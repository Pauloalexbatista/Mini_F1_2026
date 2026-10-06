import { io, Socket } from 'socket.io-client';

// The Vite frontend typically runs on 5173, but we want to connect to the backend API port 3000
// Or if deployed, it connects to the same origin.
const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' || /^192\.168\./.test(window.location.hostname) || /^10\./.test(window.location.hostname);
const SOCKET_URL = isLocal ? `http://${window.location.hostname}:3000` : '/';

export const socket: Socket = io(SOCKET_URL, {
  autoConnect: false, // We will connect manually when authenticated
});
