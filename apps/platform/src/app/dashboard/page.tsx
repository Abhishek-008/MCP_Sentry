'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { User } from '@supabase/supabase-js';
import {
    Plus, Server, Activity, Loader2, Eye, Key, Copy, Check, Terminal, Globe, Lock, Users, Database, Cloud
} from 'lucide-react';
import { createClient } from '../../../utils/supabase/client';
import Header from '../components/Header';
import Footer from '../components/Footer';
import ToolsModal from './ToolsModal';
import RegisterServerModal from './RegisterServerModal';
import SplineBackground from '../components/SplineBackground';

interface Tool {
    id: string;
    repo_url: string;
    status: 'pending' | 'building' | 'active' | 'failed';
    deployment_url: string | null;
    manifest: any;
    created_at: string;
    is_public: boolean;
    user_id: string; // Needed to check ownership
}

interface RegisteredServer {
    id: string;
    name: string;
    description: string | null;
    server_location: 'remote' | 'local';
    transport_type: 'sse' | 'http' | 'stdio';
    url: string | null;
    local_config: any;
    tools: any[];
    prompts: any[];
    resources: any[];
    tool_count: number;
    owner_id: string;
    created_at: string;
    is_public: boolean;
    status: string;
}

export default function Dashboard() {
    const router = useRouter();
    const supabase = createClient();
    const [user, setUser] = useState<User | null>(null);
    const [servers, setServers] = useState<Tool[]>([]);
    const [registeredServers, setRegisteredServers] = useState<RegisteredServer[]>([]);
    const [viewMode, setViewMode] = useState<'deployed' | 'registered'>('deployed');
    const [apiKey, setApiKey] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [selectedManifest, setSelectedManifest] = useState<any | null>(null);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [copied, setCopied] = useState(false);
    const [isRegisterModalOpen, setIsRegisterModalOpen] = useState(false);

    // Fetch Data
    const fetchData = async () => {
        const { data: { user }, error } = await supabase.auth.getUser();
        if (error || !user) {
            router.push('/login');
            return;
        }
        setUser(user);

        // 1. Fetch Tools (Mine OR Public)
        const { data: toolsData } = await supabase
            .from('tools')
            .select('*')
            // This is the magic line: Show MY tools OR PUBLIC tools
            .or(`user_id.eq.${user.id},is_public.eq.true`)
            .order('created_at', { ascending: false });

        if (toolsData) setServers(toolsData as Tool[]);

        // 2. Fetch Registered MCP Servers (Mine OR Public)
        const { data: mcpServersData } = await supabase
            .from('mcp_servers')
            .select('*')
            .or(`owner_id.eq.${user.id},is_public.eq.true`)
            .order('created_at', { ascending: false });

        if (mcpServersData) setRegisteredServers(mcpServersData as RegisteredServer[]);

        // 3. Fetch API Key
        const { data: keyData } = await supabase
            .from('api_keys')
            .select('key_hash')
            .eq('user_id', user.id)
            .single();

        if (keyData) setApiKey(keyData.key_hash);
        setLoading(false);
    };

    useEffect(() => {
        fetchData();
    }, [router, supabase]);

    // --- TOGGLE PUBLIC/PRIVATE ---
    const toggleVisibility = async (tool: Tool) => {
        // Security Check: Only Owner can toggle
        if (tool.user_id !== user?.id) return;

        const currentStatus = tool.is_public;

        // Optimistic UI update
        setServers(prev => prev.map(s => s.id === tool.id ? { ...s, is_public: !currentStatus } : s));

        const { error } = await supabase
            .from('tools')
            .update({ is_public: !currentStatus })
            .eq('id', tool.id)
            .eq('user_id', user.id); // Double check ownership in DB

        if (error) {
            console.error('Update failed:', error);
            setServers(prev => prev.map(s => s.id === tool.id ? { ...s, is_public: currentStatus } : s));
            alert('Failed to update visibility');
        }
    };

    const openToolsModal = (manifest: any) => {
        setSelectedManifest(manifest);
        setIsModalOpen(true);
    };

    const getClientConfig = () => {
        if (!apiKey) return 'Generating key...';

        // This points to your live Railway server
        let gatewayUrl = process.env.NEXT_PUBLIC_GATEWAY_URL || 'http://localhost:8000';

        if (gatewayUrl.endsWith('/')) {
            gatewayUrl = gatewayUrl.slice(0, -1);
        }

        return JSON.stringify({
            "mcpServers": {
                "mcp-gateway": {
                    "url": `${gatewayUrl}/sse?apiKey=${apiKey}`
                }
            }
        }, null, 2);
    };

    const copyToClipboard = () => {
        navigator.clipboard.writeText(getClientConfig());
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'active': return 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20';
            case 'failed': return 'text-red-400 bg-red-400/10 border-red-400/20';
            case 'pending': return 'text-yellow-400 bg-yellow-400/10 border-yellow-400/20';
            default: return 'text-blue-400 bg-blue-400/10 border-blue-400/20';
        }
    };

    const getRepoName = (url: string) => {
        try {
            const parts = url.split('/');
            return parts.length >= 2 ? `${parts[parts.length - 2]}/${parts[parts.length - 1]}` : url;
        } catch {
            return url;
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-black flex items-center justify-center">
                <Loader2 className="w-8 h-8 text-emerald-500 animate-spin" />
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-black text-gray-100 font-mono flex flex-col relative overflow-hidden">
            {/* Spline 3D Background */}
            <div className="fixed inset-0 z-0 opacity-60">
                <SplineBackground />
            </div>
            
            {/* Content Layer */}
            <div className="relative z-10">
            <Header />

            <div className="flex-1 max-w-7xl mx-auto px-6 py-12 w-full">

                <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
                    <div>
                        <h1 className="text-3xl font-bold mb-2">My Dashboard</h1>
                        <p className="text-gray-400">Manage your agents and explore community tools</p>
                    </div>
                    <div className="flex gap-3">
                        <button
                            onClick={() => setIsRegisterModalOpen(true)}
                            className="flex items-center gap-2 bg-purple-500 hover:bg-purple-600 text-white px-4 py-2 rounded-lg font-semibold transition-colors"
                        >
                            <Server className="w-5 h-5" />
                            <span>Register Server</span>
                        </button>
                        <button
                            onClick={() => router.push('/deploy')}
                            className="flex items-center gap-2 bg-emerald-500 hover:bg-emerald-600 text-black px-4 py-2 rounded-lg font-semibold transition-colors"
                        >
                            <Plus className="w-5 h-5" />
                            <span>Deploy New Server</span>
                        </button>
                    </div>
                </div>

                {/* --- CONFIG SECTION --- */}
                {apiKey && (
                    <div className="mb-10 bg-gray-900/50 border border-emerald-500/20 rounded-xl p-6 relative overflow-hidden">
                        <div className="absolute top-0 left-0 w-1 h-full bg-emerald-500"></div>
                        <div className="flex flex-col md:flex-row gap-6">
                            <div className="flex-1">
                                <h3 className="text-lg font-bold text-white flex items-center gap-2 mb-2">
                                    <Terminal className="w-5 h-5 text-emerald-500" />
                                    Client Configuration
                                </h3>
                                <p className="text-gray-400 text-sm mb-4 leading-relaxed">
                                    Use this configuration to connect Cursor or Claude to your account.
                                    This gives you access to <b>all your deployed tools</b> plus any <b>public community tools</b>.
                                </p>
                            </div>
                            <div className="flex-1 w-full max-w-xl">
                                <div className="relative group">
                                    <pre className="bg-black/80 p-4 rounded-lg border border-gray-800 text-sm text-gray-300 overflow-x-auto font-mono scrollbar-thin scrollbar-thumb-gray-700">
                                        {getClientConfig()}
                                    </pre>
                                    <button
                                        onClick={copyToClipboard}
                                        className="absolute top-2 right-2 p-2 bg-gray-800 hover:bg-gray-700 rounded-md transition-colors text-white border border-gray-700"
                                        title="Copy to clipboard"
                                    >
                                        {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* --- VIEW TOGGLE --- */}
                <div className="mb-6 flex items-center gap-3 p-1 bg-gray-900/50 border border-gray-800 rounded-lg w-fit">
                    <button
                        onClick={() => setViewMode('deployed')}
                        className={`flex items-center gap-2 px-4 py-2 rounded-md transition-all font-medium text-sm ${
                            viewMode === 'deployed'
                                ? 'bg-emerald-500 text-black shadow-lg'
                                : 'text-gray-400 hover:text-white'
                        }`}
                    >
                        <Cloud className="w-4 h-4" />
                        Deployed Servers
                        {servers.length > 0 && (
                            <span className={`ml-1 px-1.5 py-0.5 rounded text-xs font-semibold ${
                                viewMode === 'deployed' ? 'bg-black/20' : 'bg-gray-800'
                            }`}>
                                {servers.length}
                            </span>
                        )}
                    </button>
                    <button
                        onClick={() => setViewMode('registered')}
                        className={`flex items-center gap-2 px-4 py-2 rounded-md transition-all font-medium text-sm ${
                            viewMode === 'registered'
                                ? 'bg-purple-500 text-white shadow-lg'
                                : 'text-gray-400 hover:text-white'
                        }`}
                    >
                        <Database className="w-4 h-4" />
                        Registered Servers
                        {registeredServers.length > 0 && (
                            <span className={`ml-1 px-1.5 py-0.5 rounded text-xs font-semibold ${
                                viewMode === 'registered' ? 'bg-black/20' : 'bg-gray-800'
                            }`}>
                                {registeredServers.length}
                            </span>
                        )}
                    </button>
                </div>

                {/* --- DEPLOYED SERVERS LIST --- */}
                {viewMode === 'deployed' && (
                    <>
                        {servers.length === 0 ? (
                    <div className="border border-dashed border-gray-800 rounded-2xl p-12 text-center bg-gray-900/50">
                        <div className="w-16 h-16 bg-gray-800 rounded-full flex items-center justify-center mx-auto mb-4">
                            <Server className="w-8 h-8 text-gray-600" />
                        </div>
                        <h3 className="text-xl font-semibold mb-2">No servers found</h3>
                        <button
                            onClick={() => router.push('/deploy')}
                            className="text-emerald-400 hover:text-emerald-300 font-medium"
                        >
                            Deploy the first one →
                        </button>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 gap-4">
                        {servers.map((server) => {
                            const isOwner = server.user_id === user?.id;
                            const toolCount = server.manifest?.tools?.length || 0;

                            return (
                                <div key={server.id} className={`bg-gray-900 border rounded-xl p-6 transition-all hover:border-gray-700 ${isOwner ? 'border-gray-800' : 'border-blue-900/30 bg-blue-900/5'}`}>
                                    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">

                                        {/* Left: Info */}
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-3 mb-2">
                                                <h3 className="text-xl font-bold truncate text-white">
                                                    {getRepoName(server.repo_url)}
                                                </h3>

                                                {/* OWNER / COMMUNITY BADGES */}
                                                {isOwner ? (
                                                    <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium border ${getStatusColor(server.status)} uppercase tracking-wide`}>
                                                        {server.status}
                                                    </span>
                                                ) : (
                                                    <span className="px-2.5 py-0.5 rounded-full text-xs font-medium border border-blue-500/30 bg-blue-500/10 text-blue-400 uppercase tracking-wide flex items-center gap-1">
                                                        <Users className="w-3 h-3" /> Community
                                                    </span>
                                                )}

                                                {/* PUBLIC BADGE */}
                                                {server.is_public && (
                                                    <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-purple-500/10 text-purple-400 border border-purple-500/20 uppercase tracking-wide flex items-center gap-1">
                                                        <Globe className="w-3 h-3" /> Public
                                                    </span>
                                                )}
                                            </div>
                                            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-gray-400">
                                                <div className="flex items-center gap-1.5">
                                                    <Activity className="w-4 h-4" />
                                                    <span>Created {new Date(server.created_at).toLocaleDateString()}</span>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Right: Actions */}
                                        <div className="flex items-center gap-4 lg:border-l lg:border-gray-800 lg:pl-6">

                                            {/* VISIBILITY TOGGLE (Restricted to Owner) */}
                                            {isOwner ? (
                                                <button
                                                    onClick={() => toggleVisibility(server)}
                                                    className={`p-2 rounded-lg transition-colors border ${server.is_public
                                                        ? 'bg-purple-900/20 border-purple-500/30 text-purple-400 hover:bg-purple-900/40'
                                                        : 'bg-gray-800 border-gray-700 text-gray-400 hover:text-white hover:bg-gray-700'
                                                        }`}
                                                    title={server.is_public ? "Make Private" : "Make Public"}
                                                >
                                                    {server.is_public ? <Globe className="w-5 h-5" /> : <Lock className="w-5 h-5" />}
                                                </button>
                                            ) : (
                                                <div className="p-2 opacity-50 cursor-not-allowed" title="Owned by another user">
                                                    <Lock className="w-5 h-5 text-gray-600" />
                                                </div>
                                            )}

                                            <div className="text-center px-2">
                                                <div className="text-2xl font-bold text-white">{toolCount}</div>
                                                <div className="text-xs text-gray-500 uppercase font-semibold">Tools</div>
                                            </div>
                                            <div className="h-8 w-px bg-gray-800 hidden lg:block"></div>

                                            {/* VIEW BUTTON (Available to Everyone) */}
                                            <button
                                                onClick={() => openToolsModal(server.manifest)}
                                                disabled={!server.manifest}
                                                className="flex items-center gap-2 px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-200 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                            >
                                                <Eye className="w-4 h-4" />
                                                View
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
                    </>
                )}

                {/* --- REGISTERED SERVERS TABLE --- */}
                {viewMode === 'registered' && (
                    <>
                        {registeredServers.length === 0 ? (
                            <div className="border border-dashed border-gray-800 rounded-2xl p-12 text-center bg-gray-900/50">
                                <div className="w-16 h-16 bg-gray-800 rounded-full flex items-center justify-center mx-auto mb-4">
                                    <Database className="w-8 h-8 text-gray-600" />
                                </div>
                                <h3 className="text-xl font-semibold mb-2">No registered servers found</h3>
                                <button
                                    onClick={() => setIsRegisterModalOpen(true)}
                                    className="text-purple-400 hover:text-purple-300 font-medium"
                                >
                                    Register your first server →
                                </button>
                            </div>
                        ) : (
                            <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
                                {/* Table Header */}
                                <div className="bg-gray-800/50 border-b border-gray-800 px-6 py-4">
                                    <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                                        <Database className="w-5 h-5 text-purple-400" />
                                        Registered MCP Servers
                                    </h3>
                                </div>

                                {/* Table */}
                                <div className="overflow-x-auto">
                                    <table className="w-full">
                                        <thead className="bg-black/40 border-b border-gray-800">
                                            <tr>
                                                <th className="text-left px-6 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Server</th>
                                                <th className="text-left px-6 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Type</th>
                                                <th className="text-left px-6 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Transport</th>
                                                <th className="text-center px-6 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Tools</th>
                                                <th className="text-center px-6 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Status</th>
                                                <th className="text-right px-6 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Actions</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-800">
                                            {registeredServers.map((server) => {
                                                const isOwner = server.owner_id === user?.id;
                                                
                                                return (
                                                    <tr key={server.id} className={`hover:bg-gray-800/50 transition-colors ${!isOwner ? 'bg-blue-900/5' : ''}`}>
                                                        {/* Server Name & Description */}
                                                        <td className="px-6 py-4">
                                                            <div className="flex flex-col">
                                                                <div className="flex items-center gap-2">
                                                                    <span className="font-semibold text-white">{server.name}</span>
                                                                    {!isOwner && (
                                                                        <span className="px-1.5 py-0.5 rounded text-xs font-medium bg-blue-500/10 text-blue-400 border border-blue-500/20">
                                                                            Community
                                                                        </span>
                                                                    )}
                                                                    {server.is_public && (
                                                                        <span title="Public" className="flex items-center">
                                                                            <Globe className="w-3 h-3 text-purple-400" />
                                                                        </span>
                                                                    )}
                                                                </div>
                                                                {server.description && (
                                                                    <span className="text-sm text-gray-400 mt-1">{server.description}</span>
                                                                )}
                                                            </div>
                                                        </td>

                                                        {/* Server Location */}
                                                        <td className="px-6 py-4">
                                                            <span className={`px-2 py-1 rounded text-xs font-medium ${
                                                                server.server_location === 'remote'
                                                                    ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                                                                    : 'bg-green-500/10 text-green-400 border border-green-500/20'
                                                            }`}>
                                                                {server.server_location === 'remote' ? 'Remote' : 'Local'}
                                                            </span>
                                                        </td>

                                                        {/* Transport Type */}
                                                        <td className="px-6 py-4">
                                                            <span className="text-sm text-gray-300 font-mono uppercase">
                                                                {server.transport_type}
                                                            </span>
                                                        </td>

                                                        {/* Tool Count */}
                                                        <td className="px-6 py-4 text-center">
                                                            <div className="inline-flex items-center gap-1">
                                                                <span className="text-lg font-bold text-white">{server.tool_count || 0}</span>
                                                            </div>
                                                        </td>

                                                        {/* Status */}
                                                        <td className="px-6 py-4 text-center">
                                                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(server.status)}`}>
                                                                {server.status}
                                                            </span>
                                                        </td>

                                                        {/* Actions */}
                                                        <td className="px-6 py-4">
                                                            <div className="flex items-center justify-end gap-2">
                                                                {isOwner && (
                                                                    <button
                                                                        onClick={async () => {
                                                                            const newStatus = !server.is_public;
                                                                            const { error } = await supabase
                                                                                .from('mcp_servers')
                                                                                .update({ is_public: newStatus })
                                                                                .eq('id', server.id)
                                                                                .eq('owner_id', user.id);
                                                                            
                                                                            if (!error) fetchData();
                                                                        }}
                                                                        className="p-2 hover:bg-gray-800 rounded transition-colors text-gray-400 hover:text-white"
                                                                        title={server.is_public ? "Make Private" : "Make Public"}
                                                                    >
                                                                        {server.is_public ? <Globe className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
                                                                    </button>
                                                                )}
                                                                <button
                                                                    onClick={() => {
                                                                        // Create a manifest-like object for the modal
                                                                        const manifest = {
                                                                            tools: server.tools || [],
                                                                            source: server.url || server.local_config?.command || 'Unknown'
                                                                        };
                                                                        openToolsModal(manifest);
                                                                    }}
                                                                    className="flex items-center gap-2 px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-200 rounded text-sm font-medium transition-colors"
                                                                >
                                                                    <Eye className="w-4 h-4" />
                                                                    View
                                                                </button>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}
                    </>
                )}
            </div>

            <Footer />

            <RegisterServerModal
                isOpen={isRegisterModalOpen}
                onClose={() => setIsRegisterModalOpen(false)}
                onSuccess={() => fetchData()}
            />
            </div>
            {/* End Content Layer */}

            {/* Modals - outside content layer to prevent z-index issues */}
            <ToolsModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                manifest={selectedManifest}
            />
        </div>
    );
}