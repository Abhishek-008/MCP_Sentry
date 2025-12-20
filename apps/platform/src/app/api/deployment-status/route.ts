import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(request: Request) {
    console.log('[Deployment Status] Route handler called');
    
    try {
        const { searchParams } = new URL(request.url);
        const toolId = searchParams.get('toolId');

        console.log('[Deployment Status] Query for toolId:', toolId);

        if (!toolId) {
            return NextResponse.json({ error: 'Missing toolId' }, { status: 400 });
        }

        // Fetch tool status and deployment URL
        const { data: tool, error } = await supabaseAdmin
            .from('tools')
            .select('id, status, deployment_url, error_log')
            .eq('id', toolId)
            .single();

        if (error) {
            console.error('[Deployment Status] DB Error:', error);
            return NextResponse.json({ error: 'Tool not found', details: error.message }, { status: 404 });
        }

        if (!tool) {
            console.log('[Deployment Status] Tool not found in database');
            return NextResponse.json({ error: 'Tool not found' }, { status: 404 });
        }

        console.log('[Deployment Status] Found tool:', tool.id, 'status:', tool.status);

        return NextResponse.json({
            toolId: tool.id,
            status: tool.status,
            deploymentUrl: tool.deployment_url,
            errorMessage: tool.error_log
        });

    } catch (error) {
        console.error('[Deployment Status] Server Error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
