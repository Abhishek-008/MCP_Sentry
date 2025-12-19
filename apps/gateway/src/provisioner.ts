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

    // 2. DOWNLOAD from Supabase Storage
    console.log(`[Provisioner] Downloading bundle: ${bundlePath}...`);

    const { data, error } = await supabase.storage
        .from('tool-bundles')
        .download(bundlePath);

    if (error || !data) {
        throw new Error(`Failed to download bundle: ${error?.message}`);
    }

    // 3. UNZIP
    console.log(`[Provisioner] Extracting...`);
    const buffer = Buffer.from(await data.arrayBuffer());
    const zip = new AdmZip(buffer);
    zip.extractAllTo(toolDir, true);

    // 4. DETECT & INSTALL DEPENDENCIES
    console.log(`[Provisioner] Installing dependencies for ${toolId}...`);

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

        // WIN32 FIX 1: Use 'python' alias for creation
        const sysPython = process.platform === 'win32' ? 'python' : 'python3';

        console.log('      Creating venv...');
        await execa(sysPython, ['-m', 'venv', '.venv'], { cwd: toolDir });

        // WIN32 FIX 2: Calculate VENV PYTHON path
        // We use this to run pip safely (python -m pip)
        const venvPython = process.platform === 'win32'
            ? path.join(toolDir, '.venv', 'Scripts', 'python.exe')
            : path.join(toolDir, '.venv', 'bin', 'python');

        // Calculate PIP path (for direct calls if needed later)
        const venvPip = process.platform === 'win32'
            ? path.join(toolDir, '.venv', 'Scripts', 'pip.exe')
            : path.join(toolDir, '.venv', 'bin', 'pip');

        try {
            console.log('      Installing pip requirements...');

            // CRITICAL FIX: Upgrade pip using python executable, NOT pip executable
            // "python -m pip install --upgrade pip" avoids file locking issues on Windows
            await execa(venvPython, ['-m', 'pip', 'install', '--upgrade', 'pip'], { cwd: toolDir });

            if (fs.existsSync(path.join(toolDir, 'uv.lock'))) {
                await execa(venvPython, ['-m', 'pip', 'install', 'uv'], { cwd: toolDir });
                await execa(venvPip.replace('pip', 'uv'), ['sync'], { cwd: toolDir });
            } else {
                // Install "." using python -m pip for consistency
                await execa(venvPython, ['-m', 'pip', 'install', '.'], { cwd: toolDir });
            }
        } catch (error: any) {
            console.error('Pip Install Failed:', error.stderr || error.message);
            throw error;
        }
    } else {
        console.warn('   -> Unknown runtime. Skipping install.');
    }

    return toolDir;
}