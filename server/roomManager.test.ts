import assert from 'node:assert/strict';
import test from 'node:test';
import {
  parseClientMessage,
  parseServerMessage,
  type ServerToClientMessage,
} from '../src/shared/multiplayerProtocol.ts';
import { RoomManager } from './roomManager.ts';

test('RoomManager auto-splits peers into room-2 when room capacity (16) is full', () => {
  const manager = new RoomManager(16, 30);
  const inboxes = new Map<string, ServerToClientMessage[]>();

  const joinedIds: string[] = [];
  for (let i = 0; i < 17; i += 1) {
    const msgs: ServerToClientMessage[] = [];
    const joined = manager.joinPeer((msg) => msgs.push(msg));
    inboxes.set(joined.peerId, msgs);
    joinedIds.push(joined.peerId);
    if (i < 16) {
      assert.equal(joined.roomNumber, 1);
      assert.equal(joined.roomId, 'room-1');
    } else {
      assert.equal(joined.roomNumber, 2);
      assert.equal(joined.roomId, 'room-2');
    }
  }

  const summaries = manager.getRoomSummaries();
  assert.equal(summaries.length, 2);
  assert.deepEqual(summaries[0], {
    roomId: 'room-1',
    roomNumber: 1,
    peerCount: 16,
    maxPeers: 16,
  });
  assert.deepEqual(summaries[1], {
    roomId: 'room-2',
    roomNumber: 2,
    peerCount: 1,
    maxPeers: 16,
  });

  // Peer leaving room-1 opens a slot back up in room-1 for the next newcomer
  assert.equal(manager.leavePeer(joinedIds[0]), true);
  const refillMsgs: ServerToClientMessage[] = [];
  const refilled = manager.joinPeer((msg) => refillMsgs.push(msg));
  assert.equal(refilled.roomNumber, 1);
});

test('RoomManager broadcasts wishes, fire stoke, bamboo ring, and targeted milk gifts within the same room only', () => {
  const manager = new RoomManager(2, 5);
  const p1Msgs: ServerToClientMessage[] = [];
  const p2Msgs: ServerToClientMessage[] = [];
  const p3Msgs: ServerToClientMessage[] = [];

  const p1 = manager.joinPeer((msg) => p1Msgs.push(msg));
  const p2 = manager.joinPeer((msg) => p2Msgs.push(msg));
  const p3 = manager.joinPeer((msg) => p3Msgs.push(msg));

  assert.equal(p1.roomId, 'room-1');
  assert.equal(p2.roomId, 'room-1');
  assert.equal(p3.roomId, 'room-2');

  p1Msgs.length = 0;
  p2Msgs.length = 0;
  p3Msgs.length = 0;

  manager.handleMessage(p1.peerId, {
    type: 'yuzu_add',
    wish: {
      id: 'wish-test-1',
      colorHex: '#f4be2b',
      message: '오늘도 평안한 온천 시간 되세요',
      localX: 0.5,
      localZ: -0.4,
      phase: 1.2,
    },
  });
  manager.handleMessage(p1.peerId, { type: 'fire_stoke' });
  manager.handleMessage(p1.peerId, { type: 'bamboo_ring' });
  manager.handleMessage(p1.peerId, {
    type: 'milk_gift',
    targetPeerId: p2.peerId,
  });

  assert.equal(p1Msgs.length, 0);
  assert.equal(p3Msgs.length, 0);
  assert.deepEqual(
    p2Msgs.map((m) => m.type),
    ['yuzu_add', 'fire_stoke', 'bamboo_ring', 'milk_gift'],
  );

  // Clean leave removes peer and notifies room-1 survivor
  p2Msgs.length = 0;
  assert.equal(manager.leavePeer(p1.peerId), true);
  assert.equal(p2Msgs.length, 1);
  assert.deepEqual(p2Msgs[0], { type: 'peer_leave', peerId: p1.peerId });
});

