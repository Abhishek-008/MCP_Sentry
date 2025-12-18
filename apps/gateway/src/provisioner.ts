import { createClient } from '@supabase/supabase-js';
import AdmZip from 'adm-zip';
import fs from 'fs-extra';
import path from 'path';
import { execa } from 'execa';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

// We will store running tools in a local "cache" folder
const RUNTIME_DIR = path.resolve('./runtime_cache');

export async function prepareTool(toolId: string, bundlePath: string): Promise<string> {
    const toolDir = path.join(RUNTIME_DIR, toolId);

    // 1. Check Cache: If it exists, return it immediately (Hot Start)
    if (await fs.pathExists(toolDir)) {
        console.log(`[Provisioner] Tool ${toolId} is cached.`);
        return toolDir;
    }

    console.log(`[Provisioner] Cold Start for ${toolId}. Downloading...`);

    // 2. Download Zip from Supabase
    const { data, error } = await supabase.storage
        .from('tool-bundles')
        .download(bundlePath);

    if (error || !data) {
        throw new Error(`Failed to download tool artifact: ${error?.message}`);
    }

    // 3. Unzip
    // We need to write the blob to a temp file first
    const arrayBuffer = await data.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const tempZipPath = path.join(RUNTIME_DIR, `${toolId}.zip`);

    await fs.ensureDir(RUNTIME_DIR);
    await fs.writeFile(tempZipPath, buffer);

    const zip = new AdmZip(tempZipPath);
    zip.extractAllTo(toolDir, true); // overwrite = true

    // Cleanup zip
    await fs.remove(tempZipPath);

    // 4. Re-Install Dependencies (The "Hydration" Step)
    console.log(`[Provisioner] Installing dependencies for ${toolId}...`);
    await installDependencies(toolDir);

    return toolDir;
}

// Reuse the logic from Inspector, but using 'execa' for better safety
async function installDependencies(cwd: string) {
    if (await fs.pathExists(path.join(cwd, 'package.json'))) {
        console.log('   -> Node.js detected.');
        try {
            // FIX: Removed '--omit=dev'. We install EVERYTHING to ensure build scripts (like shx) work.
            // We also switched from 'ci' to 'install' to be more forgiving of lockfile issues.
            if (await fs.pathExists(path.join(cwd, 'package-lock.json'))) {
                await execa('npm', ['install'], { cwd });
            } else {
                await execa('npm', ['install'], { cwd });
            }
        } catch (e: any) {
            // If it fails, we throw now instead of just warning, 
            // because a tool without dependencies will definitely fail later.
            throw new Error(`Npm install failed: ${e.message}`);
        }
    }
    else if (await fs.pathExists(path.join(cwd, 'pyproject.toml')) || await fs.pathExists(path.join(cwd, 'requirements.txt'))) {
        console.log('   -> Python detected.');
        if (await fs.pathExists(path.join(cwd, 'requirements.txt'))) {
            await execa('pip', ['install', '-r', 'requirements.txt'], { cwd });
        } else {
            await execa('pip', ['install', '.'], { cwd });
        }
    }
}
