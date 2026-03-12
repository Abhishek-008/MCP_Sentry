"use client";

import React, { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Send, Bot, Server, Settings, Terminal, Sparkles, AlertCircle, Wrench, ChevronDown, ChevronRight, Trash2, Plus, ServerCrash, Layers, Database, Code, Cloud, CheckCircle2, Copy, Check, Save } from 'lucide-react';
import Header from '../components/Header';
import { sendMessage, ChatMessage, ToolCallInfo, ToolInfo, getTools, getPrompts, PromptInfo } from '../actions/chat';
import { createClient } from '../../../utils/supabase/client';

// Extended display message — includes tool_call pseudo-role for local UI only
type DisplayMessage =
    | ChatMessage
    | { role: 'tool_call'; toolCall: ToolCallInfo };

function ToolCallBubble({ toolCall }: { toolCall: ToolCallInfo }) {
    const [expanded, setExpanded] = useState(false);
    const resultStr = JSON.stringify(toolCall.result, null, 2);
    const argsStr = JSON.stringify(toolCall.args, null, 2);
    return (
        <div className="flex justify-start my-1 w-full max-w-3xl mx-auto">
            <div className="w-full rounded-xl border border-gray-800 bg-[#16181E] overflow-hidden">
                <button
                    onClick={() => setExpanded(v => !v)}
                    className="w-full flex items-center gap-2 px-4 py-3 hover:bg-[#1E2128] transition-colors text-left"
                >
                    <Wrench className="w-4 h-4 text-gray-400 shrink-0" />
                    <span className="text-sm font-mono font-medium text-gray-300 flex-1 truncate">
                        {toolCall.name}
                    </span>
                    <span className="text-xs text-gray-500 shrink-0 px-2 py-0.5 bg-gray-800 rounded-md">tool call</span>
                    {expanded
                        ? <ChevronDown className="w-4 h-4 text-gray-500 shrink-0" />
                        : <ChevronRight className="w-4 h-4 text-gray-500 shrink-0" />}
                </button>

                {expanded && (
                    <div className="border-t border-gray-800 bg-[#0D0F12]">
                        <div className="px-4 py-3 border-b border-gray-800/50">
                            <p className="text-xs uppercase tracking-wider text-gray-500 mb-2 font-medium">Input Arguments</p>
                            <pre className="text-xs font-mono text-gray-300 bg-[#16181E] rounded-lg p-3 overflow-x-auto whitespace-pre">
                                {argsStr === '{}' ? '(no arguments)' : argsStr}
                            </pre>
                        </div>
                        <div className="px-4 py-3">
                            <p className="text-xs uppercase tracking-wider text-emerald-500 mb-2 font-medium">Execution Result</p>
                            <pre className="text-xs font-mono text-emerald-400/90 bg-[#16181E] rounded-lg p-3 overflow-x-auto whitespace-pre max-h-64">
                                {resultStr}
                            </pre>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

export default function ClientPage() {
    const [messages, setMessages] = useState<DisplayMessage[]>([]);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [showConnectModal, setShowConnectModal] = useState(false);
    const [serverConfig, setServerConfig] = useState('');
    const [connectedServer, setConnectedServer] = useState<string | null>(null);
    const [tools, setTools] = useState<ToolInfo[]>([]);
    const [toolsLoading, setToolsLoading] = useState(false);
    const [expandedTool, setExpandedTool] = useState<string | null>(null);
    
    // Registered servers state
    const [connectionMode, setConnectionMode] = useState<'manual' | 'registry'>('manual');
    const [registeredServers, setRegisteredServers] = useState<any[]>([]);
    const [loadingServers, setLoadingServers] = useState(false);
    const [selectedRegisteredServer, setSelectedRegisteredServer] = useState<any | null>(null);
    const [availableToolsForSelection, setAvailableToolsForSelection] = useState<any[]>([]);
    const [selectedTools, setSelectedTools] = useState<Set<string>>(new Set());
    const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
    const [sessionId, setSessionId] = useState<string | null>(null); // For registry-based connections

    const [prompts, setPrompts] = useState<PromptInfo[]>([]);
    const [promptsLoading, setPromptsLoading] = useState(false);
    const [expandedPrompt, setExpandedPrompt] = useState<string | null>(null);

    // AI Models state
    const [geminiKey, setGeminiKey] = useState<string>('');
    const [isSavingKey, setIsSavingKey] = useState(false);
    const [userId, setUserId] = useState<string | null>(null);
    const [systemPrompt, setSystemPrompt] = useState<string>("You are a helpful AI assistant. Be thoughtful and detailed in your responses.");
    const [isPromptSaved, setIsPromptSaved] = useState(false);

    // Left Sidebar Navigation
    const [activeSidebarTab, setActiveSidebarTab] = useState<'servers' | 'tools' | 'prompts' | 'resources'>('servers');

    const messagesEndRef = useRef<HTMLDivElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const supabase = createClient();

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    useEffect(() => {
        const fetchUserData = async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (user) {
                setUserId(user.id);
                
                // Fetch API key
                const { data } = await supabase
                    .from('user_keys')
                    .select('api_key')
                    .eq('user_id', user.id)
                    .single();
                if (data && data.api_key) {
                    setGeminiKey(data.api_key);
                }
            }
        };
        fetchUserData();
    }, [supabase.auth]);

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        setInput(e.target.value);
        e.target.style.height = '56px';
        e.target.style.height = `${Math.min(e.target.scrollHeight, 200)}px`;
    };

    const handleSend = async () => {
        if (!input.trim() || loading) return;

        const userMessage = input.trim();
        setInput('');
        if (textareaRef.current) {
            textareaRef.current.style.height = '56px';
        }
        setError(null);
        setLoading(true);

        const chatHistory = messages.filter((m): m is ChatMessage => m.role !== 'tool_call');
        const newHistory: DisplayMessage[] = [...messages, { role: 'user', content: userMessage } as ChatMessage];
        setMessages(newHistory);

        console.log('Sending message with sessionId:', sessionId, 'connectedServer:', connectedServer);

        try {
            const result = await sendMessage(
                chatHistory,
                userMessage,
                sessionId ? undefined : (connectedServer || undefined), // Only pass serverUrl for manual connections
                geminiKey || undefined,
                systemPrompt,
                sessionId || undefined // Pass sessionId for registry connections
            );

            if (result.error) {
                setError(result.error);
            } else if (result.text) {
                const additions: DisplayMessage[] = [];
                if (result.toolCall) additions.push({ role: 'tool_call', toolCall: result.toolCall });
                additions.push({ role: 'assistant', content: result.text });
                setMessages([...newHistory, ...additions]);
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

    const fetchRegisteredServers = async () => {
        if (!userId) return;
        setLoadingServers(true);
        try {
            const { data } = await supabase
                .from('mcp_servers')
                .select('*')
                .or(`owner_id.eq.${userId},is_public.eq.true`)
                .eq('status', 'active')
                .order('created_at', { ascending: false });
            
            if (data) setRegisteredServers(data);
        } catch (err) {
            console.error('Failed to fetch servers:', err);
        } finally {
            setLoadingServers(false);
        }
    };

    const handleSelectRegisteredServer = async (server: any) => {
        setSelectedRegisteredServer(server);
        setAvailableToolsForSelection(server.tools || []);
        setSelectedTools(new Set());
    };

    const toggleToolSelection = (toolName: string) => {
        setSelectedTools(prev => {
            const newSet = new Set(prev);
            if (newSet.has(toolName)) {
                newSet.delete(toolName);
            } else {
                newSet.add(toolName);
            }
            return newSet;
        });
    };

    const connectServer = async () => {
        if (connectionMode === 'manual') {
            if (!serverConfig) return;
            setConnectedServer(serverConfig);
            setShowConnectModal(false);
            setMessages(prev => [...prev, { role: 'assistant', content: `Connecting to MCP Server...` }]);

            setToolsLoading(true);
            setPromptsLoading(true);
            setTools([]);
            setPrompts([]);

            const [toolsResult, promptsResult] = await Promise.all([
                getTools(serverConfig),
                getPrompts(serverConfig)
            ]);

            setToolsLoading(false);
            setPromptsLoading(false);

            let statusMsg = '';
            if (toolsResult.tools) {
                setTools(toolsResult.tools);
                statusMsg += `Extracted **${toolsResult.tools.length} tools**. `;
            } else {
                statusMsg += `Could not list tools: ${toolsResult.error}. `;
            }

            if (promptsResult.prompts) {
                setPrompts(promptsResult.prompts);
                statusMsg += `Extracted **${promptsResult.prompts.length} prompts**.`;
            } else {
                statusMsg += `Could not list prompts: ${promptsResult.error}.`;
            }

            setMessages(prev => [
                ...prev.slice(0, -1),
                { role: 'assistant', content: `Connection established! ${statusMsg}` }
            ]);
        } else {
            // Registry mode - create session with selected tools
            if (!selectedRegisteredServer || selectedTools.size === 0) return;
            
            // Check if server is local (requires backend, works in session-based approach)
            const isLocal = selectedRegisteredServer.server_location === 'local';
            
            // Prepare activation request
            const activationPayload: any = {
                serverId: selectedRegisteredServer.id,
                serverName: selectedRegisteredServer.name,
                location: selectedRegisteredServer.server_location,
                selectedTools: Array.from(selectedTools),
            };
            
            if (isLocal) {
                activationPayload.localConfig = selectedRegisteredServer.local_config;
            } else {
                if (!selectedRegisteredServer.url) {
                    alert('This remote server does not have a URL configured.');
                    return;
                }
                activationPayload.serverUrl = selectedRegisteredServer.url;
            }
            
            setShowConnectModal(false);
            setMessages(prev => [...prev, { role: 'assistant', content: `Activating session with **${selectedRegisteredServer.name}**...` }]);
            
            try {
                const response = await fetch('/api/chat/activate', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(activationPayload),
                });
                
                if (!response.ok) {
                    const errorData = await response.json();
                    throw new Error(errorData.error || 'Failed to activate session');
                }
                
                const data = await response.json();
                console.log('Session activated:', data);
                console.log('Setting sessionId in state:', data.sessionId);
                setSessionId(data.sessionId);
                setConnectedServer(selectedRegisteredServer.name); // Display name instead of URL
                setTools(data.tools);
                setPrompts(selectedRegisteredServer.prompts || []);
                
                setMessages(prev => [
                    ...prev.slice(0, -1),
                    { 
                        role: 'assistant', 
                        content: `Session activated! Connected to **${selectedRegisteredServer.name}** with ${data.tools.length} tools available.` 
                    }
                ]);
                
            } catch (error: any) {
                setMessages(prev => [
                    ...prev.slice(0, -1),
                    { 
                        role: 'assistant', 
                        content: `Failed to activate session: ${error.message}` 
                    }
                ]);
            }
            
            // Reset selection
            setSelectedRegisteredServer(null);
            setSelectedTools(new Set());
            setAvailableToolsForSelection([]);
        }
    };

    const handleDisconnect = async () => {
        // Deactivate session if active
        if (sessionId) {
            try {
                await fetch(`/api/chat/activate?sessionId=${sessionId}`, {
                    method: 'DELETE',
                });
            } catch (error) {
                console.error('Error deactivating session:', error);
            }
            setSessionId(null);
        }
        
        setConnectedServer(null);
        setTools([]);
        setPrompts([]);
        setExpandedTool(null);
        setExpandedPrompt(null);
    };

    const handleSaveKey = async () => {
        if (!userId) {
            alert("You must be logged in to save your key.");
            return;
        }
        setIsSavingKey(true);
        const { error } = await supabase
            .from('user_keys')
            .upsert({ user_id: userId, api_key: geminiKey }, { onConflict: 'user_id' });

        setIsSavingKey(false);
        if (error) {
            alert(error.message || "Failed to save API Key");
        }
    };

    return (
        <div className="h-screen bg-[#0A0A0B] text-gray-200 font-sans flex flex-col overflow-hidden">
            <Header />

            <div className="flex-1 flex overflow-hidden border-t border-[#1C1F26]">

                {/* 1. LEFT SIDEBAR (Servers & Tools) */}
                <div className="w-[300px] bg-[#0A0A0B] border-r border-[#1C1F26] flex flex-col shrink-0">

                    {/* Navigation Pills */}
                    <div className="p-4 border-b border-[#1C1F26]">
                        <div className="flex bg-[#16181E] p-1 rounded-lg gap-1">
                            {['servers', 'tools', 'prompts', 'resources'].map((tab) => (
                                <button
                                    key={tab}
                                    onClick={() => setActiveSidebarTab(tab as any)}
                                    className={`flex-1 text-[11px] font-medium py-1.5 px-2 rounded-md capitalize transition-colors ${activeSidebarTab === tab
                                        ? 'bg-[#2A2E37] text-white shadow-sm'
                                        : 'text-gray-500 hover:text-gray-300'
                                        }`}
                                >
                                    {tab}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
                        {activeSidebarTab === 'servers' && (
                            <div className="space-y-6">
                                {/* Servers Header */}
                                <div className="flex items-center justify-between">
                                    <h2 className="text-[14px] font-semibold text-gray-200">MCP Servers</h2>
                                    <span className="bg-[#1C1F26] text-gray-400 text-[10px] px-2 py-0.5 rounded-full font-mono">
                                        {connectedServer ? '1' : '0'}
                                    </span>
                                </div>

                                {/* Connection Options */}
                                {!connectedServer ? (
                                    <div className="space-y-3">
                                        <button className="w-full flex items-center justify-between py-3 px-4 rounded-xl border border-[#2A2E37] hover:border-emerald-500/50 hover:bg-emerald-500/5 transition-all group">
                                            <span className="text-xs font-semibold text-gray-300 group-hover:text-emerald-400">Quick Add Example Server</span>
                                            <Sparkles className="w-3.5 h-3.5 text-gray-500 group-hover:text-emerald-400" />
                                        </button>

                                        <div className="flex items-center gap-3">
                                            <div className="h-px bg-[#1C1F26] flex-1"></div>
                                            <span className="text-[10px] uppercase tracking-widest text-[#4A505E] font-medium">OR</span>
                                            <div className="h-px bg-[#1C1F26] flex-1"></div>
                                        </div>

                                        <button
                                            onClick={() => setShowConnectModal(true)}
                                            className="w-full flex items-center gap-2 py-3 px-4 rounded-xl border border-[#2A2E37] hover:border-gray-600 hover:bg-[#16181E] transition-all text-left group"
                                        >
                                            <Plus className="w-4 h-4 text-gray-500 group-hover:text-white" />
                                            <span className="text-xs font-medium text-gray-300 group-hover:text-white">Add MCP Server Manually</span>
                                        </button>

                                        <div className="flex items-center gap-3">
                                            <div className="h-px bg-[#1C1F26] flex-1"></div>
                                            <span className="text-[10px] uppercase tracking-widest text-[#4A505E] font-medium">OR</span>
                                            <div className="h-px bg-[#1C1F26] flex-1"></div>
                                        </div>

                                        <button className="w-full flex items-center justify-between py-3 px-4 rounded-xl border border-[#2A2E37] bg-gradient-to-r from-emerald-500/10 to-transparent hover:border-emerald-500/40 transition-all text-left">
                                            <div className="flex items-center gap-2">
                                                <Database className="w-4 h-4 text-emerald-500" />
                                                <span className="text-xs font-semibold text-emerald-400">Connect with GitMCP</span>
                                            </div>
                                            <span className="text-[9px] font-bold tracking-wider text-emerald-950 bg-emerald-500 px-1.5 py-0.5 rounded uppercase">New</span>
                                        </button>

                                        {/* Empty State Graphic */}
                                        <div className="pt-10 flex flex-col items-center text-center opacity-70">
                                            <div className="w-16 h-16 rounded-2xl bg-[#16181E] border border-[#2A2E37] flex items-center justify-center mb-4">
                                                <Layers className="w-6 h-6 text-gray-500" />
                                            </div>
                                            <h3 className="text-sm font-semibold text-gray-300 mb-1.5">No MCP Servers Connected</h3>
                                            <p className="text-[11px] text-gray-500 max-w-[200px] leading-relaxed">
                                                Connect to MCP servers to unlock powerful tools and capabilities for your AI assistant.
                                            </p>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="space-y-4">
                                        <div className="bg-[#16181E] border border-[#2A2E37] rounded-xl overflow-hidden shadow-md">
                                            <div className="p-3 border-b border-[#2A2E37] bg-[#1E2128]/50 flex items-center justify-between">
                                                <div className="flex items-center gap-2 overflow-hidden mr-2">
                                                    <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
                                                    <span className="text-xs font-semibold text-gray-200 truncate">{connectedServer}</span>
                                                </div>
                                                <button onClick={handleDisconnect} className="p-1 hover:bg-[#2A2E37] rounded text-red-400 transition-colors" title="Disconnect">
                                                    <Trash2 className="w-3.5 h-3.5" />
                                                </button>
                                            </div>
                                            <div className="p-4 bg-[#111317]">
                                                {toolsLoading ? (
                                                    <div className="flex items-center gap-2 text-xs text-gray-500">
                                                        <Loader2 className="w-3 h-3 animate-spin text-emerald-500" />
                                                        Discovering tools...
                                                    </div>
                                                ) : (
                                                    <div>
                                                        <p className="text-[10px] uppercase font-bold text-gray-600 mb-3 tracking-wider flex items-center gap-1.5">
                                                            <Wrench className="w-3 h-3" /> Available Tools ({tools.length})
                                                        </p>
                                                        <div className="space-y-1">
                                                            {tools.map(tool => (
                                                                <button
                                                                    key={tool.name}
                                                                    onClick={() => setExpandedTool(expandedTool === tool.name ? null : tool.name)}
                                                                    className="w-full text-left rounded-lg p-2 hover:bg-[#1E2128] transition-colors border border-transparent hover:border-[#2A2E37] group"
                                                                >
                                                                    <div className="flex items-center gap-2">
                                                                        <span className="text-xs font-mono font-medium text-amber-200/80 flex-1 truncate">
                                                                            {tool.name}
                                                                        </span>
                                                                        {expandedTool === tool.name
                                                                            ? <ChevronDown className="w-3.5 h-3.5 text-gray-600 shrink-0" />
                                                                            : <ChevronRight className="w-3.5 h-3.5 text-gray-600 shrink-0 opacity-0 group-hover:opacity-100" />}
                                                                    </div>
                                                                    {expandedTool === tool.name && (
                                                                        <div className="text-[10px] text-gray-400 mt-1.5 pl-0.5 leading-relaxed border-l-2 border-[#2A2E37]">
                                                                            {tool.description}
                                                                        </div>
                                                                    )}
                                                                </button>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                        {activeSidebarTab === 'tools' && (
                            <div className="space-y-4">
                                <div className="flex items-center justify-between pb-2 border-b border-[#1C1F26]">
                                    <h2 className="text-[14px] font-semibold text-gray-200">Available Tools</h2>
                                    <span className="bg-[#1C1F26] text-gray-400 text-[10px] px-2 py-0.5 rounded-full font-mono">
                                        {tools.length}
                                    </span>
                                </div>
                                {!connectedServer ? (
                                    <div className="text-center text-[11px] text-gray-500 py-8">Connect a server to view tools.</div>
                                ) : toolsLoading ? (
                                    <div className="flex items-center justify-center gap-2 text-xs text-gray-500 py-8">
                                        <Loader2 className="w-4 h-4 animate-spin text-emerald-500" />
                                        Loading tools...
                                    </div>
                                ) : tools.length === 0 ? (
                                    <div className="text-center text-[11px] text-gray-500 py-8">No tools exposed by this server.</div>
                                ) : (
                                    <div className="space-y-1">
                                        {tools.map(tool => (
                                            <button
                                                key={tool.name}
                                                onClick={() => setExpandedTool(expandedTool === tool.name ? null : tool.name)}
                                                className="w-full text-left rounded-lg p-2 hover:bg-[#1E2128] transition-colors border border-transparent hover:border-[#2A2E37] group"
                                            >
                                                <div className="flex items-center gap-2">
                                                    <span className="text-xs font-mono font-medium text-amber-200/80 flex-1 truncate">
                                                        {tool.name}
                                                    </span>
                                                    {expandedTool === tool.name
                                                        ? <ChevronDown className="w-3.5 h-3.5 text-gray-600 shrink-0" />
                                                        : <ChevronRight className="w-3.5 h-3.5 text-gray-600 shrink-0 opacity-0 group-hover:opacity-100" />}
                                                </div>
                                                {expandedTool === tool.name && (
                                                    <div className="text-[10px] text-gray-400 mt-1.5 pl-0.5 leading-relaxed border-l-2 border-[#2A2E37]">
                                                        {tool.description}
                                                    </div>
                                                )}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}

                        {activeSidebarTab === 'prompts' && (
                            <div className="space-y-4">
                                <div className="flex items-center justify-between pb-2 border-b border-[#1C1F26]">
                                    <h2 className="text-[14px] font-semibold text-gray-200">Available Prompts</h2>
                                    <span className="bg-[#1C1F26] text-gray-400 text-[10px] px-2 py-0.5 rounded-full font-mono">
                                        {prompts.length}
                                    </span>
                                </div>
                                {!connectedServer ? (
                                    <div className="text-center text-[11px] text-gray-500 py-8">Connect a server to view prompts.</div>
                                ) : promptsLoading ? (
                                    <div className="flex items-center justify-center gap-2 text-xs text-gray-500 py-8">
                                        <Loader2 className="w-4 h-4 animate-spin text-emerald-500" />
                                        Loading prompts...
                                    </div>
                                ) : prompts.length === 0 ? (
                                    <div className="text-center text-[11px] text-gray-500 py-8">No prompts exposed by this server.</div>
                                ) : (
                                    <div className="space-y-1">
                                        {prompts.map(prompt => (
                                            <button
                                                key={prompt.name}
                                                onClick={() => setExpandedPrompt(expandedPrompt === prompt.name ? null : prompt.name)}
                                                className="w-full text-left rounded-lg p-2 hover:bg-[#1E2128] transition-colors border border-transparent hover:border-[#2A2E37] group"
                                            >
                                                <div className="flex items-center gap-2">
                                                    <span className="text-xs font-mono font-medium text-blue-300 flex-1 truncate">
                                                        {prompt.name}
                                                    </span>
                                                    {expandedPrompt === prompt.name
                                                        ? <ChevronDown className="w-3.5 h-3.5 text-gray-600 shrink-0" />
                                                        : <ChevronRight className="w-3.5 h-3.5 text-gray-600 shrink-0 opacity-0 group-hover:opacity-100" />}
                                                </div>
                                                {expandedPrompt === prompt.name && (
                                                    <div className="text-[10px] text-gray-400 mt-1.5 pl-0.5 leading-relaxed border-l-2 border-[#2A2E37]">
                                                        {prompt.description}
                                                    </div>
                                                )}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}

                        {activeSidebarTab === 'resources' && (
                            <div className="h-full flex flex-col items-center justify-center text-gray-600 text-xs">
                                <p>Resources not implemented yet.</p>
                            </div>
                        )}
                    </div>

                    <div className="p-4 border-t border-[#1C1F26] text-[10px] text-gray-600 text-center bg-[#0A0A0B]">
                        contact@mcpsplayground.com
                    </div>
                </div>

                {/* 2. CENTER AREA (Playground) */}
                <div className="flex-1 flex flex-col bg-[#0A0A0B] relative">
                    {messages.length > 0 && (
                        <div className="absolute top-0 left-0 right-0 p-4 flex justify-end z-10 pointer-events-none">
                            <button
                                onClick={() => setMessages([])}
                                className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium text-gray-400 hover:text-white bg-[#16181E]/80 backdrop-blur-sm border border-[#2A2E37] hover:border-red-500/50 hover:bg-red-500/10 transition-colors pointer-events-auto shadow-sm"
                            >
                                <Trash2 className="w-3.5 h-3.5" />
                                Clear Chat
                            </button>
                        </div>
                    )}
                    <div className="flex-1 overflow-y-auto px-6 py-8 scrollbar-thin scrollbar-thumb-[#2A2E37]">
                        {messages.length === 0 ? (
                            <div className="h-full flex flex-col items-center justify-center pt-8 pb-32">
                                <div className="w-16 h-16 bg-[#16181E] rounded-full border border-[#2A2E37] flex items-center justify-center mb-6 shadow-lg shadow-emerald-900/10">
                                    <Bot className="w-7 h-7 text-emerald-500" />
                                </div>
                                <h1 className="text-2xl font-bold text-white mb-3">Welcome to MCP Playground!</h1>
                                <p className="text-[13px] text-gray-400 text-center max-w-md mb-10 leading-relaxed font-medium">
                                    Your AI assistant is ready to help! Connect any MCP servers to give your AI superpowers.
                                </p>

                                <div className="bg-[#16181E] border border-[#2A2E37] rounded-2xl p-6 max-w-xl w-full">
                                    <h3 className="text-center text-sm font-semibold text-white mb-2 flex items-center justify-center gap-2">
                                        <Database className="w-4 h-4 text-emerald-400" /> Powered by MCP Integrations
                                    </h3>
                                    <p className="text-center text-[11px] text-gray-500 mb-6">
                                        Connect external services and tools to expand your AI's capabilities
                                    </p>

                                    <div className="flex items-center justify-center gap-6 mb-8">
                                        {[
                                            { icon: Cloud, name: 'Cloudflare' },
                                            { icon: ServerCrash, name: 'n8n' },
                                            { icon: Sparkles, name: 'Zapier' },
                                            { icon: Plus, name: 'Any MCP', dashed: true }
                                        ].map((item, i) => (
                                            <div key={i} className="flex flex-col items-center gap-2">
                                                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center bg-white ${item.dashed ? 'border-2 border-dashed border-gray-300' : 'shadow-sm'}`}>
                                                    <item.icon className={`w-6 h-6 ${item.dashed ? 'text-gray-400' : 'text-gray-800'}`} />
                                                </div>
                                                <span className="text-[10px] font-medium text-gray-400">{item.name}</span>
                                            </div>
                                        ))}
                                    </div>

                                    <div className="flex items-center justify-center gap-8 text-[11px] text-gray-400 font-medium pb-4 border-b border-[#2A2E37] w-full">
                                        <span className="flex items-center gap-1.5">
                                            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500"></div> Real-time tool execution
                                        </span>
                                        <span className="flex items-center gap-1.5">
                                            <div className="w-1.5 h-1.5 rounded-full bg-blue-500"></div> Seamless integrations
                                        </span>
                                    </div>
                                    <div className="mt-4 flex flex-wrap justify-center gap-2">
                                        {["List my databases", "Read the config file", "Summarize recent error logs"].map((prompt, i) => (
                                            <button
                                                key={i}
                                                onClick={() => {
                                                    setInput(prompt);
                                                    if (textareaRef.current) {
                                                        textareaRef.current.style.height = '56px';
                                                        setTimeout(() => {
                                                            if (textareaRef.current) {
                                                                textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
                                                            }
                                                        }, 50);
                                                    }
                                                }}
                                                className="text-[11px] px-3 py-1.5 rounded-full bg-[#1E2128] border border-[#2A2E37] text-gray-300 hover:text-white hover:border-emerald-500/50 hover:bg-emerald-500/10 transition-colors"
                                            >
                                                {prompt}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div className="space-y-6 max-w-4xl mx-auto w-full pb-32">
                                {messages.map((msg, idx) => {
                                    if (msg.role === 'tool_call') {
                                        return <ToolCallBubble key={idx} toolCall={msg.toolCall} />;
                                    }

                                    const isUser = msg.role === 'user';
                                    return (
                                        <div key={idx} className={`w-full max-w-3xl mx-auto flex ${isUser ? 'justify-end' : 'justify-start'} animate-in fade-in slide-in-from-bottom-2`}>
                                            <div className={`
                                                px-5 py-4 rounded-2xl max-w-[85%] text-[13px] leading-relaxed
                                                ${isUser
                                                    ? 'bg-[#2A2E37] text-gray-100 rounded-tr-sm border border-[#3E424B]'
                                                    : 'bg-transparent text-gray-300'}
                                            `}>
                                                {!isUser && (
                                                    <div className="flex items-center justify-between mb-3 border-b border-[#1C1F26] pb-2">
                                                        <div className="flex items-center gap-2">
                                                            <div className="w-5 h-5 rounded-full bg-emerald-500/10 flex items-center justify-center border border-emerald-500/20">
                                                                <Bot className="w-3 h-3 text-emerald-400" />
                                                            </div>
                                                            <span className="font-semibold text-emerald-400 text-xs tracking-wide">AI Assistant</span>
                                                        </div>
                                                        <button
                                                            onClick={() => {
                                                                navigator.clipboard.writeText(msg.content);
                                                                setCopiedIndex(idx);
                                                                setTimeout(() => setCopiedIndex(null), 2000);
                                                            }}
                                                            className="text-gray-500 hover:text-gray-300 p-1 rounded-md hover:bg-[#1E2128] transition-colors"
                                                            title="Copy message"
                                                        >
                                                            {copiedIndex === idx ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                                                        </button>
                                                    </div>
                                                )}

                                                {isUser ? (
                                                    <p className="whitespace-pre-wrap">{msg.content}</p>
                                                ) : (
                                                    <div className="markdown-body chat-markdown max-w-none text-[#D1D5DB]">
                                                        <ReactMarkdown
                                                            remarkPlugins={[remarkGfm]}
                                                            components={{
                                                                p: ({ node, ...props }) => <p className="mb-3 leading-relaxed last:mb-0" {...props} />,
                                                                a: ({ node, ...props }) => <a className="text-emerald-400 hover:underline" target="_blank" rel="noopener noreferrer" {...props} />,
                                                                ul: ({ node, ...props }) => <ul className="list-disc filter drop-shadow-sm ml-5 mb-3 marker:text-emerald-500 space-y-1" {...props} />,
                                                                ol: ({ node, ...props }) => <ol className="list-decimal filter drop-shadow-sm ml-5 mb-3 text-emerald-500 space-y-1" {...props} />,
                                                                li: ({ node, ...props }) => <li className="leading-relaxed text-gray-300" {...props} />,
                                                                h1: ({ node, ...props }) => <h1 className="text-xl font-bold mb-3 text-white" {...props} />,
                                                                h2: ({ node, ...props }) => <h2 className="text-lg font-bold mb-3 text-white mt-4" {...props} />,
                                                                h3: ({ node, ...props }) => <h3 className="text-md font-bold mb-2 text-gray-200 mt-4" {...props} />,
                                                                code: ({ node, className, children, ...props }: any) => {
                                                                    const isInline = !className || !className.includes('language-');
                                                                    return isInline ? (
                                                                        <code className="bg-[#1E2128] text-amber-300 px-1.5 py-0.5 rounded text-[12px] font-mono" {...props}>{children}</code>
                                                                    ) : (
                                                                        <div className="relative my-4 group rounded-lg overflow-hidden border border-[#2A2E37]">
                                                                            <pre className="bg-[#111317] p-4 overflow-x-auto text-[12px] font-mono text-gray-300 m-0">
                                                                                <code className={className} {...props}>{children}</code>
                                                                            </pre>
                                                                        </div>
                                                                    );
                                                                },
                                                                strong: ({ node, ...props }) => <strong className="font-bold text-gray-100" {...props} />,
                                                                em: ({ node, ...props }) => <em className="italic text-gray-400" {...props} />
                                                            }}
                                                        >
                                                            {msg.content}
                                                        </ReactMarkdown>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                                {loading && (
                                    <div className="w-full max-w-3xl mx-auto flex justify-start">
                                        <div className="flex items-center gap-2 px-5 py-3 text-gray-500">
                                            <div className="flex gap-1">
                                                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500/50 animate-bounce" style={{ animationDelay: '0ms' }}></div>
                                                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500/50 animate-bounce" style={{ animationDelay: '150ms' }}></div>
                                                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500/50 animate-bounce" style={{ animationDelay: '300ms' }}></div>
                                            </div>
                                            <span className="text-xs font-medium ml-2">Processing</span>
                                        </div>
                                    </div>
                                )}
                                <div ref={messagesEndRef} />
                            </div>
                        )}
                    </div>

                    {/* Chat Input Area */}
                    <div className="absolute bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-[#0A0A0B] via-[#0A0A0B] to-transparent pt-12">
                        <div className="max-w-3xl mx-auto relative group">
                            <textarea
                                ref={textareaRef}
                                value={input}
                                onChange={handleInput}
                                onKeyDown={handleKeyDown}
                                placeholder={!geminiKey ? "Configure API key in Models tab first..." : "Send a message to Claude..."}
                                disabled={loading || !geminiKey}
                                className="w-full bg-[#16181E] border border-[#2A2E37] rounded-xl pl-5 pr-14 py-4 focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/50 transition-all resize-none disabled:opacity-70 text-sm overflow-y-hidden shadow-sm placeholder-[#4A505E] text-gray-200"
                                rows={1}
                                style={{ minHeight: '56px', maxHeight: '200px' }}
                            />
                            <button
                                onClick={handleSend}
                                disabled={!input.trim() || loading || !geminiKey}
                                className="absolute right-3 top-1/2 -translate-y-1/2 p-2.5 bg-[#2A2E37] hover:bg-emerald-500 text-gray-400 hover:text-white rounded-lg transition-colors disabled:opacity-0 disabled:scale-75 shadow-sm"
                            >
                                <Send className="w-4 h-4 ml-0.5" />
                            </button>
                        </div>
                        <div className="text-center mt-3">
                            <p className="text-[11px] text-[#4A505E] font-medium">
                                {!geminiKey ? "Configure API key in Models tab" : "AI can make mistakes. Please verify important information."}
                            </p>
                        </div>
                    </div>

                    {error && (
                        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 bg-red-500/10 border border-red-500/20 text-red-300 px-4 py-2.5 rounded-lg flex items-center gap-2 text-xs font-medium max-w-md shadow-2xl backdrop-blur-xl">
                            <AlertCircle className="w-4 h-4 shrink-0" />
                            <span>{error}</span>
                            <button onClick={() => setError(null)} className="ml-auto opacity-50 hover:opacity-100">×</button>
                        </div>
                    )}
                </div>

                {/* 3. RIGHT SIDEBAR (AI Models & Config) */}
                <div className="w-[320px] bg-[#0A0A0B] border-l border-[#1C1F26] flex flex-col shrink-0">
                    <div className="p-4 border-b border-[#1C1F26] flex items-center justify-between bg-[#0D0F12]">
                        <h2 className="text-[14px] font-semibold flex items-center gap-2 text-gray-200">
                            <Settings className="w-4 h-4 text-emerald-500" />
                            AI Models
                        </h2>
                        <div className="flex items-center gap-1.5 text-xs text-emerald-500 bg-emerald-500/10 px-2.5 py-1 rounded-full border border-emerald-500/20">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span className="font-semibold tracking-wide">Connected</span>
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto p-4 custom-scrollbar space-y-5">
                        <div className="bg-[#111317] border border-[#2A2E37] rounded-xl p-4 transition-all">
                            <h3 className="text-[13px] font-semibold text-white mb-2 flex items-center gap-2">
                                <span className="text-amber-500">✨</span> Gemini API Key
                            </h3>
                            <div className="space-y-3">
                                <div className="relative">
                                    <input
                                        type="password"
                                        value={geminiKey}
                                        onChange={(e) => setGeminiKey(e.target.value)}
                                        placeholder="AIzaSy..."
                                        className="w-full bg-[#16181E] border border-[#2A2E37] rounded-lg pl-3 pr-10 py-2 focus:outline-none focus:border-emerald-500/50 text-[12px] font-mono text-gray-200 placeholder-[#4A505E]"
                                    />
                                    <div className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 cursor-pointer hover:text-gray-300">
                                        <EyeIcon className="w-3.5 h-3.5" />
                                    </div>
                                </div>
                                <div className="flex items-center justify-between">
                                    <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer" className="text-[10px] text-gray-500 hover:text-blue-400 hover:underline inline-flex items-center gap-1">
                                        Get your API key <ChevronRight className="w-3 h-3" />
                                    </a>
                                    <button
                                        onClick={handleSaveKey}
                                        disabled={isSavingKey}
                                        className="bg-[#2A2E37] hover:bg-[#3E424B] text-white text-[11px] font-semibold px-3 py-1.5 rounded-md transition-colors disabled:opacity-50 border border-[#3E424B]"
                                    >
                                        {isSavingKey ? 'Saving...' : 'Save Key'}
                                    </button>
                                </div>
                            </div>
                        </div>

                        <div className="bg-[#111317] border border-[#2A2E37] rounded-xl overflow-hidden">
                            <div className="p-3 border-b border-[#2A2E37]">
                                <h3 className="text-[12px] font-semibold flex items-center gap-2 text-gray-300">
                                    <Layers className="w-3.5 h-3.5 text-amber-500" />
                                    Model Selection
                                </h3>
                            </div>
                            <div className="p-3">
                                <button className="w-full flex items-center justify-between bg-[#16181E] border border-[#2A2E37] rounded-lg px-3 py-2 text-xs text-white hover:border-[#3E424B] transition-colors">
                                    <span className="flex items-center gap-2">
                                        <span className="text-amber-500">✨</span> Gemini 2.5 Flash
                                    </span>
                                    <ChevronDown className="w-3.5 h-3.5 text-gray-500" />
                                </button>
                            </div>
                        </div>

                        <div className="bg-[#111317] border border-[#2A2E37] rounded-xl overflow-hidden">
                            <div className="p-3 border-b border-[#2A2E37] flex items-center justify-between">
                                <h3 className="text-[12px] font-semibold flex items-center gap-2 text-gray-300">
                                    <Terminal className="w-3.5 h-3.5 text-blue-400" />
                                    System Prompt <span className="text-[9px] bg-[#16181E] text-gray-500 px-1.5 py-0.5 rounded border border-[#2A2E37]">Optional</span>
                                </h3>
                            </div>
                            <div className="p-3">
                                <textarea
                                    value={systemPrompt}
                                    onChange={e => setSystemPrompt(e.target.value)}
                                    className="w-full bg-[#16181E] border border-[#2A2E37] rounded-lg p-3 focus:outline-none focus:border-blue-500/50 text-[11px] text-gray-400 leading-relaxed resize-none h-24 font-mono custom-scrollbar"
                                />
                                <div className="mt-3 flex justify-end">
                                    <button
                                        onClick={() => {
                                            setIsPromptSaved(true);
                                            setTimeout(() => setIsPromptSaved(false), 2000);
                                        }}
                                        className="flex items-center gap-1.5 bg-[#2A2E37] hover:bg-[#3E424B] text-gray-300 text-[11px] font-medium px-3 py-1.5 rounded-md transition-colors border border-[#3E424B]"
                                    >
                                        {isPromptSaved ? (
                                            <>
                                                <Check className="w-3 h-3 text-emerald-400" /> Saved!
                                            </>
                                        ) : (
                                            <>
                                                <Save className="w-3 h-3" /> Save Prompt
                                            </>
                                        )}
                                    </button>
                                </div>
                            </div>
                        </div>

                    </div>
                </div>
            </div>

            {/* Connect Modal */}
            {showConnectModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
                    <div className="bg-[#111317] border border-[#2A2E37] rounded-xl w-full max-w-2xl shadow-2xl max-h-[90vh] overflow-hidden flex flex-col">
                        {/* Header */}
                        <div className="p-6 border-b border-[#2A2E37]">
                            <h3 className="text-lg font-bold text-white mb-4">Add MCP Server</h3>
                            
                            {/* Mode Toggle */}
                            <div className="flex gap-2 bg-[#16181E] p-1 rounded-lg">
                                <button
                                    onClick={() => {
                                        setConnectionMode('manual');
                                        setSelectedRegisteredServer(null);
                                        setSelectedTools(new Set());
                                    }}
                                    className={`flex-1 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                                        connectionMode === 'manual'
                                            ? 'bg-emerald-500 text-black'
                                            : 'text-gray-400 hover:text-white'
                                    }`}
                                >
                                    Manual URL
                                </button>
                                <button
                                    onClick={() => {
                                        setConnectionMode('registry');
                                        setServerConfig('');
                                        if (registeredServers.length === 0) fetchRegisteredServers();
                                    }}
                                    className={`flex-1 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                                        connectionMode === 'registry'
                                            ? 'bg-purple-500 text-white'
                                            : 'text-gray-400 hover:text-white'
                                    }`}
                                >
                                    From Registry
                                </button>
                            </div>
                        </div>

                        {/* Content */}
                        <div className="flex-1 overflow-y-auto p-6">
                            {connectionMode === 'manual' ? (
                                <div className="space-y-4">
                                    <div>
                                        <label className="block text-xs font-semibold uppercas tracking-wider text-gray-400 mb-2">
                                            MCP Server URL (SSE)
                                        </label>
                                        <input
                                            type="text"
                                            value={serverConfig}
                                            onChange={(e) => setServerConfig(e.target.value)}
                                            placeholder="http://localhost:8000/sse"
                                            className="w-full bg-[#16181E] border border-[#2A2E37] rounded-lg px-4 py-2.5 focus:outline-none focus:border-emerald-500/50 text-sm font-mono text-white placeholder-[#4A505E]"
                                        />
                                        <p className="text-[11px] text-gray-500 mt-2 leading-relaxed">
                                            Enter the full URL to the SSE endpoint of your MCP server infrastructure.
                                        </p>
                                    </div>
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    {loadingServers ? (
                                        <div className="flex items-center justify-center py-12">
                                            <Loader2 className="w-6 h-6 text-emerald-500 animate-spin" />
                                        </div>
                                    ) : registeredServers.length === 0 ? (
                                        <div className="text-center py-12">
                                            <Database className="w-12 h-12 mx-auto mb-3 text-gray-600" />
                                            <p className="text-sm text-gray-400 mb-4">No registered servers found</p>
                                            <button
                                                onClick={() => setShowConnectModal(false)}
                                                className="text-purple-400 hover:text-purple-300 text-sm"
                                            >
                                                Register a server first →
                                            </button>
                                        </div>
                                    ) : !selectedRegisteredServer ? (
                                        <div className="space-y-3">
                                            <label className="block text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1">
                                                Select a Server
                                            </label>
                                            <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-3 mb-3">
                                                <p className="text-xs text-emerald-300 leading-relaxed">
                                                    <CheckCircle2 className="w-3 h-3 inline mr-1" />
                                                    Both local and remote servers are supported via backend sessions.
                                                </p>
                                            </div>
                                            {registeredServers.map(server => {
                                                return (
                                                    <button
                                                        key={server.id}
                                                        onClick={() => handleSelectRegisteredServer(server)}
                                                        className="w-full text-left p-4 rounded-lg border transition-all border-[#2A2E37] hover:border-purple-500/50 hover:bg-purple-500/5 group"
                                                    >
                                                        <div className="flex items-start justify-between gap-3">
                                                            <div className="flex-1 min-w-0">
                                                                <div className="font-semibold text-white truncate mb-1 flex items-center gap-2">
                                                                    {server.name}
                                                                </div>
                                                                {server.description && (
                                                                    <p className="text-xs text-gray-400 line-clamp-2 mb-2">
                                                                        {server.description}
                                                                    </p>
                                                                )}
                                                                <div className="flex items-center gap-2 text-xs">
                                                                    <span className={`px-2 py-0.5 rounded ${
                                                                        server.server_location === 'remote'
                                                                            ? 'bg-blue-500/10 text-blue-400'
                                                                            : 'bg-gray-700 text-gray-500'
                                                                    }`}>
                                                                        {server.server_location}
                                                                    </span>
                                                                    <span className="text-gray-500">
                                                                        {server.tool_count || 0} tools
                                                                    </span>
                                                                </div>
                                                            </div>
                                                            <ChevronRight className="w-5 h-5 text-gray-600 group-hover:text-purple-400 flex-shrink-0" />
                                                        </div>
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    ) : (
                                        <div className="space-y-4">
                                            {/* Back button and server info */}
                                            <div className="flex items-center gap-3 pb-3 border-b border-[#2A2E37]">
                                                <button
                                                    onClick={() => {
                                                        setSelectedRegisteredServer(null);
                                                        setSelectedTools(new Set());
                                                    }}
                                                    className="text-gray-400 hover:text-white transition-colors"
                                                >
                                                    ← Back
                                                </button>
                                                <div className="flex-1 min-w-0">
                                                    <div className="font-semibold text-white truncate">
                                                        {selectedRegisteredServer.name}
                                                    </div>
                                                    <div className="text-xs text-gray-500">
                                                        Select tools to connect
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Tools selection */}
                                            {availableToolsForSelection.length === 0 ? (
                                                <div className="text-center py-8 text-gray-500 text-sm">
                                                    No tools available on this server
                                                </div>
                                            ) : (
                                                <div className="space-y-2">
                                                    <div className="flex items-center justify-between mb-3">
                                                        <label className="block text-xs font-semibold uppercase tracking-wider text-gray-400">
                                                            Available Tools ({availableToolsForSelection.length})
                                                        </label>
                                                        <button
                                                            onClick={() => {
                                                                if (selectedTools.size === availableToolsForSelection.length) {
                                                                    setSelectedTools(new Set());
                                                                } else {
                                                                    setSelectedTools(new Set(availableToolsForSelection.map(t => t.name)));
                                                                }
                                                            }}
                                                            className="text-xs text-purple-400 hover:text-purple-300"
                                                        >
                                                            {selectedTools.size === availableToolsForSelection.length ? 'Deselect All' : 'Select All'}
                                                        </button>
                                                    </div>
                                                    <div className="space-y-2 max-h-[400px] overflow-y-auto custom-scrollbar">
                                                        {availableToolsForSelection.map(tool => (
                                                            <label
                                                                key={tool.name}
                                                                className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
                                                                    selectedTools.has(tool.name)
                                                                        ? 'border-purple-500/50 bg-purple-500/10'
                                                                        : 'border-[#2A2E37] hover:border-purple-500/30 hover:bg-[#16181E]'
                                                                }`}
                                                            >
                                                                <input
                                                                    type="checkbox"
                                                                    checked={selectedTools.has(tool.name)}
                                                                    onChange={() => toggleToolSelection(tool.name)}
                                                                    className="mt-1 w-4 h-4 rounded border-gray-700 text-purple-500 focus:ring-purple-500"
                                                                />
                                                                <div className="flex-1 min-w-0">
                                                                    <div className="font-mono text-sm font-medium text-white truncate">
                                                                        {tool.name}
                                                                    </div>
                                                                    {tool.description && (
                                                                        <p className="text-xs text-gray-400 mt-1 line-clamp-2">
                                                                            {tool.description}
                                                                        </p>
                                                                    )}
                                                                </div>
                                                            </label>
                                                        ))}
                                                    </div>
                                                    {selectedTools.size > 0 && (
                                                        <div className="mt-3 p-3 bg-purple-500/10 border border-purple-500/30 rounded-lg">
                                                            <p className="text-xs text-purple-300">
                                                                {selectedTools.size} tool{selectedTools.size !== 1 ? 's' : ''} selected
                                                            </p>
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* Footer */}
                        <div className="p-6 border-t border-[#2A2E37] flex justify-end gap-3">
                            <button
                                onClick={() => {
                                    setShowConnectModal(false);
                                    setConnectionMode('manual');
                                    setSelectedRegisteredServer(null);
                                    setSelectedTools(new Set());
                                }}
                                className="text-gray-400 hover:text-white px-4 py-2 transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={connectServer}
                                disabled={
                                    (connectionMode === 'manual' && !serverConfig) ||
                                    (connectionMode === 'registry' && (!selectedRegisteredServer || selectedTools.size === 0))
                                }
                                className="bg-emerald-500 hover:bg-emerald-600 text-black px-5 py-2 rounded-lg font-bold disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm"
                            >
                                Connect {connectionMode === 'registry' && selectedTools.size > 0 && `(${selectedTools.size} tools)`}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

function EyeIcon(props: any) {
    return (
        <svg
            {...props}
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
            <circle cx="12" cy="12" r="3" />
        </svg>
    )
}

function Loader2(props: any) {
    return (
        <svg
            {...props}
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <path d="M21 12a9 9 0 1 1-6.219-8.56" />
        </svg>
    )
}