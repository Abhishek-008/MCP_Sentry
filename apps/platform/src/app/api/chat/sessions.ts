import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

export interface SessionData {
  sessionId: string;
  mcpClient: Client;
  transport: SSEClientTransport | StdioClientTransport | StreamableHTTPClientTransport;
  tools: any[];
  serverConfig: {
    serverId?: string;
    serverUrl?: string;
    name: string;
    location: 'local' | 'remote';
    selectedTools?: string[];
  };
  createdAt: Date;
}

// Use global object to persist sessions across Next.js hot reloads and API route instances
declare global {
  var mcpSessions: Map<string, SessionData> | undefined;
}

// Shared session storage (In production, use Redis or database)
export const sessions = global.mcpSessions ?? new Map<string, SessionData>();

if (process.env.NODE_ENV !== 'production') {
  global.mcpSessions = sessions;
}

// Cleanup old sessions periodically
export function cleanupOldSessions() {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  for (const [sid, session] of sessions.entries()) {
    if (session.createdAt < oneHourAgo) {
      try {
        // @ts-ignore
        session.mcpClient.close?.();
      } catch (e) {
        console.error('Error closing old session:', e);
      }
      sessions.delete(sid);
      console.log(`Cleaned up old session: ${sid}`);
    }
  }
}
