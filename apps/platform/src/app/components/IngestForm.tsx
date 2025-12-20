'use client'

import { useState } from 'react'
import { User } from '@supabase/supabase-js'

export default function IngestForm({ user }: { user: User }) {
    const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
    const [message, setMessage] = useState('')
    const [deploymentUrl, setDeploymentUrl] = useState('')
    const [toolId, setToolId] = useState('')
    const [deploymentStatus, setDeploymentStatus] = useState<'pending' | 'building' | 'active' | 'failed'>('pending')

    // Form State matching your curl body
    const [formData, setFormData] = useState({
        repoUrl: 'https://github.com/openbnb-org/mcp-server-airbnb',
        startCommand: 'node dist/index.js',
        envVars: '{ "NODE_ENV": "production" }', // Kept as string for JSON parsing
        defaultArgs: '{ "ignoreRobotsText": true }'
    })

    // Poll for deployment status
    const pollDeploymentStatus = async (id: string) => {
        const maxAttempts = 60 // 5 minutes (60 * 5 seconds)
        let attempts = 0

        const poll = async () => {
            try {
                const res = await fetch(`/api/deployment-status?toolId=${id}`)
                const data = await res.json()

                setDeploymentStatus(data.status)

                if (data.status === 'active' && data.deploymentUrl) {
                    setDeploymentUrl(data.deploymentUrl)
                    setMessage('🎉 Deployment successful! Your MCP server is live.')
                    return true
                } else if (data.status === 'failed') {
                    setStatus('error')
                    setMessage(`Deployment failed: ${data.errorMessage || 'Unknown error'}`)
                    return true
                }

                attempts++
                if (attempts < maxAttempts) {
                    setTimeout(poll, 5000) // Poll every 5 seconds
                } else {
                    setMessage('⏱️ Deployment is taking longer than expected. Check back later.')
                }
            } catch (err) {
                console.error('Polling error:', err)
            }
        }

        poll()
    }

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
            setToolId(data.toolId)
            setMessage(`✨ Build started! Deploying to Railway...`)
            
            // Start polling for deployment status
            if (data.toolId) {
                pollDeploymentStatus(data.toolId)
            }
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
                        <div className="flex items-center gap-2">
                            {deploymentStatus === 'pending' || deploymentStatus === 'building' ? (
                                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-green-400"></div>
                            ) : null}
                            <span>{message}</span>
                        </div>
                        
                        {/* Show deployment URL when available */}
                        {status === 'success' && deploymentUrl && (
                            <div className="mt-4 p-3 bg-black/30 rounded border border-cyan-500/30">
                                <p className="text-xs text-gray-400 mb-2">🎉 Add this to your MCP client config:</p>
                                <code className="text-xs text-cyan-400 break-all block">
                                    {JSON.stringify({
                                        mcpServers: {
                                            [`mcp-${toolId.substring(0, 8)}`]: {
                                                url: deploymentUrl
                                            }
                                        }
                                    }, null, 2)}
                                </code>
                                <div className="flex gap-2 mt-3">
                                    <button
                                        onClick={() => navigator.clipboard.writeText(deploymentUrl)}
                                        className="text-xs px-3 py-1 bg-cyan-500/20 hover:bg-cyan-500/30 rounded border border-cyan-500/40 transition"
                                    >
                                        📋 Copy URL
                                    </button>
                                    <button
                                        onClick={() => {
                                            const config = {
                                                mcpServers: {
                                                    [`mcp-${toolId.substring(0, 8)}`]: {
                                                        url: deploymentUrl
                                                    }
                                                }
                                            };
                                            navigator.clipboard.writeText(JSON.stringify(config, null, 2));
                                        }}
                                        className="text-xs px-3 py-1 bg-purple-500/20 hover:bg-purple-500/30 rounded border border-purple-500/40 transition"
                                    >
                                        📋 Copy Config
                                    </button>
                                    <a
                                        href={deploymentUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-xs px-3 py-1 bg-blue-500/20 hover:bg-blue-500/30 rounded border border-blue-500/40 transition"
                                    >
                                        🔗 Open
                                    </a>
                                </div>
                            </div>
                        )}
                    </div>
                )}

            </form>
        </div>
    )
}
