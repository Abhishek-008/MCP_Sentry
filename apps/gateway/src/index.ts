import express from 'express';
import bodyParser from 'body-parser';
import cors from 'cors';
import { createClient } from '@supabase/supabase-js';
import { prepareTool } from './provisioner.js'; // Ensure extension matches your config
import { MCPExecutor } from './executor.js';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
app.use(cors());
app.use(bodyParser.json());

// Initialize Supabase
const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// --- HELPER: Fetch Secrets securely ---
async function getSecrets(toolId: string) {
    const { data: secrets } = await supabase
        .from('tool_secrets')
        .select('key, value')
        .eq('tool_id', toolId);

    // Convert array [{key: "A", value: "B"}] => Object { "A": "B" }
    const secretMap: NodeJS.ProcessEnv = {};
    if (secrets) {
        secrets.forEach(s => {
            secretMap[s.key] = s.value;
        });
    }
    return secretMap;
}
// ------------------------------------

// 1. List Tools Endpoint
app.get('/api/tools', async (req, res): Promise<any> => {
    try {
        const { data: tools, error } = await supabase
            .from('tools')
            .select('id, manifest')
            .eq('status', 'active');

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

// 2. Execute Endpoint
app.post('/api/execute', async (req, res): Promise<any> => {
    const { toolId, toolName, arguments: userArgs } = req.body;
    const requestId = `req_${Date.now()}`;

    if (!toolId || !toolName) {
        return res.status(400).json({ error: 'Missing toolId or toolName' });
    }

    try {
        console.time(requestId);
        console.log(`[${requestId}] 🚀 Request: ${toolName} (${toolId})`);

        // A. Fetch Tool Data
        const { data: tool } = await supabase
            .from('tools')
            .select('*')
            .eq('id', toolId)
            .single();

        if (!tool || !tool.bundle_path) {
            return res.status(404).json({ error: 'Tool not found or not built' });
        }

        // B. PIPELINE 1: Prepare Environment (Secrets + Config)
        const dbConfig = tool.configuration || {};

        // 1. Fetch Secrets (API Keys from tool_secrets table)
        const secretEnv = await getSecrets(toolId);

        // 2. Fetch Config Env (Non-sensitive vars from configuration column)
        const configEnv = dbConfig.env || {};

        // 3. Merge: Config overwrites System, Secrets overwrite Config.
        // Note: process.env is usually added by spawn, but explicit merging here is safer for debug.
        const finalEnv = {
            ...configEnv,
            ...secretEnv
        };

        // C. PIPELINE 2: Prepare Arguments (Defaults + User)
        const defaultArgs = dbConfig.defaultArguments || {};

        // Merge: Defaults override User (Security policy)
        // e.g. If user says "ignoreRobots": false, but Admin set true, force true.
        const finalArgs = {
            ...userArgs,
            ...defaultArgs
        };

        // D. Provision Runtime
        const toolDir = await prepareTool(toolId, tool.bundle_path);

        // E. Execute
        // Pass 'finalEnv' (which contains the secrets) to the executor
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