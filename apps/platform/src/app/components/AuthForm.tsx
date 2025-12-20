'use client'

import { useState } from 'react'
import { createClient } from '../../../utils/supabase/client'

type AuthMode = 'login' | 'signup'

export default function AuthForm() {
    const [mode, setMode] = useState<AuthMode>('login')
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [loading, setLoading] = useState(false)
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

    const supabase = createClient()

    const handleEmailAuth = async (e: React.FormEvent) => {
        e.preventDefault()
        setLoading(true)
        setMessage(null)

        try {
            if (mode === 'signup') {
                // Sign up new user
                const { data, error } = await supabase.auth.signUp({
                    email,
                    password,
                    options: {
                        emailRedirectTo: `${location.origin}/auth/callback`,
                    },
                })

                if (error) throw error

                setMessage({
                    type: 'success',
                    text: 'Sign up successful! Please check your email to confirm your account.',
                })

                // Clear form
                setEmail('')
                setPassword('')
            } else {
                // Sign in existing user
                const { data, error } = await supabase.auth.signInWithPassword({
                    email,
                    password,
                })

                if (error) throw error

                setMessage({
                    type: 'success',
                    text: 'Login successful!',
                })
            }
        } catch (error: any) {
            setMessage({
                type: 'error',
                text: error.message || 'An error occurred',
            })
        } finally {
            setLoading(false)
        }
    }

    const handleOAuthLogin = async (provider: 'github' | 'google') => {
        try {
            const { error } = await supabase.auth.signInWithOAuth({
                provider,
                options: {
                    redirectTo: `${location.origin}/auth/callback`,
                },
            })

            if (error) throw error
        } catch (error: any) {
            setMessage({
                type: 'error',
                text: error.message || 'OAuth login failed',
            })
        }
    }

    return (
        <div className="w-full max-w-md mx-auto bg-white/10 backdrop-blur-xl rounded-2xl shadow-2xl p-8 border border-white/20">
            {/* Header */}
            <div className="text-center mb-8">
                <h2 className="text-3xl font-bold text-white mb-2">
                    {mode === 'login' ? 'Welcome Back' : 'Create Account'}
                </h2>
                <p className="text-gray-400">
                    {mode === 'login'
                        ? 'Sign in to access your MCP servers'
                        : 'Get started with secure MCP hosting'}
                </p>
            </div>

            {/* OAuth Buttons */}
            <div className="space-y-3 mb-6">
                <button
                    onClick={() => handleOAuthLogin('github')}
                    className="w-full flex items-center justify-center gap-3 bg-white/10 hover:bg-white/20 backdrop-blur-md text-white px-6 py-3 rounded-lg font-medium border border-white/20 transition-all duration-200 hover:scale-[1.02]"
                >
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                        <path fillRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" clipRule="evenodd" />
                    </svg>
                    Continue with GitHub
                </button>

                <button
                    onClick={() => handleOAuthLogin('google')}
                    className="w-full flex items-center justify-center gap-3 bg-white hover:bg-gray-100 text-gray-900 px-6 py-3 rounded-lg font-medium border border-white/30 transition-all duration-200 hover:scale-[1.02]"
                >
                    <svg className="w-5 h-5" viewBox="0 0 24 24">
                        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                        <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                    </svg>
                    Continue with Google
                </button>
            </div>

            {/* Divider */}
            <div className="relative mb-6">
                <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-white/20"></div>
                </div>
                <div className="relative flex justify-center text-sm">
                    <span className="px-2 bg-transparent text-gray-400">Or continue with email</span>
                </div>
            </div>

            {/* Email/Password Form */}
            <form onSubmit={handleEmailAuth} className="space-y-4">
                <div>
                    <label htmlFor="email" className="block text-sm font-medium text-gray-300 mb-1">
                        Email Address
                    </label>
                    <input
                        id="email"
                        type="email"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="w-full px-4 py-2.5 bg-white/10 backdrop-blur-md border border-white/20 rounded-lg focus:ring-2 focus:ring-cyan-400 focus:border-transparent outline-none transition text-white placeholder-gray-400"
                        placeholder="you@example.com"
                    />
                </div>

                <div>
                    <label htmlFor="password" className="block text-sm font-medium text-gray-300 mb-1">
                        Password
                    </label>
                    <input
                        id="password"
                        type="password"
                        required
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="w-full px-4 py-2.5 bg-white/10 backdrop-blur-md border border-white/20 rounded-lg focus:ring-2 focus:ring-cyan-400 focus:border-transparent outline-none transition text-white placeholder-gray-400"
                        placeholder="••••••••"
                        minLength={6}
                    />
                    {mode === 'signup' && (
                        <p className="text-xs text-gray-400 mt-1">Must be at least 6 characters</p>
                    )}
                </div>

                <button
                    type="submit"
                    disabled={loading}
                    className="w-full bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-600 hover:to-blue-700 text-white px-6 py-3 rounded-lg font-semibold disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 hover:scale-[1.02] shadow-lg hover:shadow-cyan-500/50"
                >
                    {loading ? 'Processing...' : mode === 'login' ? 'Sign In' : 'Create Account'}
                </button>
            </form>

            {/* Status Message */}
            {message && (
                <div
                    className={`mt-4 p-4 rounded-lg text-sm backdrop-blur-md ${message.type === 'success'
                        ? 'bg-green-500/20 text-green-300 border border-green-500/30'
                        : 'bg-red-500/20 text-red-300 border border-red-500/30'
                        }`}
                >
                    {message.text}
                </div>
            )}

            {/* Toggle Mode */}
            <div className="mt-6 text-center text-sm">
                <span className="text-gray-400">
                    {mode === 'login' ? "Don't have an account? " : 'Already have an account? '}
                </span>
                <button
                    type="button"
                    onClick={() => {
                        setMode(mode === 'login' ? 'signup' : 'login')
                        setMessage(null)
                    }}
                    className="text-cyan-400 font-semibold hover:text-cyan-300 hover:underline transition-colors"
                >
                    {mode === 'login' ? 'Sign up' : 'Sign in'}
                </button>
            </div>
        </div>
    )
}
