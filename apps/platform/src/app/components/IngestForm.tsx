'use client'

import { useState } from 'react'
import { User } from '@supabase/supabase-js'

export default function IngestForm({ user }: { user: User }) {
    const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
    const [message, setMessage] = useState('')

    // Form State matching your curl body
    const [formData, setFormData] = useState({
        repoUrl: 'https://github.com/openbnb-org/mcp-server-airbnb',
        startCommand: 'node dist/index.js',
        envVars: '{ "NODE_ENV": "production" }', // Kept as string for JSON parsing
        defaultArgs: '{ "ignoreRobotsText": true }'
    })

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setStatus('loading')
        setMessage('')

        try {
            // 1. Prepare the payload
            const payload = {
                repoUrl: formData.repoUrl,
                userId: user.id, // Auto-filled from Auth
                startCommand: formData.startCommand,
                configuration: {
                    env: JSON.parse(formData.envVars),
                    defaultArguments: JSON.parse(formData.defaultArgs)
                }
            }

            // 2. Call your Backend Route
            const res = await fetch('/api/ingest', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(payload),
            })

            if (!res.ok) throw new Error(`Error: ${res.statusText}`)

            const data = await res.json()
            setStatus('success')
            setMessage(`Success! Job ID: ${data.jobId || 'Unknown'}`) // Assuming backend returns a jobId
        } catch (err: any) {
            console.error(err)
            setStatus('error')
            setMessage(err.message || 'Something went wrong')
        }
    }

    return (
        <div className="bg-white/10 backdrop-blur-xl p-8 rounded-2xl shadow-2xl border border-white/20">
            <h2 className="text-2xl font-bold mb-6 text-white">Register New MCP Server</h2>

            <form onSubmit={handleSubmit} className="space-y-5">

                {/* Repo URL */}
                <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">GitHub Repository URL</label>
                    <input
                        required
                        type="url"
                        className="w-full p-3 bg-white/10 backdrop-blur-md border border-white/20 rounded-lg focus:ring-2 focus:ring-cyan-400 focus:border-transparent outline-none transition text-white placeholder-gray-400"
                        value={formData.repoUrl}
                        onChange={(e) => setFormData({ ...formData, repoUrl: e.target.value })}
                        placeholder="https://github.com/username/repo"
                    />
                </div>

                {/* Start Command */}
                <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">Start Command</label>
                    <input
                        required
                        type="text"
                        placeholder="e.g. node dist/index.js"
                        className="w-full p-3 bg-white/10 backdrop-blur-md border border-white/20 rounded-lg focus:ring-2 focus:ring-cyan-400 focus:border-transparent outline-none transition text-white placeholder-gray-400"
                        value={formData.startCommand}
                        onChange={(e) => setFormData({ ...formData, startCommand: e.target.value })}
                    />
                </div>

                {/* Environment Variables (JSON) */}
                <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">Environment Variables (JSON)</label>
                    <textarea
                        rows={3}
                        className="w-full p-3 bg-white/10 backdrop-blur-md border border-white/20 rounded-lg font-mono text-sm focus:ring-2 focus:ring-cyan-400 focus:border-transparent outline-none transition text-white placeholder-gray-400"
                        value={formData.envVars}
                        onChange={(e) => setFormData({ ...formData, envVars: e.target.value })}
                        placeholder='{ "KEY": "value" }'
                    />
                </div>

                {/* Default Arguments (JSON) */}
                <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">Default Arguments (JSON)</label>
                    <textarea
                        rows={3}
                        className="w-full p-3 bg-white/10 backdrop-blur-md border border-white/20 rounded-lg font-mono text-sm focus:ring-2 focus:ring-cyan-400 focus:border-transparent outline-none transition text-white placeholder-gray-400"
                        value={formData.defaultArgs}
                        onChange={(e) => setFormData({ ...formData, defaultArgs: e.target.value })}
                        placeholder='{ "arg": true }'
                    />
                </div>

                {/* Submit Button */}
                <button
                    disabled={status === 'loading'}
                    type="submit"
                    className={`w-full py-3 rounded-lg font-bold text-white transition-all duration-200 shadow-lg ${status === 'loading'
                            ? 'bg-gray-600 cursor-not-allowed opacity-50'
                            : 'bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-600 hover:to-blue-700 hover:scale-[1.02] hover:shadow-cyan-500/50'
                        }`}
                >
                    {status === 'loading' ? 'Processing...' : 'Deploy MCP Server'}
                </button>

                {/* Status Messages */}
                {message && (
                    <div className={`p-4 rounded-lg backdrop-blur-md ${status === 'success'
                            ? 'bg-green-500/20 text-green-300 border border-green-500/30'
                            : 'bg-red-500/20 text-red-300 border border-red-500/30'
                        }`}>
                        {message}
                    </div>
                )}

            </form>
        </div>
    )
}
