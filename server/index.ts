import express from 'express';
import { existsSync } from 'node:fs';
import { createServer, type IncomingMessage } from 'node:http';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocket, WebSocketServer } from 'ws';
import {
  REMOTE_PEER_STALE_MS,
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
const MAX_WS_BUFFERED_BYTES = 256 * 1024;
const MAX_CONNECTIONS_PER_IP = 5;

const allowedOriginsEnv = new Set(
  (process.env.ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean),
);

function isOriginAllowed(
  origin: string | undefined,
  hostHeader: string | undefined,
): boolean {
  if (!origin) return true;
  let parsed: URL;
  try {
    parsed = new URL(origin);
  } catch {
    return false;
  }

  if (allowedOriginsEnv.has(parsed.origin.toLowerCase())) {
    return true;
  }

  const hostname = parsed.hostname.toLowerCase();
  if (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '::1' ||
    hostname === '[::1]'
  ) {
    return true;
  }

  if (hostHeader && parsed.host.toLowerCase() === hostHeader.toLowerCase()) {
    return true;
  }

  return false;
}

function getClientIp(req: IncomingMessage): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim()) {
    return forwarded.split(',')[0].trim();
  }
  if (Array.isArray(forwarded) && forwarded.length > 0 && forwarded[0].trim()) {
    return forwarded[0].split(',')[0].trim();
  }
  return req.socket.remoteAddress ?? 'unknown';
}

function parseRequestedRoomId(url: string | undefined): string | undefined {
  if (!url) return undefined;
  try {
    const parsed = new URL(url, 'http://localhost');
    return parsed.searchParams.get('room') ?? undefined;
  } catch {
    return undefined;
  }
}

const app = express();
const server = createServer(app);
const roomManager = new RoomManager();
const activeConnectionsByIp = new Map<string, number>();
const serializedMessageCache = new WeakMap<ServerToClientMessage, string>();

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
  verifyClient: (info: { origin: string; secure: boolean; req: IncomingMessage }) =>
    isOriginAllowed(info.req.headers.origin, info.req.headers.host),
});

function serializeServerMessage(message: ServerToClientMessage): string {
  let cached = serializedMessageCache.get(message);
  if (cached === undefined) {
    cached = JSON.stringify(message);
    serializedMessageCache.set(message, cached);
  }
  return cached;
}

function safeSend(ws: WebSocket, message: ServerToClientMessage): void {
  if (ws.readyState !== WebSocket.OPEN) return;
  if (
    message.type === 'peer_update' &&
    ws.bufferedAmount > MAX_WS_BUFFERED_BYTES
  ) {
    return;
  }
  ws.send(serializeServerMessage(message));
}

wss.on('connection', (socket: AliveWebSocket, req: IncomingMessage) => {
  const clientIp = getClientIp(req);
  const currentIpCount = activeConnectionsByIp.get(clientIp) ?? 0;
  if (currentIpCount >= MAX_CONNECTIONS_PER_IP) {
    socket.close(1008, 'Too many connections from this IP');
    return;
  }
  activeConnectionsByIp.set(clientIp, currentIpCount + 1);

  socket.isAlive = true;

  const requestedRoomId = parseRequestedRoomId(req.url);
  const { peerId, roomId } = roomManager.joinPeer(
    (msg) => {
      safeSend(socket, msg);
    },
    undefined,
    Date.now(),
    requestedRoomId,
  );

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

  let cleanedUp = false;
  const cleanup = () => {
    if (cleanedUp) return;
    cleanedUp = true;

    const remaining = (activeConnectionsByIp.get(clientIp) ?? 1) - 1;
    if (remaining <= 0) {
      activeConnectionsByIp.delete(clientIp);
    } else {
      activeConnectionsByIp.set(clientIp, remaining);
    }

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

  const pruned = roomManager.pruneStalePeers(REMOTE_PEER_STALE_MS * 3);
  if (pruned.length > 0) {
    console.log(`[ws] pruned ${pruned.length} stale peer(s): ${pruned.join(', ')}`);
  }
}, HEARTBEAT_INTERVAL_MS);

heartbeatTimer.unref();

wss.on('close', () => {
  clearInterval(heartbeatTimer);
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[onsen-ws] listening on http://0.0.0.0:${PORT} (ws path: /ws)`);
});
