'use strict';

const DEFAULT_HANDLES = ['elonmusk', 'sama', 'cathiedwood', 'federalreserve', 'claudeai'];
const NITTER_INSTANCES = [
  'https://nitter.net',
  'https://nitter.privacydev.net',
  'https://nitter.poast.org'
];

function sanitizeHandle(raw) {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/^@+/, '')
    .replace(/[^a-z0-9_]/g, '')
    .slice(0, 15);
}

function parseHandles(raw) {
  const source = String(raw || '')
    .split(',')
    .map((part) => sanitizeHandle(part))
    .filter(Boolean);
  const uniq = [];
  source.forEach((handle) => {
    if (!uniq.includes(handle)) uniq.push(handle);
  });
  return uniq.slice(0, 12);
}

function normalizeLimit(raw) {
  const n = Number(raw);
  if (!Number.isFinite(n)) return 4;
  return Math.max(1, Math.min(8, Math.floor(n)));
}

function decodeXml(value) {
  return String(value || '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function stripHtml(value) {
  return decodeXml(value).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 5500) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function fetchXApiItems(handles, limit, bearerToken) {
  const headers = { Authorization: `Bearer ${bearerToken}` };
  const all = [];

  for (const handle of handles) {
    const userRes = await fetchWithTimeout(
      `https://api.twitter.com/2/users/by/username/${encodeURIComponent(handle)}?user.fields=name,username,verified`,
      { headers }
    );
    if (!userRes.ok) continue;
    const userData = await userRes.json();
    const user = userData?.data;
    if (!user?.id) continue;

    const tweetsUrl =
      `https://api.twitter.com/2/users/${encodeURIComponent(user.id)}/tweets` +
      `?max_results=${encodeURIComponent(String(limit))}` +
      '&exclude=replies,retweets' +
      '&tweet.fields=created_at,public_metrics';

    const tweetsRes = await fetchWithTimeout(tweetsUrl, { headers });
    if (!tweetsRes.ok) continue;
    const tweetsData = await tweetsRes.json();
    const tweets = Array.isArray(tweetsData?.data) ? tweetsData.data : [];

    tweets.forEach((tweet) => {
      const text = String(tweet?.text || '').trim();
      if (!text) return;
      all.push({
        handle,
        text,
        time: tweet?.created_at || new Date().toISOString(),
        url: `https://x.com/${encodeURIComponent(handle)}/status/${encodeURIComponent(tweet.id)}`,
        likes: Number(tweet?.public_metrics?.like_count || 0),
        reposts: Number(tweet?.public_metrics?.retweet_count || 0),
        source: 'X API'
      });
    });
  }

  all.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());
  return all.slice(0, Math.max(12, limit * handles.length));
}

function parseRssItems(xml, handle, limit) {
  const items = [];
  const matches = String(xml || '').match(/<item>([\s\S]*?)<\/item>/g) || [];

  for (let i = 0; i < matches.length && items.length < limit; i += 1) {
    const row = matches[i];
    const title = (row.match(/<title>([\s\S]*?)<\/title>/i) || [])[1] || '';
    const link = (row.match(/<link>([\s\S]*?)<\/link>/i) || [])[1] || '';
    const pubDate = (row.match(/<pubDate>([\s\S]*?)<\/pubDate>/i) || [])[1] || '';
    const desc = (row.match(/<description>([\s\S]*?)<\/description>/i) || [])[1] || '';
    const text = stripHtml(title || desc).replace(/^RT by [^:]+:\s*/i, '').trim();
    if (!text) continue;

    const parsedTime = Date.parse(decodeXml(pubDate));
    items.push({
      handle,
      text,
      time: Number.isFinite(parsedTime) ? new Date(parsedTime).toISOString() : new Date().toISOString(),
      url: decodeXml(link).trim(),
      likes: null,
      reposts: null,
      source: 'Nitter RSS'
    });
  }

  return items;
}

async function fetchNitterItems(handles, limit) {
  const deadline = Date.now() + 3200;

  async function fetchForHandle(handle) {
    if (Date.now() > deadline) return [];
    const attempts = NITTER_INSTANCES.map(async (base) => {
      const url = `${base}/${encodeURIComponent(handle)}/rss`;
      const res = await fetchWithTimeout(url, { headers: { 'User-Agent': 'BBS-Terminal/1.0' } }, 1300);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const xml = await res.text();
      const parsed = parseRssItems(xml, handle, limit);
      if (!parsed.length) throw new Error('No RSS items');
      return parsed;
    });

    try {
      return await Promise.any(attempts);
    } catch (error) {
      return [];
    }
  }

  const out = [];
  const selected = handles.slice(0, 10);
  const results = await Promise.all(selected.map((handle) => fetchForHandle(handle)));
  results.forEach((items) => out.push(...items));

  const seen = new Set();
  const deduped = [];
  out
    .sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime())
    .forEach((item) => {
      const key = item.url || `${item.handle}|${item.text}`;
      if (seen.has(key)) return;
      seen.add(key);
      deduped.push(item);
    });

  return deduped.slice(0, Math.max(12, limit * handles.length));
}

function buildFallbackItems(handles) {
  const now = Date.now();
  const notes = [
    'AI infrastructure tone improving; watch semis and cloud beta.',
    'Rate path chatter picking up into macro prints; keep duration hedge active.',
    'Energy and transport updates can ripple into broad equity risk appetite.',
    'High-beta names reacting to product cycle commentary from top founders.',
    'Policy headlines from major officials may shift index futures quickly.'
  ];

  return handles.slice(0, 8).map((handle, idx) => ({
    handle,
    text: `${handle}: ${notes[idx % notes.length]}`,
    time: new Date(now - idx * 1000 * 60 * 17).toISOString(),
    url: `https://x.com/${encodeURIComponent(handle)}`,
    likes: null,
    reposts: null,
    source: 'BBS Fallback'
  }));
}

module.exports = async (req, res) => {
  if (req.method && req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const handles = parseHandles(req.query?.handles || '') || [];
  const selected = handles.length ? handles : DEFAULT_HANDLES;
  const limit = normalizeLimit(req.query?.limit);
  const bearerToken = String(process.env.X_BEARER_TOKEN || '').trim();

  let mode = 'SIM';
  let items = [];
  let source = 'fallback';

  try {
    if (bearerToken) {
      items = await fetchXApiItems(selected, limit, bearerToken);
      if (items.length) {
        mode = 'LIVE';
        source = 'x_api';
      }
    }

    if (!items.length) {
      const rssItems = await fetchNitterItems(selected, limit);
      if (rssItems.length) {
        items = rssItems;
        mode = 'LIVE';
        source = 'nitter_rss';
      }
    }

    if (!items.length) {
      items = buildFallbackItems(selected);
      mode = 'SIM';
      source = 'fallback';
    }

    res.setHeader('Cache-Control', 's-maxage=20, stale-while-revalidate=60');
    res.status(200).json({
      mode,
      source,
      handles: selected,
      items
    });
  } catch (error) {
    res.status(500).json({
      error: 'x-impact fetch failed',
      message: error && error.message ? error.message : 'Unknown error'
    });
  }
};
