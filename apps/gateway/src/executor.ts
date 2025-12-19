import { spawn, ChildProcess } from 'child_process';

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

            // Send the actual execution request
            const result = await this.callTool(toolName, args);
            return result;
        } finally {
            this.kill();
        }
    }

    private startServer() {
        console.log(`[Executor] Booting: ${this.startCommand}`);
        const [cmd, ...args] = this.startCommand.split(' ');

        if (!cmd) {
            throw new Error(`Invalid start command: ${this.startCommand}`);
        }

        this.process = spawn(cmd, args, {
            cwd: this.cwd,
            env: { ...process.env, ...this.env, PATH: process.env.PATH },
            shell: true
        });

        this.process?.stderr?.on('data', (data) => console.error(`[Tool Log] ${data}`));

        // Safety timeout
        setTimeout(() => this.kill(), 30000); // Max 30s runtime
    }

    private performHandshake(): Promise<void> {
        return new Promise((resolve, reject) => {
            if (!this.process || !this.process.stdin || !this.process.stdout) {
                return reject(new Error('Process not started'));
            }

            const initRequest = JSON.stringify({
                jsonrpc: "2.0", id: 0, method: "initialize",
                params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "gateway", version: "1.0" } }
            }) + "\n";

            const onData = (data: Buffer) => {
                const lines = data.toString().split('\n');
                for (const line of lines) {
                    if (!line.trim()) continue;
                    try {
                        const json = JSON.parse(line);

                        // Step 2: Initialize Response
                        if (json.id === 0 && json.result) {
                            const notify = JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) + "\n";
                            this.process?.stdin?.write(notify);

                            // Remove listener and resolve
                            this.process?.stdout?.off('data', onData);
                            this.isInitialized = true;
                            resolve();
                        }
                    } catch (e) { }
                }
            };

            this.process.stdout.on('data', onData);
            this.process.stdin.write(initRequest);

            // Fail if handshake takes too long
            setTimeout(() => {
                if (!this.isInitialized) reject(new Error('Handshake timeout'));
            }, 5000);
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