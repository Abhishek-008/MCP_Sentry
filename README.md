# MCP Sentry - Cloud-Deployed MCP Servers 🚀

Transform any GitHub MCP repository into a **live, accessible MCP server** with automatic cloud deployment to Railway.

## 🎯 What This Does

When a user registers their MCP server through the platform:

1. **Validates & Packages** - Clones the repo, installs dependencies, validates MCP protocol
2. **Generates Dockerfile** - Creates optimized Docker container for Node.js or Python
3. **Deploys to Railway** - Automatically deploys to Railway's cloud platform
4. **Provides URL** - Returns a public HTTPS URL that works from any machine

The deployed server can be used with standard MCP clients:

```json
{
  "mcpServers": {
    "my-deployed-server": {
      "url": "https://mcp-abc12345-production.up.railway.app"
    }
  }
}
```

## 🏗️ Architecture

```
User Submits Form
       ↓
GitHub Actions Workflow Triggered
       ↓
Inspector Script:
  - Clones repo
  - Installs dependencies  
  - Validates MCP handshake
  - Generates Dockerfile
  - Compiles HTTP wrapper
       ↓
Railway Deployment:
  - Builds Docker image
  - Deploys to Railway
  - Generates HTTPS URL
       ↓
Database Updated with URL
       ↓
User Gets Deployment URL
```

## 🚀 Quick Start

### 1. Prerequisites

