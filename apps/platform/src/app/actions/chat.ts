'use server';

import { GoogleGenerativeAI, FunctionDeclarationSchema } from '@google/generative-ai';
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { EventSource } from 'eventsource';

// Polyfill EventSource for Node.js environment
// @ts-ignore
global.EventSource = EventSource;

// Global instance removed to support per-request API keys
export interface ChatMessage {
    role: 'user' | 'assistant';
    content: string;
}

export interface ToolCallInfo {
    name: string;
    args: Record<string, unknown>;
    result: unknown;
}

export interface ToolInfo {
    name: string;
    description: string;
}

export interface PromptInfo {
    name: string;
    description: string;
}

export async function getTools(serverUrl: string): Promise<{ tools?: ToolInfo[]; error?: string }> {
    let transport: SSEClientTransport | null = null;
    try {
        transport = new SSEClientTransport(new URL(serverUrl));
        const mcpClient = new Client(
            { name: 'mcp-tool-lister', version: '1.0.0' },
            { capabilities: {} }
        );
        await mcpClient.connect(transport);
        const { tools } = await mcpClient.listTools();
        return {
            tools: tools.map(t => ({
                name: t.name,
                description: t.description ?? 'No description provided.',
            })),
        };
    } catch (err: any) {
        return { error: err.message || 'Failed to list tools.' };
    }
}

export async function getPrompts(serverUrl: string): Promise<{ prompts?: PromptInfo[]; error?: string }> {
    let transport: SSEClientTransport | null = null;
    try {
        transport = new SSEClientTransport(new URL(serverUrl));
        const mcpClient = new Client(
            { name: 'mcp-prompt-lister', version: '1.0.0' },
            { capabilities: {} }
        );
        await mcpClient.connect(transport);
        const { prompts } = await mcpClient.listPrompts();
        return {
            prompts: prompts.map((p: any) => ({
                name: p.name,
                description: p.description ?? 'No description provided.',
            })),
        };
    } catch (err: any) {
        return { error: err.message || 'Failed to list prompts.' };
    }
}

