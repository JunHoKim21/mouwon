import express from 'express';
import { existsSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocket, WebSocketServer } from 'ws';
import {
  parseClientMessage,
  type ServerToClientMessage,
} from '../src/shared/multiplayerProtocol.ts';
import { RoomManager } from './roomManager.ts';

interface AliveWebSocket extends WebSocket {
  isAlive?: boolean;
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, '..');
const distDir = resolve(projectRoot, 'dist');
const distIndex = resolve(distDir, 'index.html');

const PORT = Number(process.env.PORT ?? process.env.WS_PORT ?? 3001);
const HEARTBEAT_INTERVAL_MS = 30_000;
const MAX_WS_PAYLOAD_BYTES = 8 * 1024;

const app = express();
const server = createServer(app);
const roomManager = new RoomManager();

app.get('/health', (_req, res) => {
  res.json({
    ok: true,
    totalPeers: roomManager.getPeerCount(),
    rooms: roomManager.getRoomSummaries(),
  });
});

if (existsSync(distIndex)) {
  app.use(express.static(distDir));
  app.get('*', (_req, res) => {
    res.sendFile(distIndex);
  });
}

const wss = new WebSocketServer({
  server,
  path: '/ws',
  maxPayload: MAX_WS_PAYLOAD_BYTES,
});

function safeSend(ws: WebSocket, message: ServerToClientMessage): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(message));
  }
}

wss.on('connection', (socket: AliveWebSocket) => {
  socket.isAlive = true;

  const { peerId, roomId } = roomManager.joinPeer((msg) => {
    safeSend(socket, msg);
  });

  console.log(
    `[ws] ${peerId} joined ${roomId} (total=${roomManager.getPeerCount()})`,
  );

  socket.on('pong', () => {
    socket.isAlive = true;
  });

  socket.on('message', (data, isBinary) => {
    if (isBinary) return;
    const raw =
      typeof data === 'string' ? data : Buffer.from(data as Buffer).toString('utf8');
    const parsed = parseClientMessage(raw);
    if (!parsed) return;
    roomManager.handleMessage(peerId, parsed);
  });

  const cleanup = () => {
    if (roomManager.leavePeer(peerId)) {
      console.log(
        `[ws] ${peerId} left ${roomId} (total=${roomManager.getPeerCount()})`,
      );
    }
  };

  socket.on('close', cleanup);
  socket.on('error', (err) => {
    console.warn(`[ws] socket error for ${peerId}:`, err.message);
    cleanup();
  });
});

const heartbeatTimer = setInterval(() => {
  for (const client of wss.clients) {
    const socket = client as AliveWebSocket;
    if (socket.isAlive === false) {
      socket.terminate();
      continue;
    }
    socket.isAlive = false;
    socket.ping();
  }
}, HEARTBEAT_INTERVAL_MS);

heartbeatTimer.unref();

wss.on('close', () => {
  clearInterval(heartbeatTimer);
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[onsen-ws] listening on http://0.0.0.0:${PORT} (ws path: /ws)`);
});
