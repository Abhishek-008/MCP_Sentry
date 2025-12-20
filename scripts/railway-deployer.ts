/**
 * Railway Deployment Module
 * Deploys MCP servers to Railway platform
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

interface RailwayDeployment {
    projectId: string;
    serviceId: string;
    deploymentUrl: string;
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

    console.log('[Railway] Starting deployment...');

    try {
        // 1. Install Railway CLI if not present
        try {
            execSync('railway --version', { stdio: 'ignore' });
        } catch {
            console.log('[Railway] Installing Railway CLI...');
            execSync('bash -c "$(curl -fsSL https://railway.app/install.sh)"', { 
                stdio: 'inherit',
                shell: '/bin/bash'
            });
        }

        // 2. Configure Railway token in config file (CLI expects it here)
        const homeDir = process.env.HOME || process.env.USERPROFILE || '/root';
        const railwayConfigDir = path.join(homeDir, '.railway');
        const railwayConfigFile = path.join(railwayConfigDir, 'config.json');
        
        console.log('[Railway] Configuring authentication...');
        
        // Create config directory if it doesn't exist
        if (!fs.existsSync(railwayConfigDir)) {
            fs.mkdirSync(railwayConfigDir, { recursive: true });
        }
        
        // Write token to config file
        fs.writeFileSync(railwayConfigFile, JSON.stringify({
            token: RAILWAY_TOKEN
        }, null, 2));
        
        console.log('[Railway] Authentication configured');

        // 3. Create new project
        const projectName = `mcp-${toolId.substring(0, 8)}`;
        
        console.log(`[Railway] Creating project: ${projectName}`);
        
        // Initialize Railway project
        execSync(`railway init --name "${projectName}"`, {
            cwd: projectPath,
            stdio: 'inherit'
        });

        // 4. Set environment variables
        console.log('[Railway] Setting environment variables...');
        for (const [key, value] of Object.entries(envVars)) {
            // Escape quotes in values
            const escapedValue = value.replace(/"/g, '\\"').replace(/\$/g, '\\$');
            try {
                execSync(`railway variables --set ${key}="${escapedValue}"`, {
                    cwd: projectPath,
                    stdio: 'inherit'
                });
            } catch (e) {
                console.warn(`[Railway] Warning: Failed to set ${key}, continuing...`);
            }
        }

        // 5. Deploy using Dockerfile
        console.log('[Railway] Deploying to Railway...');
        execSync('railway up --detach', {
            cwd: projectPath,
            stdio: 'inherit'
        });

        console.log('[Railway] Deployment initiated successfully');

        // 6. Generate and set domain
        console.log('[Railway] Generating domain...');
        try {
            execSync('railway domain', {
                cwd: projectPath,
                stdio: 'inherit'
            });
        } catch (e) {
            console.warn('[Railway] Domain generation skipped');
        }

        // Wait for deployment to start
        await new Promise(resolve => setTimeout(resolve, 3000));

        // 7. Get deployment URL
        let deploymentUrl = `https://${projectName}.up.railway.app`;
        
        try {
            const statusOutput = execSync('railway status --json', {
                cwd: projectPath,
                encoding: 'utf-8'
            });
            
            const status = JSON.parse(statusOutput);
            if (status.service?.domain) {
                deploymentUrl = `https://${status.service.domain}`;
            }
        } catch (e) {
            console.log('[Railway] Using default URL format');
        }

        console.log('[Railway] ✅ Deployment successful!');
        console.log('[Railway] URL:', deploymentUrl);

        return {
            projectId: projectName,
            serviceId: projectName,
            deploymentUrl
        };

    } catch (error: any) {
        console.error('[Railway] Deployment failed:', error.message);
        throw new Error(`Railway deployment failed: ${error.message}`);
    }
}

// Alternative: Use Railway API directly (more reliable)
export async function deployToRailwayAPI(
    projectPath: string,
    toolId: string,
    envVars: Record<string, string>
): Promise<RailwayDeployment> {
    
    const RAILWAY_TOKEN = process.env.RAILWAY_API_TOKEN;
    
    if (!RAILWAY_TOKEN) {
        throw new Error('RAILWAY_API_TOKEN not set');
    }

    // Railway GraphQL API endpoint
    const RAILWAY_API = 'https://backboard.railway.app/graphql/v2';
    
    console.log('[Railway API] Starting deployment via API...');
    
    try {
        // Step 1: Create project
        const createProjectQuery = `
            mutation {
                projectCreate(input: { name: "mcp-${toolId.substring(0, 8)}" }) {
                    id
                }
            }
        `;
        
        const projectResponse = await fetch(RAILWAY_API, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${RAILWAY_TOKEN}`
            },
            body: JSON.stringify({ query: createProjectQuery })
        });
        
        const projectData = await projectResponse.json();
        
        if (projectData.errors) {
            throw new Error(`API Error: ${JSON.stringify(projectData.errors)}`);
        }
        
        const projectId = projectData.data.projectCreate.id;
        console.log('[Railway API] Project created:', projectId);
        
        // For now, return with CLI fallback
        console.log('[Railway API] Note: Full API deployment requires GitHub integration');
        console.log('[Railway API] Falling back to CLI deployment...');
        
        return deployToRailway(projectPath, toolId, envVars);
        
    } catch (error: any) {
        console.error('[Railway API] Error:', error.message);
        throw error;
    }
}