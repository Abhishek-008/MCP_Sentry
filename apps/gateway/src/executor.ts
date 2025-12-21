import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import fs from 'fs';

interface MCPResponse {
    result?: {
        content: Array<{ type: string; text: string }>;
        isError?: boolean;
    };
    error?: {
        message: string;
    };
    id: number;
}

export class MCPExecutor {
    private process: ChildProcess | null = null;
    private cwd: string;
    private startCommand: string;
    private isInitialized = false;
    private env: NodeJS.ProcessEnv;

    constructor(cwd: string, startCommand: string, env: NodeJS.ProcessEnv = {}) {
        this.cwd = cwd;
        this.startCommand = startCommand;
        this.env = env;
    }

    async executeTool(toolName: string, args: any): Promise<any> {
        try {
            await this.startServer();
            await this.performHandshake();
            const result = await this.callTool(toolName, args);
            return result;
        } finally {
            this.kill();
        }
    }

    private normalizeCommand(fullCommand: string): string {
        let cmd = fullCommand;

        // 1. "UV RUN" INTERCEPTOR
        if (cmd.startsWith('uv run ')) {
            const scriptArgs = cmd.substring(7);
            const venvPython = process.platform === 'win32'
                ? path.join(this.cwd, '.venv', 'Scripts', 'python.exe')
                : path.join(this.cwd, '.venv', 'bin', 'python');

            if (fs.existsSync(venvPython)) {
                console.log('[Executor] ⚡ Optimizing: Replaced "uv run" with venv python');
                // Quote the executable path to handle spaces in folder names
                cmd = `"${venvPython}" ${scriptArgs}`;
            }
        }

        // 2. WINDOWS PATH FIXES
        if (process.platform === 'win32') {
            cmd = cmd.replace(/\//g, '\\');
            if (cmd.includes('.venv\\bin\\python')) {
                cmd = cmd.replace('.venv\\bin\\python', '.venv\\Scripts\\python.exe');
            }
        }

        return cmd;
    }

    private startServer() {
        const safeCommand = this.normalizeCommand(this.startCommand);
        console.log(`[Executor] Booting: ${safeCommand}`);

        const shellCmd = safeCommand;

        // 1. Calculate PATH (prepend venv)
        let newPath = process.env.PATH;
        if (this.cwd) {
            const venvBin = process.platform === 'win32'
                ? path.resolve(this.cwd, '.venv', 'Scripts')
                : path.resolve(this.cwd, '.venv', 'bin');
            const delimiter = process.platform === 'win32' ? ';' : ':';
            newPath = `${venvBin}${delimiter}${process.env.PATH}`;
        }

        // 2. Spawn Process
        this.process = spawn(shellCmd, [], {
            cwd: this.cwd,
            env: {
                ...process.env,
                ...this.env,
                PATH: newPath,
                PYTHONUNBUFFERED: '1',
                // CRITICAL FIX: Ensure imports work from the root directory
                PYTHONPATH: this.cwd
            },
            shell: true
        });

        // 3. Log Output
        this.process?.stderr?.on('data', (data) => console.error(`[Tool Log] ${data}`));

        // Safety Timeout (60s)
        setTimeout(() => {
            if (this.process) {
                console.log('[Executor] ⚠️ Safety Timeout reached. Killing process.');
                this.kill();
            }
        }, 60000);
    }

    private performHandshake(): Promise<void> {
        return new Promise((resolve, reject) => {
            if (!this.process || !this.process.stdin || !this.process.stdout) {
                return reject(new Error('Process not started'));
            }

            // --- CRITICAL FIX: Detect Early Exit ---
            // If the process crashes immediately (e.g. Import Error), reject the promise.
            this.process.on('close', (code) => {
                if (!this.isInitialized) {
                    reject(new Error(`Server exited early with code ${code}. Check logs above.`));
                }
            });
            // ---------------------------------------

            const initRequest = JSON.stringify({
                jsonrpc: "2.0", id: 0, method: "initialize",
                params: {
                    protocolVersion: "2024-11-05",
                    capabilities: {},
                    clientInfo: { name: "gateway", version: "1.0" }
                }
            }) + "\n";

            const onData = (data: Buffer) => {
                const lines = data.toString().split('\n');
                for (const line of lines) {
                    if (!line.trim()) continue;
                    try {
                        const json = JSON.parse(line);

                        if (json.id === 0 && json.result) {
                            const notify = JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) + "\n";
                            this.process?.stdin?.write(notify);

                            this.process?.stdout?.off('data', onData);
                            this.isInitialized = true;
                            resolve();
                        }
                    } catch (e) { }
                }
            };

            this.process.stdout.on('data', onData);
            this.process.stdin.write(initRequest);

            setTimeout(() => {
                if (!this.isInitialized) {
                    this.kill();
                    reject(new Error('Handshake timeout'));
                }
            }, 15000);
        });
    }

    private callTool(name: string, args: any): Promise<any> {
        return new Promise((resolve, reject) => {
            if (!this.process?.stdin || !this.process?.stdout) return reject(new Error('Process died'));

            const request = JSON.stringify({
                jsonrpc: "2.0",
                id: 100,
                method: "tools/call",
                params: {
                    name: name,
                    arguments: args
                }
            }) + "\n";

            const onData = (data: Buffer) => {
                const lines = data.toString().split('\n');
                for (const line of lines) {
                    if (!line.trim()) continue;
                    try {
                        const json = JSON.parse(line) as MCPResponse;
                        if (json.id === 100) {
                            this.process?.stdout?.off('data', onData);
                            if (json.error) reject(new Error(json.error.message));
                            else resolve(json.result);
                        }
                    } catch (e) { }
                }
            };

            this.process.stdout.on('data', onData);
            this.process.stdin.write(request);
        });
    }

    private kill() {
        if (this.process) {
            this.process.kill();
            this.process = null;
        }
    }
}