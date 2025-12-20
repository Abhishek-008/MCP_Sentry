# Quick Start Guide - Deploy MCP Servers

## 1. Database Setup (CRITICAL - Do this first!)

Go to your Supabase SQL Editor and run this SQL:

```sql
-- Run this migration in Supabase SQL Editor
ALTER TABLE tools 
ADD COLUMN IF NOT EXISTS deployment_url TEXT;

ALTER TABLE tools 
ADD COLUMN IF NOT EXISTS start_command TEXT;

ALTER TABLE tools
ADD COLUMN IF NOT EXISTS error_message TEXT;

CREATE INDEX IF NOT EXISTS idx_tools_deployment_url ON tools(deployment_url);
```

## 2. Current Status

### ✅ Working:
- Form submission (POST /api/ingest) - Creates tool record in database
- GitHub Actions trigger - Dispatches workflow
- Environment variables loaded

### ❌ Not Working:
- `/api/deployment-status` endpoint returning 404 (Next.js routing issue)
- Database missing `deployment_url` column (migration not run)
- GitHub Actions workflow not completing deployment

## 3. The Problem

The deployment flow has these steps:
1. User submits form → Creates tool in DB (status: 'pending')
2. Triggers GitHub Actions workflow
3. GitHub Actions runs `inspector.ts` which:
   - Clones repo
   - Validates MCP server
   - Deploys to Railway
   - Updates DB with deployment_url
4. Frontend polls `/api/deployment-status` to check progress

**Current issues:**
- The deployment-status route exists but Next.js returns 404
- Database migrations haven't been run
- GitHub Actions workflow needs to be set up in your repo

## 4. Simplified Solution

Let me create a direct deployment script that bypasses GitHub Actions:

### Option A: Local Deployment Test
Run inspector.ts locally to test deployment:
```powershell
cd scripts
npx tsx inspector.ts https://github.com/Dheekshiths/code-interpreter "uv run mcp_server.py"
```

### Option B: Fix the Platform
1. Run the SQL migration above in Supabase
2. Fix the route.ts issue
3. Set up GitHub Actions workflow

## 5. What You Need

For deployment to work, you need:
- ✅ Supabase project (you have this)
- ✅ Railway account with API token (you have this)
- ❌ Database migrations run
- ❌ GitHub Actions workflow configured
- ❌ Working deployment-status endpoint

## Next Steps

Choose one:
1. **Test locally**: Run inspector.ts directly to deploy code-interpreter
2. **Fix platform**: Run migrations, fix route, configure GitHub Actions
3. **Simplify**: Remove GitHub Actions, deploy directly from /api/ingest

Which approach do you prefer?
