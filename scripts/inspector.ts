import { createClient } from '@supabase/supabase-js';
import { execSync, spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import archiver from 'archiver';
import dotenv from 'dotenv';

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
        console.log(`[Inspector] Processing ${REPO_URL}...`);

        // 1. Clean & Clone
        if (fs.existsSync(workDir)) fs.rmSync(workDir, { recursive: true, force: true });
        if (fs.existsSync(artifactPath)) fs.unlinkSync(artifactPath);

        execSync(`git clone ${REPO_URL} ${workDir}`);

        // 2. Install Dependencies (Robust Mode)
        installDependencies(workDir);

        // 3. Fetch Secrets (API Keys)
        console.log('[Inspector] Fetching secrets for introspection...');
        const secrets = await getSecrets(TOOL_ID);

        // 4. PREPARE ENVIRONMENT
        const venvBin = process.platform === 'win32'
            ? path.resolve(workDir, '.venv', 'Scripts')
            : path.resolve(workDir, '.venv', 'bin');

        const delimiter = process.platform === 'win32' ? ';' : ':';
        const newPath = `${venvBin}${delimiter}${process.env.PATH}`;

        const injectionEnv = {
            ...process.env,
            ...secrets,
            PATH: newPath,
            PYTHONUNBUFFERED: '1',
            PYTHONPATH: workDir
        };

        // 5. Introspection (Handshake)
        console.log(`[Inspector] Booting server with: "${START_CMD}"...`);
        // We now allow up to 120 seconds for the first boot
        const tools = await fetchToolsFromRunningServer(START_CMD, workDir, injectionEnv);
        console.log(`[Inspector] Successfully discovered ${tools.length} tools.`);

        // 6. Packing (Create Zip)
        console.log('[Inspector] Creating Snapshot Artifact...');
        await createZipArtifact(workDir, artifactPath, ['node_modules', '.git', '.venv', '__pycache__', 'dist', 'build']);

        // 7. Upload to Supabase
        console.log('[Inspector] Uploading Snapshot...');
        const fileContent = fs.readFileSync(artifactPath);
        const storagePath = `snapshots/${TOOL_ID}.zip`;

        const { error: uploadError } = await supabase.storage
            .from('tool-bundles')
            .upload(storagePath, fileContent, { contentType: 'application/zip', upsert: true });

        if (uploadError) throw uploadError;

        // 8. Update Database
        const manifest = {
            generated_at: new Date().toISOString(),
            source: REPO_URL,
            start_command: START_CMD,
            tools: tools
        };

        await supabase
            .from('tools')
            .update({
                status: 'active',
                manifest: manifest,
                bundle_path: storagePath
            })
            .eq('id', TOOL_ID);

        console.log('[Inspector] Setup Complete!');

    } catch (err: any) {
        console.error('[Inspector] FAILED:', err.message);
        await supabase.from('tools').update({ status: 'failed', error_message: err.message }).eq('id', TOOL_ID);
        process.exit(1);
    }
}

// ---------------- HELPER FUNCTIONS ----------------

function installDependencies(cwd: string) {
    console.log('[Inspector] Detecting project type...');

    // --- NODE.JS ---
    if (fs.existsSync(path.join(cwd, 'package.json'))) {
        console.log('-> Detected Node.js project');
        try { execSync('npm install', { cwd, stdio: 'inherit' }); } catch (e) { }

        const pkg = JSON.parse(fs.readFileSync(path.join(cwd, 'package.json'), 'utf-8'));
        if (pkg.scripts && pkg.scripts.build) {
            console.log('   Running build script...');
            try { execSync(`npm run build`, { cwd, stdio: 'inherit' }); } catch (e) { }
        }
    }
    // --- PYTHON ---
    else if (fs.existsSync(path.join(cwd, 'pyproject.toml')) || fs.existsSync(path.join(cwd, 'requirements.txt'))) {
        console.log('-> Detected Python project');

        execSync('python3 -m venv .venv', { cwd, stdio: 'inherit' });

        const pip = process.platform === 'win32'
            ? path.join('.venv', 'Scripts', 'pip')
            : path.join('.venv', 'bin', 'pip');

        try { execSync(`${pip} install --upgrade pip`, { cwd, stdio: 'inherit' }); } catch (e) { }

        // Install 'uv' universally
        console.log('   Installing uv support...');
        try { execSync(`${pip} install uv`, { cwd, stdio: 'inherit' }); } catch (e) { }

        if (fs.existsSync(path.join(cwd, 'requirements.txt'))) {
            console.log('   Installing requirements.txt...');
            try { execSync(`${pip} install -r requirements.txt`, { cwd, stdio: 'inherit' }); } catch (e) { throw e; }
        }

        if (fs.existsSync(path.join(cwd, 'pyproject.toml'))) {
            console.log('   Attempting to build/install project...');
            try { execSync(`${pip} install .`, { cwd, stdio: 'inherit' }); } catch (e) { }
        }
    }
}

