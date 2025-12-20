import { createClient } from '@supabase/supabase-js';
import { execSync, spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import archiver from 'archiver';
import dotenv from 'dotenv';
import type { Archiver } from 'archiver';

dotenv.config();

// --- Configuration ---
const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_KEY!);
const TOOL_ID = process.env.TOOL_ID!;
const REPO_URL = process.env.TARGET_REPO_URL!;
const START_CMD = process.env.START_CMD!;
const USER_ID = process.env.USER_ID!;

const workDir = path.resolve('./temp_repo');
const artifactPath = path.resolve('./artifact.zip');

// --- HELPER: Fetch Secrets Securely ---
async function getSecrets(toolId: string) {
    const { data: secrets, error } = await supabase
        .from('tool_secrets')
        .select('key, value')
        .eq('tool_id', toolId);

    if (error) {
        console.warn('[Inspector] Warning: Could not fetch secrets:', error.message);
        return {};
    }

    const secretMap: NodeJS.ProcessEnv = {};
    if (secrets) {
        secrets.forEach(s => {
            secretMap[s.key] = s.value;
        });
    }
    return secretMap;
}

async function main() {
    try {
        // Dynamic imports for TypeScript files
        const dockerfileModule = await import('./dockerfile-generator.js');
        const railwayModule = await import('./railway-deployer.js');
        const { generateDockerfile, saveDockerfile } = dockerfileModule;
        const { deployToRailway } = railwayModule;

        console.log(`[Inspector] Processing ${REPO_URL}...`);

        // 1. Clean & Clone
        if (fs.existsSync(workDir)) fs.rmSync(workDir, { recursive: true, force: true });
        if (fs.existsSync(artifactPath)) fs.unlinkSync(artifactPath);

        execSync(`git clone ${REPO_URL} ${workDir}`);

        // 2. Install Dependencies
        installDependencies(workDir);

        // 3. Fetch Secrets (API Keys)
        console.log('[Inspector] Fetching secrets for introspection...');
        const secrets = await getSecrets(TOOL_ID);

        // MERGE ENVS: System + Secrets + Python Fixes
        const injectionEnv = {
            ...process.env,
            ...secrets,
            // CRITICAL FIX: Force Python to not buffer output
            PYTHONUNBUFFERED: '1',
            // CRITICAL FIX: Ensure local imports work in the tool directory
            PYTHONPATH: workDir
        };

        // 4. Introspection (Handshake)
        console.log(`[Inspector] Booting server with: "${START_CMD}"...`);
        const tools = await fetchToolsFromRunningServer(START_CMD, workDir, injectionEnv);
        console.log(`[Inspector] Successfully discovered ${tools.length} tools.`);

        // 5. Packing (Create Zip)
        console.log('[Inspector] Creating Snapshot Artifact...');
        await createZipArtifact(workDir, artifactPath, ['node_modules', '.git', '.venv', '__pycache__']);

        // 6. Upload to Supabase
        console.log('[Inspector] Uploading Snapshot...');
        const fileContent = fs.readFileSync(artifactPath);
        const storagePath = `snapshots/${TOOL_ID}.zip`;

        const { error: uploadError } = await supabase.storage
            .from('tool-bundles')
            .upload(storagePath, fileContent, { contentType: 'application/zip', upsert: true });

        if (uploadError) throw uploadError;

        // 7. Compile HTTP Wrapper (TypeScript to JavaScript)
        console.log('[Inspector] Compiling HTTP wrapper...');
        const wrapperSource = path.resolve('./scripts/mcp-http-wrapper.ts');
        const wrapperDest = path.join(workDir, 'mcp-http-wrapper.js');
        
        // Compile the TypeScript wrapper to JavaScript using esbuild
        try {
            execSync(`npx esbuild ${wrapperSource} --bundle --platform=node --format=cjs --outfile=${wrapperDest}`, {
                stdio: 'inherit'
            });
        } catch (e: any) {
            console.error('[Inspector] Failed to compile HTTP wrapper:', e.message);
            throw new Error('HTTP wrapper compilation failed');
        }

        // 8. Generate Dockerfile
        console.log('[Inspector] Generating Dockerfile...');
        const dockerfile = generateDockerfile(workDir, START_CMD);
        saveDockerfile(workDir, dockerfile);

        // 9. Deploy to Railway
        console.log('[Inspector] 🚀 Deploying to Railway...');
        
        // Prepare environment variables for deployment
        const deploymentEnvVars = {
            ...secrets,
            START_COMMAND: START_CMD,
            NODE_ENV: 'production',
            PYTHONUNBUFFERED: '1'
        };

        const deployment = await deployToRailway(workDir, TOOL_ID, deploymentEnvVars);
        console.log('[Inspector] ✅ Railway deployment successful!');
        console.log('[Inspector] URL:', deployment.deploymentUrl);

        // 10. Update Database with deployment info
        const manifest = {
            generated_at: new Date().toISOString(),
            source: REPO_URL,
            start_command: START_CMD,
            tools: tools,
            deployment: {
                platform: 'railway',
                project_id: deployment.projectId,
                service_id: deployment.serviceId,
                deployed_at: new Date().toISOString()
            }
        };

        await supabase
            .from('tools')
            .update({
                status: 'active',
                manifest: manifest,
                bundle_path: storagePath,
                deployment_url: deployment.deploymentUrl
            })
            .eq('id', TOOL_ID);

        console.log('[Inspector] 🎉 Setup Complete!');
        console.log('[Inspector] Your MCP server is live at:', deployment.deploymentUrl);
        console.log('[Inspector] Add to your MCP client config:');
        console.log(JSON.stringify({
            mcpServers: {
                [`mcp-${TOOL_ID.substring(0, 8)}`]: {
                    url: deployment.deploymentUrl
                }
            }
        }, null, 2));

    } catch (err: any) {
        console.error('[Inspector] FAILED:', err.message);
        await supabase.from('tools').update({ 
            status: 'failed', 
            error_message: err.message 
        }).eq('id', TOOL_ID);
        process.exit(1);
    }
}