test('Protocol parsers sanitize coordinates, coats, wishes, and reject malformed input', () => {
  assert.equal(parseClientMessage('not-json'), null);
  assert.equal(parseClientMessage(JSON.stringify({ type: 'unknown' })), null);

  const parsedState = parseClientMessage(
    JSON.stringify({
      type: 'state',
      state: {
        coatId: 'invalid-coat',
        x: 9999,
        y: -999,
        z: 12,
        heading: 0.5,
        actionMode: 'bogus',
        moveSpeed: 500,
        hasHeadYuzu: 1,
        carryingFirewood: 0,
      },
    }),
  );
  assert.ok(parsedState && parsedState.type === 'state');
  assert.equal(parsedState.state.coatId, 'cheese');
  assert.equal(parsedState.state.actionMode, 'idle');
  assert.equal(parsedState.state.x, 80);
  assert.equal(parsedState.state.y, -10);
  assert.equal(parsedState.state.moveSpeed, 20);
  assert.equal(parsedState.state.hasHeadYuzu, true);
  assert.equal(parsedState.state.carryingFirewood, false);

  const snapshotRaw = JSON.stringify({
    type: 'room_snapshot',
    selfId: 'cat-1',
    roomId: 'room-1',
    roomNumber: 1,
    maxPeers: 16,
    peers: [],
    wishes: [],
    fireCount: 3,
  });
  const parsedSnapshot = parseServerMessage(snapshotRaw);
  assert.ok(parsedSnapshot && parsedSnapshot.type === 'room_snapshot');
  assert.equal(parsedSnapshot.fireCount, 3);
});

test('RoomManager relays milk_offer, milk_respond, milk_request, milk_request_decline and heldMilkId within room', () => {
  const manager = new RoomManager(4, 10);
  const p1Msgs: ServerToClientMessage[] = [];
  const p2Msgs: ServerToClientMessage[] = [];
  const p3Msgs: ServerToClientMessage[] = [];

  const p1 = manager.joinPeer((m) => p1Msgs.push(m), {
    coatId: 'tuxedo',
    x: 24,
    y: 0,
    z: 8,
    heading: 0,
    actionMode: 'idle',
    moveSpeed: 0,
    hasHeadYuzu: false,
    carryingFirewood: false,
    heldMilkId: 'strawberry',
  });
  const p2 = manager.joinPeer((m) => p2Msgs.push(m));
  const p3 = manager.joinPeer((m) => p3Msgs.push(m));

  p1Msgs.length = 0;
  p2Msgs.length = 0;
  p3Msgs.length = 0;

  const offerClient = parseClientMessage(
    JSON.stringify({
      type: 'milk_offer',
      targetPeerId: p2.peerId,
      drinkId: 'strawberry',
    }),
  );
  assert.ok(offerClient);
  manager.handleMessage(p1.peerId, offerClient);
  assert.equal(p2Msgs.length, 1);
  assert.equal(p3Msgs.length, 0);
  assert.deepEqual(p2Msgs[0], {
    type: 'milk_offer',
    fromPeerId: p1.peerId,
    fromCoatId: 'tuxedo',
    targetPeerId: p2.peerId,
    drinkId: 'strawberry',
  });

  manager.handleMessage(p2.peerId, {
    type: 'milk_respond',
    toPeerId: p1.peerId,
    drinkId: 'strawberry',
    accepted: false,
  });
  assert.equal(p1Msgs.length, 1);
  assert.deepEqual(p1Msgs[0], {
    type: 'milk_respond',
    fromPeerId: p2.peerId,
    fromCoatId: 'cheese',
    toPeerId: p1.peerId,
    drinkId: 'strawberry',
    accepted: false,
  });

  p2Msgs.length = 0;
  manager.handleMessage(p1.peerId, {
    type: 'milk_request',
    targetPeerId: p2.peerId,
    drinkId: 'banana',
  });
  assert.equal(p2Msgs.length, 1);
  assert.equal(p2Msgs[0].type, 'milk_request');

  p1Msgs.length = 0;
  manager.handleMessage(p2.peerId, {
    type: 'milk_request_decline',
    toPeerId: p1.peerId,
    drinkId: 'banana',
  });
  assert.equal(p1Msgs.length, 1);
  assert.equal(p1Msgs[0].type, 'milk_request_decline');

  // Invalid heldMilkId sanitizes cleanly to null
  const badMilk = parseClientMessage(
    JSON.stringify({
      type: 'state',
      state: {
        coatId: 'cheese',
        x: 0,
        y: 0,
        z: 10,
        heading: 0,
        actionMode: 'idle',
        moveSpeed: 0,
        hasHeadYuzu: false,
        carryingFirewood: false,
        heldMilkId: 'espresso',
      },
    }),
  );
  assert.ok(badMilk && badMilk.type === 'state');
  assert.equal(badMilk.state.heldMilkId, null);
});

