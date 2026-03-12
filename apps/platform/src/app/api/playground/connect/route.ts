import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

export const dynamic = 'force-dynamic';

interface PlaygroundConnectRequest {
    userId: string;
    mcpId: string;
}

/**
 * POST /api/playground/connect
 * Connect to a registered MCP server in the playground
 * This fetches the server config from database and establishes connection
 */
export async function POST(req: Request) {
    const supabaseAdmin = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    try {
        const { userId, mcpId }: PlaygroundConnectRequest = await req.json();

        if (!userId || !mcpId) {
            return NextResponse.json({ 
                error: 'userId and mcpId are required' 
            }, { status: 400 });
        }

        console.log(`[Playground] User ${userId} connecting to ${mcpId}`);

        // Fetch MCP server configuration from database
        const { data: server, error: fetchError } = await supabaseAdmin
            .from('mcp_servers')
            .select('*')
            .eq('id', mcpId)
            .single();

        if (fetchError || !server) {
            console.error('[Playground] Server not found:', fetchError);
            return NextResponse.json({ 
                error: 'MCP server not found' 
            }, { status: 404 });
        }

        // Check access rights (user must own the server or it must be public)
        if (server.owner_id !== userId && !server.is_public) {
            return NextResponse.json({ 
                error: 'Access denied to this MCP server' 
            }, { status: 403 });
        }

        console.log(`[Playground] Connecting to ${server.name} (${server.server_location})`);

        let transport;
       let client;

        try {
            // Create transport based on server configuration
            if (server.server_location === 'local') {
                const localConfig = typeof server.local_config === 'string' 
                    ? JSON.parse(server.local_config) 
                    : server.local_config;

                // Merge environment variables
                const mergedEnv = { 
                    ...process.env, 
                    ...(localConfig.envVars || {}) 
                } as Record<string, string>;

                transport = new StdioClientTransport({
                    command: localConfig.command,
                    args: localConfig.args || [],
                    env: mergedEnv,
                });
            } else {
                // Remote server
                if (!server.url) {
                    return NextResponse.json({ 
                        error: 'Server URL not configured' 
                    }, { status: 500 });
                }

                transport = new SSEClientTransport(new URL(server.url));
            }

            // Create MCP client
            client = new Client({
                name: "mcp-sentry-playground",
                version: "1.0.0",
            }, {
                capabilities: {}
            });

            // Connect to server
            await client.connect(transport);
            console.log(`[Playground] Connected successfully`);

            // Fetch current capabilities
            const toolsResult = await client.listTools();
            const tools = toolsResult.tools.map((tool) => ({
                name: tool.name,
                description: tool.description,
                inputSchema: tool.inputSchema,
            }));

            // Fetch prompts (optional)
            let prompts = [];
            try {
                const promptsResult = await client.listPrompts();
                prompts = promptsResult.prompts.map((prompt) => ({
                    name: prompt.name,
                    description: prompt.description,
                    arguments: prompt.arguments,
                }));
            } catch (err) {
                console.log('[Playground] Prompts not supported');
            }

            // Fetch resources (optional)
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
                console.log('[Playground] Resources not supported');
            }

            // Close connection (we're just fetching capabilities)
            await client.close();

            console.log(`[Playground] Connection successful - ${tools.length} tools available`);

            // Return capabilities and server info
            return NextResponse.json({
                success: true,
                server: {
                    id: server.id,
                    name: server.name,
                    description: server.description,
                    serverLocation: server.server_location,
                    transportType: server.transport_type,
                },
                capabilities: {
                    tools,
                    prompts,
                    resources,
                },
                message: `Connected to ${server.name}`,
            });

        } catch (connectionError: any) {
            console.error(`[Playground] Connection failed:`, connectionError.message);

            // Close client if it was opened
            if (client) {
                try {
                    await client.close();
                } catch (e) {
                    // Ignore close errors
                }
            }

            return NextResponse.json({
                success: false,
                error: connectionError.message,
                message: `Failed to connect to ${server.name}: ${connectionError.message}`,
            }, { status: 200 }); // Return 200 so UI can show error gracefully
        }

    } catch (error: any) {
        console.error('[Playground] Error:', error);
        return NextResponse.json({ 
            error: error.message || 'Playground connection failed' 
        }, { status: 500 });
    }
}
