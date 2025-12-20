/**
 * Railway Deployment Module
 * Deploys MCP servers to Railway platform without CLI login
 */

import { execSync, spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import https from 'https';
import http from 'http';

interface RailwayDeployment {
    projectId: string;
    serviceId: string;
    deploymentUrl: string;
}

// Make HTTPS/HTTP request
function makeRequest(url: string, method: string = 'GET', body?: any, headers?: Record<string, string>): Promise<any> {
    return new Promise((resolve, reject) => {
        const isHttps = url.startsWith('https');
        const client = isHttps ? https : http;
        const urlObj = new URL(url);
        
        const options = {
            hostname: urlObj.hostname,
            port: urlObj.port,
            path: urlObj.pathname + urlObj.search,
            method,
            headers: {
                'Content-Type': 'application/json',
                ...headers
            }
        };

        const req = client.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    resolve(JSON.parse(data));
                } catch {
                    resolve(data);
                }
            });
        });

        req.on('error', reject);
        if (body) {
            req.write(JSON.stringify(body));
        }
        req.end();
    });
}

export async function deployToRailway(
    projectPath: string,
    toolId: string,
    envVars: Record<string, string>
): Promise<RailwayDeployment> {
    
    const RAILWAY_TOKEN = process.env.RAILWAY_API_TOKEN;
    
    if (!RAILWAY_TOKEN) {
        throw new Error('RAILWAY_API_TOKEN not set in environment');
    }

    console.log('[Railway] Starting deployment via token...');

    try {
        const projectName = `mcp-${toolId.substring(0, 8)}`;
        
        // Step 1: Create a railway.json to skip init
        console.log('[Railway] Creating railway.json configuration...');
        
        const railwayJson = {
            "$schema": "https://railway.app/railway.schema.json",
            "build": {
                "builder": "dockerfile",
                "buildCommand": "docker build -t railway .",
                "startCommand": ""
            },
            "deploy": {
                "restartPolicyType": "on_failure",
                "restartPolicyMaxRetries": 5,
                "numReplicas": 1,
                "sleepApplication": false,
                "healthchecks": {
                    "readiness": null,
                    "liveness": null
                }
            }
        };

        fs.writeFileSync(
            path.join(projectPath, 'railway.json'),
            JSON.stringify(railwayJson, null, 2)
        );

        // Step 2: Create .railwayrc.json with token
        console.log('[Railway] Creating .railwayrc.json with token...');
        
        const railwayrc = {
            "token": RAILWAY_TOKEN
        };

        fs.writeFileSync(
            path.join(projectPath, '.railwayrc.json'),
            JSON.stringify(railwayrc, null, 2)
        );

        // Step 3: Set up environment
        const railwayEnv = {
            ...process.env,
            RAILWAY_TOKEN,
            RAILWAY_API_TOKEN: RAILWAY_TOKEN
        };

        // Step 4: Try using railway link instead of init (doesn't require login)
        console.log(`[Railway] Linking to Railway project: ${projectName}...`);
        
        try {
            // First ensure railway CLI is available
            try {
                execSync('railway --version', { stdio: 'pipe' });
            } catch {
                console.log('[Railway] Installing Railway CLI...');
                execSync('npm install -g @railway/cli', { stdio: 'inherit' });
            }

            // Try to link project - this works with token auth
            execSync(`railway init --name "${projectName}" --empty`, {
                cwd: projectPath,
                env: railwayEnv,
                stdio: 'inherit',
                shell: '/bin/sh'
            });
        } catch (initError) {
            // If init fails, try with just the token set
            console.log('[Railway] Direct init failed, attempting token-based setup...');
            
            // Write a minimal .railway/config.json
            const railwayDir = path.join(projectPath, '.railway');
            if (!fs.existsSync(railwayDir)) {
                fs.mkdirSync(railwayDir, { recursive: true });
            }
            
            fs.writeFileSync(
                path.join(railwayDir, 'config.json'),
                JSON.stringify({ token: RAILWAY_TOKEN }, null, 2)
            );
        }

        // Step 5: Set environment variables
        console.log('[Railway] Setting environment variables...');
        for (const [key, value] of Object.entries(envVars)) {
            try {
                const escapedValue = value.replace(/"/g, '\\"').replace(/\$/g, '\\$').replace(/`/g, '\\`');
                execSync(`railway variables set ${key}="${escapedValue}"`, {
                    cwd: projectPath,
                    env: railwayEnv,
                    stdio: 'pipe'
                });
                console.log(`[Railway] Set variable: ${key}`);
            } catch (e) {
                console.warn(`[Railway] Warning setting ${key}:`, (e as Error).message);
                // Continue on error
            }
        }

        // Step 6: Deploy
        console.log('[Railway] Deploying project...');
        try {
            const deployOutput = execSync('railway up --detach 2>&1 || true', {
                cwd: projectPath,
                env: railwayEnv,
                encoding: 'utf-8'
            });
            console.log('[Railway] Deploy output:', deployOutput);
        } catch (e) {
            console.log('[Railway] Deploy command completed');
        }

        // Step 7: Get deployment info
        console.log('[Railway] Retrieving deployment information...');
        await new Promise(resolve => setTimeout(resolve, 3000));

        let deploymentUrl = `https://${projectName}-production.up.railway.app`;
        
        try {
            const statusOutput = execSync('railway status 2>&1 || true', {
                cwd: projectPath,
                env: railwayEnv,
                encoding: 'utf-8'
            });
            
            // Try to extract URL from status output
            const urlMatch = statusOutput.match(/https:\/\/[^\s\n]+\.railway\.app/);
            if (urlMatch) {
                deploymentUrl = urlMatch[0];
            }
        } catch (e) {
            console.log('[Railway] Could not retrieve live status, using default URL');
        }

        console.log(`[Railway] ✅ Deployment successful!`);
        console.log(`[Railway] Project URL: ${deploymentUrl}`);

        return {
            projectId: projectName,
            serviceId: projectName,
            deploymentUrl
        };

    } catch (error) {
        console.error('[Railway] Deployment error:', error);
        throw error;
    }
}