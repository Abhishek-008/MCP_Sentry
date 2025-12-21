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
// IMPORTANT: Text parser is needed for JSON-RPC over SSE
app.use(bodyParser.json());

const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// --- SESSION STORAGE ---
// We need to store active SSE connections to handle incoming messages
// Map<SessionID, { transport, server }>
const sessions = new Map<string, { transport: SSEServerTransport, server: Server }>();

// --- AUTH MIDDLEWARE ---
interface AuthRequest extends Request {
    user?: { id: string };
}

const requireApiKey = async (req: AuthRequest, res: Response, next: NextFunction) => {
    const apiKey = req.headers['x-api-key'] || req.query.apiKey;
    if (!apiKey || typeof apiKey !== 'string') {
        return res.status(401).json({ error: 'Missing API Key' });
    }
    try {
        const { data: keyData } = await supabase
            .from('api_keys')
            .select('user_id')
            .eq('key_hash', apiKey)
            .single();

        if (!keyData) return res.status(403).json({ error: 'Invalid API Key' });
        req.user = { id: keyData.user_id };
        next();
    } catch (err) {
        return res.status(500).json({ error: 'Auth Verification Failed' });
    }
};

// --- HELPER: Fetch Secrets ---
async function getSecrets(toolId: string) {
    const { data: secrets } = await supabase.from('tool_secrets').select('key, value').eq('tool_id', toolId);
    const secretMap: NodeJS.ProcessEnv = {};
    if (secrets) secrets.forEach(s => secretMap[s.key] = s.value);
    return secretMap;
}

// ---------------------------------------------------------
//  ENDPOINT 1: SSE CONNECT (What Cursor Connects To)
// ---------------------------------------------------------
app.get('/sse', requireApiKey, async (req: AuthRequest, res: Response) => {
    const userId = req.user!.id;

    // 1. Create a specific transport for this connection
    // Note: We point the "endpoint" to /messages with a session ID query param
    const transport = new SSEServerTransport("/messages", res);

    // 2. Create a specific MCP Server instance for this user
    const server = new Server({ name: "gateway", version: "1.0.0" }, { capabilities: { tools: {} } });

    // 3. Register Tool Listing Logic
    server.setRequestHandler(ListToolsRequestSchema, async () => {
        const { data: tools } = await supabase
            .from('tools')
            .select('id, manifest, user_id, is_public')
            .eq('status', 'active')
            .or(`user_id.eq.${userId},is_public.eq.true`);

        return {
            tools: (tools || []).map(t => {
                const manifest = t.manifest as any;
                return (manifest.tools || []).map((mt: any) => ({
                    name: mt.name,
                    description: mt.description,
                    inputSchema: mt.inputSchema,
                    _toolId: t.id // Internal ID for execution
                }));
            }).flat()
        };
    });

    // 4. Register Execution Logic
    server.setRequestHandler(CallToolRequestSchema, async (request) => {
        const { name, arguments: args } = request.params;

        // Find the tool ID by looking up the name again (or optimizing this later)
        const { data: tools } = await supabase
            .from('tools')
            .select('*')
            .eq('status', 'active')
            .or(`user_id.eq.${userId},is_public.eq.true`);

        // Find the matching tool definition
        let foundTool = null;
        for (const t of tools || []) {
            const manifest = t.manifest as any;
            if (manifest.tools.find((mt: any) => mt.name === name)) {
                foundTool = t;
                break;
            }
        }

        if (!foundTool) throw new Error(`Tool ${name} not found`);

        // Prepare Execution
        const toolDir = await prepareTool(foundTool.id, foundTool.bundle_path);
        const secretEnv = await getSecrets(foundTool.id);
        const configEnv = foundTool.configuration?.env || {};
        const defaultArgs = foundTool.configuration?.defaultArguments || {};

        const executor = new MCPExecutor(toolDir, foundTool.start_command, { ...configEnv, ...secretEnv });
        const result = await executor.executeTool(name, { ...args, ...defaultArgs });

        // Format Result for MCP
        if (result.content) return result;
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    });

    // 5. Connect and Start
    // Store the session so we can handle incoming messages later
    sessions.set(transport.sessionId, { transport, server });

    // Cleanup when connection closes
    res.on('close', () => {
        sessions.delete(transport.sessionId);
    });

    await server.connect(transport);
});

// ---------------------------------------------------------
//  ENDPOINT 2: INCOMING MESSAGES (Cursor talks back here)
// ---------------------------------------------------------
app.post('/messages', async (req: Request, res: Response) => {
    // The SDK sends the session ID in the query string
    const sessionId = req.query.sessionId as string;
    const session = sessions.get(sessionId);

    if (!session) {
        return res.status(404).send("Session not found");
    }

    // Pass the JSON body to the transport
    await session.transport.handlePostMessage(req, res);
});



const PORT = process.env.PORT || 8000;
app.listen(PORT, () => console.log(`Gateway listening on port ${PORT}`));