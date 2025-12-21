import React from 'react';
import { ArrowRight, Shield, Zap, Lock, Cloud, Code } from 'lucide-react';
import Header from './components/Header';
import Footer from './components/Footer';

export default function HomePage() {
  // Mock user state - replace with actual auth
  const user = null;

  const handleLogout = () => {
    console.log('Logout');
  };

  return (
    <div className="min-h-screen bg-black text-gray-100 font-mono flex flex-col">
      <Header/>

      {/* Hero Section */}
      <section className="max-w-7xl mx-auto px-6 pt-20 pb-32">
        <div className="text-center space-y-8">
          <div className="inline-block">
            <span className="px-4 py-1.5 bg-emerald-500/10 border border-emerald-500/20 rounded-full text-emerald-400 text-sm">
              Zero Trust MCP Execution
            </span>
          </div>

          <h1 className="text-6xl md:text-7xl font-bold leading-tight">
            Deploy MCP Servers
            <br />
            <span className="text-emerald-400">Without the Risk</span>
          </h1>

          <p className="text-xl text-gray-400 max-w-3xl mx-auto leading-relaxed">
            A multi-tenant platform where developers can register Model Context Protocol servers
            and users can safely execute them with complete isolation. No shared resources, no data leaks.
          </p>

          <div className="flex items-center justify-center space-x-4 pt-4">
            <a
              href="/deploy"
              className="px-8 py-4 bg-emerald-500 hover:bg-emerald-600 text-black font-semibold rounded-lg transition-all transform hover:scale-105 flex items-center space-x-2"
            >
              <span>Deploy Your Server</span>
              <ArrowRight className="w-5 h-5" />
            </a>
            <a
              href="/docs"
              className="px-8 py-4 border border-gray-700 hover:border-gray-600 rounded-lg transition-colors"
            >
              View Docs
            </a>
          </div>
        </div>

        {/* Terminal Preview */}
        <div className="mt-20 max-w-4xl mx-auto">
          <div className="bg-gray-900 rounded-lg border border-gray-800 overflow-hidden shadow-2xl">
            <div className="flex items-center space-x-2 px-4 py-3 bg-gray-800 border-b border-gray-700">
              <div className="w-3 h-3 rounded-full bg-red-500"></div>
              <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
              <div className="w-3 h-3 rounded-full bg-green-500"></div>
              <span className="text-sm text-gray-500 ml-4">deploy.sh</span>
            </div>
            <div className="p-6 space-y-2 text-sm">
              <div className="flex items-start">
                <span className="text-emerald-400">$</span>
                <span className="ml-2 text-gray-300">mcp-sentry deploy github.com/user/mcp-server</span>
              </div>
              <div className="text-gray-500">→ Validating repository...</div>
              <div className="text-gray-500">→ Building Docker image...</div>
              <div className="text-gray-500">→ Deploying to isolated sandbox...</div>
              <div className="flex items-start text-emerald-400">
                <span>✓</span>
                <span className="ml-2">Deployed: https://mcp-abc123.railway.app</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section className="max-w-7xl mx-auto px-6 py-20 border-t border-gray-900">
        <div className="text-center mb-16">
          <h2 className="text-4xl font-bold mb-4">How It Works</h2>
          <p className="text-gray-400 text-lg">Three layers of defense for complete isolation</p>
        </div>

        <div className="grid md:grid-cols-3 gap-8">
          {/* Feature 1 */}
          <div className="bg-gray-900 border border-gray-800 rounded-lg p-8 hover:border-emerald-500/30 transition-colors">
            <div className="w-12 h-12 bg-emerald-500/10 rounded-lg flex items-center justify-center mb-6">
              <Shield className="w-6 h-6 text-emerald-400" />
            </div>
            <h3 className="text-xl font-bold mb-3">Input Hardening</h3>
            <p className="text-gray-400 leading-relaxed">
              Every server submission goes through static analysis and dependency scanning.
              We validate manifests and sanitize tool descriptions before they ever touch production.
            </p>
          </div>

          {/* Feature 2 */}
          <div className="bg-gray-900 border border-gray-800 rounded-lg p-8 hover:border-emerald-500/30 transition-colors">
            <div className="w-12 h-12 bg-emerald-500/10 rounded-lg flex items-center justify-center mb-6">
              <Lock className="w-6 h-6 text-emerald-400" />
            </div>
            <h3 className="text-xl font-bold mb-3">Runtime Isolation</h3>
            <p className="text-gray-400 leading-relaxed">
              Each execution runs in an ephemeral micro-VM with network allowlisting.
              Secrets are injected at runtime, never stored in code. The sandbox is destroyed after use.
            </p>
          </div>

          {/* Feature 3 */}
          <div className="bg-gray-900 border border-gray-800 rounded-lg p-8 hover:border-emerald-500/30 transition-colors">
            <div className="w-12 h-12 bg-emerald-500/10 rounded-lg flex items-center justify-center mb-6">
              <Zap className="w-6 h-6 text-emerald-400" />
            </div>
            <h3 className="text-xl font-bold mb-3">Traffic Mediation</h3>
            <p className="text-gray-400 leading-relaxed">
              AI agents never talk to tools directly. Our gateway validates every request
              against the registry and enforces dynamic policies for sensitive operations.
            </p>
          </div>
        </div>
      </section>

      {/* Cloud Deployment Section */}
      <section className="max-w-7xl mx-auto px-6 py-20">
        <div className="bg-gradient-to-br from-emerald-500/10 to-emerald-500/5 border border-emerald-500/20 rounded-2xl p-12">
          <div className="flex items-start space-x-6">
            <div className="w-16 h-16 bg-emerald-500/20 rounded-xl flex items-center justify-center flex-shrink-0">
              <Cloud className="w-8 h-8 text-emerald-400" />
            </div>
            <div className="flex-1">
              <h2 className="text-3xl font-bold mb-4">Automatic Cloud Deployment</h2>
              <p className="text-gray-300 text-lg leading-relaxed mb-6">
                Point us to your GitHub repository and we handle the rest. We clone, validate,
                containerize, and deploy your MCP server to Railway with a public HTTPS endpoint.
                No Docker knowledge required, no infrastructure headaches.
              </p>
              <div className="flex items-center space-x-3 text-sm text-gray-400">
                <Code className="w-4 h-4" />
                <span>Supports Node.js & Python</span>
                <span className="text-gray-700">•</span>
                <span>Auto-generated Dockerfiles</span>
                <span className="text-gray-700">•</span>
                <span>HTTPS by default</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="max-w-7xl mx-auto px-6 py-20">
        <div className="text-center bg-gray-900 border border-gray-800 rounded-2xl p-16">
          <h2 className="text-4xl font-bold mb-4">Ready to Deploy?</h2>
          <p className="text-gray-400 text-lg mb-8 max-w-2xl mx-auto">
            Join developers building the next generation of AI-powered tools with complete security and isolation.
          </p>
          <a
            href="/login"
            className="px-10 py-4 bg-emerald-500 hover:bg-emerald-600 text-black font-semibold rounded-lg transition-all transform hover:scale-105 inline-flex items-center space-x-2"
          >
            <span>Get Started Free</span>
            <ArrowRight className="w-5 h-5" />
          </a>
        </div>
      </section>

      <Footer />
    </div>
  );
}