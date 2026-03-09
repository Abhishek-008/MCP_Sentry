import os
import json
from mcp.server.fastmcp import FastMCP
from dotenv import load_dotenv
from supabase import create_client, Client

load_dotenv()

# Initialize FastMCP server
mcp = FastMCP("CollegeDatabaseSupabase")

# Supabase Setup
url: str = os.environ.get("SUPABASE_URL")
key: str = os.environ.get("SUPABASE_KEY")

if not url or not key:
    # Fallback/Check for environment variables
    # We allow the server to start but tools might fail if env is missing
    pass

try:
    if url and key:
        supabase: Client = create_client(url, key)
    else:
        supabase = None
except Exception as e:
    print(f"Failed to initialize Supabase client: {e}")
    supabase = None

def check_supabase():
    if not supabase:
        return False, "Supabase credentials not configured or initialization failed."
    return True, ""

@mcp.tool()
def query_marks(student_name: str) -> str:
    """Get marks for a student by their name (first or last)."""
    ok, msg = check_supabase()
    if not ok: return msg
    
    try:
        # 1. Find students matching the name
        students_res = supabase.table("students").select("student_id, first_name, last_name").or_(
            f"first_name.ilike.%{student_name}%,last_name.ilike.%{student_name}%"
        ).execute()
        
        students = students_res.data
        if not students:
            return f"No students found matching '{student_name}'"
            
        results = []
        for s in students:
            # Get marks for this student
            marks_res = supabase.table("marks").select(
                "mark_obtained, exam_date, subjects(subject_name)"
            ).eq("student_id", s['student_id']).execute()
            
            for m in marks_res.data:
                results.append({
                    "first_name": s['first_name'],
                    "last_name": s['last_name'],
                    "subject_name": m['subjects']['subject_name'] if m['subjects'] else "Unknown",
                    "mark_obtained": m['mark_obtained'],
                    "exam_date": m['exam_date']
                })
                
        if not results:
            return f"No marks found for students matching '{student_name}'"
            
        return json.dumps(results, indent=2)
    except Exception as e:
        return f"Error: {str(e)}"

@mcp.tool()
def get_student_report(student_id: int) -> str:
    """Generate a full report card for a student ID."""
    ok, msg = check_supabase()
    if not ok: return msg

    try:
        student_res = supabase.table("students").select("*").eq("student_id", student_id).execute()
        if not student_res.data:
            return "Student not found"
        student = student_res.data[0]
        
        marks_res = supabase.table("marks").select(
            "mark_obtained, subjects(subject_name), teachers(first_name, last_name)"
        ).eq("student_id", student_id).execute()
        
        marks = marks_res.data
        
        report = {
            "student": f"{student['first_name']} {student['last_name']}",
            "email": student['email'],
            "results": [
                {
                    "subject_name": m['subjects']['subject_name'] if m['subjects'] else "Unknown",
                    "mark_obtained": m['mark_obtained'],
                    "teacher": f"{m['teachers']['first_name']} {m['teachers']['last_name']}" if m['teachers'] else "Unknown"
                }
                for m in marks
            ],
            "average_mark": sum(m['mark_obtained'] for m in marks) / len(marks) if marks else 0
        }
        return json.dumps(report, indent=2)
        
    except Exception as e:
        return f"Error: {str(e)}"

@mcp.tool()
def get_teacher_stats(teacher_name: str) -> str:
    """Analyze performance of students taught by a specific teacher."""
    ok, msg = check_supabase()
    if not ok: return msg

    try:
        teachers_res = supabase.table("teachers").select("teacher_id, first_name, last_name").or_(
            f"first_name.ilike.%{teacher_name}%,last_name.ilike.%{teacher_name}%"
        ).execute()
        
        if not teachers_res.data:
            return "Teacher not found"
            
        # For simplicity, pick the first matching teacher
        teacher = teachers_res.data[0]
        
        marks_res = supabase.table("marks").select(
             "mark_obtained, subjects(subject_name)"
        ).eq("teacher_id", teacher['teacher_id']).execute()
        
        marks = marks_res.data
        if not marks:
            return "No marks found for this teacher"
            
        values = [m['mark_obtained'] for m in marks]
        stats = {
            "teacher": f"{teacher['first_name']} {teacher['last_name']}",
            "subjects_taught": list(set(m['subjects']['subject_name'] for m in marks if m['subjects'])),
            "students_graded": len(values),
            "average_student_mark": round(sum(values) / len(values), 2),
            "highest_mark_given": max(values),
            "lowest_mark_given": min(values)
        }
        return json.dumps(stats, indent=2)
    except Exception as e:
        return f"Error: {str(e)}"

