import React from 'react';
import { Terminal, Github, Twitter } from 'lucide-react';

export default function Footer() {
    return (
        <footer className="border-t border-gray-900 mt-auto">
            <div className="max-w-7xl mx-auto px-6 py-12">
                {/* Main Footer Content */}
                <div className="grid md:grid-cols-4 gap-8 mb-8">
                    {/* Brand Section */}
                    <div className="md:col-span-2">
                        <div className="flex items-center space-x-2 mb-4">
                            <Terminal className="w-5 h-5 text-emerald-400" />
                            <span className="font-bold text-lg">MCP_Sentry</span>
                        </div>
                        <p className="text-gray-500 text-sm leading-relaxed max-w-md">
                            Zero Trust MCP Hosting Platform. Deploy Model Context Protocol servers
                            with enterprise-grade security and complete isolation.
                        </p>
                        <div className="flex items-center space-x-4 mt-4">
                            <a
                                href="https://github.com"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-gray-500 hover:text-emerald-400 transition-colors"
                            >
                                <Github className="w-5 h-5" />
                            </a>
                            <a
                                href="https://twitter.com"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-gray-500 hover:text-emerald-400 transition-colors"
                            >
                                <Twitter className="w-5 h-5" />
                            </a>
                        </div>
                    </div>

                    {/* Product Links */}
                    <div>
                        <h3 className="font-semibold text-gray-300 mb-3">Product</h3>
                        <ul className="space-y-2 text-sm">
                            <li>
                                <a href="/deploy" className="text-gray-500 hover:text-emerald-400 transition-colors">
                                    Deploy Server
                                </a>
                            </li>
                            <li>
                                <a href="/docs" className="text-gray-500 hover:text-emerald-400 transition-colors">
                                    Documentation
                                </a>
                            </li>
                            <li>
                                <a href="/pricing" className="text-gray-500 hover:text-emerald-400 transition-colors">
                                    Pricing
                                </a>
                            </li>
                            <li>
                                <a href="/examples" className="text-gray-500 hover:text-emerald-400 transition-colors">
                                    Examples
                                </a>
                            </li>
                        </ul>
                    </div>

                    {/* Company Links */}
                    <div>
                        <h3 className="font-semibold text-gray-300 mb-3">Company</h3>
                        <ul className="space-y-2 text-sm">
                            <li>
                                <a href="/about" className="text-gray-500 hover:text-emerald-400 transition-colors">
                                    About
                                </a>
                            </li>
                            <li>
                                <a href="/blog" className="text-gray-500 hover:text-emerald-400 transition-colors">
                                    Blog
                                </a>
                            </li>
                            <li>
                                <a href="/contact" className="text-gray-500 hover:text-emerald-400 transition-colors">
                                    Contact
                                </a>
                            </li>
                            <li>
                                <a href="/status" className="text-gray-500 hover:text-emerald-400 transition-colors">
                                    Status
                                </a>
                            </li>
                        </ul>
                    </div>
                </div>

                {/* Bottom Bar */}
                <div className="pt-8 border-t border-gray-900 flex flex-col md:flex-row items-center justify-between gap-4">
                    <div className="text-gray-500 text-sm">
                        © 2025 MCP_Sentry. Built for the Model Context Protocol.
                    </div>
                    <div className="flex items-center space-x-6 text-sm">
                        <a href="/privacy" className="text-gray-500 hover:text-emerald-400 transition-colors">
                            Privacy Policy
                        </a>
                        <a href="/terms" className="text-gray-500 hover:text-emerald-400 transition-colors">
                            Terms of Service
                        </a>
                        <a href="/security" className="text-gray-500 hover:text-emerald-400 transition-colors">
                            Security
                        </a>
                    </div>
                </div>
            </div>
        </footer>
    );
}