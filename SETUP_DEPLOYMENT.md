# Setup Guide - Enable Automatic Deployment

## Current Status
✅ Platform UI working at localhost:3000
✅ Form submission creates tool in database (status: pending)
✅ deployment-status endpoint working (200 responses)
❌ Deployment stuck at "pending" - GitHub Actions not configured

## Why Your MCP Server Isn't Deploying

The form submits successfully and triggers a GitHub Actions workflow, but:
1. This code isn't pushed to GitHub yet
2. GitHub Actions needs secrets configured
3. The workflow file exists but can't run locally

## Solution: Push to GitHub and Configure Secrets

### Step 1: Initialize Git and Push to GitHub

```powershell
cd "C:\Users\NXP736\Desktop\Codes\MCP_Sentry-version1\MCP_Sentry-version1"

# Initialize git
git init
git add .
git commit -m "Initial commit - MCP Sentry Platform"

# Add your GitHub repo (replace with your actual repo)
git remote add origin https://github.com/Abhishek-008/MCP_Sentry.git

# Push to GitHub
git branch -M main
git push -u origin main
```

### Step 2: Add GitHub Secrets

Go to: https://github.com/Abhishek-008/MCP_Sentry/settings/secrets/actions

Add these secrets (click "New repository secret"):

1. **NEXT_PUBLIC_SUPABASE_URL**
   ```
   https://eemqujreaojlesadsbkd.supabase.co
   ```

2. **SUPABASE_SERVICE_ROLE_KEY**
   ```
   eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVlbXF1anJlYW9qbGVzYWRzYmtkIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NjAyMDU1OCwiZXhwIjoyMDgxNTk2NTU4fQ.zPuxNCnqr0N8eb1DkUFCxZX4dBySqGFlyUZzEti00LM
   ```

3. **RAILWAY_API_TOKEN**
   ```
   f3012087-ed85-46ea-8ef0-f6b4e3261bda
   ```

### Step 3: Test the Workflow

After pushing code and adding secrets:

1. Go to http://localhost:3000
2. Submit a new deployment for: https://github.com/Dheekshiths/code-interpreter
3. Start command: `uv run mcp_server.py`
4. Watch the deployment status change from `pending` → `building` → `active`
5. Get the deployment URL when it shows "Deployment successful!"

### Step 4: Verify Deployment

Check GitHub Actions: https://github.com/Abhishek-008/MCP_Sentry/actions

You should see the "Ingest MCP Tool" workflow running.

## Alternative: Quick Test Without GitHub

If you want to test deployment immediately without setting up GitHub:

1. Install Python on your machine
2. Run this command:

```powershell
cd "C:\Users\NXP736\Desktop\Codes\MCP_Sentry-version1\MCP_Sentry-version1\scripts"
$env:SUPABASE_URL="https://eemqujreaojlesadsbkd.supabase.co"
$env:SUPABASE_KEY="<service-role-key>"
$env:RAILWAY_API_TOKEN="f3012087-ed85-46ea-8ef0-f6b4e3261bda"
$env:TOOL_ID="92cea771-57c0-4434-a411-a8ab795e868f"
$env:TARGET_REPO_URL="https://github.com/Dheekshiths/code-interpreter"
$env:START_CMD="uv run mcp_server.py"
npx tsx inspector.ts
```

This will deploy the MCP server to Railway and update the database with the deployment URL.

## What Happens After Setup

Once GitHub Actions is configured:

1. User submits form → Tool created (status: `pending`)
2. GitHub Actions triggered automatically
3. Workflow runs `inspector.ts`:
   - Clones the MCP server repo
   - Validates it's a valid MCP server
   - Generates Dockerfile
   - Deploys to Railway
   - Updates database (status: `active`, deployment_url: `https://...`)
4. Frontend polls and shows deployment URL
5. Users can use the MCP server from Claude Desktop!

## Current Tool Status

Your current submission (ID: 92cea771-57c0-4434-a411-a8ab795e868f) is stuck at "pending" because the workflow hasn't run. After you complete the setup above, submit a new deployment and it will work!
