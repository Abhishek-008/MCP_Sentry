/**
 * Dockerfile Generator for MCP Servers
 * Detects project type and generates appropriate Dockerfile
 */

import fs from 'fs';
import path from 'path';

export function generateDockerfile(projectPath: string, startCommand: string): string {
    const isNode = fs.existsSync(path.join(projectPath, 'package.json'));
    const isPython = fs.existsSync(path.join(projectPath, 'pyproject.toml')) ||
                     fs.existsSync(path.join(projectPath, 'requirements.txt'));
    const hasPnpmLock = fs.existsSync(path.join(projectPath, 'pnpm-lock.yaml'));
    const hasUvLock = fs.existsSync(path.join(projectPath, 'uv.lock'));

    if (isNode) {
        return generateNodeDockerfile(startCommand, hasPnpmLock);
    } else if (isPython) {
        return generatePythonDockerfile(startCommand, hasUvLock, projectPath);
    } else {
        throw new Error('Unknown project type - cannot generate Dockerfile');
    }
}

function generateNodeDockerfile(startCommand: string, usePnpm: boolean): string {
    const packageManager = usePnpm ? 'pnpm' : 'npm';
    
    return `# Node.js MCP Server
FROM node:20-slim

WORKDIR /app

# Copy package files
COPY package*.json ./
${usePnpm ? 'COPY pnpm-lock.yaml ./' : ''}

# Install dependencies
${usePnpm ? `RUN npm install -g pnpm && pnpm install --prod` : `RUN npm install --production`}

# Copy source code
COPY . .

# Build if necessary
RUN if [ -f "tsconfig.json" ]; then ${usePnpm ? 'pnpm' : 'npm'} run build || true; fi

# Copy HTTP wrapper if it exists, otherwise expect compiled code
RUN if [ ! -f "mcp-http-wrapper.js" ]; then echo "Wrapper not found, will use direct start command"; fi

# Expose port
EXPOSE 3000

# Set start command as environment variable
ENV START_COMMAND="${startCommand}"
ENV NODE_ENV=production
ENV LOG_LEVEL=debug

# Try to start with wrapper if it exists, otherwise run start command directly
CMD if [ -f "mcp-http-wrapper.js" ]; then node mcp-http-wrapper.js; else sh -c "$START_COMMAND"; fi
`;
}

function generatePythonDockerfile(startCommand: string, useUv: boolean, projectPath: string): string {
    const hasRequirements = fs.existsSync(path.join(projectPath, 'requirements.txt'));
    const hasPyproject = fs.existsSync(path.join(projectPath, 'pyproject.toml'));
    
    return `# Python MCP Server
FROM python:3.11-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \\
    git \\
    && rm -rf /var/lib/apt/lists/*

# Copy dependency files
${hasRequirements ? 'COPY requirements.txt ./' : ''}
${hasPyproject ? 'COPY pyproject.toml ./' : ''}
${useUv ? 'COPY uv.lock ./' : ''}

# Install Python dependencies
${useUv ? `
RUN pip install --no-cache-dir uv && \\
    uv sync
` : `
RUN pip install --no-cache-dir --upgrade pip
${hasRequirements ? 'RUN pip install --no-cache-dir -r requirements.txt' : ''}
${hasPyproject ? 'RUN pip install --no-cache-dir .' : ''}
`}

# Copy source code
COPY . .

# Install project in editable mode if pyproject.toml exists
${hasPyproject && !useUv ? 'RUN pip install --no-cache-dir -e .' : ''}

# Copy HTTP wrapper (compiled from TypeScript)
COPY mcp-http-wrapper.js ./

# Install Node.js to run the wrapper
RUN apt-get update && apt-get install -y nodejs npm && rm -rf /var/lib/apt/lists/*

# Expose port
EXPOSE 3000

# Set start command as environment variable
ENV START_COMMAND="${startCommand}"
ENV PYTHONUNBUFFERED=1
ENV LOG_LEVEL=debug

# Try to start with wrapper if it exists, otherwise run start command directly
CMD if [ -f "mcp-http-wrapper.js" ]; then node mcp-http-wrapper.js; else sh -c "$START_COMMAND"; fi
`;
}

export function saveDockerfile(projectPath: string, content: string): void {
    fs.writeFileSync(path.join(projectPath, 'Dockerfile'), content);
    console.log('[Dockerfile] Generated successfully');
}
