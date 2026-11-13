import {
  ROOM_MAX_PLAYERS,
  WS_STATE_SEND_INTERVAL_MS,
  parseServerMessage,
  type ClientPlayerPayload,
  type ClientToServerMessage,
  type MultiplayerRoomStatus,
  type RemotePeerState,
  type ServerToClientMessage,
} from '../shared/multiplayerProtocol.ts';
import type { WishYuzuItem } from './ritualMath.ts';

const KEEPALIVE_STATE_INTERVAL_MS = 5000;
const RECONNECT_BASE_MS = 1800;
const RECONNECT_MAX_MS = 12_000;

export type RoomSnapshotMessage = Extract<
  ServerToClientMessage,
  { type: 'room_snapshot' }
>;

export interface MultiplayerClientCallbacks {
  getInitialState: () => ClientPlayerPayload;
  onStatusChange: (status: MultiplayerRoomStatus) => void;
  onRoomSnapshot: (snapshot: RoomSnapshotMessage) => void;
  onPeerUpdate: (peer: RemotePeerState) => void;
  onPeerLeave: (peerId: string) => void;
  onRemoteWishAdd: (wish: WishYuzuItem, fromPeerId: string) => void;
  onRemoteFireStoke: (fromPeerId: string, fireCount: number) => void;
  onRemoteBambooRing: (fromPeerId: string) => void;
  onRemoteMilkGift: (fromPeerId: string, targetPeerId?: string) => void;
}

