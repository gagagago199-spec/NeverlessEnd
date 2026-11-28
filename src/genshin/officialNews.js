'use strict';

const zlib = require('node:zlib');

const OFFICIAL_API = 'https://api-os-takumi-static.hoyoverse.com/content_v2_user/app/a1b1f9d3315447cc/getContentList';
const OFFICIAL_ARTICLE = /^https:\/\/genshin\.hoyoverse\.com\/(?:en|en-us)\/news\/detail\/(\d+)(?:[/?#].*)?$/i;
const NEWS_CHANNEL_NAME = 'genshinnews';
const STATE_PREFIX = 'NLGENSHINNEWS1|';
const STATE_CHANNEL_NAME = 'neverless-data';
const CATEGORY_IDS = [395, 396, 397, 398]; // Latest / Info / Updates / Events
const POLL_MS = 10 * 60 * 1000;
const MAX_SEEN = 180;
const MAX_NEW_PER_POLL = 12;

const guildStates = new Map();
const busyGuilds = new Set();
let installed = false;
let running = false;

function normalizeChannelName(value) {
  return String(value || '').normalize('NFKC').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function isOfficialImageUrl(value) {
  if (typeof value !== 'string' || value.length > 1600) return false;
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    return url.protocol === 'https:' && ['hoyoverse.com', 'mihoyo.com', 'hoyolab.com']
      .some((domain) => host === domain || host.endsWith('.' + domain));
  } catch { return false; }
}

function cleanText(value, limit = 1000) {
  const entities = { amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', nbsp: ' ' };
  return String(value ?? '').replace(/<[^>]*>/g, ' ')
    .replace(/&(#x[0-9a-f]+|#[0-9]+|amp|quot|apos|lt|gt|nbsp);/gi, (match, entity) => {
      const k = entity.toLowerCase();
      if (k[0] === '#') {
        const number = k[1] === 'x' ? parseInt(k.slice(2), 16) : parseInt(k.slice(1), 10);
        return number > 0 && number <= 0x10ffff ? String.fromCodePoint(number) : '';
      }
      return entities[k] ?? match;
    })
    .replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, limit);
}

function extractImages(post) {
  let ext = post?.sExt;
  if (typeof ext === 'string') {
    try { ext = JSON.parse(ext); } catch { ext = null; }
  }
  const candidates = [];
  for (const group of [ext?.banner, ext?.value, ext?.images, post?.sCover, post?.sBanner]) {
    const rows = Array.isArray(group) ? group : group ? [group] : [];
    for (const row of rows) {
      const url = typeof row === 'string' ? row : row?.url;
      if (isOfficialImageUrl(url) && !candidates.includes(url)) candidates.push(url);
    }
  }
  return candidates.slice(0, 4);
}

function normalizePost(post) {
  const id = String(post?.iInfoId ?? '').trim();
  if (!/^\d{1,20}$/.test(id)) return null;
  const title = cleanText(post?.sTitle, 250);
  if (!title) return null;
  return {
    id,
    title,
    description: cleanText(post?.sIntro, 1100),
    published: String(post?.dtStartTime ?? ''),
    link: 'https://genshin.hoyoverse.com/en/news/detail/' + id,
    images: extractImages(post),
  };
}

function normalizeNewsRows(rows) {
  const byId = new Map();
  for (const row of rows) {
    const post = normalizePost(row);
    if (!post || !OFFICIAL_ARTICLE.test(post.link)) continue;
    const previous = byId.get(post.id);
    if (!previous || post.images.length > previous.images.length) byId.set(post.id, post);
  }
  return [...byId.values()].sort((a, b) =>
    a.published.localeCompare(b.published) || Number(a.id) - Number(b.id));
}

async function fetchOfficialNews(fetcher = fetch) {
  // Some HoYoverse categories respond with an empty/changed payload even
  // while other official categories are healthy. Preserve the healthy ones.
  const results = await Promise.all(CATEGORY_IDS.map(async (category) => {
    try {
      const params = new URLSearchParams({
        AppId: '32', iPageSize: '35', iPage: '1', iChanId: String(category), sLangKey: 'en-us',
      });
      const response = await fetcher(OFFICIAL_API + '?' + params.toString(), {
        signal: AbortSignal.timeout(12_000),
        headers: { Accept: 'application/json', 'User-Agent': 'NeverLess-GenshinNews/1.0' },
      });
      if (!response.ok) throw new Error('HTTP ' + response.status);
      const json = await response.json();
      if (!Array.isArray(json?.data?.list)) {
        throw new Error('Unexpected response (code ' + String(json?.code ?? 'unknown').slice(0, 16) + ')');
      }
      return { ok: true, posts: json.data.list };
    } catch (error) {
      console.warn('[genshin-news] Category ' + category + ' unavailable: ' + error.message);
      return { ok: false, posts: [] };
    }
  }));
  if (!results.some((row) => row.ok)) {
    throw new Error('All official news categories failed; no state was changed');
  }
  return normalizeNewsRows(results.flatMap((row) => row.posts));
}

function isNewsChannel(channel) {
  if (!channel || channel.type !== 0 || !channel.guild) return false;
  const forcedId = String(process.env.GENSHIN_NEWS_CHANNEL_ID || '').trim();
  const forcedGuild = String(process.env.GENSHIN_NEWS_GUILD_ID || '').trim();
  if (forcedGuild && channel.guild.id !== forcedGuild) return false;
  return forcedId ? channel.id === forcedId : normalizeChannelName(channel.name) === NEWS_CHANNEL_NAME;
}

function findNewsChannels(client) {
  const channels = [];
  for (const guild of client.guilds.cache.values()) {
    for (const channel of guild.channels.cache.values()) {
      if (isNewsChannel(channel) && channel.isSendable?.()) {
        channels.push(channel);
        break;
      }
    }
  }
  return channels;
}

function encodeState(guildId, state) {
  const data = {
    channelId: state.channelId,
    seen: [...new Set(state.seen || [])].slice(-MAX_SEEN),
    updatedAt: Date.now(),
  };
  return STATE_PREFIX + guildId + '|' +
    zlib.deflateRawSync(Buffer.from(JSON.stringify(data), 'utf8')).toString('base64url');
}

function decodeState(content, guildId) {
  const prefix = STATE_PREFIX + guildId + '|';
  if (!String(content || '').startsWith(prefix)) return null;
  try {
    const data = JSON.parse(zlib.inflateRawSync(
      Buffer.from(String(content).slice(prefix.length), 'base64url')).toString('utf8'));
    if (!Array.isArray(data.seen) || !/^\d{15,22}$/.test(String(data.channelId ?? ''))) return null;
    return {
      channelId: String(data.channelId),
      seen: data.seen.filter((id) => /^\d{1,20}$/.test(String(id))).map(String).slice(-MAX_SEEN),
    };
  } catch { return null; }
}

async function loadPersistedState(guild, client) {
  const storage = guild.channels.cache.find((ch) => ch.type === 0 && ch.name === STATE_CHANNEL_NAME);
  if (!storage) return { state: null, message: null, storage: null };
  let before;
  for (let batchNo = 0; batchNo < 20; batchNo += 1) {
    const batch = await storage.messages.fetch({ limit: 100, ...(before ? { before } : {}) });
    for (const message of batch.values()) {
      if (message.author?.id !== client.user?.id) continue;
      const state = decodeState(message.content, guild.id);
      if (state) return { state, message, storage };
    }
    if (batch.size < 100) break;
    before = batch.last()?.id;
    if (!before) break;
  }
  return { state: null, message: null, storage };
}

async function loadPostedIds(channel, client) {
  const batch = await channel.messages.fetch({ limit: 100 }).catch(() => null);
  const ids = [];
  for (const message of batch?.values?.() || []) {
    if (message.author?.id !== client.user?.id) continue;
    for (const embed of message.embeds || []) {
      const match = String(embed.url || '').match(OFFICIAL_ARTICLE);
      if (match && !ids.includes(match[1])) ids.push(match[1]);
    }
  }
  return ids;
}

async function getGuildState(channel, client, posts) {
  const guild = channel.guild;
  const cached = guildStates.get(guild.id);
  if (cached?.channelId === channel.id) return cached;
  const persisted = await loadPersistedState(guild, client).catch((error) => {
    console.warn('[genshin-news] Could not read persistent state:', error.message);
    return { state: null, storage: null, message: null };
  });
  const history = await loadPostedIds(channel, client);
  const continued = persisted.state?.channelId === channel.id;
  const seen = continued
    ? [...new Set([...persisted.state.seen, ...history])]
    : [...new Set([...posts.map((post) => post.id), ...history])];
  const state = {
    channelId: channel.id, seen: seen.slice(-MAX_SEEN),
    storage: persisted.storage, message: persisted.message,
  };
  guildStates.set(guild.id, state);
  if (!continued) {
    // On initial setup or channel replacement, seed without flooding old news.
    await saveGuildState(channel, state);
    console.log('[genshin-news] Baseline initialized in ' + guild.name + ' for ' + seen.length + ' existing articles.');
  } else {
    console.log('[genshin-news] Restored ' + seen.length + ' seen articles for ' + guild.name + '.');
  }
  return state;
}

async function saveGuildState(channel, state) {
  if (!state.storage) {
    state.storage = channel.guild.channels.cache.find(
      (ch) => ch.type === 0 && ch.name === STATE_CHANNEL_NAME) || null;
  }
  if (!state.storage) {
    console.warn('[genshin-news] neverless-data channel not found; using message history for deduplication.');
    return false;
  }
  const body = encodeState(channel.guild.id, state);
  try {
    if (state.message) await state.message.edit(body);
    else state.message = await state.storage.send({ content: body, allowedMentions: { parse: [] } });
    return true;
  } catch (error) {
    console.warn('[genshin-news] Could not persist published IDs:', error.message);
    state.message = null;
    return false;
  }
}

function buildNewsPayload(post) {
  const first = {
    color: 0x66bfce,
    author: { name: 'Genshin Impact • Official News', url: 'https://genshin.hoyoverse.com/en/news' },
    title: post.title.slice(0, 256),
    url: post.link,
    description: post.description || 'New official Genshin Impact announcement. Open the article to read more.',
    footer: { text: 'HoYoverse • Official announcement' },
  };
  if (post.images[0]) first.image = { url: post.images[0] };
  const more = post.images.slice(1, 4).map((url) => ({ color: 0x66bfce, image: { url } }));
  return { embeds: [first, ...more], allowedMentions: { parse: [] } };
}

async function publishNews(channel, client, posts) {
  if (busyGuilds.has(channel.guild.id)) return;
  busyGuilds.add(channel.guild.id);
  try {
    const state = await getGuildState(channel, client, posts);
    const seen = new Set(state.seen);
    const newPosts = posts.filter((post) => !seen.has(post.id)).slice(0, MAX_NEW_PER_POLL);
    for (const post of newPosts) {
      await channel.send(buildNewsPayload(post));
      seen.add(post.id);
      state.seen = [...seen].slice(-MAX_SEEN);
      await saveGuildState(channel, state);
      console.log('[genshin-news] Published official article ' + post.id + ' in guild ' + channel.guild.id);
    }
  } catch (error) {
    console.error('[genshin-news] Publish failed in guild ' + channel.guild.id + ':', error.message);
  } finally {
    busyGuilds.delete(channel.guild.id);
  }
}

async function pollOfficialNews(client, fetcher = fetch) {
  if (running || !client.user) return;
  const channels = findNewsChannels(client);
  if (!channels.length) return;
  running = true;
  try {
    const posts = await fetchOfficialNews(fetcher);
    if (!posts.length) throw new Error('No posts returned; skipping state updates');
    for (const channel of channels) await publishNews(channel, client, posts);
  } catch (error) {
    console.warn('[genshin-news] Fetch failed; retrying next poll:', error.message);
  } finally {
    running = false;
  }
}

function installOfficialGenshinNews(client) {
  if (installed) return;
  installed = true;
  const run = () => pollOfficialNews(client).catch((error) =>
    console.error('[genshin-news] Unexpected poll failure:', error.message));
  client.once('ready', () => {
    console.log('[genshin-news] Official HoYoverse news watcher ready (10-minute interval).');
    setTimeout(run, 12_000).unref?.();
    setInterval(run, POLL_MS).unref?.();
  });
  client.on('channelCreate', (channel) => {
    if (isNewsChannel(channel)) setTimeout(run, 2000).unref?.();
  });
}

module.exports = {
  installOfficialGenshinNews, pollOfficialNews, fetchOfficialNews,
  normalizeChannelName, normalizePost, normalizeNewsRows, extractImages,
  encodeState, decodeState, isNewsChannel, buildNewsPayload,
};
