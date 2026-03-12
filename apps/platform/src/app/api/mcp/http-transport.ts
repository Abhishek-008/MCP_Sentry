import { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js';

/**
 * Custom HTTP transport for MCP servers that use JSON-RPC over HTTP POST
 * instead of Server-Sent Events
 */
export class HTTPClientTransport implements Transport {
  private url: URL;
  private headers: Record<string, string>;
  
  onmessage?: (message: JSONRPCMessage) => void;
  onerror?: (error: Error) => void;
  onclose?: () => void;

  constructor(url: URL, headers?: Record<string, string>) {
    this.url = url;
    this.headers = headers || {};
  }

  async start(): Promise<void> {
    // HTTP transport doesn't need to establish a persistent connection
    console.log('[HTTP Transport] Ready to send requests to', this.url.toString());
  }

  async send(message: JSONRPCMessage): Promise<void> {
    try {
      console.log('[HTTP Transport] Sending message:', message);
      
      const response = await fetch(this.url.toString(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...this.headers,
        },
        body: JSON.stringify(message),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      console.log('[HTTP Transport] Received response:', data);
      
      // Call the message callback with the response
      if (this.onmessage) {
        this.onmessage(data as JSONRPCMessage);
      }
    } catch (error) {
      console.error('[HTTP Transport] Error:', error);
      if (this.onerror) {
        this.onerror(error as Error);
      }
      throw error;
    }
  }

  async close(): Promise<void> {
    console.log('[HTTP Transport] Closing');
    if (this.onclose) {
      this.onclose();
    }
  }
}
