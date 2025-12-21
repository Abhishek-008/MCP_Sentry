'use client';

import React from 'react';
import { X, Wrench, Box, Code } from 'lucide-react';

interface ToolsModalProps {
    isOpen: boolean;
    onClose: () => void;
    manifest: any | null;
}

export default function ToolsModal({ isOpen, onClose, manifest }: ToolsModalProps) {
    if (!isOpen) return null;

    const tools = manifest?.tools || [];
    const source = manifest?.source || 'Unknown Source';

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop */}
            <div 
                className="absolute inset-0 bg-black/80 backdrop-blur-sm transition-opacity"
                onClick={onClose}
            ></div>

            {/* Modal Content */}
            <div className="relative bg-gray-900 border border-gray-800 rounded-2xl w-full max-w-3xl max-h-[85vh] shadow-2xl flex flex-col font-mono animate-in fade-in zoom-in-95 duration-200">
                
                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b border-gray-800 bg-gray-900 rounded-t-2xl z-10">
                    <div>
                        <h2 className="text-xl font-bold text-white flex items-center gap-2">
                            <Wrench className="w-5 h-5 text-emerald-500" />
                            Available Tools
                        </h2>
                        <p className="text-sm text-gray-400 mt-1 truncate max-w-md">
                            Source: {source}
                        </p>
                    </div>
                    <button 
                        onClick={onClose}
                        className="p-2 hover:bg-gray-800 rounded-lg transition-colors text-gray-400 hover:text-white"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Scrollable Content */}
                <div className="overflow-y-auto p-6 space-y-6">
                    {tools.length === 0 ? (
                        <div className="text-center py-12 text-gray-500">
                            <Box className="w-12 h-12 mx-auto mb-3 opacity-20" />
                            <p>No tools definition found in manifest.</p>
                        </div>
                    ) : (
                        tools.map((tool: any, index: number) => (
                            <div key={index} className="bg-black/40 border border-gray-800 rounded-xl overflow-hidden">
                                {/* Tool Name Bar */}
                                <div className="bg-gray-800/50 px-4 py-3 border-b border-gray-800 flex justify-between items-center">
                                    <span className="font-semibold text-emerald-400">{tool.name}</span>
                                    <span className="text-xs text-gray-500 px-2 py-1 bg-black rounded border border-gray-800">
                                        Function
                                    </span>
                                </div>

                                <div className="p-4">
                                    {/* Description */}
                                    <p className="text-gray-300 text-sm mb-4 leading-relaxed">
                                        {tool.description}
                                    </p>

                                    {/* Arguments / Input Schema */}
                                    {tool.inputSchema?.properties && (
                                        <div className="mt-4">
                                            <h4 className="text-xs font-semibold text-gray-500 uppercase mb-2 flex items-center gap-1">
                                                <Code className="w-3 h-3" /> Arguments
                                            </h4>
                                            <div className="grid gap-2">
                                                {Object.entries(tool.inputSchema.properties).map(([key, prop]: [string, any]) => {
                                                    const isRequired = tool.inputSchema.required?.includes(key);
                                                    return (
                                                        <div key={key} className="flex flex-col sm:flex-row sm:items-start gap-2 sm:gap-4 p-2 rounded hover:bg-white/5 transition-colors text-sm">
                                                            <div className="min-w-[120px] font-mono">
                                                                <span className="text-indigo-400">{key}</span>
                                                                {isRequired && <span className="text-red-400 ml-1">*</span>}
                                                            </div>
                                                            <div className="flex-1">
                                                                <div className="text-gray-400 text-xs mb-0.5">
                                                                    {prop.type}
                                                                </div>
                                                                <div className="text-gray-300">
                                                                    {prop.description}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))
                    )}
                </div>

                {/* Footer */}
                <div className="p-4 border-t border-gray-800 bg-gray-900 rounded-b-2xl text-right">
                    <button 
                        onClick={onClose}
                        className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-white rounded-lg text-sm font-medium transition-colors"
                    >
                        Close
                    </button>
                </div>
            </div>
        </div>
    );
}