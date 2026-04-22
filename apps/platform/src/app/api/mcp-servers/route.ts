import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

interface RegisterServerRequest {
    // Basic information
    name: string;
    description?: string;

    // Server configuration
    serverLocation: 'remote' | 'local';
    transportType: 'sse' | 'http' | 'stdio';

    // Remote server fields
    url?: string;

    // Local server fields
    localConfig?: {
        command: string;
        args?: string[];
        envVars?: Record<string, string>;
    };

    // Capabilities (from connection test)
    tools?: any[];
    prompts?: any[];
    resources?: any[];

    // Optional metadata
    tags?: string[];
    isPublic?: boolean;
}

/**
 * POST /api/mcp-servers
 * Register a new MCP server in the registry
 */
export async function POST(req: Request) {
    const supabaseAdmin = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    try {
        const body = await req.json();
        const data: RegisterServerRequest = body;
        const userId = body.userId;

         // Validate user
        if (!userId) {
            return NextResponse.json({ error: 'User ID required' }, { status: 400 });
        }

        // Validation
        if (!data.name || !data.serverLocation || !data.transportType) {
            return NextResponse.json({ 
                error: 'Missing required fields: name, serverLocation, transportType' 
            }, { status: 400 });
        }

        // Validate remote server has URL
        if (data.serverLocation === 'remote' && !data.url) {
            return NextResponse.json({ 
                error: 'URL is required for remote servers' 
            }, { status: 400 });
        }

        // Validate local server has config
        if (data.serverLocation === 'local' && !data.localConfig) {
            return NextResponse.json({ 
                error: 'Local configuration is required for local servers' 
            }, { status: 400 });
        }

        console.log(`[Register] Registering MCP server: ${data.name} (${data.serverLocation})`);

        // Prepare insert data
        const insertData: any = {
            name: data.name,
            description: data.description || null,
            server_location: data.serverLocation,
            transport_type: data.transportType,
            owner_id: userId,
            tools: data.tools || [],
            prompts: data.prompts || [],
            resources: data.resources || [],
            tags: data.tags || [],
            is_public: data.isPublic || false,
            status: 'active',
            approval_status: 'approved',
        };

        // Add location-specific fields
        if (data.serverLocation === 'remote') {
            insertData.url = data.url;
        } else {
            insertData.local_config = data.localConfig;
        }

        // Insert into database
        const { data: server, error: dbError } = await supabaseAdmin
            .from('mcp_servers')
            .insert(insertData)
            .select()
            .single();

        if (dbError) {
            console.error('[Register] Database error:', dbError);
            return NextResponse.json({ 
                error: 'Failed to register server',
                details: dbError.message 
            }, { status: 500 });
        }

        console.log(`[Register] Successfully registered server: ${server.id}`);

        return NextResponse.json({
            success: true,
            data: server,
            message: `Successfully registered ${data.name}`,
        }, { status: 201 });

    } catch (error: any) {
        console.error('[Register] Error:', error);
        return NextResponse.json({ 
            error: error.message || 'Registration failed' 
        }, { status: 500 });
    }
}

/**
 * GET /api/mcp-servers
 * List registered MCP servers
 */
export async function GET(req: Request) {
    const supabaseAdmin = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    try {
        const { searchParams } = new URL(req.url);
        const userId = searchParams.get('userId');
        const status = searchParams.get('status');
        const ownedByMe = searchParams.get('ownedByMe') === 'true';

        let query = supabaseAdmin
            .from('mcp_servers')
            .select('*');

        // Filter logic
        if (ownedByMe && userId) {
            query = query.eq('owner_id', userId);
        } else if (userId) {
            // Show user's servers OR public servers
            query = query.or(`owner_id.eq.${userId},is_public.eq.true`);
        } else {
            // No user context - show only public
            query = query.eq('is_public', true);
        }

        if (status) {
            query = query.eq('status', status);
        }

        query = query.order('created_at', { ascending: false });

        const { data: servers, error } = await query;

        if (error) {
            console.error('[List] Database error:', error);
            return NextResponse.json({ 
                error: 'Failed to fetch servers' 
            }, { status: 500 });
        }

        return NextResponse.json({
            success: true,
            data: servers,
            meta: {
                total: servers.length,
            },
        });

    } catch (error: any) {
        console.error('[List] Error:', error);
        return NextResponse.json({ 
            error: error.message || 'Failed to list servers' 
        }, { status: 500 });
    }
}
