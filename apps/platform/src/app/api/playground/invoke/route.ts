import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

export const dynamic = 'force-dynamic';

interface InvokeRequest {
    mcpId: string;
    toolName: string;
    arguments: Record<string, any>;
    userId: string;
}

/**
 * POST /api/playground/invoke
 * Invoke a tool from a connected MCP server
 */
export async function POST(req: Request) {
    const supabaseAdmin = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    let client: Client | null = null;

    try {
        const body: InvokeRequest = await req.json();
        const { mcpId, toolName, arguments: toolArgs, userId } = body;

        if (!mcpId || !toolName || !userId) {
            return NextResponse.json({ 
                error: 'Missing required fields: mcpId, toolName, userId' 
            }, { status: 400 });
        }

        console.log(`[Playground] Invoking tool ${toolName} on server ${mcpId}`);

        // Fetch server configuration from database
        const { data: server, error: dbError } = await supabaseAdmin
            .from('mcp_servers')
            .select('*')
            .eq('id', mcpId)
            .single();

        if (dbError || !server) {
            return NextResponse.json({ 
                error: 'MCP server not found' 
            }, { status: 404 });
        }

        // Check access permissions (owner or public)
        if (server.owner_id !== userId && !server.is_public) {
            return NextResponse.json({ 
                error: 'Access denied to this MCP server' 
            }, { status: 403 });
        }

        // Create transport based on server configuration
        let transport;

        if (server.server_location === 'remote') {
            if (!server.url) {
                throw new Error('Remote server missing URL');
            }

            console.log(`[Playground] Connecting to remote server: ${server.url}`);
            const transportType = server.transport_type || 'sse';
            if (transportType === 'http' || transportType === 'streamable_http') {
                transport = new StreamableHTTPClientTransport(new URL(server.url));
            } else {
                transport = new SSEClientTransport(new URL(server.url));
            }
        } else {
            // Local server
            const config = server.local_config;
            if (!config?.command) {
                throw new Error('Local server missing command configuration');
            }

            console.log(`[Playground] Spawning local server: ${config.command}`);
            
            // Prepare environment variables
            const mergedEnv = { ...process.env, ...(config.env || {}) } as Record<string, string>;

            transport = new StdioClientTransport({
                command: config.command,
                args: config.args || [],
                env: mergedEnv,
            });
        }

        // Initialize client and connect
        client = new Client({
            name: 'mcp-sentry-playground',
            version: '1.0.0',
        }, {
            capabilities: {},
        });

        await client.connect(transport);
        console.log(`[Playground] Connected to server ${mcpId}`);

        // Invoke the tool
        console.log(`[Playground] Invoking tool: ${toolName} with args:`, toolArgs);
        
        const result = await client.callTool({
            name: toolName,
            arguments: toolArgs || {},
        });

        console.log(`[Playground] Tool invocation successful`);

        // Close connection
        await client.close();
        client = null;

        return NextResponse.json({
            success: true,
            result: result.content,
            isError: result.isError || false,
        }, { status: 200 });

    } catch (error: any) {
        console.error('[Playground] Invocation error:', error);

        // Cleanup connection
        if (client) {
            try {
                await client.close();
            } catch (closeError) {
                console.error('[Playground] Error closing client:', closeError);
            }
        }

        return NextResponse.json({ 
            success: false,
            error: error.message || 'Tool invocation failed',
            details: error.toString(),
        }, { status: 500 });
    }
}
