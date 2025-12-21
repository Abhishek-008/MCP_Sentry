# apps/gateway/Dockerfile

# 1. Base Image: Node 20 on Debian (Stable Linux)
FROM node:20-bookworm

# 2. Install System Dependencies
# - python3-full: Includes venv and dev headers
# - build-essential: GCC/Make for compiling C++ extensions (fixes pyroaring/pandas)
# - git: For cloning tools
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    python3-venv \
    python3-dev \
    build-essential \
    curl \
    git \
    && rm -rf /var/lib/apt/lists/*

# 3. Install 'uv' (The fast Python manager we use)
RUN curl -LsSf https://astral.sh/uv/install.sh | sh
ENV PATH="/root/.local/bin:${PATH}"

# 4. Set Working Directory
WORKDIR /app

# 5. Dependencies
# Copy package files first to cache dependencies
COPY package.json tsconfig.json ./
RUN npm install

# 6. Source Code
COPY src ./src

# 7. Build TypeScript
RUN npm run build

# 8. Create Cache Directory
# We explicitly create this so permissions are correct
RUN mkdir -p runtime_cache

# 9. Environment Variables
# Force Python to be unbuffered (logs show up instantly)
ENV PYTHONUNBUFFERED=1
ENV PORT=8000

# 10. Start
EXPOSE 8000
CMD ["node", "dist/index.js"]