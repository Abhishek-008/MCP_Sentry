/**
 * MCP HTTP/SSE Wrapper
 * Exposes an MCP server over HTTP using Server-Sent Events
 * This allows MCP servers to be accessed from any machine via URL
 */

import express from 'express';
import { spawn, ChildProcess } from 'child_process';
import cors from 'cors';

const app = express();
app.use(cors());
app.use(express.json());

let mcpProcess: ChildProcess | null = null;
let isInitialized = false;
const responseCallbacks = new Map<number, (data: any) => void>();

// Start the MCP server process
function startMCPServer() {
    const startCommand = process.env.START_COMMAND || 'node dist/index.js';
    const [cmd, ...args] = startCommand.split(' ');

    console.log(`[Wrapper] Starting MCP server: ${startCommand}`);
    
    mcpProcess = spawn(cmd, args, {
        cwd: process.cwd(),
        env: { ...process.env },
        shell: true
    });

    mcpProcess.stdout?.on('data', (data) => {
        const lines = data.toString().split('\n');
        for (const line of lines) {
            if (!line.trim()) continue;
            try {
                const json = JSON.parse(line);
                console.log('[MCP Response]', json);
                
                // Handle responses
                if (json.id !== undefined && responseCallbacks.has(json.id)) {
                    const callback = responseCallbacks.get(json.id)!;
                    callback(json);
                    responseCallbacks.delete(json.id);
                }

                // Handle initialization
                if (json.id === 0 && json.result) {
                    const notify = JSON.stringify({ 
                        jsonrpc: "2.0", 
                        method: "notifications/initialized" 
                    }) + "\n";
                    mcpProcess?.stdin?.write(notify);
                    isInitialized = true;
                    console.log('[Wrapper] MCP server initialized');
                }
            } catch (e) {
                // Ignore non-JSON lines
            }
        }
    });

    mcpProcess.stderr?.on('data', (data) => {
        console.error(`[MCP stderr] ${data}`);
    });

    mcpProcess.on('exit', (code) => {
        console.log(`[Wrapper] MCP process exited with code ${code}`);
        isInitialized = false;
    });

    // Send initialize request
    setTimeout(() => {
        const initRequest = JSON.stringify({
            jsonrpc: "2.0",
            id: 0,
            method: "initialize",
            params: {
                protocolVersion: "2024-11-05",
                capabilities: {},
                clientInfo: { name: "http-wrapper", version: "1.0" }
            }
        }) + "\n";
        mcpProcess?.stdin?.write(initRequest);
    }, 1000);
}

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ 
        status: isInitialized ? 'ready' : 'starting',
        uptime: process.uptime()
    });
});

// List available tools
app.get('/tools', async (req, res) => {
    if (!isInitialized) {
        return res.status(503).json({ error: 'MCP server not ready' });
    }

    const requestId = Date.now();
    const toolsRequest = JSON.stringify({
        jsonrpc: "2.0",
        id: requestId,
        method: "tools/list"
    }) + "\n";

    responseCallbacks.set(requestId, (data) => {
        if (data.error) {
            res.status(500).json({ error: data.error });
        } else {
            res.json(data.result);
        }
    });

    mcpProcess?.stdin?.write(toolsRequest);

    // Timeout after 10 seconds
    setTimeout(() => {
        if (responseCallbacks.has(requestId)) {
            responseCallbacks.delete(requestId);
            res.status(504).json({ error: 'Request timeout' });
        }
    }, 10000);
});

// Execute a tool
app.post('/tools/call', async (req, res) => {
    if (!isInitialized) {
        return res.status(503).json({ error: 'MCP server not ready' });
    }

    const { name, arguments: args } = req.body;
    
    if (!name) {
        return res.status(400).json({ error: 'Missing tool name' });
    }

    const requestId = Date.now();
    const callRequest = JSON.stringify({
        jsonrpc: "2.0",
        id: requestId,
        method: "tools/call",
        params: {
            name,
            arguments: args || {}
        }
    }) + "\n";

    responseCallbacks.set(requestId, (data) => {
        if (data.error) {
            res.status(500).json({ error: data.error });
        } else {
            res.json(data.result);
        }
    });

    mcpProcess?.stdin?.write(callRequest);

    // Timeout after 30 seconds
    setTimeout(() => {
        if (responseCallbacks.has(requestId)) {
            responseCallbacks.delete(requestId);
            res.status(504).json({ error: 'Request timeout' });
        }
    }, 30000);
});

// Start the MCP server
startMCPServer();

// Start HTTP server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`[Wrapper] HTTP server listening on port ${PORT}`);
});

// Cleanup on exit
process.on('SIGTERM', () => {
    console.log('[Wrapper] Shutting down...');
    mcpProcess?.kill();
    process.exit(0);
});
