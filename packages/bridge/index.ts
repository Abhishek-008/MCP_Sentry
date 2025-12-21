#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
    CallToolRequestSchema,
    ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

// Configuration
const GATEWAY_URL = process.env.GATEWAY_URL || "http://localhost:8000";
const API_KEY = process.env.MCP_API_KEY;

if (!API_KEY) {
    console.error("[Bridge] Error: MCP_API_KEY environment variable is required.");
    process.exit(1);
}

// Initialize MCP Server
const server = new Server(
    {
        name: "mcp-gateway-bridge",
        version: "1.0.0",
    },
    {
        capabilities: {
            tools: {},
        },
    }
);

/**
 * Handler: List Tools
 * Fetches the list of active tools from the Gateway
 */
server.setRequestHandler(ListToolsRequestSchema, async () => {
    try {
        const response = await fetch(`${GATEWAY_URL}/api/tools`, {
            method: "GET",
            headers: {
                "Content-Type": "application/json",
                "x-api-key": API_KEY, // <--- CRITICAL FIX: Send the Key
            },
        });

        if (!response.ok) {
            throw new Error(`Gateway returned ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();
        return {
            tools: data.tools || [],
        };
    } catch (error: any) {
        console.error("[Bridge] Failed to fetch tools:", error.message);
        return { tools: [] };
    }
});

/**
 * Handler: Call Tool
 * Forwards execution requests to the Gateway
 */
server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    // We need to find the toolId. 
    // In the 'List Tools' response, we embedded it as '_toolId'.
    // However, the client (Cursor) doesn't pass that back to us.
    // We must re-fetch the list to find the ID, OR rely on the Gateway 
    // to find the tool by name (if names are unique).

    // OPTION A: Robust Lookup (Fetch list first)
    // This is safer because multiple users might have a tool named "search".
    // The Bridge runs locally for ONE user, so we filter by that user's view.
    try {
        // 1. Get Tool ID
        const toolsResponse = await fetch(`${GATEWAY_URL}/api/tools`, {
            headers: { "x-api-key": API_KEY }
        });
        const toolsData = await toolsResponse.json();
        const toolDef = toolsData.tools.find((t: any) => t.name === name);

        if (!toolDef || !toolDef._toolId) {
            throw new Error(`Tool '${name}' not found on Gateway.`);
        }

        // 2. Execute
        const executeResponse = await fetch(`${GATEWAY_URL}/api/execute`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "x-api-key": API_KEY, // <--- CRITICAL FIX
            },
            body: JSON.stringify({
                toolId: toolDef._toolId,
                toolName: name,
                arguments: args,
            }),
        });

        if (!executeResponse.ok) {
            const errText = await executeResponse.text();
            return {
                content: [{ type: "text", text: `Gateway Error: ${errText}` }],
                isError: true
            };
        }

        const result = await executeResponse.json();

        // Check if the result is already in MCP format, or wrap it
        if (result.success && result.result) {
            // If result.result is already an array of content
            if (Array.isArray(result.result.content)) {
                return result.result;
            }
            // Fallback for simple results
            return {
                content: [{ type: "text", text: JSON.stringify(result.result, null, 2) }]
            };
        }

        return {
            content: [{ type: "text", text: JSON.stringify(result, null, 2) }]
        };

    } catch (error: any) {
        return {
            content: [{ type: "text", text: `Bridge Error: ${error.message}` }],
            isError: true,
        };
    }
});

// Start the Server
async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("[Bridge] Connected to Gateway at", GATEWAY_URL);
}

main().catch((error) => {
    console.error("[Bridge] Fatal error:", error);
    process.exit(1);
});