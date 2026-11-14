import {
  MAX_ROOM_YUZUS,
  ROOM_MAX_PLAYERS,
  type ClientPlayerPayload,
  type ClientToServerMessage,
  type RemotePeerState,
  type ServerToClientMessage,
} from '../src/shared/multiplayerProtocol.ts';
import {
  INITIAL_WISH_YUZUS,
  type WishYuzuItem,
} from '../src/world/ritualMath.ts';

export type SendMessageFn = (message: ServerToClientMessage) => void;

interface PeerSession {
  id: string;
  roomId: string;
  state: RemotePeerState;
  send: SendMessageFn;
  lastSeenAt: number;
}

interface RoomState {
  id: string;
  number: number;
  peers: Map<string, PeerSession>;
  wishes: WishYuzuItem[];
  fireCount: number;
}

export interface RoomSummary {
  roomId: string;
  roomNumber: number;
  peerCount: number;
  maxPeers: number;
}

const DEFAULT_INITIAL_STATE: ClientPlayerPayload = {
  coatId: 'cheese',
  x: 0,
  y: 0,
  z: 38,
  heading: Math.PI,
  actionMode: 'idle',
  moveSpeed: 0,
  hasHeadYuzu: false,
  carryingFirewood: false,
  heldMilkId: null,
};

export class RoomManager {
  private readonly maxPlayers: number;
  private readonly maxYuzus: number;
  private readonly rooms = new Map<string, RoomState>();
  private readonly peerRoomIndex = new Map<string, string>();
  private nextPeerSeq = 1;

  constructor(
    maxPlayers: number = ROOM_MAX_PLAYERS,
    maxYuzus: number = MAX_ROOM_YUZUS,
  ) {
    this.maxPlayers = Math.max(1, Math.floor(maxPlayers));
    this.maxYuzus = Math.max(1, Math.floor(maxYuzus));
  }

  /**
   * Finds the lowest-numbered room with open capacity, or creates a new room.
   */
  private acquireAvailableRoom(): RoomState {
    let roomNumber = 1;
    while (true) {
      const roomId = `room-${roomNumber}`;
      const existing = this.rooms.get(roomId);
      if (!existing) {
        const created: RoomState = {
          id: roomId,
          number: roomNumber,
          peers: new Map(),
          wishes: INITIAL_WISH_YUZUS.map((w) => ({ ...w })),
          fireCount: 0,
        };
        this.rooms.set(roomId, created);
        return created;
      }
      if (existing.peers.size < this.maxPlayers) {
        return existing;
      }
      roomNumber += 1;
    }
  }

  private broadcastToRoom(
    room: RoomState,
    message: ServerToClientMessage,
    excludePeerId?: string,
  ): void {
    for (const peer of room.peers.values()) {
      if (peer.id !== excludePeerId) {
        peer.send(message);
      }
    }
  }

  private sendToPeerInRoom(
    room: RoomState,
    targetPeerId: string,
    message: ServerToClientMessage,
  ): void {
    const target = room.peers.get(targetPeerId);
    if (target) {
      target.send(message);
    }
  }

  public joinPeer(
    send: SendMessageFn,
    initialPayload?: ClientPlayerPayload,
    now: number = Date.now(),
  ): { peerId: string; roomId: string; roomNumber: number } {
    const peerId = `cat-${this.nextPeerSeq++}`;
    const room = this.acquireAvailableRoom();
    const state: RemotePeerState = {
      id: peerId,
      ...(initialPayload ?? DEFAULT_INITIAL_STATE),
    };

    const existingPeers = Array.from(room.peers.values()).map((p) => ({
      ...p.state,
    }));

    const session: PeerSession = {
      id: peerId,
      roomId: room.id,
      state,
      send,
      lastSeenAt: now,
    };

    room.peers.set(peerId, session);
    this.peerRoomIndex.set(peerId, room.id);

    send({
      type: 'room_snapshot',
      selfId: peerId,
      roomId: room.id,
      roomNumber: room.number,
      maxPeers: this.maxPlayers,
      peers: existingPeers,
      wishes: room.wishes.map((w) => ({ ...w })),
      fireCount: room.fireCount,
    });

    this.broadcastToRoom(
      room,
      { type: 'peer_update', peer: { ...session.state } },
      peerId,
    );

    return {
      peerId,
      roomId: room.id,
      roomNumber: room.number,
    };
  }