export async function sendMessage(
    history: ChatMessage[],
    message: string,
    serverUrl?: string,
    apiKey?: string,
    systemPrompt?: string,
    sessionId?: string // New parameter for session-based chat
) {
    // If sessionId is provided, use session-based chat API
    if (sessionId) {
        console.log('Using session-based chat with sessionId:', sessionId);
        try {
            const url = `${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/chat/stream`;
            const payload = {
                sessionId,
                message,
                history,
                apiKey: apiKey || process.env.GEMINI_API_KEY,
                systemPrompt,
            };
            console.log('Fetching:', url, 'with payload:', payload);
            
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });

            console.log('Response status:', response.status, response.ok);

            if (!response.ok) {
                const error = await response.json();
                console.error('API error response:', error);
                return { error: error.error || 'Failed to send message' };
            }

            const result = await response.json();
            console.log('API success response:', result);
            return result;
        } catch (error: any) {
            console.error('Session-based chat error:', error);
            return { error: error.message || 'Failed to process request' };
        }
    }

    // Original direct URL-based chat (for manual URL input)
    let mcpClient: Client | null = null;
    let transport: SSEClientTransport | null = null;

    try {
        const useApiKey = apiKey || process.env.GEMINI_API_KEY;
        if (!useApiKey) {
            return { error: 'GEMINI_API_KEY is not configured in environment variables and no custom API Key was provided.' };
        }

        const genAI = new GoogleGenerativeAI(useApiKey);

        // Initialize Gemini Model
        // Using gemini-3-flash-preview which supports function calling well
        const modelName = 'gemini-3-flash-preview'; // Using a known strong model for tools if possible, or fallback

        let tools: any[] = [];
        let model: any;

        // 1. Connect to MCP Server if URL is provided
        if (serverUrl) {
            try {
                transport = new SSEClientTransport(new URL(serverUrl));
                mcpClient = new Client({
                    name: "mcp-client-nextjs",
                    version: "1.0.0",
                }, {
                    capabilities: {}
                });

                await mcpClient.connect(transport);

                const toolsList = await mcpClient.listTools();

                // Helper to clean schema for Gemini
                const cleanSchema = (schema: any): any => {
                    if (!schema || typeof schema !== 'object') return schema;

                    const { additionalProperties, $schema, ...rest } = schema;

                    if (rest.properties) {
                        for (const key in rest.properties) {
                            rest.properties[key] = cleanSchema(rest.properties[key]);
                        }
                    }
                    if (rest.items) {
                        rest.items = cleanSchema(rest.items);
                    }

                    return rest;
                };

                // Map MCP Tools to Gemini Tools
                tools = [{
                    functionDeclarations: toolsList.tools.map(tool => ({
                        name: tool.name,
                        description: tool.description,
                        parameters: cleanSchema(tool.inputSchema) as FunctionDeclarationSchema,
                    }))
                }];

                console.log(`Connected to MCP Server. Found ${toolsList.tools.length} tools.`);

            } catch (err: any) {
                console.error("Failed to connect to MCP server:", err);
                return { error: `MCP Connection Failed: ${err.message}` };
            }
        }

        model = genAI.getGenerativeModel({
            model: 'gemini-2.5-flash',
            tools: tools,
            systemInstruction: {
                role: 'system',
                parts: [{
                    text: systemPrompt || "You are a helpful AI assistant. You have access to a set of tools from an MCP server. \n" +
                        "Use these tools ONLY when the user's request specifically requires them. \n" +
                        "For greetings like 'hi', 'hello', or general questions that do not require tool data, answer directly without using any tools. \n" +
                        "Do not hallucinate tool calls. If a tool is not relevant, simply reply with text."
                }]
            }
        });

        // 2. Prepare Chat History
        let geminiHistory = history.map(h => ({
            role: h.role === 'user' ? 'user' : 'model',
            parts: [{ text: h.content }],
        }));

        // Google Generative AI requires the first message in history to be from 'user'.
        if (geminiHistory.length > 0 && geminiHistory[0].role === 'model') {
            const firstUserIndex = geminiHistory.findIndex(h => h.role === 'user');
            if (firstUserIndex !== -1) {
                geminiHistory = geminiHistory.slice(firstUserIndex);
            } else {
                geminiHistory = [];
            }
        }

        const chat = model.startChat({
            history: geminiHistory,
        });

        // 3. Send Message
        const result = await chat.sendMessage(message);
        const response = await result.response;

        // 4. Handle Function Calls (loop over all calls)
        const functionCalls = response.functionCalls();
        if (functionCalls && functionCalls.length > 0 && mcpClient) {
            // Execute all tool calls sequentially
            let currentResponse = response;
            let lastToolCall: ToolCallInfo | undefined;

            for (const call of functionCalls) {
                console.log("Calling Tool:", call.name, call.args);
                try {
                    const toolResult = await mcpClient.callTool({
                        name: call.name,
                        arguments: call.args as any
                    });

                    lastToolCall = {
                        name: call.name,
                        args: call.args as Record<string, unknown>,
                        result: toolResult.content,
                    };

                    const toolResponsePart = [
                        {
                            functionResponse: {
                                name: call.name,
                                response: {
                                    name: call.name,
                                    content: toolResult.content
                                }
                            }
                        }
                    ];

                    const intermediary = await chat.sendMessage(toolResponsePart);
                    currentResponse = await intermediary.response;

                } catch (toolErr: any) {
                    console.error("Tool Execution Error:", toolErr);
                    return { text: `Error executing tool ${call.name}: ${toolErr.message}`, toolCall: lastToolCall };
                }
            }

            return { text: currentResponse.text(), toolCall: lastToolCall };

        } else {
            return { text: response.text() };
        }

    } catch (error: any) {
        console.error("Gemini/MCP Error:", error);
        return { error: error.message || 'Failed to process request.' };
    } finally {
        // Cleanup MCP connection
        if (transport) {
            // Close transport/client if method exists or relying on garbage collection/disconnect
            // mcpClient?.close(); // Client doesn't strictly have close, but transport might
        }
    }
}