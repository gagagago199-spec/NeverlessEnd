'use strict';

const assert = require('node:assert/strict');
const news = require('./officialNews');

async function main() {
  assert.equal(news.normalizeChannelName('𝗚𝗲𝗻𝘀𝗵𝗶𝗻↝𝗡𝗲𝘄𝘀'), 'genshinnews');
  assert.equal(news.normalizeChannelName('genshin-news'), 'genshinnews');
  const guild = { id: '1542716819327156244', name: 'NeverLess', channels: { cache: new Map() } };
  const channel = {
    id: '1542716819327156247', guild, name: '𝗚𝗲𝗻𝘀𝗵𝗶𝗻↝𝗡𝗲𝘄𝘀',
    type: 0, isSendable() { return true; }, messages: {
      async fetch() { return new Map(); },
    }, sent: [], async send(payload) { this.sent.push(payload); return payload; },
  };
  guild.channels.cache.set(channel.id, channel);
  guild.channels.cache.find = (predicate) => [...guild.channels.cache.values()].find(predicate) || null;
  assert.equal(news.isNewsChannel(channel), true);
  assert.equal(news.isNewsChannel({ ...channel, name: 'genshin-chat' }), false);
  assert.equal(news.isNewsChannel({ ...channel, type: 2 }), false);

  const a = {
    iInfoId: 188001,
    sTitle: 'Version &amp; Events',
    sIntro: 'Official <b>new</b> update &amp; rewards',
    dtStartTime: '2026-11-28 01:00:00',
    sExt: JSON.stringify({
      banner: [
        { url: 'https://fastcdn.hoyoverse.com/preview-one.png' },
        { url: 'https://fastcdn.hoyoverse.com/preview-two.png' },
        { url: 'https://evil.example.com/fake.png' },
      ],
    }),
  };
  const b = { ...a, iInfoId: 188002, sTitle: 'Another official article', dtStartTime: '2026-11-28 02:00:00' };
  const c = { ...a, iInfoId: 188003, sTitle: 'Brand new announcement', dtStartTime: '2026-11-28 03:00:00' };
  const normalized = news.normalizePost(a);
  assert.equal(normalized.title, 'Version & Events');
  assert.equal(normalized.description, 'Official new update & rewards');
  assert.equal(normalized.link, 'https://genshin.hoyoverse.com/en/news/detail/188001');
  assert.deepEqual(normalized.images, [
    'https://fastcdn.hoyoverse.com/preview-one.png',
    'https://fastcdn.hoyoverse.com/preview-two.png',
  ]);
  assert.equal(news.normalizePost({ iInfoId: 'not-numeric', sTitle: 'Fake' }), null);
  assert.equal(news.normalizeNewsRows([a, a, b]).length, 2);
  assert.equal(news.buildNewsPayload(normalized).embeds.length, 2);
  assert.deepEqual(news.buildNewsPayload(normalized).allowedMentions, { parse: [] });

  const state = { channelId: channel.id, seen: ['188001', '188002'] };
  assert.deepEqual(news.decodeState(news.encodeState(guild.id, state), guild.id), state);
  assert.equal(news.decodeState(news.encodeState(guild.id, state), '1550000000000000000'), null);
  assert.equal(news.decodeState('invalid', guild.id), null);

  const client = { user: { id: '1550000000000000001' }, guilds: { cache: new Map([[guild.id, guild]]) } };
  let articles = [a, b];
  let requests = 0;
  const fakeFetch = async (url) => {
    const parsed = new URL(url);
    requests += 1;
    assert.equal(parsed.hostname, 'api-os-takumi-static.hoyoverse.com');
    assert.equal(parsed.searchParams.get('AppId'), '32');
    assert.ok(['395', '396', '397', '398'].includes(parsed.searchParams.get('iChanId')));
    return { ok: true, async json() { return { data: { list: articles } }; } };
  };
  const firstBatch = await news.fetchOfficialNews(fakeFetch);
  assert.equal(firstBatch.length, 2);
  await news.pollOfficialNews(client, fakeFetch);
  assert.equal(channel.sent.length, 0, 'First poll should not flood old news');

  articles = [a, b, c];
  await news.pollOfficialNews(client, fakeFetch);
  assert.equal(channel.sent.length, 1);
  assert.equal(channel.sent[0].embeds[0].url, 'https://genshin.hoyoverse.com/en/news/detail/188003');
  await news.pollOfficialNews(client, fakeFetch);
  assert.equal(channel.sent.length, 1, 'No duplicate when revisiting same article');
  assert.equal(requests, 16, 'Four official categories checked on each fetch');
  const partlyUnavailable = await news.fetchOfficialNews(async (url) => {
    const category = new URL(url).searchParams.get('iChanId');
    return { ok: true, async json() {
      return category === '396' ? { code: -1, data: null } : { code: 0, data: { list: [a, b, c] } };
    } };
  });
  assert.equal(partlyUnavailable.length, 3, 'One broken category must not stop remaining official news');

  console.log('Genshin official news tests passed');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
