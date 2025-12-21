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
RUN npm install --include=dev

# 7. Source Code
COPY src ./src

# 8. FORCE BUILD (THE FIX IS HERE)
# We changed "module" from "commonjs" to "nodenext" to match "type": "module" in package.json
RUN echo '{"compilerOptions":{"target":"es2020","module":"nodenext","moduleResolution":"nodenext","outDir":"./dist","rootDir":"./src","strict":true,"esModuleInterop":true,"skipLibCheck":true,"forceConsistentCasingInFileNames":true}}' > tsconfig.docker.json

# 9. Run Compilation
RUN npx tsc -p tsconfig.docker.json

# 10. Verify Build
RUN ls -la dist/

# 11. Runtime Cache
RUN mkdir -p runtime_cache

# 12. Env & Start
ENV PYTHONUNBUFFERED=1
ENV PORT=8000
EXPOSE 8000

# 13. Start Command
CMD ["node", "dist/index.js"]