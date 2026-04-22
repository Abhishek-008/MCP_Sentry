'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { 
    Server, Loader2, Play, ChevronRight, Database, Cloud, 
    Terminal, CheckCircle2, XCircle, AlertCircle, Code, FileText
} from 'lucide-react';
import { createClient } from '../../../utils/supabase/client';
import Header from '../components/Header';
import Footer from '../components/Footer';

interface MCPServer {
    id: string;
    name: string;
    description: string | null;
    server_location: 'remote' | 'local';
    transport_type: string;
    url: string | null;
    local_config: any;
    tool_count: number;
    owner_id: string;
    is_public: boolean;
}

interface Tool {
    name: string;
    description?: string;
    inputSchema?: {
        type: string;
        properties?: Record<string, any>;
        required?: string[];
    };
}

interface ToolResult {
    success: boolean;
    result?: any[];
    error?: string;
    isError?: boolean;
}

export default function PlaygroundPage() {
    const router = useRouter();
    const supabase = createClient();
    
    const [userId, setUserId] = useState<string | null>(null);
    const [servers, setServers] = useState<MCPServer[]>([]);
    const [selectedServer, setSelectedServer] = useState<MCPServer | null>(null);
    const [tools, setTools] = useState<Tool[]>([]);
    const [selectedTool, setSelectedTool] = useState<Tool | null>(null);
    
    const [loading, setLoading] = useState(true);
    const [connecting, setConnecting] = useState(false);
    const [invoking, setInvoking] = useState(false);
    
    const [toolArgs, setToolArgs] = useState<Record<string, any>>({});
    const [result, setResult] = useState<ToolResult | null>(null);

    useEffect(() => {
        fetchServers();
    }, []);

    const fetchServers = async () => {
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) {
            router.push('/login');
            return;
        }

        setUserId(user.id);

        const { data: serversData } = await supabase
            .from('mcp_servers')
            .select('*')
            .or(`owner_id.eq.${user.id},is_public.eq.true`)
            .eq('status', 'active')
            .order('created_at', { ascending: false });

        if (serversData) setServers(serversData as MCPServer[]);
        setLoading(false);
    };

    const connectToServer = async (server: MCPServer) => {
        setConnecting(true);
        setSelectedServer(server);
        setTools([]);
        setSelectedTool(null);
        setResult(null);
        setToolArgs({});

        try {
            const response = await fetch('/api/playground/connect', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    mcpId: server.id,
                    userId,
                }),
            });

            const data = await response.json();

            if (!data.success) {
                throw new Error(data.error || 'Connection failed');
            }

            setTools(data.capabilities?.tools || []);
        } catch (error: any) {
            alert(`Failed to connect: ${error.message}`);
            setSelectedServer(null);
        } finally {
            setConnecting(false);
        }
    };

    const selectTool = (tool: Tool) => {
        setSelectedTool(tool);
        setResult(null);
        
        // Initialize arguments with empty values
        const initialArgs: Record<string, any> = {};
        if (tool.inputSchema?.properties) {
            Object.keys(tool.inputSchema.properties).forEach(key => {
                initialArgs[key] = '';
            });
        }
        setToolArgs(initialArgs);
    };

    const updateArg = (key: string, value: any, type: string) => {
        let parsedValue = value;
        
        // Try to parse based on type
        if (type === 'number' || type === 'integer') {
            parsedValue = value === '' ? '' : Number(value);
        } else if (type === 'boolean') {
            parsedValue = value === 'true';
        } else if (type === 'array' || type === 'object') {
            try {
                parsedValue = value ? JSON.parse(value) : value;
            } catch {
                parsedValue = value;
            }
        }
        
        setToolArgs(prev => ({ ...prev, [key]: parsedValue }));
    };

    const invokeTool = async () => {
        if (!selectedServer || !selectedTool || !userId) return;

        setInvoking(true);
        setResult(null);

        try {
            // Filter out empty string arguments
            const cleanArgs: Record<string, any> = {};
            Object.entries(toolArgs).forEach(([key, value]) => {
                if (value !== '' && value !== null && value !== undefined) {
                    cleanArgs[key] = value;
                }
            });

            const response = await fetch('/api/playground/invoke', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    mcpId: selectedServer.id,
                    toolName: selectedTool.name,
                    arguments: cleanArgs,
                    userId,
                }),
            });

            const data = await response.json();
            setResult(data);
        } catch (error: any) {
            setResult({
                success: false,
                error: error.message || 'Invocation failed',
            });
        } finally {
            setInvoking(false);
        }
    };

    const renderInputField = (key: string, prop: any, isRequired: boolean) => {
        const type = prop.type || 'string';
        const description = prop.description || '';

        if (type === 'boolean') {
            return (
                <select
                    value={toolArgs[key]?.toString() || ''}
                    onChange={(e) => updateArg(key, e.target.value, type)}
                    className="w-full bg-black/50 border border-gray-700 rounded-lg px-4 py-2 text-white focus:border-emerald-500 focus:outline-none"
                >
                    <option value="">Select...</option>
                    <option value="true">true</option>
                    <option value="false">false</option>
                </select>
            );
        }

        if (type === 'array' || type === 'object') {
            return (
                <textarea
                    value={typeof toolArgs[key] === 'string' ? toolArgs[key] : JSON.stringify(toolArgs[key], null, 2)}
                    onChange={(e) => updateArg(key, e.target.value, type)}
                    placeholder={`JSON ${type}`}
                    rows={3}
                    className="w-full bg-black/50 border border-gray-700 rounded-lg px-4 py-2 text-white focus:border-emerald-500 focus:outline-none font-mono text-sm"
                />
            );
        }

        return (
            <input
                type={type === 'number' || type === 'integer' ? 'number' : 'text'}
                value={toolArgs[key] || ''}
                onChange={(e) => updateArg(key, e.target.value, type)}
                placeholder={description || `Enter ${key}`}
                className="w-full bg-black/50 border border-gray-700 rounded-lg px-4 py-2 text-white focus:border-emerald-500 focus:outline-none"
            />
        );
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-black flex items-center justify-center">
                <Loader2 className="w-8 h-8 text-emerald-500 animate-spin" />
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-black text-gray-100 font-mono flex flex-col">
            <Header />

            <div className="flex-1 max-w-7xl mx-auto px-6 py-12 w-full">
                <div className="mb-8">
                    <h1 className="text-3xl font-bold mb-2 flex items-center gap-3">
                        <Terminal className="w-8 h-8 text-emerald-500" />
                        MCP Playground
                    </h1>
                    <p className="text-gray-400">Connect to registered MCP servers and interact with their tools</p>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Left: Server List */}
                    <div className="lg:col-span-1">
                        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
                            <div className="bg-gray-800/50 border-b border-gray-800 px-4 py-3">
                                <h3 className="font-semibold text-white flex items-center gap-2">
                                    <Server className="w-4 h-4 text-emerald-500" />
                                    Available Servers
                                </h3>
                            </div>
                            <div className="divide-y divide-gray-800 max-h-[600px] overflow-y-auto">
                                {servers.length === 0 ? (
                                    <div className="p-6 text-center text-gray-500">
                                        <Database className="w-12 h-12 mx-auto mb-3 opacity-20" />
                                        <p className="text-sm">No servers available</p>
                                        <button
                                            onClick={() => router.push('/dashboard')}
                                            className="text-emerald-400 hover:text-emerald-300 text-sm mt-2"
                                        >
                                            Register a server →
                                        </button>
                                    </div>
                                ) : (
                                    servers.map(server => (
                                        <button
                                            key={server.id}
                                            onClick={() => connectToServer(server)}
                                            disabled={connecting}
                                            className={`w-full p-4 text-left transition-colors hover:bg-gray-800/50 disabled:opacity-50 ${
                                                selectedServer?.id === server.id ? 'bg-emerald-900/20 border-l-2 border-emerald-500' : ''
                                            }`}
                                        >
                                            <div className="flex items-start justify-between gap-2">
                                                <div className="flex-1 min-w-0">
                                                    <div className="font-semibold text-white truncate">{server.name}</div>
                                                    {server.description && (
                                                        <div className="text-xs text-gray-400 mt-1 line-clamp-2">{server.description}</div>
                                                    )}
                                                    <div className="flex items-center gap-2 mt-2">
                                                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                                                            server.server_location === 'remote'
                                                                ? 'bg-blue-500/10 text-blue-400'
                                                                : 'bg-green-500/10 text-green-400'
                                                        }`}>
                                                            {server.server_location === 'remote' ? <Cloud className="w-3 h-3 inline mr-1" /> : <Terminal className="w-3 h-3 inline mr-1" />}
                                                            {server.server_location}
                                                        </span>
                                                        <span className="text-xs text-gray-500">{server.tool_count} tools</span>
                                                    </div>
                                                </div>
                                                <ChevronRight className="w-5 h-5 text-gray-600 flex-shrink-0" />
                                            </div>
                                        </button>
                                    ))
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Middle: Tools List */}
                    <div className="lg:col-span-1">
                        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
                            <div className="bg-gray-800/50 border-b border-gray-800 px-4 py-3">
                                <h3 className="font-semibold text-white flex items-center gap-2">
                                    <Code className="w-4 h-4 text-purple-500" />
                                    Tools
                                </h3>
                            </div>
                            <div className="divide-y divide-gray-800 max-h-[600px] overflow-y-auto">
                                {connecting ? (
                                    <div className="p-6 text-center">
                                        <Loader2 className="w-8 h-8 text-emerald-500 animate-spin mx-auto mb-2" />
                                        <p className="text-sm text-gray-400">Connecting...</p>
                                    </div>
                                ) : !selectedServer ? (
                                    <div className="p-6 text-center text-gray-500">
                                        <Server className="w-12 h-12 mx-auto mb-3 opacity-20" />
                                        <p className="text-sm">Select a server to view tools</p>
                                    </div>
                                ) : tools.length === 0 ? (
                                    <div className="p-6 text-center text-gray-500">
                                        <Code className="w-12 h-12 mx-auto mb-3 opacity-20" />
                                        <p className="text-sm">No tools available</p>
                                    </div>
                                ) : (
                                    tools.map(tool => (
                                        <button
                                            key={tool.name}
                                            onClick={() => selectTool(tool)}
                                            className={`w-full p-4 text-left transition-colors hover:bg-gray-800/50 ${
                                                selectedTool?.name === tool.name ? 'bg-purple-900/20 border-l-2 border-purple-500' : ''
                                            }`}
                                        >
                                            <div className="font-semibold text-white">{tool.name}</div>
                                            {tool.description && (
                                                <div className="text-xs text-gray-400 mt-1 line-clamp-2">{tool.description}</div>
                                            )}
                                            {tool.inputSchema?.properties && (
                                                <div className="text-xs text-gray-500 mt-2">
                                                    {Object.keys(tool.inputSchema.properties).length} parameters
                                                </div>
                                            )}
                                        </button>
                                    ))
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Right: Tool Execution */}
                    <div className="lg:col-span-1">
                        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
                            <div className="bg-gray-800/50 border-b border-gray-800 px-4 py-3">
                                <h3 className="font-semibold text-white flex items-center gap-2">
                                    <Play className="w-4 h-4 text-blue-500" />
                                    Execute
                                </h3>
                            </div>
                            <div className="p-4 max-h-[600px] overflow-y-auto">
                                {!selectedTool ? (
                                    <div className="text-center text-gray-500 py-12">
                                        <Play className="w-12 h-12 mx-auto mb-3 opacity-20" />
                                        <p className="text-sm">Select a tool to execute</p>
                                    </div>
                                ) : (
                                    <div className="space-y-4">
                                        {/* Tool Info */}
                                        <div className="pb-4 border-b border-gray-800">
                                            <h4 className="font-semibold text-white">{selectedTool.name}</h4>
                                            {selectedTool.description && (
                                                <p className="text-sm text-gray-400 mt-1">{selectedTool.description}</p>
                                            )}
                                        </div>

                                        {/* Parameters */}
                                        {selectedTool.inputSchema?.properties && Object.keys(selectedTool.inputSchema.properties).length > 0 ? (
                                            <div className="space-y-3">
                                                <h5 className="text-sm font-semibold text-gray-300">Parameters</h5>
                                                {Object.entries(selectedTool.inputSchema.properties).map(([key, prop]: [string, any]) => {
                                                    const isRequired = selectedTool.inputSchema?.required?.includes(key);
                                                    return (
                                                        <div key={key}>
                                                            <label className="block text-sm text-gray-300 mb-1">
                                                                {key}
                                                                {isRequired && <span className="text-red-400 ml-1">*</span>}
                                                                <span className="text-xs text-gray-500 ml-2">({prop.type})</span>
                                                            </label>
                                                            {prop.description && (
                                                                <p className="text-xs text-gray-500 mb-1">{prop.description}</p>
                                                            )}
                                                            {renderInputField(key, prop, isRequired || false)}
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        ) : (
                                            <p className="text-sm text-gray-500">No parameters required</p>
                                        )}

                                        {/* Execute Button */}
                                        <button
                                            onClick={invokeTool}
                                            disabled={invoking}
                                            className="w-full flex items-center justify-center gap-2 bg-emerald-500 hover:bg-emerald-600 disabled:bg-gray-700 text-black disabled:text-gray-400 px-4 py-2 rounded-lg font-semibold transition-colors"
                                        >
                                            {invoking ? (
                                                <>
                                                    <Loader2 className="w-4 h-4 animate-spin" />
                                                    Executing...
                                                </>
                                            ) : (
                                                <>
                                                    <Play className="w-4 h-4" />
                                                    Execute Tool
                                                </>
                                            )}
                                        </button>

                                        {/* Result */}
                                        {result && (
                                            <div className={`mt-4 p-4 rounded-lg border ${
                                                result.success && !result.isError
                                                    ? 'bg-emerald-900/20 border-emerald-500/30'
                                                    : 'bg-red-900/20 border-red-500/30'
                                            }`}>
                                                <div className="flex items-center gap-2 mb-2">
                                                    {result.success && !result.isError ? (
                                                        <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                                                    ) : (
                                                        <XCircle className="w-5 h-5 text-red-400" />
                                                    )}
                                                    <span className={`font-semibold ${
                                                        result.success && !result.isError ? 'text-emerald-400' : 'text-red-400'
                                                    }`}>
                                                        {result.success && !result.isError ? 'Success' : 'Error'}
                                                    </span>
                                                </div>
                                                <div className="bg-black/50 rounded p-3 overflow-x-auto">
                                                    <pre className="text-xs text-gray-300 whitespace-pre-wrap">
                                                        {result.error || JSON.stringify(result.result, null, 2)}
                                                    </pre>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <Footer />
        </div>
    );
}
