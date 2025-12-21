# apps/gateway/Dockerfile

# 1. Base Image
FROM node:20-bookworm

# 2. Install System Dependencies
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    python3-venv \
    python3-dev \
    build-essential \
    curl \
    git \
    && rm -rf /var/lib/apt/lists/*

# 3. Install 'uv'
RUN curl -LsSf https://astral.sh/uv/install.sh | sh
ENV PATH="/root/.local/bin:${PATH}"

# 4. Install Global Tools
RUN npm install -g pnpm typescript ts-node

# 5. Set Working Directory
WORKDIR /app

# 6. Dependencies
COPY package.json ./
# We install devDependencies too (false flag) just to ensure 'tsc' works
RUN npm install --include=dev

# 7. Source Code
COPY src ./src

# 8. FORCE BUILD (The Fix)
# Instead of relying on your local tsconfig, we generate a known-good one
# that guarantees output to /app/dist
RUN echo '{"compilerOptions":{"target":"es2020","module":"commonjs","outDir":"./dist","rootDir":"./src","strict":true,"esModuleInterop":true,"skipLibCheck":true,"forceConsistentCasingInFileNames":true}}' > tsconfig.docker.json

# 9. Run Compilation using the custom config
RUN npx tsc -p tsconfig.docker.json

# 10. Debug Step: Verify the file exists (This will show in build logs if it fails)
RUN ls -la dist/

# 11. Create Cache Directory
RUN mkdir -p runtime_cache

# 12. Env & Start
ENV PYTHONUNBUFFERED=1
ENV PORT=8000
EXPOSE 8000

# 13. Start Command
CMD ["node", "dist/index.js"]