FROM node:20-bookworm

WORKDIR /app

# Copy dependency files first to maximize Docker layer caching
COPY package.json package-lock.json* ./

# Install Python and Build Tools required for node-gyp native compilation
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

# Explicitly install all dependencies and FORCE SQLite to compile from C++ source code!
# This completely bypasses the pre-built GLIBC 2.38 binary mismatch error.
RUN npm install --build-from-source=sqlite3

# Copy the rest of the engine logic and frontend assets
COPY . .

# Build the Vite React Application into the /dist folder
RUN npm run build

# Securely expose the unified server port
EXPOSE 3001

# Start the Node.js API which also acts as the Frontend file server
CMD ["npm", "start"]
