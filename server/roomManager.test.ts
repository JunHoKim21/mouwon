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