@mcp.tool()
def get_top_students(limit: int = 5) -> str:
    """Get the top performing students based on average marks."""
    ok, msg = check_supabase()
    if not ok: return msg

    try:
        all_marks_res = supabase.table("marks").select(
            "mark_obtained, student_id"
        ).execute()
        
        all_marks = all_marks_res.data
        
        if not all_marks:
            return "No data available."
            
        # Aggregate
        student_totals = {}
        student_counts = {}
        
        for m in all_marks:
            sid = m['student_id']
            if sid not in student_totals:
                student_totals[sid] = 0
                student_counts[sid] = 0
            student_totals[sid] += m['mark_obtained']
            student_counts[sid] += 1
            
        averages = []
        for sid, total in student_totals.items():
            avg = total / student_counts[sid]
            averages.append((sid, avg))
            
        # Sort desc
        averages.sort(key=lambda x: x[1], reverse=True)
        top_sids = averages[:limit]
        
        # Fetch names for top students
        results = []
        for sid, avg in top_sids:
            s_res = supabase.table("students").select("first_name, last_name").eq("student_id", sid).single().execute()
            if s_res.data:
                s = s_res.data
                results.append({
                    "student": f"{s['first_name']} {s['last_name']}",
                    "average": round(avg, 2)
                })
                
        return json.dumps(results, indent=2)
        
    except Exception as e:
        return f"Error: {str(e)}"

@mcp.tool()
def update_student_mark(student_id: int, subject_id: int, new_mark: int) -> str:
    """Update a specific mark for a student."""
    ok, msg = check_supabase()
    if not ok: return msg

    try:
        res = supabase.table("marks").update({"mark_obtained": new_mark}).match({"student_id": student_id, "subject_id": subject_id}).execute()
        
        if not res.data:
            return "Mark record not found to update."
            
        return f"Mark updated to {new_mark} for student {student_id} in subject {subject_id}."
    except Exception as e:
        return f"Error: {str(e)}"

@mcp.tool()
def add_new_student(first_name: str, last_name: str, email: str) -> str:
    """Register a new student."""
    ok, msg = check_supabase()
    if not ok: return msg

    try:
        max_res = supabase.table("students").select("student_id").order("student_id", desc=True).limit(1).execute()
        if max_res.data:
            new_id = max_res.data[0]['student_id'] + 1
        else:
            new_id = 1
            
        res = supabase.table("students").insert({
            "student_id": new_id,
            "first_name": first_name,
            "last_name": last_name,
            "email": email,
            "dob": "2000-01-01",
            "address": "Unknown",
            "contact": "Unknown"
        }).execute()
        
        return f"Student added with ID {new_id}"
    except Exception as e:
        return f"Error: {str(e)}"

@mcp.resource("college://students")
def list_students() -> str:
    """List all registered students"""
    ok, msg = check_supabase()
    if not ok: return msg
    try:
        res = supabase.table("students").select("*").execute()
        return json.dumps(res.data, indent=2)
    except Exception as e:
        return f"Error: {str(e)}"

@mcp.resource("college://teachers")
def list_teachers() -> str:
    """List all teachers"""
    ok, msg = check_supabase()
    if not ok: return msg
    try:
        res = supabase.table("teachers").select("*").execute()
        return json.dumps(res.data, indent=2)
    except Exception as e:
        return f"Error: {str(e)}"

@mcp.resource("college://subjects")
def list_subjects() -> str:
    """List all subjects"""
    ok, msg = check_supabase()
    if not ok: return msg
    try:
        res = supabase.table("subjects").select("*").execute()
        return json.dumps(res.data, indent=2)
    except Exception as e:
        return f"Error: {str(e)}"

@mcp.tool()
def get_subject_stats(subject_name: str) -> str:
    """Get statistics for a specific subject."""
    ok, msg = check_supabase()
    if not ok: return msg
    try:
        sub_res = supabase.table("subjects").select("*").ilike("subject_name", f"%{subject_name}%").execute()
        if not sub_res.data:
            return "Subject not found"
        
        subject = sub_res.data[0]
        
        marks_res = supabase.table("marks").select("mark_obtained").eq("subject_id", subject['subject_id']).execute()
        marks = marks_res.data
        if not marks:
            return f"No marks for {subject['subject_name']}"
            
        values = [m['mark_obtained'] for m in marks]
        stats = {
            "subject": subject['subject_name'],
            "total_students": len(values),
            "average_mark": sum(values) / len(values),
            "highest_mark": max(values),
            "lowest_mark": min(values)
        }
        return json.dumps(stats, indent=2)
    except Exception as e:
        return f"Error: {str(e)}"

if __name__ == "__main__":
    mcp.run()
