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
app.use(cors());

// REMOVED: app.use(bodyParser.json()); <-- This was causing the hang!

const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const sessions = new Map<string, { transport: SSEServerTransport, server: Server }>();

// --- AUTH MIDDLEWARE ---
interface AuthRequest extends Request {
    user?: { id: string };
}

const requireApiKey = async (req: AuthRequest, res: Response, next: NextFunction) => {
    const apiKey = req.headers['x-api-key'] || req.query.apiKey;
    if (!apiKey || typeof apiKey !== 'string') {
        console.log('[Auth] Missing Key');
        return res.status(401).json({ error: 'Missing API Key' });
    }
    try {
        const { data: keyData } = await supabase
            .from('api_keys')
            .select('user_id')
            .eq('key_hash', apiKey)
            .single();

        if (!keyData) {
            console.log('[Auth] Invalid Key');
            return res.status(403).json({ error: 'Invalid API Key' });
        }
        req.user = { id: keyData.user_id };
        next();
    } catch (err) {
        console.error('[Auth] Error:', err);
        return res.status(500).json({ error: 'Auth Verification Failed' });
    }
};

async function getSecrets(toolId: string) {
    const { data: secrets } = await supabase.from('tool_secrets').select('key, value').eq('tool_id', toolId);
    const secretMap: NodeJS.ProcessEnv = {};
    if (secrets) secrets.forEach(s => secretMap[s.key] = s.value);
    return secretMap;
}

// ---------------------------------------------------------
//  ENDPOINT 1: SSE CONNECT
// ---------------------------------------------------------
app.get('/sse', requireApiKey, async (req: AuthRequest, res: Response) => {
    console.log(`[SSE] New Connection from User: ${req.user!.id}`);
    const userId = req.user!.id;

    const transport = new SSEServerTransport("/messages", res);
    const server = new Server({ name: "gateway", version: "1.0.0" }, { capabilities: { tools: {} } });

    server.setRequestHandler(ListToolsRequestSchema, async () => {
        console.log(`[SSE] Client asked for Tool List (User: ${userId})`);
        const { data: tools } = await supabase
            .from('tools')
            .select('id, manifest, user_id, is_public')
            .eq('status', 'active')
            .or(`user_id.eq.${userId},is_public.eq.true`);

        const list = (tools || []).map(t => {
            const manifest = t.manifest as any;
            return (manifest.tools || []).map((mt: any) => ({
                name: mt.name,
                description: mt.description,
                inputSchema: mt.inputSchema,
                _toolId: t.id
            }));
        }).flat();

        console.log(`[SSE] Returning ${list.length} tools`);
        return { tools: list };
    });

    server.setRequestHandler(CallToolRequestSchema, async (request) => {
        const { name, arguments: args } = request.params;
        console.log(`[SSE] Client executing: ${name}`);

        const { data: tools } = await supabase
            .from('tools')
            .select('*')
            .eq('status', 'active')
            .or(`user_id.eq.${userId},is_public.eq.true`);

        let foundTool = null;
        for (const t of tools || []) {
            const manifest = t.manifest as any;
            if (manifest.tools.find((mt: any) => mt.name === name)) {
                foundTool = t;
                break;
            }
        }

        if (!foundTool) throw new Error(`Tool ${name} not found`);

        const toolDir = await prepareTool(foundTool.id, foundTool.bundle_path);
        const secretEnv = await getSecrets(foundTool.id);
        const configEnv = foundTool.configuration?.env || {};
        const defaultArgs = foundTool.configuration?.defaultArguments || {};

        const executor = new MCPExecutor(toolDir, foundTool.start_command, { ...configEnv, ...secretEnv });
        const result = await executor.executeTool(name, { ...args, ...defaultArgs });

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
// IMPORTANT: Do NOT use bodyParser here. The transport needs the raw stream.
app.post('/messages', async (req: Request, res: Response) => {
    const sessionId = req.query.sessionId as string;
    // console.log(`[Msg] Incoming message for session: ${sessionId}`); 

    const session = sessions.get(sessionId);
    if (!session) {
        console.warn(`[Msg] Session not found: ${sessionId}`);
        return res.status(404).send("Session not found");
    }

    await session.transport.handlePostMessage(req, res);
});

// ---------------------------------------------------------
//  LEGACY HTTP ENDPOINTS
// ---------------------------------------------------------
// We attach bodyParser ONLY to these routes now.
const jsonParser = bodyParser.json();

app.get('/api/tools', requireApiKey, async (req: AuthRequest, res: Response): Promise<any> => {
    // ... Copy your legacy GET logic here if you still need it ...
    // For now, let's just return empty to prevent errors if you hit it
    return res.json({ tools: [] });
});

app.post('/api/execute', jsonParser, requireApiKey, async (req: AuthRequest, res: Response): Promise<any> => {
    // ... Your legacy POST logic here ...
    // Note I added 'jsonParser' middleware to this line specifically
    // Use the previous logic if you need this endpoint for scripts
});

const PORT = process.env.PORT || 8000;
app.listen(PORT, () => console.log(`Gateway listening on port ${PORT}`));