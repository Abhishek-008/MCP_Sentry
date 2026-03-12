import { NextRequest, NextResponse } from 'next/server';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { randomUUID } from 'crypto';
import { EventSource } from 'eventsource';
import { sessions, SessionData, cleanupOldSessions } from '../sessions';

// @ts-ignore - Polyfill EventSource for server-side
global.EventSource = EventSource;

interface ActivateRequest {
  serverId?: string;
  serverUrl?: string;
  serverName?: string;
  location?: 'local' | 'remote';
  localConfig?: {
    command: string;
    args?: string[];
    env?: Record<string, string>;
  };
  selectedTools?: string[];
  sessionId?: string; // For reconnection
}

export async function POST(req: NextRequest) {
  try {
    const body: ActivateRequest = await req.json();
    const { serverId, serverUrl, serverName, location, localConfig, selectedTools, sessionId: existingSessionId } = body;

    // Check for reconnection
    if (existingSessionId && sessions.has(existingSessionId)) {
      const session = sessions.get(existingSessionId)!;
      return NextResponse.json({
        sessionId: session.sessionId,
        tools: session.tools,
        status: 'reconnected',
      });
    }

    // Validate inputs
    if (!serverUrl && !localConfig) {
      return NextResponse.json(
        { error: 'Either serverUrl or localConfig must be provided' },
        { status: 400 }
      );
    }

    let transport: SSEClientTransport | StdioClientTransport;
    let mcpClient: Client;

    // Create appropriate transport
    if (location === 'local' && localConfig) {
      console.log('Creating STDIO transport for local server:', localConfig);
      transport = new StdioClientTransport({
        command: localConfig.command,
        args: localConfig.args || [],
        env: localConfig.env || {},
      });
    } else if (serverUrl) {
      console.log('Creating SSE transport for remote server:', serverUrl);
      transport = new SSEClientTransport(new URL(serverUrl));
    } else {
      return NextResponse.json(
        { error: 'Invalid server configuration' },
        { status: 400 }
      );
    }

    // Create MCP client
    mcpClient = new Client(
      {
        name: 'mcp-sentry-client',
        version: '1.0.0',
      },
      {
        capabilities: {},
      }
    );

    // Connect to server
    await mcpClient.connect(transport);
    console.log('Connected to MCP server');

    // List available tools
    const toolsList = await mcpClient.listTools();
    console.log('Available tools:', toolsList.tools.length);

    // Filter tools if selectedTools is provided
    const availableTools = selectedTools && selectedTools.length > 0
      ? toolsList.tools.filter(tool => selectedTools.includes(tool.name))
      : toolsList.tools;

    // Create session
    const newSessionId = randomUUID();
    const sessionData: SessionData = {
      sessionId: newSessionId,
      mcpClient,
      transport,
      tools: availableTools,
      serverConfig: {
        serverId,
        serverUrl,
        name: serverName || 'MCP Server',
        location: location || 'remote',
        selectedTools,
      },
      createdAt: new Date(),
    };

    sessions.set(newSessionId, sessionData);
    console.log(`Session ${newSessionId} created with ${availableTools.length} tools`);

    // Cleanup old sessions
    cleanupOldSessions();

    return NextResponse.json({
      sessionId: newSessionId,
      tools: availableTools,
      status: 'activated',
    });
  } catch (error: any) {
    console.error('Session activation error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to activate session' },
      { status: 500 }
    );
  }
}

// Get session info
export async function GET(req: NextRequest) {
  const sessionId = req.nextUrl.searchParams.get('sessionId');
  
  if (!sessionId) {
    return NextResponse.json({ error: 'sessionId required' }, { status: 400 });
  }

  const session = sessions.get(sessionId);
  if (!session) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 });
  }

  return NextResponse.json({
    sessionId: session.sessionId,
    tools: session.tools,
    serverConfig: session.serverConfig,
    createdAt: session.createdAt,
  });
}

// Deactivate session
export async function DELETE(req: NextRequest) {
  const sessionId = req.nextUrl.searchParams.get('sessionId');
  
  if (!sessionId) {
    return NextResponse.json({ error: 'sessionId required' }, { status: 400 });
  }

  const session = sessions.get(sessionId);
  if (session) {
    try {
      // @ts-ignore
      await session.mcpClient.close?.();
    } catch (e) {
      console.error('Error closing session:', e);
    }
    sessions.delete(sessionId);
    console.log(`Session ${sessionId} deactivated`);
  }

  return NextResponse.json({ status: 'deactivated' });
}
