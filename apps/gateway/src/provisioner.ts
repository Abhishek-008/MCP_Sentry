import fs from 'fs-extra';
import path from 'path';
import { execa } from 'execa';
import { createClient } from '@supabase/supabase-js';
import AdmZip from 'adm-zip';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// --- HELPER: Find a Stable Python Path (Resolves to absolute executable) ---
async function findStablePythonPath(): Promise<string> {
    console.log('[Provisioner] Scanning for stable Python (3.10 - 3.12)...');

    // Commands to test
    const candidates = process.platform === 'win32'
        ? [
            ['py', '-3.12'], ['py', '-3.11'], ['py', '-3.10'], // Windows Launcher
            ['python3.12'], ['python3.11'], ['python']         // Direct PATH
        ]
        : [['python3.12'], ['python3.11'], ['python3'], ['python']];

    for (const cmd of candidates) {
        const pythonBinary = cmd[0];
        if (!pythonBinary) continue;

        try {
            // 1. Check version string
            const versionCheck = await execa(pythonBinary, [...cmd.slice(1), '--version']);
            const versionStr = versionCheck.stdout.trim(); // e.g., "Python 3.12.8"

            if (versionStr.includes(' 3.14') || versionStr.includes(' 3.13')) {
                console.log(`   Skipping ${cmd.join(' ')} (${versionStr}) - Too new/unstable.`);
                continue;
            }

            // 2. Resolve ABSOLUTE path
            // We ask Python to tell us where it lives. This is critical for 'uv'.
            const pathCheck = await execa(pythonBinary, [...cmd.slice(1), '-c', 'import sys; print(sys.executable)']);
            const absPath = pathCheck.stdout.trim();

            console.log(`   ✅ Selected: ${absPath} (${versionStr})`);
            return absPath;
        } catch (e) {
            // Command not found, continue
        }
    }

    console.warn('   ⚠️ No specific stable python found. Falling back to system "python".');
    return 'python'; // Hope for the best
}

export async function prepareTool(toolId: string, bundlePath: string): Promise<string> {
    const runtimeCache = path.resolve('runtime_cache');
    const toolDir = path.join(runtimeCache, toolId);

    // 1. Check Cache
    if (fs.existsSync(toolDir)) {
        const files = await fs.readdir(toolDir);
        if (files.length > 0) {
            console.log(`[Provisioner] Tool ${toolId} is cached.`);
            return toolDir;
        }
    }

    console.log(`[Provisioner] Cold Start for ${toolId}.`);

    // Ensure Clean Directory
    if (fs.existsSync(toolDir)) await fs.remove(toolDir);
    await fs.ensureDir(toolDir);

    // 2. DOWNLOAD
    console.log(`[Provisioner] Downloading bundle: ${bundlePath}...`);
    const { data, error } = await supabase.storage
        .from('tool-bundles')
        .download(bundlePath);

    if (error || !data) throw new Error(`Failed to download bundle: ${error?.message}`);

    // 3. UNZIP
    console.log(`[Provisioner] Extracting...`);
    const buffer = Buffer.from(await data.arrayBuffer());
    const zip = new AdmZip(buffer);
    zip.extractAllTo(toolDir, true);

    // 4. DETECT & INSTALL
    console.log(`[Provisioner] Installing dependencies...`);

    const isNode = fs.existsSync(path.join(toolDir, 'package.json'));
    const isPython = fs.existsSync(path.join(toolDir, 'pyproject.toml')) ||
        fs.existsSync(path.join(toolDir, 'requirements.txt'));

    if (isNode) {
        console.log('   -> Node.js detected.');
        if (fs.existsSync(path.join(toolDir, 'pnpm-lock.yaml'))) {
            try { await execa('npm', ['install', '-g', 'pnpm'], { stdio: 'ignore' }); } catch (e) { }
            await execa('pnpm', ['install'], { cwd: toolDir });
        } else {
            await execa('npm', ['install', '--omit=dev'], { cwd: toolDir });
        }
        if (fs.existsSync(path.join(toolDir, 'tsconfig.json'))) {
            try { await execa('npm', ['run', 'build'], { cwd: toolDir }); } catch (e) { }
        }

    } else if (isPython) {
        console.log('   -> Python detected.');

        // ROBUSTNESS: Get Absolute Path to Stable Python
        const pythonExe = await findStablePythonPath();

        console.log('      Creating venv...');
        // Create venv explicitly using the stable python
        await execa(pythonExe, ['-m', 'venv', '.venv'], { cwd: toolDir });

        // Calculate Venv Paths
        const venvPython = process.platform === 'win32'
            ? path.join(toolDir, '.venv', 'Scripts', 'python.exe')
            : path.join(toolDir, '.venv', 'bin', 'python');

        try {
            console.log('      Installing dependencies (via pip/uv)...');
            // Upgrade pip
            await execa(venvPython, ['-m', 'pip', 'install', '--upgrade', 'pip'], { cwd: toolDir });

            // Install 'uv' inside venv
            await execa(venvPython, ['-m', 'pip', 'install', 'uv'], { cwd: toolDir });

            // INSTALLATION LOGIC
            if (fs.existsSync(path.join(toolDir, 'uv.lock'))) {
                const venvUv = process.platform === 'win32'
                    ? path.join(toolDir, '.venv', 'Scripts', 'uv.exe')
                    : path.join(toolDir, '.venv', 'bin', 'uv');

                // CRITICAL FIX: Pass --python flag to force uv to use our stable version
                // This prevents it from deleting our venv and using System Python 3.14
                console.log(`      Running uv sync with python: ${pythonExe}`);
                await execa(venvUv, ['sync', '--python', pythonExe], { cwd: toolDir });

            } else if (fs.existsSync(path.join(toolDir, 'pyproject.toml'))) {
                await execa(venvPython, ['-m', 'pip', 'install', '.'], { cwd: toolDir });
            } else if (fs.existsSync(path.join(toolDir, 'requirements.txt'))) {
                await execa(venvPython, ['-m', 'pip', 'install', '-r', 'requirements.txt'], { cwd: toolDir });
            }
        } catch (error: any) {
            console.error('Dependency Install Failed:', error.stderr || error.message);
            throw error;
        }
    } else {
        console.warn('   -> Unknown runtime. Skipping install.');
    }

    return toolDir;
}