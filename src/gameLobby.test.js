'use strict';

const assert = require('node:assert/strict');
const {
  normalizeUid,
  normalizeServer,
  normalizeGame,
  normalizeMinecraftEdition,
  normalizeMinecraftName,
  normalizeProfile,
  canAdminister,
  canCloseLobby,
  adminPayload,
  stateContent,
  parseState,
  sanitizeLobby,
  nextOwnerId,
  constants,
} = require('./gameLobby');

assert.equal(normalizeUid('700123456'), '700123456');
assert.equal(normalizeUid('UID: 700123456'), '700123456');
assert.equal(normalizeUid('123'), null);

assert.equal(normalizeServer('EU'), 'EU');
assert.equal(normalizeServer('Europe'), 'EU');
assert.equal(normalizeServer('North America'), 'NA');
assert.equal(normalizeServer('Asia'), 'ASIA');
assert.equal(normalizeServer('TW-HK-MO'), 'TW/HK/MO');
assert.equal(normalizeServer('Mars'), null);

const lobby = {
  id: 'abcdef123456',
  guildId: '1542716819327156244',
  ownerId: '1542716819327156245',
  members: [
    { userId: '1542716819327156245', uid: '700123456', server: 'EU', joinedAt: 100 },
    { userId: '1542716819327156246', uid: '600123456', server: 'NA', joinedAt: 200 },
  ],
  locked: false,
  joinMode: 'approve',
  limit: 5,
  textChannelId: '1542716819327156247',
  voiceChannelId: '1542716819327156248',
  parentId: null,
  controlMessageId: null,
  pending: [],
  createdAt: 100,
  updatedAt: 100,
};

const encoded = stateContent(lobby);
const decoded = parseState(encoded);
assert.equal(decoded.ownerId, lobby.ownerId);
assert.equal(decoded.joinMode, 'approve');
assert.equal(decoded.limit, 5);

const restored = sanitizeLobby(decoded, 1000);
assert.ok(restored);
assert.equal(restored.members.length, 2);
assert.equal(nextOwnerId(restored, lobby.ownerId), '1542716819327156246');
assert.equal(constants.DEFAULT_LIMIT, 4);
assert.equal(constants.MAX_LIMIT, 20);

const bad = sanitizeLobby({ ...decoded, ownerId: '1542716819327156299' }, 1000);
assert.equal(bad, null, 'owner must be part of the persisted lobby');

// Minecraft and Genshin profiles are independent; old records default to Genshin.
assert.equal(normalizeGame('minecraft'), 'minecraft');
assert.equal(normalizeGame(undefined), 'genshin');
assert.equal(normalizeMinecraftEdition('java'), 'JAVA');
assert.equal(normalizeMinecraftEdition('Bedrock'), 'BEDROCK');
assert.equal(normalizeMinecraftEdition('unknown'), null);
assert.equal(normalizeMinecraftName('Steve_99', 'JAVA'), 'Steve_99');
assert.equal(normalizeMinecraftName('Name With Spaces', 'JAVA'), null);
assert.equal(normalizeMinecraftName('Bedrock Gamer', 'BEDROCK'), 'Bedrock Gamer');
assert.deepEqual(normalizeProfile('minecraft', 'Alex_12', 'java'), { uid: 'Alex_12', server: 'JAVA' });
assert.deepEqual(normalizeProfile('minecraft', 'Bedrock Gamer', 'bedrock'), { uid: 'Bedrock Gamer', server: 'BEDROCK' });
assert.deepEqual(normalizeProfile('genshin', '700123456', 'eu'), { uid: '700123456', server: 'EU' });
assert.equal(normalizeProfile('minecraft', 'Not Valid Username', 'java'), null);
assert.equal(canAdminister({ ownerId: lobby.ownerId }, lobby.ownerId), true);
assert.equal(canAdminister({ ownerId: lobby.ownerId }, '1542716819327156299'), false);
const mcLobby = {
  ...lobby, game: 'minecraft', members: [
    { userId: lobby.ownerId, uid: 'Steve_99', server: 'JAVA', joinedAt: 100 },
  ],
};
const decodedMinecraft = parseState(stateContent(mcLobby));
assert.equal(decodedMinecraft.game, 'minecraft');
const restoredMinecraft = sanitizeLobby(decodedMinecraft, 1000);
assert.equal(restoredMinecraft.game, 'minecraft');
assert.equal(restoredMinecraft.members[0].uid, 'Steve_99');
assert.equal(restoredMinecraft.members[0].server, 'JAVA');
assert.equal(sanitizeLobby(decoded, 1000).game, 'genshin');
const tombstone = { guildId: lobby.guildId, id: lobby.id, deleted: true };
const tombstoneContent = 'NLGLOBBY1|' + lobby.guildId + '|' + lobby.id + '|' +
  require('node:zlib').deflateRawSync(Buffer.from(JSON.stringify(tombstone))).toString('base64url');
assert.equal(parseState(tombstoneContent).deleted, true);

// Discord requires unique component IDs even on disabled buttons. In one-page
// guilds both previous/next target page zero but must retain different IDs.
const singlePage = adminPayload({ id: lobby.guildId });
const controlIds = singlePage.components
  .flatMap((row) => row.toJSON().components)
  .map((component) => component.custom_id);
assert.equal(new Set(controlIds).size, controlIds.length, 'Manage Lobbies must have unique custom IDs');
assert.ok(controlIds.some((id) => id.endsWith(':prev')));
assert.ok(controlIds.some((id) => id.endsWith(':next')));

// Server owner and current lobby owner may close; ordinary members and
// other guilds must not. Only closing has elevated server-owner privileges.
const interactionFor = (id, guildId = lobby.guildId) => ({
  guildId, user: { id }, guild: { ownerId: '1542716819327156299' },
});
assert.equal(canCloseLobby(interactionFor(lobby.ownerId), lobby), true);
assert.equal(canCloseLobby(interactionFor('1542716819327156299'), lobby), true);
assert.equal(canCloseLobby(interactionFor('1542716819327156298'), lobby), false);
assert.equal(canCloseLobby(interactionFor('1542716819327156299', '1542716819327156311'), lobby), false);

console.log('game lobby tests passed');