function fetchToolsFromRunningServer(command: string, cwd: string, env: NodeJS.ProcessEnv): Promise<any[]> {
    return new Promise((resolve, reject) => {
        const [cmd, ...args] = command.split(' ');
        const serverProcess = spawn(cmd, args, { cwd, env: env, shell: true });

        let buffer = '';
        let isInitialized = false;
        let stderrLog = '';

        // TIMEOUT MANAGEMENT
        // We start with 120s. Every time we receive data (log or output), we extend the life.
        let timeoutHandle: NodeJS.Timeout;

        const refreshTimeout = () => {
            if (timeoutHandle) clearTimeout(timeoutHandle);
            timeoutHandle = setTimeout(() => {
                if (!isInitialized) {
                    serverProcess.kill();
                    reject(new Error("Timeout: Server took too long (>120s idle) to startup.\nLogs:\n" + stderrLog));
                }
            }, 120000); // 2 Minutes Max Idle Time
        };

        refreshTimeout();

        serverProcess.on('error', (err) => reject(new Error(`Spawn Error: ${err.message}`)));

        serverProcess.on('exit', (code) => {
            if (!isInitialized) reject(new Error(`Server exited early (code ${code}). Logs:\n${stderrLog}`));
        });

        serverProcess.stdin.on('error', (err) => {
            if ((err as any).code !== 'EPIPE') console.error('[Inspector] Stdin Error:', err);
        });

        serverProcess.stdout.on('data', (data) => {
            refreshTimeout(); // Keep alive on activity
            const chunk = data.toString();
            buffer += chunk;
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
                if (!line.trim()) continue;
                try {
                    const json = JSON.parse(line);

                    if (json.id === 0 && json.result) {
                        const initNotification = JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) + "\n";
                        if (!serverProcess.stdin.destroyed) serverProcess.stdin.write(initNotification);

                        const toolsRequest = JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }) + "\n";
                        if (!serverProcess.stdin.destroyed) serverProcess.stdin.write(toolsRequest);
                        isInitialized = true;
                    }

                    if (json.id === 1 && json.result && json.result.tools) {
                        clearTimeout(timeoutHandle);
                        resolve(json.result.tools);
                        serverProcess.kill();
                    }
                } catch (e) { }
            }
        });

        serverProcess.stderr.on('data', (data) => {
            refreshTimeout(); // Keep alive on logs (compilation output)
            const log = data.toString();
            stderrLog += log;
            console.error(`[Server stderr] ${log}`);
        });

        const initRequest = JSON.stringify({
            jsonrpc: "2.0", id: 0, method: "initialize",
            params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "inspector", version: "1.0" } }
        }) + "\n";

        if (!serverProcess.stdin.destroyed) serverProcess.stdin.write(initRequest);
    });
}

function createZipArtifact(sourceDir: string, outPath: string, ignoreList: string[]): Promise<void> {
    return new Promise((resolve, reject) => {
        const output = fs.createWriteStream(outPath);
        const archive = archiver('zip', { zlib: { level: 9 } });
        output.on('close', () => resolve());
        archive.on('error', (err) => reject(err));
        archive.pipe(output);
        archive.glob('**/*', { cwd: sourceDir, ignore: ignoreList.map(i => `**/${i}/**`), dot: true });
        archive.finalize();
    });
}

main();