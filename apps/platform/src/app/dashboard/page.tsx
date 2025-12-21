'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { User } from '@supabase/supabase-js';
import {
    Plus, Server, Activity, Loader2, Eye, Key, Copy, Check, Terminal, Globe, Lock, Users
} from 'lucide-react';
import { createClient } from '../../../utils/supabase/client';
import Header from '../components/Header';
import Footer from '../components/Footer';
import ToolsModal from './ToolsModal';

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

export default function Dashboard() {
    const router = useRouter();
    const supabase = createClient();
    const [user, setUser] = useState<User | null>(null);
    const [servers, setServers] = useState<Tool[]>([]);
    const [apiKey, setApiKey] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [selectedManifest, setSelectedManifest] = useState<any | null>(null);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [copied, setCopied] = useState(false);

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

        // 2. Fetch API Key
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
        const gatewayUrl = process.env.NEXT_PUBLIC_GATEWAY_URL || 'http://localhost:8000';

        return JSON.stringify({
            "mcpServers": {
                "mcp-gateway-cloud": {
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
        <div className="min-h-screen bg-black text-gray-100 font-mono flex flex-col">
            <Header />

            <div className="flex-1 max-w-7xl mx-auto px-6 py-12 w-full">

                <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
                    <div>
                        <h1 className="text-3xl font-bold mb-2">My Dashboard</h1>
                        <p className="text-gray-400">Manage your agents and explore community tools</p>
                    </div>
                    <button
                        onClick={() => router.push('/deploy')}
                        className="flex items-center gap-2 bg-emerald-500 hover:bg-emerald-600 text-black px-4 py-2 rounded-lg font-semibold transition-colors"
                    >
                        <Plus className="w-5 h-5" />
                        <span>Deploy New Server</span>
                    </button>
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

                {/* --- SERVERS LIST --- */}
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
            </div>

            <Footer />

            <ToolsModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                manifest={selectedManifest}
            />
        </div>
    );
}