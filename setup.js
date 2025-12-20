#!/usr/bin/env node

/**
 * Quick Start Setup Script
 * Helps configure MCP Sentry for cloud deployment
 */

const readline = require('readline');
const fs = require('fs');
const path = require('path');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    red: '\x1b[31m',
    cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
    console.log(`${colors[color]}${message}${colors.reset}`);
}

function question(query) {
    return new Promise(resolve => rl.question(query, resolve));
}

async function main() {
    console.clear();
    log('╔════════════════════════════════════════════════════════╗', 'cyan');
    log('║         MCP Sentry - Quick Start Setup                ║', 'cyan');
    log('║  Cloud Deployment Configuration for MCP Servers       ║', 'cyan');
    log('╚════════════════════════════════════════════════════════╝', 'cyan');
    log('');

    // Welcome
    log('This script will help you configure MCP Sentry for cloud deployment.', 'bright');
    log('You\'ll need:', 'yellow');
    log('  • Railway account (free tier available)');
    log('  • Supabase project (free tier available)');
    log('  • GitHub repository for this project');
    log('');

    const proceed = await question('Ready to start? (y/n): ');
    if (proceed.toLowerCase() !== 'y') {
        log('Setup cancelled.', 'yellow');
        rl.close();
        return;
    }

    log('');
    log('═══════════════════════════════════════════════════════', 'blue');
    log(' Step 1: Railway Configuration', 'bright');
    log('═══════════════════════════════════════════════════════', 'blue');
    log('');

    log('1. Go to https://railway.app and create an account', 'yellow');
    log('2. Navigate to Account → Tokens', 'yellow');
    log('3. Create a new API token', 'yellow');
    log('');

    const railwayToken = await question('Enter your Railway API token: ');

    log('');
    log('═══════════════════════════════════════════════════════', 'blue');
    log(' Step 2: Supabase Configuration', 'bright');
    log('═══════════════════════════════════════════════════════', 'blue');
    log('');

    log('1. Go to https://supabase.com and create a project', 'yellow');
    log('2. Go to Settings → API', 'yellow');
    log('');

    const supabaseUrl = await question('Enter your Supabase Project URL: ');
    const supabaseAnonKey = await question('Enter your Supabase Anon Key: ');
    const supabaseServiceKey = await question('Enter your Supabase Service Role Key: ');

    log('');
    log('═══════════════════════════════════════════════════════', 'blue');
    log(' Step 3: GitHub Configuration', 'bright');
    log('═══════════════════════════════════════════════════════', 'blue');
    log('');

    log('1. Create a GitHub Personal Access Token:', 'yellow');
    log('   https://github.com/settings/tokens/new', 'yellow');
    log('   Required scopes: repo, workflow', 'yellow');
    log('');

    const githubRepo = await question('Enter your GitHub repository (owner/repo): ');
    const githubPat = await question('Enter your GitHub PAT: ');

    log('');
    log('═══════════════════════════════════════════════════════', 'blue');
    log(' Step 4: Database Setup', 'bright');
    log('═══════════════════════════════════════════════════════', 'blue');
    log('');

    log('Run this SQL in Supabase SQL Editor:', 'yellow');
    log('');
    log('ALTER TABLE tools ADD COLUMN IF NOT EXISTS deployment_url TEXT;', 'cyan');
    log('CREATE INDEX IF NOT EXISTS idx_tools_deployment_url ON tools(deployment_url);', 'cyan');
    log('');

    const dbMigrated = await question('Have you run the migration? (y/n): ');
    
    if (dbMigrated.toLowerCase() !== 'y') {
        log('Please run the database migration first!', 'red');
        log('See scripts/migrations/add_deployment_url.sql', 'yellow');
        rl.close();
        return;
    }

    log('');
    log('═══════════════════════════════════════════════════════', 'blue');
    log(' Generating Configuration Files...', 'bright');
    log('═══════════════════════════════════════════════════════', 'blue');
    log('');

    // Create .env file
    const envContent = `# Railway Configuration
RAILWAY_API_TOKEN=${railwayToken}

# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=${supabaseUrl}
NEXT_PUBLIC_SUPABASE_ANON_KEY=${supabaseAnonKey}
SUPABASE_SERVICE_ROLE_KEY=${supabaseServiceKey}

# GitHub Configuration
GITHUB_PLATFORM_REPO=${githubRepo}
GITHUB_PAT=${githubPat}
`;

    try {
        fs.writeFileSync('.env', envContent);
        log('✅ Created .env file', 'green');
    } catch (error) {
        log('❌ Failed to create .env file', 'red');
        log(`Error: ${error.message}`, 'red');
    }

    // Create platform .env.local
    const platformEnvContent = `NEXT_PUBLIC_SUPABASE_URL=${supabaseUrl}
NEXT_PUBLIC_SUPABASE_ANON_KEY=${supabaseAnonKey}
SUPABASE_SERVICE_ROLE_KEY=${supabaseServiceKey}
GITHUB_PLATFORM_REPO=${githubRepo}
GITHUB_PAT=${githubPat}
`;

    try {
        const platformEnvPath = path.join('apps', 'platform', '.env.local');
        fs.writeFileSync(platformEnvPath, platformEnvContent);
        log('✅ Created apps/platform/.env.local', 'green');
    } catch (error) {
        log('❌ Failed to create platform env file', 'red');
    }

    log('');
    log('═══════════════════════════════════════════════════════', 'blue');
    log(' GitHub Secrets Setup', 'bright');
    log('═══════════════════════════════════════════════════════', 'blue');
    log('');

    log('Add these secrets to your GitHub repository:', 'yellow');
    log(`  Settings → Secrets and variables → Actions → New repository secret`, 'yellow');
    log('');

    const secrets = [
        { name: 'RAILWAY_API_TOKEN', value: railwayToken },
        { name: 'NEXT_PUBLIC_SUPABASE_URL', value: supabaseUrl },
        { name: 'SUPABASE_SERVICE_ROLE_KEY', value: supabaseServiceKey },
        { name: 'GITHUB_PLATFORM_REPO', value: githubRepo },
        { name: 'GITHUB_PAT', value: githubPat }
    ];

    secrets.forEach(secret => {
        log(`  ${secret.name}`, 'cyan');
    });

    log('');
    log('Copy these values from above or from your .env file.', 'yellow');
    log('');

    const githubSecretsSet = await question('Have you added all GitHub secrets? (y/n): ');

    log('');
    log('═══════════════════════════════════════════════════════', 'green');
    log(' 🎉 Setup Complete!', 'bright');
    log('═══════════════════════════════════════════════════════', 'green');
    log('');

    log('Next Steps:', 'bright');
    log('');
    log('1. Install dependencies:', 'yellow');
    log('   pnpm install', 'cyan');
    log('');
    log('2. Start the development server:', 'yellow');
    log('   pnpm dev', 'cyan');
    log('');
    log('3. Open http://localhost:3000', 'yellow');
    log('');
    log('4. Sign up and deploy your first MCP server!', 'yellow');
    log('');
    log('📚 Documentation:', 'bright');
    log('   • Setup Guide: SETUP_CHECKLIST.md', 'cyan');
    log('   • Usage Examples: USAGE_EXAMPLES.md', 'cyan');
    log('   • Architecture: ARCHITECTURE.md', 'cyan');
    log('');

    if (githubSecretsSet.toLowerCase() !== 'y') {
        log('⚠️  Don\'t forget to add GitHub secrets before deploying!', 'yellow');
        log('');
    }

    rl.close();
}

main().catch(error => {
    log(`Fatal error: ${error.message}`, 'red');
    rl.close();
    process.exit(1);
});
