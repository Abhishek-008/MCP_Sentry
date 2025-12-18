import express from 'express';
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

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

// 1. List Tools Endpoint (For Bridge/Cursor)
app.get('/api/tools', async (req, res): Promise<any> => {
    try {
        const { data: tools, error } = await supabase
            .from('tools')
            .select('id, manifest')
            .eq('status', 'active');

        if (error) throw error;

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
        console.error('[Gateway List Error]', err);
        return res.status(500).json({ error: err.message });
    }
});

// 2. Execute Endpoint (The Robust Core)
app.post('/api/execute', async (req, res): Promise<any> => {
    const { toolId, toolName, arguments: userArgs } = req.body;
    const requestId = `req_${Date.now()}`; // For tracking

    if (!toolId || !toolName) {
        return res.status(400).json({ error: 'Missing toolId or toolName' });
    }

    try {
        console.time(requestId);
        console.log(`[${requestId}] Request: ${toolName} (${toolId})`);

        // A. Fetch Tool + Configuration
        const { data: tool } = await supabase
            .from('tools')
            .select('*')
            .eq('id', toolId)
            .single();

        if (!tool || !tool.bundle_path) {
            return res.status(404).json({ error: 'Tool not found or not built' });
        }

        // B. Provision (Download/Install)
        const toolDir = await prepareTool(toolId, tool.bundle_path);

        // C. Configuration Merging (The "Robust" Part)
        // We read 'configuration' column from DB (default to empty object if null)
        const dbConfig = tool.configuration || {};
        const defaultArgs = dbConfig.defaultArguments || {};
        const toolEnv = dbConfig.env || {};

        // Merge: User Args override Default Args (or vice versa, depending on policy)
        // Here, we let Default Args override User Args to force safety (like robots.txt)
        // Or strictly merge:
        const finalArgs = { ...userArgs, ...defaultArgs };

        // D. Execution
        const executor = new MCPExecutor(toolDir, tool.start_command, toolEnv);

        // Execute with timeout handling via Promise.race if needed (executor has internal 30s)
        const result = await executor.executeTool(toolName, finalArgs);

        console.log(`[${requestId}] Success`);
        console.timeEnd(requestId);

        return res.json({ success: true, result });

    } catch (err: any) {
        console.error(`[${requestId}] Failed:`, err.message);
        console.timeEnd(requestId);

        // Return a structured error that the Bridge can understand
        return res.status(500).json({
            error: err.message,
            toolId,
            toolName
        });
    }
});

const PORT = process.env.PORT || 8000;
app.listen(PORT, () => console.log(`Gateway listening on port ${PORT}`));