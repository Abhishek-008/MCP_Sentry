import { spawn, ChildProcess } from 'child_process';
import path from 'path';

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

    // --- HELPER: Resolve Absolute Path for Windows ---
    private normalizeCommand(fullCommand: string): string {
        // Split "cmd" from "args" (e.g. ".venv/bin/python" and "-m notion_mcp")
        const [binary = '', ...args] = fullCommand.split(' ');

        if (process.platform === 'win32') {
            console.log('[Executor] Applying Windows path fixes...');

            let safeBinary = binary;

            // 1. Fix Slashes
            safeBinary = safeBinary.replace(/\//g, '\\');

            // 2. Fix venv path mapping (bin -> Scripts)
            if (safeBinary.includes('.venv\\bin\\python')) {
                safeBinary = safeBinary.replace('.venv\\bin\\python', '.venv\\Scripts\\python.exe');
            }

            // 3. FORCE ABSOLUTE PATH
            // If it looks like a relative path inside the tool dir, make it absolute.
            if (safeBinary.startsWith('.venv') || safeBinary.startsWith('node')) {
                // If it starts with .venv, resolve it against cwd
                if (safeBinary.startsWith('.venv')) {
                    safeBinary = path.resolve(this.cwd, safeBinary);
                }
                // (Optional) If it is 'node', we usually leave it to system PATH, 
                // but for venv python, we must be specific.
            }

            // Reassemble
            return `${safeBinary} ${args.join(' ')}`;
        }

        return fullCommand;
    }
    // ------------------------------------------------

    private startServer() {
        // 1. Normalize
        const safeCommand = this.normalizeCommand(this.startCommand);
        console.log(`[Executor] Booting: ${safeCommand}`);

        // 2. Split again for spawn
        // We need to respect spaces in paths if we had them, but for now simple split is fine
        // because our auto-generated paths don't have spaces.
        let newPath = process.env.PATH;

        if (this.startCommand.includes('.venv')) {
            const venvBin = process.platform === 'win32'
                ? path.resolve(this.cwd, '.venv', 'Scripts')
                : path.resolve(this.cwd, '.venv', 'bin');

            // Prepend to PATH (Windows uses ';', Linux uses ':')
            const delimiter = process.platform === 'win32' ? ';' : ':';
            newPath = `${venvBin}${delimiter}${process.env.PATH}`;
        }

        const [cmd, ...args] = safeCommand.split(' ');

        if (!cmd) {
            throw new Error(`Invalid start command: ${this.startCommand}`);
        }

        this.process = spawn(cmd, args, {
            cwd: this.cwd,
            // Use the enhanced PATH
            env: { ...process.env, ...this.env, PATH: newPath },
            shell: true
        });

        this.process?.stderr?.on('data', (data) => console.error(`[Tool Log] ${data}`));

        setTimeout(() => this.kill(), 60000);
    }

    private performHandshake(): Promise<void> {
        return new Promise((resolve, reject) => {
            if (!this.process || !this.process.stdin || !this.process.stdout) {
                return reject(new Error('Process not started'));
            }

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