- [Railway Account](https://railway.app) (Free tier: $5/month credit)
- [Supabase Project](https://supabase.com)
- GitHub repository for this platform

### 2. Setup Railway

1. Sign up at https://railway.app
2. Go to Account → Tokens
3. Create new API token
4. Copy the token

### 3. Configure Secrets

Add to GitHub repository secrets (Settings → Secrets and variables → Actions):

```
RAILWAY_API_TOKEN=your_railway_token_here
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_key
GITHUB_PLATFORM_REPO=your-username/your-repo
GITHUB_PAT=your_github_personal_access_token
```

### 4. Run Database Migration

Execute in Supabase SQL Editor:

```sql
ALTER TABLE tools 
ADD COLUMN IF NOT EXISTS deployment_url TEXT;

CREATE INDEX IF NOT EXISTS idx_tools_deployment_url ON tools(deployment_url);
```

### 5. Install Dependencies

```bash
cd MCP_Sentry-version1
pnpm install
```

### 6. Test Deployment

```bash
# Start the platform
pnpm dev

# Visit http://localhost:3000
# Sign in and submit an MCP server repository
```

## 📋 How It Works

### HTTP/SSE Wrapper

Each MCP server is wrapped with an HTTP layer ([mcp-http-wrapper.ts](scripts/mcp-http-wrapper.ts)):

```typescript
// Exposes MCP over HTTP
GET  /health          → Health check
GET  /tools           → List available MCP tools  
POST /tools/call      → Execute a tool
```

### Dockerfile Generation

Automatically detects project type and generates appropriate Dockerfile:

- **Node.js**: Uses npm/pnpm, builds TypeScript if needed
- **Python**: Creates venv, installs requirements, handles uv/poetry

### Railway Deployment

Uses Railway CLI to:
1. Create new project
2. Set environment variables (secrets)
3. Deploy using generated Dockerfile
4. Generate public HTTPS domain

## 🔧 Supported MCP Servers

### Node.js Projects
- ✅ Plain JavaScript
- ✅ TypeScript (auto-compiled)
- ✅ npm/pnpm/yarn
- ✅ Any `node` start command

### Python Projects
- ✅ Plain Python
- ✅ `requirements.txt`
- ✅ `pyproject.toml`
- ✅ `uv` package manager
- ✅ Virtual environments

## 📡 Using Deployed Servers

### With Claude Desktop

Add to `claude_desktop_config.json`:

**Mac/Linux**: `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "my-server": {
      "url": "https://your-deployment-url.railway.app"
    }
  }
}
```

### With Any MCP Client

```typescript
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';

const transport = new SSEClientTransport(
  new URL('https://your-deployment-url.railway.app')
);

const client = new Client({
  name: 'my-client',
  version: '1.0.0'
}, {
  capabilities: {}
});

await client.connect(transport);
```

### Direct HTTP Calls

```bash
# List tools
curl https://your-deployment-url.railway.app/tools

# Call a tool
curl -X POST https://your-deployment-url.railway.app/tools/call \
  -H "Content-Type: application/json" \
  -d '{
    "name": "search_airbnb",
    "arguments": {
      "location": "Paris",
      "checkin": "2025-06-01"
    }
  }'
```

## 💰 Cost Breakdown

Railway free tier includes:
- **$5 free credit/month**
- **~500 hours of compute**
- **1 GB RAM per service**

Each deployed MCP server uses:
- ~256-512 MB RAM
- Minimal CPU (idle most of the time)
- ~1-2 GB storage

**You can deploy 5-10 small MCP servers within the free tier.**

## 🛠️ Development

### Project Structure

```
MCP_Sentry-version1/
├── apps/
│   ├── platform/          # Next.js web app
│   │   ├── src/app/
│   │   │   ├── api/ingest/    # Triggers deployment
│   │   │   ├── api/deployment-status/  # Polls status
│   │   │   └── components/IngestForm.tsx
│   └── gateway/           # (Legacy - not used with cloud deployment)
├── scripts/
│   ├── inspector.ts       # Main orchestrator
│   ├── mcp-http-wrapper.ts  # HTTP wrapper for MCP
│   ├── dockerfile-generator.ts  # Generates Dockerfiles
│   └── railway-deployer.ts  # Railway API integration
└── .github/workflows/
    └── ingest.yml         # GitHub Actions workflow
```

### Running Locally

```bash
# Platform only
pnpm --filter mcp-platform dev

# Or both platform and legacy gateway
pnpm dev
```

## 🔒 Security Features

1. **Isolated Deployments** - Each MCP server runs in its own Railway container
2. **Secrets Management** - Environment variables stored securely in Supabase
3. **HTTPS by Default** - All deployments use HTTPS
4. **No Shared Resources** - Each deployment is independent

## 🐛 Troubleshooting

### Railway CLI Not Found

```bash
npm install -g @railway/cli
railway login
```

### Deployment Timeout

- Check GitHub Actions logs
- Verify Railway token is valid
- Check Railway dashboard for build errors

### MCP Server Fails to Start

- Test locally first: `npx tsx scripts/inspector.ts`
- Check start command is correct
- Verify dependencies install successfully

### No Deployment URL

- Wait 5-10 minutes for deployment to complete
- Check Railway logs for errors
- Ensure Railway domain generation is enabled

## 📚 API Reference

### POST /api/ingest

Triggers MCP server deployment.

**Request:**
```json
{
  "repoUrl": "https://github.com/user/mcp-server",
  "userId": "user-uuid",
  "startCommand": "node dist/index.js",
  "configuration": {
    "env": { "API_KEY": "secret" },
    "defaultArguments": { "timeout": 30 }
  }
}
```

**Response:**
```json
{
  "success": true,
  "toolId": "tool-uuid",
  "message": "Build queued successfully"
}
```

### GET /api/deployment-status?toolId=xxx

Polls deployment status.

**Response:**
```json
{
  "toolId": "tool-uuid",
  "status": "active",
  "deploymentUrl": "https://mcp-xxx.railway.app",
  "errorMessage": null
}
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test with a real MCP server deployment
5. Submit a pull request

## 📄 License

MIT License - See LICENSE file for details

## 🙏 Credits

Built with:
- [Railway](https://railway.app) - Cloud deployment
- [Supabase](https://supabase.com) - Database & storage
- [Next.js](https://nextjs.org) - Web framework
- [Model Context Protocol](https://modelcontextprotocol.io) - MCP standard

---

**Made with ❤️ for the MCP community**
