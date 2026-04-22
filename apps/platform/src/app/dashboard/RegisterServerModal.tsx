'use client';

import React, { useState } from 'react';
import { X, Server, Loader2, CheckCircle2, AlertCircle, Plus, Trash2 } from 'lucide-react';
import { createClient } from '../../../utils/supabase/client';

interface RegisterServerModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
}

export default function RegisterServerModal({ isOpen, onClose, onSuccess }: RegisterServerModalProps) {
    const supabase = createClient();
    const [step, setStep] = useState<'form' | 'testing' | 'success' | 'error'>('form');
    const [errorMessage, setErrorMessage] = useState('');

    // Form state
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [serverLocation, setServerLocation] = useState<'remote' | 'local'>('remote');
    const [transportType, setTransportType] = useState<'sse' | 'http' | 'stdio'>('sse');
    const [url, setUrl] = useState('');
    const [command, setCommand] = useState('');
    const [args, setArgs] = useState<string[]>([]);
    const [envVars, setEnvVars] = useState<Array<{ key: string; value: string }>>([]);
    const [isPublic, setIsPublic] = useState(false);

    // Discovered capabilities
    const [discoveredTools, setDiscoveredTools] = useState<any[]>([]);
    const [discoveredPrompts, setDiscoveredPrompts] = useState<any[]>([]);
    const [discoveredResources, setDiscoveredResources] = useState<any[]>([]);

    if (!isOpen) return null;

    const resetForm = () => {
        setName('');
        setDescription('');
        setServerLocation('remote');
        setTransportType('sse');
        setUrl('');
        setCommand('');
        setArgs([]);
        setEnvVars([]);
        setIsPublic(false);
        setStep('form');
        setErrorMessage('');
        setDiscoveredTools([]);
        setDiscoveredPrompts([]);
        setDiscoveredResources([]);
    };

    const handleClose = () => {
        resetForm();
        onClose();
    };

    const addArg = () => {
        setArgs([...args, '']);
    };

    const updateArg = (index: number, value: string) => {
        const newArgs = [...args];
        newArgs[index] = value;
        setArgs(newArgs);
    };

    const removeArg = (index: number) => {
        setArgs(args.filter((_, i) => i !== index));
    };

    const addEnvVar = () => {
        setEnvVars([...envVars, { key: '', value: '' }]);
    };

    const updateEnvVar = (index: number, field: 'key' | 'value', value: string) => {
        const newEnvVars = [...envVars];
        newEnvVars[index][field] = value;
        setEnvVars(newEnvVars);
    };

    const removeEnvVar = (index: number) => {
        setEnvVars(envVars.filter((_, i) => i !== index));
    };

    const testConnection = async () => {
        setStep('testing');
        setErrorMessage('');

        try {
            const payload: any = {
                type: serverLocation === 'local' ? 'stdio' : 'remote',
            };

            if (serverLocation === 'remote') {
                if (!url) throw new Error('URL is required for remote servers');
                payload.url = url;
                payload.transportType = transportType;
            } else {
                if (!command) throw new Error('Command is required for local servers');
                payload.command = command;
                payload.args = args.filter(arg => arg.trim() !== '');
                
                // Convert env vars to object
                const envObj: Record<string, string> = {};
                envVars.forEach(({ key, value }) => {
                    if (key.trim()) {
                        envObj[key.trim()] = value;
                    }
                });
                payload.env = envObj;
            }

            const response = await fetch('/api/mcp/connect', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });

            const result = await response.json();

            if (!result.connected) {
                throw new Error(result.error || 'Connection failed');
            }

            // Store discovered capabilities
            setDiscoveredTools(result.tools || []);
            setDiscoveredPrompts(result.prompts || []);
            setDiscoveredResources(result.resources || []);

            // Proceed to register
            await registerServer(result);

        } catch (error: any) {
            setStep('error');
            setErrorMessage(error.message || 'Failed to connect to server');
        }
    };

    const registerServer = async (capabilities: any) => {
        try {
            // Get current user
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) throw new Error('Not authenticated');

            const payload: any = {
                name: name.trim(),
                description: description.trim() || null,
                serverLocation,
                transportType: serverLocation === 'remote' ? transportType : 'stdio',
                userId: user.id,
                isPublic,
                tools: capabilities.tools || [],
                prompts: capabilities.prompts || [],
                resources: capabilities.resources || [],
            };

            if (serverLocation === 'remote') {
                payload.url = url;
            } else {
                payload.localConfig = {
                    command,
                    args: args.filter(arg => arg.trim() !== ''),
                    env: envVars.reduce((acc, { key, value }) => {
                        if (key.trim()) acc[key.trim()] = value;
                        return acc;
                    }, {} as Record<string, string>),
                };
            }

            const response = await fetch('/api/mcp-servers', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });

            const result = await response.json();

            if (!result.success) {
                throw new Error(result.error || 'Registration failed');
            }

            setStep('success');
            setTimeout(() => {
                handleClose();
                onSuccess();
            }, 1500);

        } catch (error: any) {
            setStep('error');
            setErrorMessage(error.message || 'Failed to register server');
        }
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();

        // Validation
        if (!name.trim()) {
            setErrorMessage('Server name is required');
            return;
        }

        if (serverLocation === 'remote' && !url.trim()) {
            setErrorMessage('URL is required for remote servers');
            return;
        }

        if (serverLocation === 'local' && !command.trim()) {
            setErrorMessage('Command is required for local servers');
            return;
        }

        testConnection();
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop */}
            <div 
                className="absolute inset-0 bg-black/80 backdrop-blur-sm transition-opacity"
                onClick={step === 'form' ? handleClose : undefined}
            ></div>

            {/* Modal Content */}
            <div className="relative bg-gray-900 border border-gray-800 rounded-2xl w-full max-w-2xl max-h-[90vh] shadow-2xl flex flex-col font-mono animate-in fade-in zoom-in-95 duration-200">
                
                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b border-gray-800 bg-gray-900 rounded-t-2xl z-10">
                    <div>
                        <h2 className="text-xl font-bold text-white flex items-center gap-2">
                            <Server className="w-5 h-5 text-emerald-500" />
                            Register MCP Server
                        </h2>
                        <p className="text-sm text-gray-400 mt-1">
                            Connect to external MCP servers
                        </p>
                    </div>
                    <button 
                        onClick={handleClose}
                        disabled={step === 'testing'}
                        className="p-2 hover:bg-gray-800 rounded-lg transition-colors text-gray-400 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Content */}
                <div className="overflow-y-auto p-6">
                    {step === 'form' && (
                        <form onSubmit={handleSubmit} className="space-y-6">
                            {/* Name */}
                            <div>
                                <label className="block text-sm font-medium text-gray-300 mb-2">
                                    Server Name <span className="text-red-400">*</span>
                                </label>
                                <input
                                    type="text"
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    placeholder="e.g., GitHub MCP Server"
                                    className="w-full bg-black/50 border border-gray-700 rounded-lg px-4 py-2 text-white focus:border-emerald-500 focus:outline-none"
                                />
                            </div>

                            {/* Description */}
                            <div>
                                <label className="block text-sm font-medium text-gray-300 mb-2">
                                    Description
                                </label>
                                <textarea
                                    value={description}
                                    onChange={(e) => setDescription(e.target.value)}
                                    placeholder="Optional description..."
                                    rows={3}
                                    className="w-full bg-black/50 border border-gray-700 rounded-lg px-4 py-2 text-white focus:border-emerald-500 focus:outline-none resize-none"
                                />
                            </div>

                            {/* Server Location */}
                            <div>
                                <label className="block text-sm font-medium text-gray-300 mb-2">
                                    Server Location <span className="text-red-400">*</span>
                                </label>
                                <div className="flex gap-4">
                                    <button
                                        type="button"
                                        onClick={() => setServerLocation('remote')}
                                        className={`flex-1 py-3 px-4 rounded-lg border-2 transition-colors ${
                                            serverLocation === 'remote'
                                                ? 'border-emerald-500 bg-emerald-500/10 text-emerald-400'
                                                : 'border-gray-700 bg-black/50 text-gray-400 hover:border-gray-600'
                                        }`}
                                    >
                                        <div className="font-semibold">Remote</div>
                                        <div className="text-xs mt-1">HTTP/SSE server</div>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setServerLocation('local')}
                                        className={`flex-1 py-3 px-4 rounded-lg border-2 transition-colors ${
                                            serverLocation === 'local'
                                                ? 'border-emerald-500 bg-emerald-500/10 text-emerald-400'
                                                : 'border-gray-700 bg-black/50 text-gray-400 hover:border-gray-600'
                                        }`}
                                    >
                                        <div className="font-semibold">Local</div>
                                        <div className="text-xs mt-1">STDIO process</div>
                                    </button>
                                </div>
                            </div>

                            {/* Remote Server Configuration */}
                            {serverLocation === 'remote' && (
                                <>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-300 mb-2">
                                            Transport Type <span className="text-red-400">*</span>
                                        </label>
                                        <select
                                            value={transportType}
                                            onChange={(e) => setTransportType(e.target.value as 'sse' | 'http')}
                                            className="w-full bg-black/50 border border-gray-700 rounded-lg px-4 py-2 text-white focus:border-emerald-500 focus:outline-none"
                                        >
                                            <option value="sse">SSE (Server-Sent Events)</option>
                                            <option value="http">HTTP (Streamable)</option>
                                        </select>
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium text-gray-300 mb-2">
                                            Server URL <span className="text-red-400">*</span>
                                        </label>
                                        <input
                                            type="text"
                                            value={url}
                                            onChange={(e) => setUrl(e.target.value)}
                                            placeholder="https://example.com/mcp"
                                            className="w-full bg-black/50 border border-gray-700 rounded-lg px-4 py-2 text-white focus:border-emerald-500 focus:outline-none"
                                        />
                                    </div>
                                </>
                            )}

                            {/* Local Server Configuration */}
                            {serverLocation === 'local' && (
                                <>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-300 mb-2">
                                            Command <span className="text-red-400">*</span>
                                        </label>
                                        <input
                                            type="text"
                                            value={command}
                                            onChange={(e) => setCommand(e.target.value)}
                                            placeholder="npx, node, python, etc."
                                            className="w-full bg-black/50 border border-gray-700 rounded-lg px-4 py-2 text-white focus:border-emerald-500 focus:outline-none"
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium text-gray-300 mb-2">
                                            Arguments
                                        </label>
                                        <div className="space-y-2">
                                            {args.map((arg, index) => (
                                                <div key={index} className="flex gap-2">
                                                    <input
                                                        type="text"
                                                        value={arg}
                                                        onChange={(e) => updateArg(index, e.target.value)}
                                                        placeholder={`Argument ${index + 1}`}
                                                        className="flex-1 bg-black/50 border border-gray-700 rounded-lg px-4 py-2 text-white focus:border-emerald-500 focus:outline-none"
                                                    />
                                                    <button
                                                        type="button"
                                                        onClick={() => removeArg(index)}
                                                        className="p-2 bg-red-900/20 hover:bg-red-900/40 text-red-400 rounded-lg border border-red-900/30 transition-colors"
                                                    >
                                                        <Trash2 className="w-4 h-4" />
                                                    </button>
                                                </div>
                                            ))}
                                            <button
                                                type="button"
                                                onClick={addArg}
                                                className="flex items-center gap-2 text-sm text-emerald-400 hover:text-emerald-300 transition-colors"
                                            >
                                                <Plus className="w-4 h-4" />
                                                Add Argument
                                            </button>
                                        </div>
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium text-gray-300 mb-2">
                                            Environment Variables
                                        </label>
                                        <div className="space-y-2">
                                            {envVars.map((envVar, index) => (
                                                <div key={index} className="flex gap-2">
                                                    <input
                                                        type="text"
                                                        value={envVar.key}
                                                        onChange={(e) => updateEnvVar(index, 'key', e.target.value)}
                                                        placeholder="KEY"
                                                        className="flex-1 bg-black/50 border border-gray-700 rounded-lg px-4 py-2 text-white focus:border-emerald-500 focus:outline-none font-mono text-sm"
                                                    />
                                                    <input
                                                        type="text"
                                                        value={envVar.value}
                                                        onChange={(e) => updateEnvVar(index, 'value', e.target.value)}
                                                        placeholder="value"
                                                        className="flex-1 bg-black/50 border border-gray-700 rounded-lg px-4 py-2 text-white focus:border-emerald-500 focus:outline-none font-mono text-sm"
                                                    />
                                                    <button
                                                        type="button"
                                                        onClick={() => removeEnvVar(index)}
                                                        className="p-2 bg-red-900/20 hover:bg-red-900/40 text-red-400 rounded-lg border border-red-900/30 transition-colors"
                                                    >
                                                        <Trash2 className="w-4 h-4" />
                                                    </button>
                                                </div>
                                            ))}
                                            <button
                                                type="button"
                                                onClick={addEnvVar}
                                                className="flex items-center gap-2 text-sm text-emerald-400 hover:text-emerald-300 transition-colors"
                                            >
                                                <Plus className="w-4 h-4" />
                                                Add Environment Variable
                                            </button>
                                        </div>
                                    </div>
                                </>
                            )}

                            {/* Public Toggle */}
                            <div className="flex items-center gap-3 p-4 bg-black/30 rounded-lg border border-gray-800">
                                <input
                                    type="checkbox"
                                    id="isPublic"
                                    checked={isPublic}
                                    onChange={(e) => setIsPublic(e.target.checked)}
                                    className="w-4 h-4 rounded border-gray-700 text-emerald-500 focus:ring-emerald-500"
                                />
                                <label htmlFor="isPublic" className="text-sm text-gray-300 cursor-pointer">
                                    Make this server public (visible to all users)
                                </label>
                            </div>

                            {/* Error Message */}
                            {errorMessage && (
                                <div className="p-4 bg-red-900/20 border border-red-900/30 rounded-lg flex items-start gap-3">
                                    <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
                                    <span className="text-red-400 text-sm">{errorMessage}</span>
                                </div>
                            )}
                        </form>
                    )}

                    {step === 'testing' && (
                        <div className="py-12 text-center">
                            <Loader2 className="w-12 h-12 text-emerald-500 animate-spin mx-auto mb-4" />
                            <h3 className="text-lg font-semibold text-white mb-2">Testing Connection</h3>
                            <p className="text-gray-400 text-sm">Connecting to server and discovering capabilities...</p>
                        </div>
                    )}

                    {step === 'success' && (
                        <div className="py-12 text-center">
                            <div className="w-16 h-16 bg-emerald-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                                <CheckCircle2 className="w-8 h-8 text-emerald-400" />
                            </div>
                            <h3 className="text-lg font-semibold text-white mb-2">Server Registered!</h3>
                            <p className="text-gray-400 text-sm mb-4">
                                Found {discoveredTools.length} tools, {discoveredPrompts.length} prompts, {discoveredResources.length} resources
                            </p>
                        </div>
                    )}

                    {step === 'error' && (
                        <div className="py-12 text-center">
                            <div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                                <AlertCircle className="w-8 h-8 text-red-400" />
                            </div>
                            <h3 className="text-lg font-semibold text-white mb-2">Registration Failed</h3>
                            <p className="text-gray-400 text-sm mb-6">{errorMessage}</p>
                            <button
                                onClick={() => {
                                    setStep('form');
                                    setErrorMessage('');
                                }}
                                className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-white rounded-lg text-sm font-medium transition-colors"
                            >
                                Try Again
                            </button>
                        </div>
                    )}
                </div>

                {/* Footer */}
                {step === 'form' && (
                    <div className="p-6 border-t border-gray-800 bg-gray-900 rounded-b-2xl flex justify-end gap-3">
                        <button 
                            onClick={handleClose}
                            type="button"
                            className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-white rounded-lg text-sm font-medium transition-colors"
                        >
                            Cancel
                        </button>
                        <button 
                            onClick={handleSubmit}
                            className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-black rounded-lg text-sm font-semibold transition-colors"
                        >
                            Test & Register
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
