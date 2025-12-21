'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { User } from '@supabase/supabase-js';
import { 
    Plus, Server, Activity, Loader2, Eye 
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
}

export default function Dashboard() {
    const router = useRouter();
    const supabase = createClient();
    const [user, setUser] = useState<User | null>(null);
    const [servers, setServers] = useState<Tool[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedManifest, setSelectedManifest] = useState<any | null>(null);
    const [isModalOpen, setIsModalOpen] = useState(false);

    // Auth & Data Fetching
    useEffect(() => {
        const init = async () => {
            const { data: { user }, error } = await supabase.auth.getUser();
            if (error || !user) {
                router.push('/login');
                return;
            }
            setUser(user);

            // Fetch Servers
            const { data, error: dbError } = await supabase
                .from('tools')
                .select('*')
                .eq('user_id', user.id)
                .order('created_at', { ascending: false });

            if (!dbError && data) {
                setServers(data as Tool[]);
            }
            setLoading(false);
        };
        init();
    }, [router, supabase]);

    // Updated Logout Handler
    const handleLogout = async () => {
        await supabase.auth.signOut();
        router.push('/'); // Redirects to Home Page
    };

    const openToolsModal = (manifest: any) => {
        setSelectedManifest(manifest);
        setIsModalOpen(true);
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
                {/* Page Header */}
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
                    <div>
                        <h1 className="text-3xl font-bold mb-2">My Servers</h1>
                        <p className="text-gray-400">Manage your deployed MCP agents</p>
                    </div>
                    <button
                        onClick={() => router.push('/deploy')}
                        className="flex items-center gap-2 bg-emerald-500 hover:bg-emerald-600 text-black px-4 py-2 rounded-lg font-semibold transition-colors"
                    >
                        <Plus className="w-5 h-5" />
                        <span>Deploy New Server</span>
                    </button>
                </div>

                {/* Empty State */}
                {servers.length === 0 ? (
                    <div className="border border-dashed border-gray-800 rounded-2xl p-12 text-center bg-gray-900/50">
                        <div className="w-16 h-16 bg-gray-800 rounded-full flex items-center justify-center mx-auto mb-4">
                            <Server className="w-8 h-8 text-gray-600" />
                        </div>
                        <h3 className="text-xl font-semibold mb-2">No servers deployed yet</h3>
                        <p className="text-gray-400 mb-6">Get started by deploying your first Model Context Protocol server.</p>
                        <button
                            onClick={() => router.push('/deploy')}
                            className="text-emerald-400 hover:text-emerald-300 font-medium"
                        >
                            Start Deployment →
                        </button>
                    </div>
                ) : (
                    /* Server Grid */
                    <div className="grid grid-cols-1 gap-4">
                        {servers.map((server) => {
                            const toolCount = server.manifest?.tools?.length || 0;
                            
                            return (
                                <div key={server.id} className="bg-gray-900 border border-gray-800 rounded-xl p-6 transition-all hover:border-gray-700">
                                    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
                                        
                                        {/* Left: Info */}
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-3 mb-2">
                                                <h3 className="text-xl font-bold truncate text-white">
                                                    {getRepoName(server.repo_url)}
                                                </h3>
                                                <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium border ${getStatusColor(server.status)} uppercase tracking-wide`}>
                                                    {server.status}
                                                </span>
                                            </div>
                                            
                                            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-gray-400">
                                                <div className="flex items-center gap-1.5">
                                                    <Activity className="w-4 h-4" />
                                                    <span>Created {new Date(server.created_at).toLocaleDateString()}</span>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Right: Stats & Actions */}
                                        <div className="flex items-center gap-4 lg:border-l lg:border-gray-800 lg:pl-6">
                                            <div className="text-center px-2">
                                                <div className="text-2xl font-bold text-white">{toolCount}</div>
                                                <div className="text-xs text-gray-500 uppercase font-semibold">Tools</div>
                                            </div>

                                            <div className="h-8 w-px bg-gray-800 hidden lg:block"></div>

                                            <button
                                                onClick={() => openToolsModal(server.manifest)}
                                                disabled={!server.manifest}
                                                className="flex items-center gap-2 px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-200 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                            >
                                                <Eye className="w-4 h-4" />
                                                View Tools
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