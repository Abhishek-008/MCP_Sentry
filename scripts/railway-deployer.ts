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
            if (process.platform === 'win32') {
                execSync('npm install -g @railway/cli', { stdio: 'inherit' });
            } else {
                execSync('curl -fsSL https://railway.app/install.sh | sh', { stdio: 'inherit' });
            }
        }

        // 2. Set Railway token in environment (no login needed)
        console.log('[Railway] Authenticating with API token...');
        const railwayEnv = { 
            ...process.env, 
            RAILWAY_TOKEN 
        };

        // 3. Create new project or link to existing
        const projectName = `mcp-${toolId.substring(0, 8)}`;
        
        console.log(`[Railway] Creating project: ${projectName}`);
        
        // Initialize Railway project with --no-input flag for CI environments
        try {
            execSync(`railway init -n ${projectName} --no-input`, {
                cwd: projectPath,
                env: railwayEnv,
                stdio: 'inherit'
            });
        } catch (e) {
            // If --no-input doesn't work, try basic init
            console.log('[Railway] Retrying init without --no-input...');
            execSync(`railway init -n ${projectName}`, {
                cwd: projectPath,
                env: railwayEnv,
                input: '\n',  // Provide empty input for prompts
                stdio: 'inherit'
            });
        }

        // 4. Set environment variables
        console.log('[Railway] Setting environment variables...');
        for (const [key, value] of Object.entries(envVars)) {
            // Escape quotes in values
            const escapedValue = value.replace(/"/g, '\\"');
            execSync(`railway variables set ${key}="${escapedValue}"`, {
                cwd: projectPath,
                env: railwayEnv,
                stdio: 'inherit'
            });
        }

        // 5. Deploy using Dockerfile
        console.log('[Railway] Deploying to Railway...');
        const deployOutput = execSync('railway up --detach', {
            cwd: projectPath,
            env: railwayEnv,
            encoding: 'utf-8'
        });

        console.log('[Railway] Deploy output:', deployOutput);

        // 6. Get deployment URL (wait for it to be ready)
        console.log('[Railway] Waiting for deployment URL...');
        
        // Generate domain
        execSync('railway domain', {
            cwd: projectPath,
            env: railwayEnv,
            stdio: 'inherit'
        });

        // Wait a bit for URL to be generated
        await new Promise(resolve => setTimeout(resolve, 5000));

        // Get the deployment info
        const statusOutput = execSync('railway status', {
            cwd: projectPath,
            env: railwayEnv,
            encoding: 'utf-8'
        });

        console.log('[Railway] Status:', statusOutput);

        // Extract URL from status (Railway typically shows it in status)
        // Format: https://mcp-xxxxx-production.up.railway.app
        const urlMatch = statusOutput.match(/https:\/\/[^\s]+\.railway\.app/);
        const deploymentUrl = urlMatch ? urlMatch[0] : '';

        if (!deploymentUrl) {
            // Fallback: construct URL from project name
            const fallbackUrl = `https://${projectName}-production.up.railway.app`;
            console.log('[Railway] Using fallback URL:', fallbackUrl);
            
            return {
                projectId: projectName,
                serviceId: projectName,
                deploymentUrl: fallbackUrl
            };
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