test('RoomManager enforces 60s rate limit and server-assigned wish.id on yuzu_add', () => {
  const manager = new RoomManager(4, 10);
  const p1Msgs: ServerToClientMessage[] = [];
  const p2Msgs: ServerToClientMessage[] = [];

  const p1 = manager.joinPeer((m) => p1Msgs.push(m), undefined, 1000);
  manager.joinPeer((m) => p2Msgs.push(m), undefined, 1000);
  p2Msgs.length = 0;

  manager.handleMessage(
    p1.peerId,
    {
      type: 'yuzu_add',
      wish: {
        id: 'client-spoofed-id',
        colorHex: '#f4be2b',
        message: '첫 번째 따뜻한 소원',
        localX: 0.2,
        localZ: -0.1,
        phase: 0.5,
      },
    },
    10_000,
  );
  assert.equal(p2Msgs.length, 1);
  assert.equal(p2Msgs[0].type, 'yuzu_add');
  if (p2Msgs[0].type === 'yuzu_add') {
    assert.notEqual(p2Msgs[0].wish.id, 'client-spoofed-id');
    assert.match(p2Msgs[0].wish.id, /^wish-10000-\d+$/);
  }

  // Within 60s: ignored
  manager.handleMessage(
    p1.peerId,
    {
      type: 'yuzu_add',
      wish: {
        id: 'client-spoofed-id-2',
        colorHex: '#94c456',
        message: '연속 도배 소원',
        localX: 0.4,
        localZ: 0.1,
        phase: 1.0,
      },
    },
    69_999,
  );
  assert.equal(p2Msgs.length, 1);

  // At 60s+: allowed
  manager.handleMessage(
    p1.peerId,
    {
      type: 'yuzu_add',
      wish: {
        id: 'client-spoofed-id-3',
        colorHex: '#f28b30',
        message: '60초 뒤 두 번째 소원',
        localX: -0.3,
        localZ: 0.2,
        phase: 2.0,
      },
    },
    70_000,
  );
  assert.equal(p2Msgs.length, 2);
});

test('RoomManager blocks yuzu_add wishes containing blocked words or URLs', () => {
  const manager = new RoomManager(4, 10);
  const p1Msgs: ServerToClientMessage[] = [];
  const p2Msgs: ServerToClientMessage[] = [];

  const p1 = manager.joinPeer((m) => p1Msgs.push(m), undefined, 1000);
  manager.joinPeer((m) => p2Msgs.push(m), undefined, 1000);
  p2Msgs.length = 0;

  manager.handleMessage(
    p1.peerId,
    {
      type: 'yuzu_add',
      wish: {
        id: 'bad-url',
        colorHex: '#f4be2b',
        message: 'https://spam.example.com 놀러오세요',
        localX: 0,
        localZ: 0,
        phase: 0,
      },
    },
    2000,
  );
  manager.handleMessage(
    p1.peerId,
    {
      type: 'yuzu_add',
      wish: {
        id: 'bad-word',
        colorHex: '#f4be2b',
        message: '바카라 사이트 추천',
        localX: 0,
        localZ: 0,
        phase: 0,
      },
    },
    3000,
  );
  assert.equal(p2Msgs.length, 0);

  // Valid wish after blocked attempts still succeeds
  manager.handleMessage(
    p1.peerId,
    {
      type: 'yuzu_add',
      wish: {
        id: 'good-wish',
        colorHex: '#f4be2b',
        message: '모두 건강하고 평안하세요',
        localX: 0,
        localZ: 0,
        phase: 0,
      },
    },
    4000,
  );
  assert.equal(p2Msgs.length, 1);
});