// ---------------- HELPER FUNCTIONS ----------------

function installDependencies(cwd: string) {
    console.log('[Inspector] Detecting project type...');

    if (fs.existsSync(path.join(cwd, 'package.json'))) {
        console.log('-> Detected Node.js project');
        try { execSync('npm install', { cwd, stdio: 'inherit' }); } catch (e) { }

        // Build if needed
        const pkg = JSON.parse(fs.readFileSync(path.join(cwd, 'package.json'), 'utf-8'));
        if (pkg.scripts && pkg.scripts.build) {
            execSync(`npm run build`, { cwd, stdio: 'inherit' });
        }
    }
    else if (fs.existsSync(path.join(cwd, 'pyproject.toml')) || fs.existsSync(path.join(cwd, 'requirements.txt'))) {
        console.log('-> Detected Python project');

        // Re-create venv cleanly
        execSync('python3 -m venv .venv', { cwd, stdio: 'inherit' });

        const pip = process.platform === 'win32'
            ? path.join('.venv', 'Scripts', 'pip')
            : path.join('.venv', 'bin', 'pip');

        try { execSync(`${pip} install --upgrade pip`, { cwd, stdio: 'inherit' }); } catch (e) { }

        if (fs.existsSync(path.join(cwd, 'requirements.txt'))) {
            execSync(`${pip} install -r requirements.txt`, { cwd, stdio: 'inherit' });
        }
        if (fs.existsSync(path.join(cwd, 'pyproject.toml'))) {
            execSync(`${pip} install .`, { cwd, stdio: 'inherit' });
        }
    }
}

function fetchToolsFromRunningServer(command: string, cwd: string, env: NodeJS.ProcessEnv): Promise<any[]> {
    return new Promise((resolve, reject) => {
        const [cmd, ...args] = command.split(' ');

        // Spawn with INJECTED ENV (Secrets + PYTHONUNBUFFERED)
        const serverProcess = spawn(cmd, args, { cwd, env: env, shell: true });

        let buffer = '';
        let isInitialized = false;

        serverProcess.stdout.on('data', (data) => {
            const chunk = data.toString();
            console.log(`[Server stdout] ${chunk}`); // DEBUG LOG

            buffer += chunk;
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
                if (!line.trim()) continue;
                try {
                    const json = JSON.parse(line);

                    // Step 2: Receive Initialize Result
                    if (json.id === 0 && json.result) {
                        console.log('[Handshake] Server Initialized. Sending notification...');
                        const initNotification = JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) + "\n";
                        serverProcess.stdin.write(initNotification);

                        console.log('[Handshake] Requesting tools...');
                        const toolsRequest = JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }) + "\n";
                        serverProcess.stdin.write(toolsRequest);
                        isInitialized = true;
                    }

                    // Step 3: Receive Tools
                    if (json.id === 1 && json.result && json.result.tools) {
                        console.log('[Handshake] Tools received!');
                        resolve(json.result.tools);
                        serverProcess.kill();
                    }

                    if (json.error) {
                        console.error('[Handshake Error]', json.error);
                    }

                } catch (e) {
                    // Ignore non-JSON lines (logs)
                }
            }
        });

        serverProcess.stderr.on('data', (data) => console.error(`[Server stderr] ${data}`));

        // Step 1: Send Initialize Request
        const initRequest = JSON.stringify({
            jsonrpc: "2.0", id: 0, method: "initialize",
            params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "inspector", version: "1.0" } }
        }) + "\n";

        console.log('[Handshake] Sending initialize request...');
        serverProcess.stdin.write(initRequest);

        setTimeout(() => {
            if (!isInitialized) {
                serverProcess.kill();
                reject(new Error("Timeout: Handshake failed (20s). Check Server stderr logs above."));
            }
        }, 20000); // Increased timeout to 20s
    });
}

function createZipArtifact(sourceDir: string, outPath: string, ignoreList: string[]): Promise<void> {
    return new Promise((resolve, reject) => {
        const output = fs.createWriteStream(outPath);
        const archive = archiver('zip', { zlib: { level: 9 } });

        output.on('close', () => resolve());
        archive.on('error', (err: Error) => reject(err));

        archive.pipe(output);

        archive.glob('**/*', {
            cwd: sourceDir,
            ignore: ignoreList.map(i => `**/${i}/**`),
            dot: true
        });

        archive.finalize();
    });
}

main();