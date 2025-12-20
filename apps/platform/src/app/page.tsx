'use client'

import { useEffect, useState } from 'react'
import { User } from '@supabase/supabase-js'
import IngestForm from './components/IngestForm'
import AuthForm from './components/AuthForm'
import { createClient } from '../../utils/supabase/client'

export default function Home() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    // 1. Check active session on load
    const checkUser = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      setUser(user)
      setLoading(false)
    }
    checkUser()

    // 2. Listen for auth changes (login/logout)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
    })

    return () => subscription.unsubscribe()
  }, [])

  const handleLogout = async () => {
    await supabase.auth.signOut()
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-gray-900 via-slate-900 to-black">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-cyan-400 mx-auto mb-4"></div>
          <p className="text-gray-400">Loading...</p>
        </div>
      </div>
    )
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-gray-900 via-slate-900 to-black text-white overflow-hidden relative">
      {/* Animated background effects */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 -left-4 w-72 h-72 bg-purple-500 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-blob"></div>
        <div className="absolute top-0 -right-4 w-72 h-72 bg-cyan-500 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-blob animation-delay-2000"></div>
        <div className="absolute -bottom-8 left-20 w-72 h-72 bg-pink-500 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-blob animation-delay-4000"></div>
      </div>

      <div className="relative z-10 flex min-h-screen flex-col items-center justify-center p-6">
        <div className="w-full max-w-7xl">
          {/* Header */}
          <div className="flex justify-between items-center mb-12">
            <div>
              <h1 className="text-4xl font-bold bg-gradient-to-r from-cyan-400 via-blue-500 to-purple-600 bg-clip-text text-transparent">
                Secure MCP Marketplace
              </h1>
              <p className="text-gray-400 mt-2">Zero Trust MCP Hosting Platform</p>
            </div>

            {user && (
              <div className="flex gap-4 items-center bg-white/10 backdrop-blur-md px-6 py-3 rounded-full border border-white/20 shadow-lg">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 bg-gradient-to-r from-cyan-400 to-blue-500 rounded-full flex items-center justify-center text-white font-semibold">
                    {user.email?.[0].toUpperCase()}
                  </div>
                  <span className="text-sm font-medium text-white">{user.email}</span>
                </div>
                <button
                  onClick={handleLogout}
                  className="bg-red-500/90 hover:bg-red-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 hover:scale-105"
                >
                  Logout
                </button>
              </div>
            )}
          </div>

          {/* Main Content */}
          {!user ? (
            <div className="grid lg:grid-cols-2 gap-12 items-center">
              {/* Left: Marketing Content */}
              <div className="space-y-8">
                <div className="space-y-4">
                  <h2 className="text-5xl font-bold leading-tight text-white">
                    Deploy MCP Agents in
                    <span className="block bg-gradient-to-r from-cyan-400 via-blue-500 to-purple-600 bg-clip-text text-transparent">
                      Isolated Sandboxes
                    </span>
                  </h2>
                  <p className="text-xl text-gray-400 leading-relaxed">
                    Securely host and manage your Model Context Protocol agents with enterprise-grade security and zero-trust architecture.
                  </p>
                </div>

                <div className="space-y-4">
                  <Feature icon="🔒" title="Zero Trust Security" description="Every agent runs in an isolated sandbox" />
                  <Feature icon="⚡" title="Instant Deployment" description="Deploy from GitHub in seconds" />
                  <Feature icon="🔧" title="Easy Configuration" description="Simple environment and argument management" />
                  <Feature icon="📊" title="Real-time Monitoring" description="Track your agents' performance live" />
                </div>
              </div>

              {/* Right: Auth Form */}
              <div>
                <AuthForm />
              </div>
            </div>
          ) : (
            // If logged in, show the Ingest Form
            <div className="max-w-4xl mx-auto">
              <IngestForm user={user} />
            </div>
          )}
        </div>
      </div>
    </main>
  )
}

function Feature({ icon, title, description }: { icon: string; title: string; description: string }) {
  return (
    <div className="flex items-start gap-4 bg-white/5 backdrop-blur-sm p-4 rounded-xl border border-white/10 hover:bg-white/10 transition-all duration-200">
      <div className="text-3xl">{icon}</div>
      <div>
        <h3 className="font-semibold text-white mb-1">{title}</h3>
        <p className="text-gray-400 text-sm">{description}</p>
      </div>
    </div>
  )
}
