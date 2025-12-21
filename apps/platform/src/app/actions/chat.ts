'use server';

import { GoogleGenerativeAI, FunctionDeclarationSchema } from '@google/generative-ai';
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { EventSource } from 'eventsource';

// Polyfill EventSource for Node.js environment
// @ts-ignore
global.EventSource = EventSource;

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

export interface ChatMessage {
    role: 'user' | 'assistant';
    content: string;
}

export async function sendMessage(history: ChatMessage[], message: string, serverConfig?: string) {
    let mcpClient: Client | null = null;
    let transport: SSEClientTransport | StdioClientTransport | null = null;

    try {
        if (!process.env.GEMINI_API_KEY) {
            return { error: 'GEMINI_API_KEY is not configured in environment variables.' };
        }

        // Initialize Gemini Model
        // Use gemini-2.0-flash-exp (or gemini-pro) which supports tools well
        // Falling back to gemini-1.5-flash as requested previously
        const modelName = 'gemini-2.5-flash'; // Using a known strong model for tools if possible, or fallback

        let tools: any[] = [];
        let model: any;

        // 1. Connect to MCP Server if configuration is provided
        if (serverConfig) {
            console.log("Current Server CWD:", process.cwd());
            try {
                // Check if it's a URL (SSE) or JSON (Stdio)
                const isUrl = serverConfig.startsWith('http://') || serverConfig.startsWith('https://');
                const isJson = serverConfig.trim().startsWith('{');

                if (isUrl) {
                    transport = new SSEClientTransport(new URL(serverConfig));
                } else if (isJson) {
                    // Assume JSON configuration for Stdio
                    try {
                        const config = JSON.parse(serverConfig);
                        let serverDef;

                        // Support both raw server definition or the "mcpServers" format
                        if (config.mcpServers) {
                            const serverName = Object.keys(config.mcpServers)[0];
                            if (serverName) {
                                serverDef = config.mcpServers[serverName];
                            }
                        } else {
                            serverDef = config;
                        }

                        if (!serverDef || !serverDef.command) {
                            throw new Error("Invalid MCP configuration: missing 'command'");
                        }

                        transport = new StdioClientTransport({
                            command: serverDef.command,
                            args: serverDef.args || [],
                            env: {
                                ...process.env,
                                ...serverDef.env
                            }
                        });
                    } catch (parseErr: any) {
                        throw new Error(`Failed to parse server configuration: ${parseErr.message}`);
                    }
                } else {
                    // Treat as a direct file path (User convenience)
                    // Auto-detect runtime based on extension
                    const scriptPath = serverConfig.trim();
                    const isJs = scriptPath.endsWith(".js");
                    const isTs = scriptPath.endsWith(".ts");
                    const isPy = scriptPath.endsWith(".py");

                    let command = "";
                    let args: string[] = [];

                    if (isJs) {
                        command = process.execPath; // node
                        args = [scriptPath];
                    } else if (isTs) {
                        // Use npx tsx to execute typescript files
                        command = "npx";
                        args = ["-y", "tsx", scriptPath];
                    } else if (isPy) {
                        command = process.platform === "win32" ? "python" : "python3";
                        args = [scriptPath];
                    } else {
                        // Default fallback or error
                        throw new Error("Unknown script type. Please use .js, .ts, or .py, or provide a full JSON configuration.");
                    }

                    console.log(`Auto-detected MCP Server: ${command} ${args.join(' ')}`);

                    transport = new StdioClientTransport({
                        command,
                        args,
                        env: {
                            ...process.env,
                            // Fallback API Key for convenience if not set globally
                            MCP_API_KEY: process.env.MCP_API_KEY || "mcp_sk_dce473d11962478091a279cc1992e07c",
                            PORT: "8000"
                        }
                    });
                }

                mcpClient = new Client({
                    name: "mcp-client-nextjs",
                    version: "1.0.0",
                }, {
                    capabilities: {}
                });

                await mcpClient.connect(transport!);

                const toolsList = await mcpClient.listTools();

                // Map MCP Tools to Gemini Tools
                tools = [{
                    functionDeclarations: toolsList.tools.map(tool => ({
                        name: tool.name,
                        description: tool.description,
                        parameters: tool.inputSchema as FunctionDeclarationSchema,
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
            tools: tools
        });

        // 2. Prepare Chat History
        let geminiHistory = history.map(h => ({
            role: h.role === 'user' ? 'user' : 'model',
            parts: [{ text: h.content }],
        }));

        // Gemini requires history to start with a 'user' role
        // Provide a valid history by removing leading 'model' messages
        const firstUserIndex = geminiHistory.findIndex(h => h.role === 'user');
        if (firstUserIndex === -1) {
            // No user messages in history yet (or only model messages)
            // We can safely clear history because the current 'message' will be the first user message
            geminiHistory = [];
        } else if (firstUserIndex > 0) {
            geminiHistory = geminiHistory.slice(firstUserIndex);
        }

        const chat = model.startChat({
            history: geminiHistory,
        });

        // 3. Send Message
        const result = await chat.sendMessage(message);
        const response = await result.response;

        // 4. Handle Function Calls
        // complex handling for tool use
        const functionCalls = response.functionCalls();
        if (functionCalls && functionCalls.length > 0 && mcpClient) {
            // Execute tools
            // Note: Simplification - we only handle sequential calls here or the first one
            // In a real robust implementation, we'd handle loop

            const call = functionCalls[0];
            console.log("Calling Tool:", call.name, call.args);

            try {
                const toolResult = await mcpClient.callTool({
                    name: call.name,
                    arguments: call.args as any
                });

                // Send result back to Gemini
                // We need to construct the history update
                // This is a bit tricky with the SDK stateless wrapper, 
                // typically we'd send the tool response as a new message part

                // Construct Tool Response Part
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

                const finalResult = await chat.sendMessage(toolResponsePart);
                const finalResponse = await finalResult.response;
                return { text: finalResponse.text() };

            } catch (toolErr: any) {
                console.error("Tool Execution Error:", toolErr);
                return { text: `Error executing tool ${call.name}: ${toolErr.message}` };
            }

        } else {
            return { text: response.text() };
        }

    } catch (error: any) {
        console.error("Gemini/MCP Error:", error);
        return { error: error.message || 'Failed to process request.' };
    } finally {
        // Cleanup MCP connection
        if (transport) {
            // For Stdio, we might want to close to kill the process
            // For SSE, close connection
            // However, separating 'transport' variable types is hard without casting or distinct handling
            // transport.close() exists on both? 
            // StdioClientTransport: close() kills the process usually.
            // SSEClientTransport: close() closes the event source.

            try {
                // @ts-ignore
                await mcpClient?.close();
            } catch (e) {
                console.error("Error closing client:", e);
            }
        }
    }
}