  public leavePeer(peerId: string): boolean {
    const roomId = this.peerRoomIndex.get(peerId);
    if (!roomId) return false;
    this.peerRoomIndex.delete(peerId);

    const room = this.rooms.get(roomId);
    if (!room) return false;

    const deleted = room.peers.delete(peerId);
    if (!deleted) return false;

    if (room.peers.size === 0) {
      this.rooms.delete(roomId);
      return true;
    }

    this.broadcastToRoom(room, { type: 'peer_leave', peerId });
    return true;
  }

  public handleMessage(
    peerId: string,
    message: ClientToServerMessage,
    now: number = Date.now(),
  ): void {
    const roomId = this.peerRoomIndex.get(peerId);
    if (!roomId) return;
    const room = this.rooms.get(roomId);
    if (!room) return;
    const session = room.peers.get(peerId);
    if (!session) return;

    session.lastSeenAt = now;

    switch (message.type) {
      case 'hello':
      case 'state': {
        session.state = { id: peerId, ...message.state };
        this.broadcastToRoom(
          room,
          { type: 'peer_update', peer: { ...session.state } },
          peerId,
        );
        break;
      }
      case 'yuzu_add': {
        const duplicate = room.wishes.some((w) => w.id === message.wish.id);
        if (!duplicate) {
          room.wishes = [...room.wishes, { ...message.wish }].slice(
            -this.maxYuzus,
          );
          this.broadcastToRoom(
            room,
            {
              type: 'yuzu_add',
              wish: { ...message.wish },
              fromPeerId: peerId,
            },
            peerId,
          );
        }
        break;
      }
      case 'fire_stoke': {
        room.fireCount += 1;
        this.broadcastToRoom(
          room,
          {
            type: 'fire_stoke',
            fromPeerId: peerId,
            fireCount: room.fireCount,
          },
          peerId,
        );
        break;
      }
      case 'bamboo_ring': {
        this.broadcastToRoom(
          room,
          { type: 'bamboo_ring', fromPeerId: peerId },
          peerId,
        );
        break;
      }
      case 'milk_gift': {
        if (
          message.targetPeerId &&
          !room.peers.has(message.targetPeerId)
        ) {
          return;
        }
        this.broadcastToRoom(
          room,
          {
            type: 'milk_gift',
            fromPeerId: peerId,
            targetPeerId: message.targetPeerId,
          },
          peerId,
        );
        break;
      }
      case 'milk_offer': {
        this.sendToPeerInRoom(room, message.targetPeerId, {
          type: 'milk_offer',
          fromPeerId: peerId,
          fromCoatId: session.state.coatId,
          targetPeerId: message.targetPeerId,
          drinkId: message.drinkId,
        });
        break;
      }
      case 'milk_respond': {
        this.sendToPeerInRoom(room, message.toPeerId, {
          type: 'milk_respond',
          fromPeerId: peerId,
          fromCoatId: session.state.coatId,
          toPeerId: message.toPeerId,
          drinkId: message.drinkId,
          accepted: message.accepted,
        });
        break;
      }
      case 'milk_request': {
        this.sendToPeerInRoom(room, message.targetPeerId, {
          type: 'milk_request',
          fromPeerId: peerId,
          fromCoatId: session.state.coatId,
          targetPeerId: message.targetPeerId,
          drinkId: message.drinkId,
        });
        break;
      }
      case 'milk_request_decline': {
        this.sendToPeerInRoom(room, message.toPeerId, {
          type: 'milk_request_decline',
          fromPeerId: peerId,
          fromCoatId: session.state.coatId,
          toPeerId: message.toPeerId,
          drinkId: message.drinkId,
        });
        break;
      }
    }
  }

  public pruneStalePeers(maxIdleMs: number, now: number = Date.now()): string[] {
    const removed: string[] = [];
    for (const room of this.rooms.values()) {
      for (const peer of room.peers.values()) {
        if (now - peer.lastSeenAt > maxIdleMs) {
          removed.push(peer.id);
        }
      }
    }
    for (const peerId of removed) {
      this.leavePeer(peerId);
    }
    return removed;
  }

  public getRoomSummaries(): RoomSummary[] {
    return Array.from(this.rooms.values())
      .sort((a, b) => a.number - b.number)
      .map((room) => ({
        roomId: room.id,
        roomNumber: room.number,
        peerCount: room.peers.size,
        maxPeers: this.maxPlayers,
      }));
  }

  public getPeerCount(): number {
    return this.peerRoomIndex.size;
  }
}
