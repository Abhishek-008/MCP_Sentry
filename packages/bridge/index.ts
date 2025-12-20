import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import axios from 'axios';

// Configuration
// In a real app, the user would pass their API Key here
const GATEWAY_URL = process.env.GATEWAY_URL || "http://localhost:8000";

async function main() {
    console.error(`[Bridge] Connecting to Gateway at ${GATEWAY_URL}...`);

    // 1. Initialize the Local MCP Server
    const server = new Server(
        {
            name: "mcp-cloud-bridge",
            version: "1.0.0",
        },
        {
            capabilities: {
                tools: {},
            },
        }
    );

    // 2. Cache for Tool ID Mapping
    // We need to map "airbnb_search" -> "UUID-123" so the Gateway knows what to load
    const toolIdMap = new Map<string, string>();

    // 3. Handle "List Tools"
    // When Cursor asks "What tools do you have?", we ask the Gateway.
    server.setRequestHandler(ListToolsRequestSchema, async () => {
        try {
            const response = await axios.get(`${GATEWAY_URL}/api/tools`);
            const tools = response.data.tools;

            // Update our map so we know which ID belongs to which tool name
            toolIdMap.clear();
            tools.forEach((t: any) => {
                if (t._toolId) {
                    toolIdMap.set(t.name, t._toolId);
                    delete t._toolId; // Remove internal ID before sending to Cursor
                }
            });

            return { tools };
        } catch (error: any) {
            console.error("[Bridge Error] Failed to fetch tools:", error.message);
            return { tools: [] }; // Return empty if gateway is down
        }
    });

    // 4. Handle "Call Tool"
    // When Cursor asks "Run airbnb_search", we forward it to the Gateway.
    server.setRequestHandler(CallToolRequestSchema, async (request) => {
        const toolName = request.params.name;
        const args = request.params.arguments;
        const toolId = toolIdMap.get(toolName);

        if (!toolId) {
            throw new Error(`Tool ${toolName} not found in map. Did you refresh?`);
        }

        try {
            console.error(`[Bridge] Forwarding ${toolName} to Cloud...`);

            const response = await axios.post(`${GATEWAY_URL}/api/execute`, {
                toolId: toolId,
                toolName: toolName,
                arguments: args
            });

            // The Gateway returns the raw result. We wrap it in MCP format.
            // Note: Your Executor currently returns the raw JSON from the tool.
            // We assume the tool output is text/json.
            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify(response.data.result, null, 2),
                    },
                ],
            };

        } catch (error: any) {
            console.error("[Bridge Error] Execution failed:", error.response?.data || error.message);
            return {
                content: [
                    {
                        type: "text",
                        text: `Error: ${error.message}`,
                    },
                ],
                isError: true,
            };
        }
    });

    // 5. Connect to Stdio
    // This is how Cursor talks to this script
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("[Bridge] Ready.");
}

main().catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
});