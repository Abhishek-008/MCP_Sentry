'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { User } from '@supabase/supabase-js';
import { createClient } from '../../../utils/supabase/client';
import { 
    Github, Play, Plus, X, Key, AlertCircle, 
    CheckCircle, Loader, Settings
} from 'lucide-react';
import Header from '../components/Header';
import Footer from '../components/Footer';

export default function DeployForm() {
    const router = useRouter();
    const supabase = createClient();

    // Auth State
    const [user, setUser] = useState<User | null>(null);
    const [loadingAuth, setLoadingAuth] = useState(true);

    // Form State
    const [repoUrl, setRepoUrl] = useState('');
    const [startCommand, setStartCommand] = useState('');
    const [defaultArgs, setDefaultArgs] = useState(''); 
    
    // Env Vars State
    const [envVars, setEnvVars] = useState<Array<{ key: string; value: string }>>([]);
    const [showEnvModal, setShowEnvModal] = useState(false);
    const [newEnvKey, setNewEnvKey] = useState('');
    const [newEnvValue, setNewEnvValue] = useState('');

    // Deployment State
    const [isDeploying, setIsDeploying] = useState(false);
    const [deploymentStatus, setDeploymentStatus] = useState<'idle' | 'success' | 'error'>('idle');
    const [errorMessage, setErrorMessage] = useState('');

    // 1. Check Authentication on Mount
    useEffect(() => {
        const checkUser = async () => {
            const { data: { user }, error } = await supabase.auth.getUser();
            if (error || !user) {
                router.push('/login');
            } else {
                setUser(user);
            }
            setLoadingAuth(false);
        };
        checkUser();
    }, [router, supabase]);

    // Helper: Validate JSON (Allows empty string as valid)
    const isValidJson = (str: string) => {
        if (!str.trim()) return true; 
        try {
            JSON.parse(str);
            return true;
        } catch (e) {
            return false;
        }
    };

    const addEnvVar = () => {
        if (newEnvKey.trim() && newEnvValue.trim()) {
            setEnvVars([...envVars, { key: newEnvKey.trim(), value: newEnvValue.trim() }]);
            setNewEnvKey('');
            setNewEnvValue('');
            setShowEnvModal(false);
        }
    };

    const removeEnvVar = (index: number) => {
        setEnvVars(envVars.filter((_, i) => i !== index));
    };

    const handleDeploy = async () => {
        if (!repoUrl || !startCommand || !user) return;

        if (!isValidJson(defaultArgs)) {
            setErrorMessage("Default Arguments must be valid JSON.");
            setDeploymentStatus('error');
            return;
        }

        setIsDeploying(true);
        setDeploymentStatus('idle');
        setErrorMessage('');

        try {
            const envObject = envVars.reduce((acc, { key, value }) => {
                acc[key] = value;
                return acc;
            }, {} as Record<string, string>);

            let parsedArgs = {};
            if (defaultArgs.trim()) {
                parsedArgs = JSON.parse(defaultArgs);
            }

            const response = await fetch('/api/ingest', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    repoUrl,
                    userId: user.id,
                    startCommand,
                    configuration: {
                        env: envObject,
                        defaultArguments: parsedArgs
                    }
                })
            });

            const data = await response.json();

            if (data.success) {
                setDeploymentStatus('success');
                
                // Redirect to Dashboard after 2 seconds
                setTimeout(() => {
                    router.push('/dashboard');
                }, 2000);
            } else {
                setErrorMessage(data.message || 'Deployment failed to start.');
                setDeploymentStatus('error');
            }
        } catch (error: any) {
            console.error('Deployment error:', error);
            setErrorMessage(error.message || 'An unexpected error occurred.');
            setDeploymentStatus('error');
        } finally {
            setIsDeploying(false);
        }
    };

    if (loadingAuth) {
        return (
            <div className="min-h-screen bg-black flex items-center justify-center">
                <Loader className="w-8 h-8 text-emerald-500 animate-spin" />
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-black text-gray-100 font-mono flex flex-col">
            <Header />

            <div className="flex-1 max-w-4xl mx-auto px-6 py-12 w-full">
                <div className="mb-8">
                    <h1 className="text-4xl font-bold mb-3">Deploy MCP Server</h1>
                    <p className="text-gray-400 text-lg">
                        Connect your GitHub repository and we'll handle the deployment
                    </p>
                </div>

                <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 space-y-6">
                    
                    {/* Repository URL */}
                    <div>
                        <label htmlFor="repoUrl" className="block text-sm font-medium text-gray-300 mb-2">
                            GitHub Repository URL <span className="text-red-500">*</span>
                        </label>
                        <div className="relative">
                            <Github className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-500" />
                            <input
                                id="repoUrl"
                                type="url"
                                required
                                value={repoUrl}
                                onChange={(e) => setRepoUrl(e.target.value)}
                                placeholder="https://github.com/username/mcp-server"
                                className="w-full pl-10 pr-4 py-3 bg-black border border-gray-700 rounded-lg focus:outline-none focus:border-emerald-500 transition-colors text-gray-100 placeholder-gray-600"
                            />
                        </div>
                    </div>

                    {/* Start Command */}
                    <div>
                        <label htmlFor="startCommand" className="block text-sm font-medium text-gray-300 mb-2">
                            Start Command <span className="text-red-500">*</span>
                        </label>
                        <div className="relative">
                            <Play className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-500" />
                            <input
                                id="startCommand"
                                type="text"
                                required
                                value={startCommand}
                                onChange={(e) => setStartCommand(e.target.value)}
                                placeholder="node dist/index.js"
                                className="w-full pl-10 pr-4 py-3 bg-black border border-gray-700 rounded-lg focus:outline-none focus:border-emerald-500 transition-colors text-gray-100 placeholder-gray-600"
                            />
                        </div>
                    </div>

                    {/* Default Arguments */}
                    <div>
                        <label htmlFor="defaultArgs" className="block text-sm font-medium text-gray-300 mb-2">
                            Default Arguments (Optional JSON)
                        </label>
                        <div className="relative">
                            <Settings className="absolute left-3 top-4 w-5 h-5 text-gray-500" />
                            <textarea
                                id="defaultArgs"
                                value={defaultArgs}
                                onChange={(e) => setDefaultArgs(e.target.value)}
                                placeholder='{"timeout": 30}'
                                rows={4}
                                className={`w-full pl-10 pr-4 py-3 bg-black border rounded-lg focus:outline-none focus:border-emerald-500 transition-colors text-gray-100 placeholder-gray-600 font-mono text-sm ${
                                    !isValidJson(defaultArgs) 
                                    ? 'border-red-500 focus:border-red-500' 
                                    : 'border-gray-700'
                                }`}
                            />
                        </div>
                        <p className={`text-xs mt-1 ${!isValidJson(defaultArgs) ? 'text-red-400' : 'text-gray-500'}`}>
                            {!isValidJson(defaultArgs) 
                                ? 'Invalid JSON format' 
                                : 'Arguments passed to the MCP server on startup (leave empty if none).'}
                        </p>
                    </div>

                    {/* Environment Variables */}
                    <div>
                        <div className="flex items-center justify-between mb-3">
                            <label className="block text-sm font-medium text-gray-300">
                                Environment Variables
                            </label>
                            <button
                                onClick={() => setShowEnvModal(true)}
                                className="flex items-center space-x-2 px-3 py-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 rounded-lg transition-colors text-emerald-400 text-sm"
                            >
                                <Plus className="w-4 h-4" />
                                <span>Add Variable</span>
                            </button>
                        </div>

                        {envVars.length > 0 ? (
                            <div className="space-y-2">
                                {envVars.map((env, index) => (
                                    <div
                                        key={index}
                                        className="flex items-center justify-between bg-black border border-gray-700 rounded-lg p-3"
                                    >
                                        <div className="flex items-center space-x-3 flex-1">
                                            <Key className="w-4 h-4 text-gray-500" />
                                            <div className="flex-1 grid grid-cols-2 gap-4">
                                                <span className="text-sm text-gray-300 font-semibold">{env.key}</span>
                                                <span className="text-sm text-gray-500 font-mono">
                                                    {'•'.repeat(Math.min(env.value.length, 20))}
                                                </span>
                                            </div>
                                        </div>
                                        <button
                                            onClick={() => removeEnvVar(index)}
                                            className="p-1 hover:bg-gray-800 rounded transition-colors"
                                        >
                                            <X className="w-4 h-4 text-gray-500 hover:text-red-400" />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="bg-black border border-gray-800 border-dashed rounded-lg p-6 text-center">
                                <Key className="w-8 h-8 text-gray-700 mx-auto mb-2" />
                                <p className="text-sm text-gray-500">No environment variables added</p>
                            </div>
                        )}
                    </div>

                    {/* Deploy Button */}
                    <div className="pt-4">
                        <button
                            onClick={handleDeploy}
                            disabled={!repoUrl.trim() || !startCommand.trim() || isDeploying || !isValidJson(defaultArgs)}
                            className="w-full py-4 px-6 bg-emerald-500 hover:bg-emerald-600 disabled:bg-gray-800 disabled:text-gray-500 disabled:cursor-not-allowed text-black font-semibold rounded-lg transition-all transform hover:scale-[1.02] disabled:transform-none flex items-center justify-center space-x-2"
                        >
                            {isDeploying ? (
                                <>
                                    <Loader className="w-5 h-5 animate-spin" />
                                    <span>Deploying...</span>
                                </>
                            ) : (
                                <>
                                    <Play className="w-5 h-5" />
                                    <span>Deploy Server</span>
                                </>
                            )}
                        </button>
                    </div>

                    {/* Status Messages */}
                    {deploymentStatus === 'success' && (
                        <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-4 flex items-start space-x-3 animate-in fade-in slide-in-from-top-2">
                            <CheckCircle className="w-5 h-5 text-emerald-400 flex-shrink-0 mt-0.5" />
                            <div className="flex-1">
                                <p className="text-emerald-400 font-semibold mb-1">Success! Deployment Queued</p>
                                <p className="text-sm text-gray-300">
                                    Your MCP server has been successfully added to the build queue.
                                    <br />
                                    <span className="text-emerald-400 animate-pulse">Redirecting to Dashboard...</span>
                                </p>
                            </div>
                        </div>
                    )}

                    {deploymentStatus === 'error' && (
                        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 flex items-start space-x-3 animate-in fade-in slide-in-from-top-2">
                            <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
                            <div>
                                <p className="text-red-400 font-semibold mb-1">Deployment Failed</p>
                                <p className="text-sm text-gray-300">
                                    {errorMessage || 'There was an error deploying your server.'}
                                </p>
                            </div>
                        </div>
                    )}
                </div>

                {/* Help Section */}
                <div className="mt-8 bg-gray-900 border border-gray-800 rounded-xl p-6">
                    <h3 className="text-lg font-bold mb-3">Need Help?</h3>
                    <div className="space-y-2 text-sm text-gray-400">
                        <p>• Your repository must contain a valid MCP server implementation</p>
                        <p>• Supported languages: Node.js (npm/pnpm) and Python (pip/uv)</p>
                        <p>• Default Arguments are optional.</p>
                    </div>
                </div>
            </div>

            {/* Env Modal */}
            {showEnvModal && (
                <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-6">
                    <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 w-full max-w-md">
                        <div className="flex items-center justify-between mb-6">
                            <h3 className="text-xl font-bold">Add Environment Variable</h3>
                            <button
                                onClick={() => setShowEnvModal(false)}
                                className="p-1 hover:bg-gray-800 rounded transition-colors"
                            >
                                <X className="w-5 h-5 text-gray-500" />
                            </button>
                        </div>

                        <div className="space-y-4">
                            <div>
                                <label htmlFor="envKey" className="block text-sm font-medium text-gray-300 mb-2">
                                    Variable Name
                                </label>
                                <input
                                    id="envKey"
                                    type="text"
                                    value={newEnvKey}
                                    onChange={(e) => setNewEnvKey(e.target.value)}
                                    placeholder="API_KEY"
                                    className="w-full px-4 py-3 bg-black border border-gray-700 rounded-lg focus:outline-none focus:border-emerald-500 transition-colors text-gray-100 placeholder-gray-600 font-mono"
                                />
                            </div>

                            <div>
                                <label htmlFor="envValue" className="block text-sm font-medium text-gray-300 mb-2">
                                    Variable Value
                                </label>
                                <input
                                    id="envValue"
                                    type="password"
                                    value={newEnvValue}
                                    onChange={(e) => setNewEnvValue(e.target.value)}
                                    placeholder="sk-..."
                                    className="w-full px-4 py-3 bg-black border border-gray-700 rounded-lg focus:outline-none focus:border-emerald-500 transition-colors text-gray-100 placeholder-gray-600 font-mono"
                                />
                            </div>

                            <div className="flex space-x-3 pt-2">
                                <button
                                    onClick={() => setShowEnvModal(false)}
                                    className="flex-1 py-3 px-4 bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={addEnvVar}
                                    disabled={!newEnvKey.trim() || !newEnvValue.trim()}
                                    className="flex-1 py-3 px-4 bg-emerald-500 hover:bg-emerald-600 disabled:bg-gray-800 disabled:text-gray-500 disabled:cursor-not-allowed text-black font-semibold rounded-lg transition-colors"
                                >
                                    Add Variable
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            <Footer />
        </div>
    );
}