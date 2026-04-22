import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { sessions } from '../sessions';

interface StreamRequest {
  sessionId: string;
  message: string;
  history: Array<{ role: 'user' | 'assistant'; content: string }>;
  apiKey: string;
  systemPrompt?: string;
}

export async function POST(req: NextRequest) {
  try {
    const body: StreamRequest = await req.json();
    const { sessionId, message, history, apiKey, systemPrompt } = body;

    console.log('Chat stream request - sessionId:', sessionId);
    console.log('Available sessions:', Array.from(sessions.keys()));

    // Validate inputs
    if (!sessionId || !message || !apiKey) {
      return NextResponse.json(
        { error: 'sessionId, message, and apiKey required' },
        { status: 400 }
      );
    }

    // Get session
    const session = sessions.get(sessionId);
    if (!session) {
      console.error('Session not found:', sessionId);
      return NextResponse.json(
        { error: 'Session not found or expired' },
        { status: 404 }
      );
    }

    console.log('Session found, processing chat...');

    // Initialize Gemini
    const genAI = new GoogleGenerativeAI(apiKey);

    // Clean JSON schemas for Gemini compatibility
    function cleanToolSchema(tool: any) {
      const cleanSchema = (schema: any): any => {
        if (!schema || typeof schema !== 'object') return schema;

        const cleaned = { ...schema };
        delete cleaned.$schema;
        delete cleaned.additionalProperties;

        if (cleaned.properties) {
          cleaned.properties = Object.entries(cleaned.properties).reduce(
            (acc, [key, value]) => {
              acc[key] = cleanSchema(value);
              return acc;
            },
            {} as any
          );
        }

        if (cleaned.items) {
          cleaned.items = cleanSchema(cleaned.items);
        }

        return cleaned;
      };

      return {
        name: tool.name,
        description: tool.description || 'No description provided',
        parameters: cleanSchema(tool.inputSchema || {}),
      };
    }

    // Map tools to Gemini format
    const geminiTools =
      session.tools && session.tools.length > 0
        ? session.tools.map(cleanToolSchema)
        : undefined;

    const model = genAI.getGenerativeModel({
      model: 'gemini-3-flash-preview',
      tools: geminiTools
        ? [
            {
              functionDeclarations: geminiTools,
            },
          ]
        : undefined,
      systemInstruction: {
        role: 'system',
        parts: [
          {
            text:
              systemPrompt ||
              "You are a helpful AI assistant. You have access to a set of tools from an MCP server. \n" +
                "Use these tools ONLY when the user's request specifically requires them. \n" +
                "For greetings like 'hi', 'hello', or general questions that do not require tool data, answer directly without using any tools. \n" +
                "Do not hallucinate tool calls. If a tool is not relevant, simply reply with text.",
          },
        ],
      },
    });

    // Prepare chat history
    let geminiHistory = history.map(h => ({
      role: h.role === 'user' ? 'user' : 'model',
      parts: [{ text: h.content }],
    }));

    // Ensure first message is from user
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

    // Send message
    const result = await chat.sendMessage(message);
    const response = await result.response;

    // Handle function calls
    const functionCalls = response.functionCalls();
    if (functionCalls && functionCalls.length > 0) {
      let currentResponse = response;
      let lastToolCall: any;

      for (const call of functionCalls) {
        console.log('Calling Tool:', call.name, call.args);
        try {
          const toolResult = await session.mcpClient.callTool({
            name: call.name,
            arguments: call.args as any,
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
                  content: toolResult.content,
                },
              },
            },
          ];

          const intermediary = await chat.sendMessage(toolResponsePart);
          currentResponse = await intermediary.response;
        } catch (toolErr: any) {
          console.error('Tool Execution Error:', toolErr);
          return NextResponse.json({
            text: `Error executing tool ${call.name}: ${toolErr.message}`,
            toolCall: lastToolCall,
          });
        }
      }

      return NextResponse.json({
        text: currentResponse.text(),
        toolCall: lastToolCall,
      });
    } else {
      return NextResponse.json({
        text: response.text(),
      });
    }
  } catch (error: any) {
    console.error('Chat stream error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to process chat' },
      { status: 500 }
    );
  }
}
