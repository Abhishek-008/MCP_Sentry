# apps/gateway/Dockerfile

# 1. Base Image
FROM node:20-bookworm

# 2. Install System Dependencies (Python, Build Tools for C++)
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

# 4. Install PNPM (The Missing Piece) <--- NEW
RUN npm install -g pnpm

# 5. Set Working Directory
WORKDIR /app

# 6. Dependencies
COPY package.json tsconfig.json ./
# Use npm install (or pnpm install if you prefer, but npm works with the lockfile you have)
RUN npm install

# 7. Source Code
COPY src ./src

# 8. Build
RUN npm run build

# 9. Create Cache Directory
RUN mkdir -p runtime_cache

# 10. Env & Start
ENV PYTHONUNBUFFERED=1
ENV PORT=8000
EXPOSE 8000

# Force the start command to use Node directly (Bypassing pnpm scripts just in case)
CMD ["node", "dist/index.js"]