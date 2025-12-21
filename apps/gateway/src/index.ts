import express, { type Request, type Response, type NextFunction } from 'express';
import bodyParser from 'body-parser';
import cors from 'cors';
import { createClient } from '@supabase/supabase-js';
import { prepareTool } from './provisioner.js';
import { MCPExecutor } from './executor.js';
import dotenv from 'dotenv';
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";

dotenv.config();

const app = express();

// 1. CORS: Allow everything to prevent browser blocks
app.use(cors({ origin: '*', methods: '*', allowedHeaders: '*' }));

// 2. DEBUG LOGGER
app.use((req, res, next) => {
    // Only log API requests to keep logs clean
    if (req.path.startsWith('/api') || req.path.startsWith('/sse')) {
        console.log(`[Http] ${req.method} ${req.path}`);
    }
    next();
});

// 3. LAZY SUPABASE (Prevent crash if variables are missing at startup)
const getSupabase = () => {
    return createClient(
        process.env.SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
};

const sessions = new Map<string, { transport: SSEServerTransport, server: Server }>();

// --- AUTH ---
interface AuthRequest extends Request {
    user?: { id: string };
}
const requireApiKey = async (req: AuthRequest, res: Response, next: NextFunction) => {
    const apiKey = req.headers['x-api-key'] || req.query.apiKey;
    if (!apiKey || typeof apiKey !== 'string') return res.status(401).json({ error: 'Missing API Key' });

    try {
        const { data: keyData } = await getSupabase().from('api_keys').select('user_id').eq('key_hash', apiKey).single();
        if (!keyData) return res.status(403).json({ error: 'Invalid API Key' });
        req.user = { id: keyData.user_id };
        next();
    } catch (err) {
        // Fail open or closed? Closed.
        return res.status(500).json({ error: 'Auth Check Failed' });
    }
};

async function getSecrets(toolId: string) {
    const { data: secrets } = await getSupabase().from('tool_secrets').select('key, value').eq('tool_id', toolId);
    const secretMap: NodeJS.ProcessEnv = {};
    if (secrets) secrets.forEach(s => secretMap[s.key] = s.value);
    return secretMap;
}

// ---------------------------------------------------------
//  ENDPOINT 1: SSE CONNECT
// ---------------------------------------------------------
app.get('/sse', requireApiKey, async (req: AuthRequest, res: Response) => {
    console.log(`[SSE] Connection Start: ${req.user!.id}`);

    // --- CRITICAL FIX: FORCE HTTPS URL ---
    // We calculate the absolute URL to prevent the client from guessing HTTP
    const host = req.get('host');
    const isLocal = host?.includes('localhost') || host?.includes('127.0.0.1');
    const protocol = isLocal ? 'http' : 'https';
    const endpointUrl = `${protocol}://${host}/api/messages`;

    console.log(`[SSE] Advertising Endpoint: ${endpointUrl}`);

    const transport = new SSEServerTransport(endpointUrl, res);
    const server = new Server({ name: "gateway", version: "1.0.0" }, { capabilities: { tools: {} } });

    server.setRequestHandler(ListToolsRequestSchema, async () => {
        const userId = req.user!.id;
        const { data: tools } = await getSupabase().from('tools').select('*').eq('status', 'active').or(`user_id.eq.${userId},is_public.eq.true`);

        return {
            tools: (tools || []).map(t => {
                const manifest = t.manifest as any;
                return (manifest.tools || []).map((mt: any) => ({
                    name: mt.name,
                    description: mt.description,
                    inputSchema: mt.inputSchema,
                    _toolId: t.id
                }));
            }).flat()
        };
    });

    server.setRequestHandler(CallToolRequestSchema, async (request) => {
        const { name, arguments: args } = request.params;
        const userId = req.user!.id;
        console.log(`[SSE] Executing ${name}`);

        const { data: tools } = await getSupabase().from('tools').select('*').eq('status', 'active').or(`user_id.eq.${userId},is_public.eq.true`);
        const foundTool = tools?.find(t => (t.manifest as any).tools.some((mt: any) => mt.name === name));

        if (!foundTool) throw new Error(`Tool ${name} not found`);

        const toolDir = await prepareTool(foundTool.id, foundTool.bundle_path);
        const secretEnv = await getSecrets(foundTool.id);
        const configEnv = foundTool.configuration?.env || {};

        const executor = new MCPExecutor(toolDir, foundTool.start_command, { ...configEnv, ...secretEnv });
        const result = await executor.executeTool(name, { ...args, ...foundTool.configuration?.defaultArguments });

        if (result.content) return result;
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    });

    sessions.set(transport.sessionId, { transport, server });

    res.on('close', () => {
        console.log('[SSE] Connection Closed');
        sessions.delete(transport.sessionId);
    });

    await server.connect(transport);
});

// ---------------------------------------------------------
//  ENDPOINT 2: INCOMING MESSAGES
// ---------------------------------------------------------
app.post('/api/messages', async (req: Request, res: Response) => {
    const sessionId = req.query.sessionId as string;
    const session = sessions.get(sessionId);

    if (!session) {
        console.log(`[Msg] 404 Session Not Found: ${sessionId}`);
        return res.status(404).send("Session not found");
    }

    // Pass raw request to SDK
    await session.transport.handlePostMessage(req, res);
});

// --- DEBUG HANDLER ---
app.get('/api/messages', (req, res) => {
    console.error("❌ ERROR: Client sent GET to /api/messages! Still seeing redirects.");
    res.status(405).send("Method Not Allowed. Please check your URL for HTTP/HTTPS mismatches.");
});

const PORT = process.env.PORT || 8000;
app.listen(PORT, () => console.log(`Gateway listening on port ${PORT}`));