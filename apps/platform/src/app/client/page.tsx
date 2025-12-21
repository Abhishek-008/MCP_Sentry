"use client";

import React, { useState, useRef, useEffect } from 'react';
import { Send, Bot, User, Server, Settings, Terminal, Sparkles, MessageSquare, AlertCircle } from 'lucide-react';
import Header from '../components/Header';
import { sendMessage, ChatMessage } from '../actions/chat';

export default function ClientPage() {
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [showConnectModal, setShowConnectModal] = useState(false);
    const [serverConfig, setServerConfig] = useState('');
    const [connectedServer, setConnectedServer] = useState<string | null>(null);

    const messagesEndRef = useRef<HTMLDivElement>(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    const handleSend = async () => {
        if (!input.trim() || loading) return;

        const userMessage = input.trim();
        setInput('');
        setError(null);
        setLoading(true);

        // Add user message immediately
        const newHistory = [...messages, { role: 'user', content: userMessage } as ChatMessage];
        setMessages(newHistory);

        try {
            // Pass the connected server URL if available
            const result = await sendMessage(messages, userMessage, connectedServer || undefined);

            if (result.error) {
                setError(result.error);
                // Optionally remove the user message if it failed or show error bubble
            } else if (result.text) {
                setMessages([...newHistory, { role: 'assistant', content: result.text }]);
            }
        } catch (err: any) {
            setError(err.message || "An unexpected error occurred.");
        } finally {
            setLoading(false);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    const connectServer = () => {
        if (!serverConfig) return;
        setConnectedServer(serverConfig);
        setShowConnectModal(false);
        setMessages(prev => [...prev, { role: 'assistant', content: `Connected to MCP Server. I can now access tools from this server.` }]);
    };

    return (
        <div className="min-h-screen bg-black text-gray-100 font-mono flex flex-col">
            <Header />

            <div className="flex-1 flex overflow-hidden">
                {/* Sidebar - Tools / Servers */}
                <div className="w-64 bg-gray-900 border-r border-gray-800 hidden md:flex flex-col">
                    <div className="p-4 border-b border-gray-800 flex items-center justify-between">
                        <span className="font-semibold text-emerald-400 flex items-center gap-2">
                            <Server className="w-4 h-4" />
                            MCP Servers
                        </span>
                        <button className="text-gray-500 hover:text-gray-300">
                            <Settings className="w-4 h-4" />
                        </button>
                    </div>

                    <div className="flex-1 overflow-y-auto p-4 space-y-4">
                        {!connectedServer ? (
                            <div className="text-sm text-gray-500 text-center py-4 border border-dashed border-gray-800 rounded-lg">
                                <p>No active servers</p>
                                <button
                                    onClick={() => setShowConnectModal(true)}
                                    className="mt-2 text-xs text-emerald-500 hover:text-emerald-400"
                                >
                                    + Connect Server
                                </button>
                            </div>
                        ) : (
                            <div className="bg-gray-800/50 p-3 rounded-lg border border-gray-700/50">
                                <div className="flex items-center gap-2 mb-2">
                                    <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
                                    <span className="text-sm font-medium truncate" title={connectedServer}>
                                        {connectedServer.startsWith('{') ? 'Custom Configuration' : connectedServer}
                                    </span>
                                </div>
                                <div className="space-y-1">
                                    <div className="text-xs text-gray-400 flex items-center gap-1">
                                        <Terminal className="w-3 h-3" />
                                        <span>Click to disconnect</span>
                                    </div>
                                    <button
                                        onClick={() => setConnectedServer(null)}
                                        className="text-[10px] text-red-400 hover:underline"
                                    >
                                        Disconnect
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="p-4 border-t border-gray-800 bg-gray-900/50">
                        <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-emerald-500/20 flex items-center justify-center">
                                <Sparkles className="w-4 h-4 text-emerald-400" />
                            </div>
                            <div className="flex-1">
                                <p className="text-xs font-medium text-emerald-400">Gemini Pro</p>
                                <p className="text-[10px] text-gray-500">Model Active</p>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Main Chat Area */}
                <div className="flex-1 flex flex-col bg-black relative">
                    {/* Chat Messages */}
                    <div className="flex-1 overflow-y-auto p-6 space-y-6 scrollbar-thin scrollbar-thumb-gray-800">
                        {messages.length === 0 ? (
                            <div className="h-full flex flex-col items-center justify-center text-gray-500 opacity-50">
                                <Bot className="w-16 h-16 mb-4 text-emerald-500/50" />
                                <p className="text-lg">How can I help you today?</p>
                                <p className="text-sm">I can help you interact with your MCP tools.</p>
                            </div>
                        ) : (
                            messages.map((msg, idx) => (
                                <div
                                    key={idx}
                                    className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-in fade-in slide-in-from-bottom-2`}
                                >
                                    <div
                                        className={`max-w-[80%] rounded-2xl px-5 py-3 ${msg.role === 'user'
                                            ? 'bg-emerald-600 text-white rounded-br-none'
                                            : 'bg-gray-800/80 text-gray-200 border border-gray-700/50 rounded-bl-none'
                                            }`}
                                    >
                                        <p className="whitespace-pre-wrap">{msg.content}</p>
                                    </div>
                                </div>
                            ))
                        )}
                        {loading && (
                            <div className="flex justify-start">
                                <div className="bg-gray-800/80 rounded-2xl px-5 py-3 rounded-bl-none border border-gray-700/50 flex items-center gap-2 text-gray-400">
                                    <Bot className="w-4 h-4 animate-pulse" />
                                    <span className="text-sm">Thinking...</span>
                                </div>
                            </div>
                        )}
                        <div ref={messagesEndRef} />
                    </div>

                    {/* Error Message */}
                    {error && (
                        <div className="absolute bottom-24 left-6 right-6 mx-auto max-w-2xl bg-red-500/10 border border-red-500/20 text-red-200 px-4 py-2 rounded-lg flex items-center gap-2 text-sm backdrop-blur-sm">
                            <AlertCircle className="w-4 h-4" />
                            <span>{error}</span>
                        </div>
                    )}

                    {/* Input Area */}
                    <div className="p-4 border-t border-gray-800 bg-black/50 backdrop-blur-xl">
                        <div className="max-w-4xl mx-auto relative group">
                            <textarea
                                value={input}
                                onChange={(e) => setInput(e.target.value)}
                                onKeyDown={handleKeyDown}
                                placeholder="Send a message..."
                                disabled={loading}
                                className="w-full bg-gray-900/50 border border-gray-700 rounded-xl pl-4 pr-12 py-3 focus:outline-none focus:border-emerald-500/50 transition-colors resize-none disabled:opacity-50 text-sm min-h-[50px] max-h-[200px]"
                                rows={1}
                                style={{ height: 'auto', minHeight: '50px' }}
                            />
                            <button
                                onClick={handleSend}
                                disabled={!input.trim() || loading}
                                className="absolute right-2 top-1/2 -translate-y-1/2 p-2 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-500 rounded-lg transition-all disabled:opacity-0 disabled:scale-75"
                            >
                                <Send className="w-4 h-4" />
                            </button>
                        </div>
                        <div className="text-center mt-2">
                            <p className="text-[10px] text-gray-600">
                                AI can make mistakes. Please verify important information.
                            </p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Connect Modal */}
            {showConnectModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
                    <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 w-full max-w-md shadow-2xl">
                        <h3 className="text-lg font-bold mb-4">Connect MCP Server</h3>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-400 mb-2">
                                    MCP Server Configuration (JSON)
                                </label>
                                <textarea
                                    value={serverConfig}
                                    onChange={(e) => setServerConfig(e.target.value)}
                                    placeholder={`{
  "mcpServers": {
    "my-server": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-memory"]
    }
  }
}`}
                                    className="w-full bg-black border border-gray-700 rounded-lg px-4 py-2 focus:outline-none focus:border-emerald-500 text-sm font-mono h-48"
                                />
                            </div>
                            <div className="flex justify-end gap-3 font-medium text-sm">
                                <button
                                    onClick={() => setShowConnectModal(false)}
                                    className="text-gray-400 hover:text-gray-200 px-3 py-2"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={connectServer}
                                    className="bg-emerald-500 hover:bg-emerald-600 text-black px-4 py-2 rounded-lg"
                                >
                                    Connect
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
