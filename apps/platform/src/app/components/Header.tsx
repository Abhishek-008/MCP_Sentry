'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { LogOut, User as UserIcon, LayoutDashboard, PlusCircle } from 'lucide-react';
import { createClient } from '../../../utils/supabase/client';
import { User } from '@supabase/supabase-js';

export default function Header() {
    const [user, setUser] = useState<User | null>(null);
    const router = useRouter();
    const pathname = usePathname();
    const supabase = createClient();

    useEffect(() => {
        const getUser = async () => {
            const { data: { user } } = await supabase.auth.getUser();
            setUser(user);
        };
        getUser();

        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
            setUser(session?.user ?? null);
        });

        return () => subscription.unsubscribe();
    }, [supabase]);

    const handleLogout = async () => {
        await supabase.auth.signOut();
        setUser(null);
        router.push('/');
    };

    const isActive = (path: string) => pathname === path
        ? "text-emerald-400 bg-emerald-500/10"
        : "text-gray-400 hover:text-white hover:bg-white/5";

    return (
        <header className="border-b border-gray-800 bg-black/50 backdrop-blur-md sticky top-0 z-40">
            <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">

                {/* Logo & Navigation */}
                <div className="flex items-center gap-8">
                    <Link href="/" className="flex items-center gap-3 group">
                        {/* Terminal Style Logo from Image */}
                        <div className="font-mono text-xl font-bold tracking-tight">
                            <span className="text-emerald-500 mr-2">{'>_'}</span>
                            <span className="text-white group-hover:text-emerald-400 transition-colors">
                                MCP_Sentry
                            </span>
                        </div>
                    </Link>

                    {/* Navigation - Only visible if logged in */}
                    {user && (
                        <nav className="hidden md:flex items-center gap-1">
                            <Link
                                href="/dashboard"
                                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${isActive('/dashboard')}`}
                            >
                                <LayoutDashboard className="w-4 h-4" />
                                Dashboard
                            </Link>
                            <Link
                                href="/deploy"
                                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${isActive('/deploy')}`}
                            >
                                <PlusCircle className="w-4 h-4" />
                                Register Server
                            </Link>
                            <Link
                                href="/client"
                                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${isActive('/client')}`}
                            >
                                <code className="text-xs font-bold">{'>_'}</code>
                                Client
                            </Link>
                        </nav>
                    )}
                </div>

                {/* Right Side: User Profile / Auth */}
                <div>
                    {user ? (
                        <div className="flex items-center gap-4">
                            <div className="hidden md:flex items-center gap-2 text-sm text-gray-400 bg-gray-900 border border-gray-800 px-3 py-1.5 rounded-full font-mono">
                                <UserIcon className="w-3.5 h-3.5" />
                                <span className="truncate max-w-[150px]">{user.email}</span>
                            </div>
                            <button
                                onClick={handleLogout}
                                className="p-2 text-gray-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all"
                                title="Sign Out"
                            >
                                <LogOut className="w-5 h-5" />
                            </button>
                        </div>
                    ) : (
                        <Link
                            href="/login"
                            className="text-sm font-mono font-medium text-emerald-400 hover:text-emerald-300 transition-colors"
                        >
                            Sign In_
                        </Link>
                    )}
                </div>
            </div>
        </header>
    );
}