export function resolveWebSocketUrl(): string | null {
  if (typeof window === 'undefined' || !window.location) {
    return null;
  }
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}/ws`;
}

function statesEqual(a: ClientPlayerPayload, b: ClientPlayerPayload): boolean {
  return (
    a.coatId === b.coatId &&
    a.actionMode === b.actionMode &&
    a.hasHeadYuzu === b.hasHeadYuzu &&
    a.carryingFirewood === b.carryingFirewood &&
    Math.abs(a.x - b.x) < 0.015 &&
    Math.abs(a.y - b.y) < 0.015 &&
    Math.abs(a.z - b.z) < 0.015 &&
    Math.abs(a.heading - b.heading) < 0.015 &&
    Math.abs(a.moveSpeed - b.moveSpeed) < 0.05
  );
}

export class OnsenMultiplayerClient {
  private readonly callbacks: MultiplayerClientCallbacks;
  private socket: WebSocket | null = null;
  private reconnectTimer: number | null = null;
  private disposed = false;
  private reconnectAttempt = 0;

  private lastSentAt = 0;
  private lastSentState: ClientPlayerPayload | null = null;

  private activePeerIds = new Set<string>();
  private status: MultiplayerRoomStatus = {
    state: 'offline',
    roomId: null,
    roomNumber: null,
    peerCount: 1,
    maxPeers: ROOM_MAX_PLAYERS,
    selfId: null,
  };

  constructor(callbacks: MultiplayerClientCallbacks) {
    this.callbacks = callbacks;
  }

  public getStatus(): MultiplayerRoomStatus {
    return { ...this.status };
  }

  public start(): void {
    if (this.disposed) return;
    this.connect(true);
  }

  private emitStatus(next: Partial<MultiplayerRoomStatus>): void {
    this.status = {
      ...this.status,
      ...next,
      peerCount:
        next.state === 'connected' || this.status.state === 'connected'
          ? 1 + this.activePeerIds.size
          : 1,
    };
    this.callbacks.onStatusChange(this.getStatus());
  }

  private connect(isInitial: boolean): void {
    if (this.disposed) return;
    const url = resolveWebSocketUrl();
    if (!url || typeof WebSocket === 'undefined') {
      this.emitStatus({ state: 'offline', roomId: null, roomNumber: null, selfId: null });
      return;
    }

    if (this.socket) {
      try {
        this.socket.close();
      } catch {
        // Ignore close errors during reconnect
      }
      this.socket = null;
    }

    if (isInitial) {
      this.emitStatus({ state: 'connecting' });
    }

    let ws: WebSocket;
    try {
      ws = new WebSocket(url);
    } catch {
      this.scheduleReconnect();
      return;
    }

    this.socket = ws;

    ws.onopen = () => {
      if (this.disposed || this.socket !== ws) return;
      this.reconnectAttempt = 0;
      const initial = this.callbacks.getInitialState();
      this.sendRaw({ type: 'hello', state: initial });
      this.lastSentState = { ...initial };
      this.lastSentAt = Date.now();
    };

    ws.onmessage = (event) => {
      if (this.disposed || this.socket !== ws || typeof event.data !== 'string') {
        return;
      }
      const message = parseServerMessage(event.data);
      if (!message) return;
      this.handleServerMessage(message);
    };

    ws.onclose = () => {
      if (this.socket !== ws) return;
      this.socket = null;
      this.activePeerIds.clear();
      this.emitStatus({
        state: 'offline',
        roomId: null,
        roomNumber: null,
        selfId: null,
      });
      this.scheduleReconnect();
    };

    ws.onerror = () => {
      // onclose will run right after and transition cleanly to offline + retry
    };
  }

  private scheduleReconnect(): void {
    if (this.disposed || this.reconnectTimer !== null) return;
    const delay = Math.min(
      RECONNECT_MAX_MS,
      Math.round(RECONNECT_BASE_MS * Math.pow(1.6, this.reconnectAttempt)),
    );
    this.reconnectAttempt += 1;
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null;
      this.connect(false);
    }, delay);
  }

  private handleServerMessage(message: ServerToClientMessage): void {
    switch (message.type) {
      case 'room_snapshot': {
        this.activePeerIds.clear();
        for (const peer of message.peers) {
          if (peer.id !== message.selfId) {
            this.activePeerIds.add(peer.id);
          }
        }
        this.emitStatus({
          state: 'connected',
          roomId: message.roomId,
          roomNumber: message.roomNumber,
          maxPeers: message.maxPeers,
          selfId: message.selfId,
        });
        this.callbacks.onRoomSnapshot(message);
        break;
      }
      case 'peer_update': {
        if (message.peer.id === this.status.selfId) return;
        const isNew = !this.activePeerIds.has(message.peer.id);
        this.activePeerIds.add(message.peer.id);
        if (isNew) {
          this.emitStatus({});
        }
        this.callbacks.onPeerUpdate(message.peer);
        break;
      }
      case 'peer_leave': {
        if (this.activePeerIds.delete(message.peerId)) {
          this.emitStatus({});
        }
        this.callbacks.onPeerLeave(message.peerId);
        break;
      }
      case 'yuzu_add': {
        if (message.fromPeerId !== this.status.selfId) {
          this.callbacks.onRemoteWishAdd(message.wish, message.fromPeerId);
        }
        break;
      }
      case 'fire_stoke': {
        if (message.fromPeerId !== this.status.selfId) {
          this.callbacks.onRemoteFireStoke(
            message.fromPeerId,
            message.fireCount,
          );
        }
        break;
      }
      case 'bamboo_ring': {
        if (message.fromPeerId !== this.status.selfId) {
          this.callbacks.onRemoteBambooRing(message.fromPeerId);
        }
        break;
      }
      case 'milk_gift': {
        if (message.fromPeerId !== this.status.selfId) {
          this.callbacks.onRemoteMilkGift(
            message.fromPeerId,
            message.targetPeerId,
          );
        }
        break;
      }
    }
  }

  private sendRaw(message: ClientToServerMessage): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return;
    this.socket.send(JSON.stringify(message));
  }

  public sendState(
    nextState: ClientPlayerPayload,
    now: number = Date.now(),
    force: boolean = false,
  ): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return;
    const elapsed = now - this.lastSentAt;
    if (!force && elapsed < WS_STATE_SEND_INTERVAL_MS) return;

    const changed =
      !this.lastSentState || !statesEqual(this.lastSentState, nextState);
    if (!force && !changed && elapsed < KEEPALIVE_STATE_INTERVAL_MS) return;

    this.lastSentAt = now;
    this.lastSentState = { ...nextState };
    this.sendRaw({ type: 'state', state: nextState });
  }

  public sendWishAdd(wish: WishYuzuItem): void {
    this.sendRaw({ type: 'yuzu_add', wish });
  }

  public sendFireStoke(): void {
    this.sendRaw({ type: 'fire_stoke' });
  }

  public sendBambooRing(): void {
    this.sendRaw({ type: 'bamboo_ring' });
  }

  public sendMilkGift(targetPeerId?: string): void {
    this.sendRaw({ type: 'milk_gift', targetPeerId });
  }

  public dispose(): void {
    this.disposed = true;
    if (this.reconnectTimer !== null) {
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.activePeerIds.clear();
    if (this.socket) {
      this.socket.onopen = null;
      this.socket.onmessage = null;
      this.socket.onclose = null;
      this.socket.onerror = null;
      try {
        this.socket.close();
      } catch {
        // Ignore close errors on unmount
      }
      this.socket = null;
    }
  }
}
