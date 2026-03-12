import { NextResponse } from 'next/server';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

export const dynamic = 'force-dynamic';

interface RemoteConnectionRequest {
    type: 'remote';
    url: string;
    transport: 'sse' | 'http';
    headers?: Record<string, string>;
}

interface LocalConnectionRequest {
    type: 'stdio';
    command: string;
    args?: string[];
    env?: Record<string, string>;
}

type ConnectionRequest = RemoteConnectionRequest | LocalConnectionRequest;

/**
 * POST /api/mcp/connect
 * Test connectivity to an MCP server and fetch capabilities before registration
 */
export async function POST(req: Request) {
    try {
        const data: ConnectionRequest = await req.json();

        console.log(`[MCP Connect] Testing connection to ${data.type} server`);

        let transport;
        let client;

        try {
            // Create appropriate transport based on type
            if (data.type === 'stdio') {
                if (!data.command) {
                    return NextResponse.json({ 
                        authorized: false,
                        error: 'Command required for local server' 
                    }, { status: 400 });
                }

                // Merge environment variables
                const mergedEnv = { ...process.env, ...(data.env || {}) } as Record<string, string>;

                transport = new StdioClientTransport({
                    command: data.command,
                    args: data.args || [],
                    env: mergedEnv,
                });
            } else {
                // Remote server (SSE or HTTP)
                if (!data.url) {
                    return NextResponse.json({ 
                        authorized: false,
                        error: 'URL required for remote server' 
                    }, { status: 400 });
                }

                // For both SSE and HTTP, we use SSEClientTransport
                // (Streamable HTTP requires a different transport not yet implemented)
                const opts = data.headers ? { 
                    requestInit: { headers: new Headers(data.headers) } 
                } : undefined;

                transport = new SSEClientTransport(new URL(data.url), opts);
            }

            // Create MCP client
            client = new Client({
                name: "mcp-sentry-connector",
                version: "1.0.0",
            }, {
                capabilities: {}
            });

            // Connect to server
            await client.connect(transport);
            console.log(`[MCP Connect] Connected successfully`);

            // Fetch capabilities
            const toolsResult = await client.listTools();
            const tools = toolsResult.tools.map((tool) => ({
                name: tool.name,
                description: tool.description,
                inputSchema: tool.inputSchema,
            }));

            // Fetch prompts (optional capability)
            let prompts = [];
            try {
                const promptsResult = await client.listPrompts();
                prompts = promptsResult.prompts.map((prompt) => ({
                    name: prompt.name,
                    description: prompt.description,
                    arguments: prompt.arguments,
                }));
            } catch (err) {
                console.log('[MCP Connect] Prompts not supported by this server');
            }

            // Fetch resources (optional capability)
            let resources = [];
            try {
                const resourcesResult = await client.listResources();
                resources = resourcesResult.resources.map((resource) => ({
                    uri: resource.uri,
                    name: resource.name,
                    description: resource.description,
                    mimeType: resource.mimeType,
                }));
            } catch (err) {
                console.log('[MCP Connect] Resources not supported by this server');
            }

            // Close connection
            await client.close();

            console.log(`[MCP Connect] Discovered ${tools.length} tools, ${prompts.length} prompts, ${resources.length} resources`);

            return NextResponse.json({
                authorized: true,
                connected: true,
                tools,
                prompts,
                resources,
                message: `Successfully connected and discovered ${tools.length} tool(s)`,
            });

        } catch (error: any) {
            console.error(`[MCP Connect] Connection failed:`, error.message);

            // Close client if it was opened
            if (client) {
                try {
                    await client.close();
                } catch (e) {
                    // Ignore close errors
                }
            }

            return NextResponse.json({
                authorized: false,
                connected: false,
                error: error.message,
                message: `Failed to connect: ${error.message}`,
                tools: [],
                prompts: [],
                resources: [],
            }, { status: 200 }); // Return 200 so UI can show the error gracefully
        }

    } catch (error: any) {
        console.error('[MCP Connect] Error:', error);
        return NextResponse.json({ 
            authorized: false,
            error: error.message || 'Connection test failed' 
        }, { status: 500 });
    }
}
