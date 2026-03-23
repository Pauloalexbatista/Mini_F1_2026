import { io, Socket } from 'socket.io-client';

// The Vite frontend typically runs on 5173, but we want to connect to the backend API port 3000
// Or if deployed, it connects to the same origin.
const SOCKET_URL = window.location.hostname === 'localhost' ? 'http://localhost:3000' : '/';

export const socket: Socket = io(SOCKET_URL, {
  autoConnect: false, // We will connect manually when authenticated
});
