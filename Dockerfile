FROM node:20-bookworm

WORKDIR /app

# Copy dependency files first to maximize Docker layer caching
COPY package.json package-lock.json* ./

# Explicitly install all dependencies (including devDependencies required for vite build)
RUN npm ci

# Copy the rest of the engine logic and frontend assets
COPY . .

# Build the Vite React Application into the /dist folder
RUN npm run build

# Securely expose the unified server port
EXPOSE 3001

# Start the Node.js API which also acts as the Frontend file server
CMD ["npm", "start"]