test('RoomManager enforces 3s rate limit on bamboo_ring and blocks self-targeted milk_offer', () => {
  const manager = new RoomManager(4, 10);
  const p1Msgs: ServerToClientMessage[] = [];
  const p2Msgs: ServerToClientMessage[] = [];

  const p1 = manager.joinPeer((m) => p1Msgs.push(m), undefined, 1000);
  manager.joinPeer((m) => p2Msgs.push(m), undefined, 1000);
  p1Msgs.length = 0;
  p2Msgs.length = 0;

  manager.handleMessage(p1.peerId, { type: 'bamboo_ring' }, 5000);
  manager.handleMessage(p1.peerId, { type: 'bamboo_ring' }, 7999);
  assert.equal(p2Msgs.filter((m) => m.type === 'bamboo_ring').length, 1);

  manager.handleMessage(p1.peerId, { type: 'bamboo_ring' }, 8000);
  assert.equal(p2Msgs.filter((m) => m.type === 'bamboo_ring').length, 2);

  // Self-targeted milk_offer is ignored
  manager.handleMessage(
    p1.peerId,
    {
      type: 'milk_offer',
      targetPeerId: p1.peerId,
      drinkId: 'banana',
    },
    9000,
  );
  assert.equal(p1Msgs.length, 0);
});

test('RoomManager persists wishes and fireCount when room empties and restores on rejoin', () => {
  const manager = new RoomManager(4, 10);
  const p1Msgs: ServerToClientMessage[] = [];
  const p1 = manager.joinPeer((m) => p1Msgs.push(m), undefined, 1000);

  manager.handleMessage(
    p1.peerId,
    {
      type: 'yuzu_add',
      wish: {
        id: 'ignored',
        colorHex: '#94c456',
        message: '다시 와도 남아있는 유자 쪽지',
        localX: 0.5,
        localZ: 0.5,
        phase: 1.5,
      },
    },
    2000,
  );
  manager.handleMessage(p1.peerId, { type: 'fire_stoke' }, 2000);
  manager.handleMessage(p1.peerId, { type: 'fire_stoke' }, 5000);

  assert.equal(manager.leavePeer(p1.peerId), true);
  assert.equal(manager.getRoomSummaries().length, 0);

  const p2Msgs: ServerToClientMessage[] = [];
  const p2 = manager.joinPeer((m) => p2Msgs.push(m), undefined, 6000);
  assert.equal(p2.roomId, 'room-1');
  assert.equal(p2Msgs.length, 1);
  assert.equal(p2Msgs[0].type, 'room_snapshot');
  if (p2Msgs[0].type === 'room_snapshot') {
    assert.equal(p2Msgs[0].fireCount, 2);
    assert.ok(
      p2Msgs[0].wishes.some((w) => w.message === '다시 와도 남아있는 유자 쪽지'),
    );
  }
});

test('RoomManager joins requestedRoomId, sets roomNumber, and falls back when full', () => {
  const manager = new RoomManager(1, 10);
  const p1Msgs: ServerToClientMessage[] = [];
  const p2Msgs: ServerToClientMessage[] = [];
  const p3Msgs: ServerToClientMessage[] = [];

  const p1 = manager.joinPeer((m) => p1Msgs.push(m), undefined, 1000, 'Myoyu-123');
  assert.equal(p1.roomId, 'myoyu-123');
  assert.equal(p1.roomNumber, 0);

  const p2 = manager.joinPeer((m) => p2Msgs.push(m), undefined, 1000, 'room-7');
  assert.equal(p2.roomId, 'room-7');
  assert.equal(p2.roomNumber, 7);

  // myoyu-123 is full (maxPlayers = 1) -> falls back to acquireAvailableRoom() -> room-1
  const p3 = manager.joinPeer((m) => p3Msgs.push(m), undefined, 1000, 'myoyu-123');
  assert.equal(p3.roomId, 'room-1');
  assert.equal(p3.roomNumber, 1);
});
