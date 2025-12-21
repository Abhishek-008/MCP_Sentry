"use client";

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Mail, Lock, ArrowRight, Loader2, AlertCircle } from 'lucide-react';
import Header from '../components/Header';
import Footer from '../components/Footer';
import { createClient } from '../../../utils/supabase/client';

export default function LoginPage() {
    const router = useRouter();
    const supabase = createClient();

    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [isSignUp, setIsSignUp] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [message, setMessage] = useState<string | null>(null);

    const handleSubmit = async () => {
        setLoading(true);
        setError(null);
        setMessage(null);

        try {
            if (isSignUp) {
                // Handle Sign Up
                const { data, error } = await supabase.auth.signUp({
                    email,
                    password,
                    options: {
                        // Redirect back to this page or the deploy page after email confirmation
                        emailRedirectTo: `${location.origin}/auth/callback`,
                    },
                });

                if (error) throw error;

                if (data.user && !data.session) {
                    setMessage("Account created! Please check your email to confirm your account.");
                } else {
                    // If email confirmation is disabled or auto-confirmed
                    router.push('/dashboard');
                }
            } else {
                // Handle Sign In
                const { error } = await supabase.auth.signInWithPassword({
                    email,
                    password,
                });

                if (error) throw error;

                router.push('/dashboard');
            }
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };



    const handleGoogleLogin = async () => {
        setLoading(true);
        try {
            const { error } = await supabase.auth.signInWithOAuth({
                provider: 'google',
                options: {
                    redirectTo: `${location.origin}/auth/callback?next=/dashboard`
                },
            });
            if (error) throw error;
        } catch (err: any) {
            setError(err.message);
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-black text-gray-100 font-mono flex flex-col">
            <Header />

            {/* Login Form */}
            <div className="flex-1 flex items-center justify-center px-6 py-12">
                <div className="w-full max-w-md">
                    {/* Header */}
                    <div className="text-center mb-8">
                        <div className="inline-flex items-center justify-center w-16 h-16 bg-emerald-500/10 rounded-2xl mb-6">
                            <Lock className="w-8 h-8 text-emerald-400" />
                        </div>
                        <h1 className="text-3xl font-bold mb-2">
                            {isSignUp ? 'Create Account' : 'Welcome Back'}
                        </h1>
                        <p className="text-gray-400">
                            {isSignUp
                                ? 'Start deploying MCP servers securely'
                                : 'Sign in to manage your deployments'}
                        </p>
                    </div>

                    {/* Form Card */}
                    <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 shadow-2xl shadow-emerald-900/10">
                        {/* Error/Success Messages */}
                        {error && (
                            <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-lg flex items-start gap-3">
                                <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
                                <p className="text-sm text-red-200">{error}</p>
                            </div>
                        )}
                        {message && (
                            <div className="mb-6 p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-lg flex items-start gap-3">
                                <CheckCircleIcon className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                                <p className="text-sm text-emerald-200">{message}</p>
                            </div>
                        )}

                        <div className="space-y-3 mb-6">


                            {/* Google Login */}
                            <button
                                onClick={handleGoogleLogin}
                                disabled={loading}
                                className="w-full py-3 px-4 bg-gray-800 hover:bg-gray-750 border border-gray-700 hover:border-gray-600 rounded-lg transition-colors flex items-center justify-center space-x-3 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {loading ? (
                                    <Loader2 className="w-5 h-5 animate-spin" />
                                ) : (
                                    <>
                                        <svg className="w-5 h-5" viewBox="0 0 24 24">
                                            <path
                                                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                                                fill="#4285F4"
                                            />
                                            <path
                                                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                                                fill="#34A853"
                                            />
                                            <path
                                                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.84z"
                                                fill="#FBBC05"
                                            />
                                            <path
                                                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                                                fill="#EA4335"
                                            />
                                        </svg>
                                        <span>Continue with Google</span>
                                    </>
                                )}
                            </button>
                        </div>

                        {/* Divider */}
                        <div className="relative my-6">
                            <div className="absolute inset-0 flex items-center">
                                <div className="w-full border-t border-gray-800"></div>
                            </div>
                            <div className="relative flex justify-center text-sm">
                                <span className="px-4 bg-gray-900 text-gray-500">or continue with email</span>
                            </div>
                        </div>

                        {/* Email/Password Inputs */}
                        <div className="space-y-4">
                            {/* Email Input */}
                            <div>
                                <label htmlFor="email" className="block text-sm font-medium text-gray-300 mb-2">
                                    Email Address
                                </label>
                                <div className="relative">
                                    <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-500" />
                                    <input
                                        id="email"
                                        type="email"
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        placeholder="dev@example.com"
                                        disabled={loading}
                                        className="w-full pl-10 pr-4 py-3 bg-black border border-gray-700 rounded-lg focus:outline-none focus:border-emerald-500 transition-colors text-gray-100 placeholder-gray-600 disabled:opacity-50"
                                    />
                                </div>
                            </div>

                            {/* Password Input */}
                            <div>
                                <label htmlFor="password" className="block text-sm font-medium text-gray-300 mb-2">
                                    Password
                                </label>
                                <div className="relative">
                                    <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-500" />
                                    <input
                                        id="password"
                                        type="password"
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        placeholder="••••••••"
                                        disabled={loading}
                                        className="w-full pl-10 pr-4 py-3 bg-black border border-gray-700 rounded-lg focus:outline-none focus:border-emerald-500 transition-colors text-gray-100 placeholder-gray-600 disabled:opacity-50"
                                    />
                                </div>
                            </div>

                            {/* Forgot Password */}
                            {!isSignUp && (
                                <div className="flex justify-end">
                                    <button
                                        type="button"
                                        className="text-sm text-emerald-400 hover:text-emerald-300 transition-colors"
                                    >
                                        Forgot password?
                                    </button>
                                </div>
                            )}

                            {/* Submit Button */}
                            <button
                                onClick={handleSubmit}
                                disabled={loading}
                                className="w-full py-3 px-4 bg-emerald-500 hover:bg-emerald-600 text-black font-semibold rounded-lg transition-all transform hover:scale-[1.02] flex items-center justify-center space-x-2 disabled:opacity-50 disabled:hover:scale-100 disabled:cursor-not-allowed"
                            >
                                {loading ? (
                                    <Loader2 className="w-5 h-5 animate-spin" />
                                ) : (
                                    <>
                                        <span>{isSignUp ? 'Create Account' : 'Sign In'}</span>
                                        <ArrowRight className="w-5 h-5" />
                                    </>
                                )}
                            </button>
                        </div>

                        {/* Toggle Sign Up/Sign In */}
                        <div className="mt-6 text-center">
                            <span className="text-gray-400">
                                {isSignUp ? 'Already have an account?' : "Don't have an account?"}
                            </span>
                            {' '}
                            <button
                                onClick={() => {
                                    setIsSignUp(!isSignUp);
                                    setError(null);
                                    setMessage(null);
                                }}
                                className="text-emerald-400 hover:text-emerald-300 font-semibold transition-colors"
                            >
                                {isSignUp ? 'Sign In' : 'Sign Up'}
                            </button>
                        </div>
                    </div>

                    {/* Terms */}
                    <p className="text-center text-sm text-gray-500 mt-6">
                        By continuing, you agree to our{' '}
                        <a href="#" className="text-emerald-400 hover:text-emerald-300 transition-colors">
                            Terms of Service
                        </a>
                        {' '}and{' '}
                        <a href="#" className="text-emerald-400 hover:text-emerald-300 transition-colors">
                            Privacy Policy
                        </a>
                    </p>
                </div>
            </div>

            <Footer />

            {/* Terminal Background Effect */}
            <div className="fixed inset-0 -z-10 opacity-[0.015]">
                <div className="absolute inset-0" style={{
                    backgroundImage: `repeating-linear-gradient(
                        0deg,
                        rgb(34, 197, 94) 0px,
                        rgb(34, 197, 94) 1px,
                        transparent 1px,
                        transparent 2px
                    )`
                }}></div>
            </div>
        </div>
    );
}

// Simple icon component for success message
function CheckCircleIcon(props: any) {
    return (
        <svg
            {...props}
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="currentColor"
        >
            <path
                fillRule="evenodd"
                d="M2.25 12c0-5.385 4.365-9.75 9.75-9.75s9.75 4.365 9.75 9.75-4.365 9.75-9.75 9.75S2.25 17.385 2.25 12zm13.36-1.814a.75.75 0 10-1.22-.872l-3.236 4.53L9.53 12.22a.75.75 0 00-1.06 1.06l2.25 2.25a.75.75 0 001.14-.094l3.75-5.25z"
                clipRule="evenodd"
            />
        </svg>
    )
}