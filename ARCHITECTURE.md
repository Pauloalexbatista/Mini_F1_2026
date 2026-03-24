# MINI F1 2026 - ARCHITECTURE & INFRASTRUCTURE

## 1. Database Persistence (`SQLite` + `Docker` + `Coolify`)
The backend is powered by Node.js and an SQLite database. It is critical to understand the environment logic to prevent data loss.

### The Problem with Ephemeral Containers
In a Docker/Coolify environment, clicking "Force Rebuild" destroys the current container and replacing it with a fresh one from the GitHub repository. If the SQLite database file is stored within the standard application directory (e.g. `/app/server`), it will be **permanently deleted** during every rebuild.

### The Persistent Volume Solution
To solve this, the application has been hardcoded in `server/database.js` to look for a designated safe folder when running in production:
\`\`\`javascript
const COOLIFY_VOLUME_PATH = '/app/server_data';
const isCoolify = fs.existsSync(COOLIFY_VOLUME_PATH) || process.env.NODE_ENV === 'production';
const dbFolder = isCoolify ? COOLIFY_VOLUME_PATH : __dirname;
\`\`\`

**MANDATORY COOLIFY CONFIGURATION:**
For this to work, a **Persistent Volume** must be explicitly mapped in the Coolify Dashboard:
1. Go to the App in Coolify -> **Persistent Volumes** (Storages)
2. Add a new volume.
3. Destination / Path inside container: `/app/server_data`
4. Save and Force Redeploy.

Once this is mapped, the container writes the database to the host machine's physical disk, allowing it to survive rebuilds perfectly.

### Development Environment (Vite Proxy)
In the local development environment (`npm run dev`), the `vite.config.ts` proxies all `/api` traffic directly to the production server (`https://minif12026.online`). 
- **Consequence:** Creating or fetching tracks locally will actively read/write to the **production database**.
- **Exception:** WebSockets (`socket.io`) are NOT proxied, meaning local racing telemetry runs exclusively on `localhost:3000`.

## 2. Version Control Segregation
The SQLite database files MUST NEVER be tracked in Git.
- `server/database.sqlite`
- `server/database.sqlite-shm`
- `server/database.sqlite-wal`
These are included in `.gitignore`. If they are tracked, a Git commit could inadvertently pull a local database into the production Docker image, overwriting the server's state upon deployment.

## 3. Track Generation & Spline Interpolation
Tracks are drawn in the Track Builder Studio using SVG Polylines (`M ... L ...`).
When tracks are loaded from the database, they pass through:
1. `parseStudioToNodes()`: Extracts the `M` and `L` coordinates.
2. `computeSpline()`: Applies a Catmull-Rom spline interpolation, generating points every 20 pixels.
This dense array of nodes is crucial for the physics engine to calculate Voronoi wall distances and apex tight-zones correctly. Without `computeSpline`, tracks lack physics and render as malformed, low-poly shapes.
