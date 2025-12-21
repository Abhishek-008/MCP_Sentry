import express, { type Request, type Response, type NextFunction } from 'express';
import bodyParser from 'body-parser';
import cors from 'cors';
import { createClient } from '@supabase/supabase-js';
import { prepareTool } from './provisioner.js';
import { MCPExecutor } from './executor.js';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
app.use(cors());
app.use(bodyParser.json());

// Initialize Supabase Admin (Needs Service Role to lookup keys securely)
const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// --- AUTH MIDDLEWARE ---
// Extends Request to include the authenticated user
interface AuthRequest extends Request {
    user?: { id: string };
}

const requireApiKey = async (req: AuthRequest, res: Response, next: NextFunction) => {
    // 1. Extract Key (Support Header or Query Param for SSE ease)
    const apiKey = req.headers['x-api-key'] || req.query.apiKey;

    if (!apiKey || typeof apiKey !== 'string') {
        return res.status(401).json({ error: 'Missing API Key' });
    }

    try {
        // 2. Validate Key against DB
        // We assume the key sent is the raw key, but for security, usually you send a hash.
        // For MVP, we query by the key_hash column assuming you stored it correctly,
        // OR if you stored the raw key directly (simpler for now).

        // Let's assume for this step you verify against the 'key_hash' column.
        const { data: keyData, error } = await supabase
            .from('api_keys')
            .select('user_id')
            .eq('key_hash', apiKey) // In prod, hash the input first!
            .single();

        if (error || !keyData) {
            return res.status(403).json({ error: 'Invalid API Key' });
        }

        // 3. Attach User ID to Request
        req.user = { id: keyData.user_id };
        next();

    } catch (err) {
        return res.status(500).json({ error: 'Auth Verification Failed' });
    }
};

// --- HELPER: Fetch Secrets securely ---
async function getSecrets(toolId: string) {
    const { data: secrets } = await supabase
        .from('tool_secrets')
        .select('key, value')
        .eq('tool_id', toolId);

    const secretMap: NodeJS.ProcessEnv = {};
    if (secrets) {
        secrets.forEach(s => {
            secretMap[s.key] = s.value;
        });
    }
    return secretMap;
}

// ------------------------------------

// 1. List Tools Endpoint (SECURED)
// Only returns tools belonging to the authenticated user
app.get('/api/tools', requireApiKey, async (req: AuthRequest, res: Response): Promise<any> => {
    try {
        const userId = req.user!.id; // Guaranteed by middleware

        const { data: tools, error } = await supabase
            .from('tools')
            .select('id, manifest')
            .eq('status', 'active')
            .eq('user_id', userId); // <--- CRITICAL: User Isolation

        if (error) throw error;

        // Flatten tools for the client
        const mcpTools = tools.map(t => {
            const manifest = t.manifest as any;
            return (manifest.tools || []).map((mt: any) => ({
                name: mt.name,
                description: mt.description,
                inputSchema: mt.inputSchema,
                _toolId: t.id
            }));
        }).flat();

        return res.json({ tools: mcpTools });
    } catch (err: any) {
        console.error('[List Error]', err);
        return res.status(500).json({ error: err.message });
    }
});

// 2. Execute Endpoint (SECURED)
app.post('/api/execute', requireApiKey, async (req: AuthRequest, res: Response): Promise<any> => {
    const { toolId, toolName, arguments: userArgs } = req.body;
    const userId = req.user!.id;
    const requestId = `req_${Date.now()}`;

    if (!toolId || !toolName) {
        return res.status(400).json({ error: 'Missing toolId or toolName' });
    }

    try {
        console.time(requestId);
        console.log(`[${requestId}] 🚀 Request: ${toolName} (${toolId})`);

        // A. Fetch Tool Data (AND VERIFY OWNERSHIP)
        const { data: tool } = await supabase
            .from('tools')
            .select('*')
            .eq('id', toolId)
            .eq('user_id', userId) // <--- CRITICAL: Prevent using others' tools
            .single();

        if (!tool) {
            return res.status(404).json({ error: 'Tool not found or access denied' });
        }

        if (!tool.bundle_path) {
            return res.status(400).json({ error: 'Tool not built (missing bundle_path)' });
        }

        // B. PIPELINE 1: Prepare Environment (Secrets + Config)
        const dbConfig = tool.configuration || {};

        // 1. Fetch Secrets 
        const secretEnv = await getSecrets(toolId);

        // 2. Fetch Config Env
        const configEnv = dbConfig.env || {};

        // 3. Merge
        const finalEnv = {
            ...configEnv,
            ...secretEnv
        };

        // C. PIPELINE 2: Prepare Arguments (Defaults + User)
        const defaultArgs = dbConfig.defaultArguments || {};
        const finalArgs = {
            ...userArgs,
            ...defaultArgs
        };

        // D. Provision Runtime
        const toolDir = await prepareTool(toolId, tool.bundle_path);

        // E. Execute
        const executor = new MCPExecutor(toolDir, tool.start_command, finalEnv);
        const result = await executor.executeTool(toolName, finalArgs);

        console.log(`[${requestId}] ✅ Success`);
        console.timeEnd(requestId);

        return res.json({ success: true, result });

    } catch (err: any) {
        console.error(`[${requestId}] ❌ Failed:`, err.message);
        console.timeEnd(requestId);

        return res.status(500).json({
            error: err.message,
            toolId,
            toolName
        });
    }
});

const PORT = process.env.PORT || 8000;
app.listen(PORT, () => console.log(`Gateway listening on port ${PORT}`));