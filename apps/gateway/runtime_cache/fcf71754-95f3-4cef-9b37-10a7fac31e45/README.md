# College Database MCP Server (Supabase Edition)

This project provides a Model Context Protocol (MCP) server for managing a college database (backed by Supabase).

## Prerequisites

- [uv](https://github.com/astral-sh/uv) (for Python dependency management)
- Node.js & npm (for the MCP Inspector)
- A Supabase project with credentials

## Setup

1. **Install Dependencies**:
   ```bash
   uv sync
   ```

2. **Environment Configuration**:
   Create a `.env` file in the root directory with your Supabase credentials:
   ```env
   SUPABASE_URL=your_supabase_url
   SUPABASE_KEY=your_supabase_key
   ```

3. **Database Initialization**:
   Ensure your Supabase project has the required tables (`students`, `teachers`, `subjects`, `marks`) and data populated.

## Available Servers

### College Database Server (Supabase)
Manages students, teachers, subjects, and marks.

**Run locally:**
```bash
uv run servers/college_supabase.py
```
*Or using the virtual environment python directly:*
```bash
.venv/bin/python servers/college_supabase.py
```

**Features:**
- **Students**: List, add, and query students.
- **Teachers**: List and analyze teacher performance.
- **Subjects**: List subjects and view statistics.
- **Marks**: Update grades and generate report cards.
- **Resources**: `college://students`, `college://teachers`, `college://subjects`.

## Testing with MCP Inspector

You can inspect and test the tools interactively using the MCP Inspector:

```bash
npx -y @modelcontextprotocol/inspector uv run servers/college_supabase.py
```
*Or if using the venv python directly:*
```bash
npx -y @modelcontextprotocol/inspector .venv/bin/python servers/college_supabase.py
```

## Configuration for Claude Desktop

Add the following to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "CollegeSupabase": {
      "command": "/path/to/uv",
      "args": [
        "--directory",
        "/absolute/path/to/mcp-server-demo",
        "run",
        "servers/college_supabase.py"
      ]
    }
  }
}
```
*Note: Replace `/path/to/uv` and `/absolute/path/to/mcp-server-demo` with the actual absolute path to your project directory.*
