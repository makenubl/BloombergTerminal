'use strict';

const PROVIDER_MAP = {
  claude: {
    label: 'Claude',
    handles: ['claudeai', 'anthropicai']
  },
  openai: {
    label: 'OpenAI',
    handles: ['openai', 'sama']
  },
  perplexity: {
    label: 'Perplexity',
    handles: ['perplexity_ai', 'aravsrinivas']
  }
};

const NITTER_INSTANCES = [
  'https://nitter.net',
  'https://nitter.privacydev.net',
  'https://nitter.poast.org'
];

const IMPACT_RULES = [
  {
    id: 'medical-ai',
    keywords: ['medical', 'healthcare', 'clinical', 'hospital', 'patient', 'diagnostic', 'pharma', 'biotech'],
    shortTargets: [
      { industry: 'Legacy Healthcare Software', symbol: 'BBS_HLTH_LEGACY', thesis: 'AI-native workflows can compress old software margins.' },
      { industry: 'Traditional Outsourced Services', symbol: 'BBS_MED_BPO', thesis: 'Automation risk increases for repetitive healthcare service layers.' }
    ],
    longTargets: [
      { industry: 'AI Compute Suppliers', symbol: 'BBS_AI_COMPUTE', thesis: 'Inference demand rises with specialized medical models.' }
    ]
  },
  {
    id: 'search-agents',
    keywords: ['search', 'agent', 'assistant', 'answer engine', 'deep research', 'browser'],
    shortTargets: [
      { industry: 'Legacy Search Monetization', symbol: 'BBS_SEARCH_LEGACY', thesis: 'Answer-first UX can pressure link-click ad flows.' },
      { industry: 'Manual Research Vendors', symbol: 'BBS_RES_TOOLS', thesis: 'Automated synthesis may displace manual analyst workflows.' }
    ],
    longTargets: [
      { industry: 'Inference Infrastructure', symbol: 'BBS_AI_INFRA', thesis: 'Higher query complexity increases compute consumption.' }
    ]
  },
  {
    id: 'coding-devtools',
    keywords: ['code', 'coding', 'developer', 'repo', 'debug', 'agentic coding', 'swe', 'programming'],
    shortTargets: [
      { industry: 'Legacy IT Services', symbol: 'BBS_IT_SERV', thesis: 'Code automation can reduce manual implementation demand.' },
      { industry: 'Entry-Level Coding Market', symbol: 'BBS_JR_DEV', thesis: 'Task automation compresses simple coding value pools.' }
    ],
    longTargets: [
      { industry: 'Dev Compute + Tooling', symbol: 'BBS_DEV_INFRA', thesis: 'Autonomous dev loops require more cloud + model calls.' }
    ]
  },
  {
    id: 'enterprise-workflows',
    keywords: ['enterprise', 'workflow', 'crm', 'sales', 'support', 'customer service', 'backoffice'],
    shortTargets: [
      { industry: 'Legacy Workflow Suites', symbol: 'BBS_WORKFLOW_OLD', thesis: 'AI-native orchestration can displace rigid seat-based products.' }
    ],
    longTargets: [
      { industry: 'Automation Platforms', symbol: 'BBS_AUTOMATION', thesis: 'Orchestration demand increases with enterprise adoption.' }
    ]
  },
  {
    id: 'education',
    keywords: ['education', 'learning', 'student', 'tutor', 'curriculum', 'classroom'],
    shortTargets: [
      { industry: 'Traditional Test Prep', symbol: 'BBS_TEST_PREP', thesis: 'Personalized tutoring agents can pressure fixed-content businesses.' }
    ],
    longTargets: [
      { industry: 'Adaptive Learning AI', symbol: 'BBS_EDTECH_AI', thesis: 'Agent tutors increase adaptive learning demand.' }
    ]
  }
];

const LAUNCH_WORDS = [
  'launch',
  'launched',
  'release',
  'released',
  'shipping',
  'ships',
  'rollout',
  'rolling out',
  'introduce',
  'introducing',
  'new feature',
  'now supports',
  'available now',
  'announcing',
  'beta'
];

function sanitizeHandle(raw) {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/^@+/, '')
    .replace(/[^a-z0-9_]/g, '')
    .slice(0, 15);
}

function parseProviders(raw) {
  const requested = String(raw || '')
    .split(',')
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean);
  if (!requested.length) return ['claude', 'openai', 'perplexity'];
  return requested.filter((name, idx) => PROVIDER_MAP[name] && requested.indexOf(name) === idx);
}

function normalizeLimit(raw, fallback = 4) {
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(1, Math.min(8, Math.floor(n)));
}

function normalizeMinConfidence(raw) {
  const n = Number(raw);
  if (!Number.isFinite(n)) return 62;
  return Math.max(45, Math.min(95, Math.floor(n)));
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

async function fetchWithTimeout(url, options = {}, timeoutMs = 2400) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function fetchXUserId(handle, bearerToken) {
  const res = await fetchWithTimeout(
    `https://api.twitter.com/2/users/by/username/${encodeURIComponent(handle)}?user.fields=username`,
    { headers: { Authorization: `Bearer ${bearerToken}` } },
    2000
  );
  if (!res.ok) return '';
  const payload = await res.json().catch(() => ({}));
  return payload?.data?.id || '';
}

async function fetchXPosts(handle, bearerToken, limit) {
  const userId = await fetchXUserId(handle, bearerToken);
  if (!userId) return [];

  const url =
    `https://api.twitter.com/2/users/${encodeURIComponent(userId)}/tweets` +
    `?max_results=${encodeURIComponent(String(limit))}` +
    '&exclude=replies,retweets' +
    '&tweet.fields=created_at,public_metrics';

  const res = await fetchWithTimeout(url, { headers: { Authorization: `Bearer ${bearerToken}` } }, 2600);
  if (!res.ok) return [];
  const payload = await res.json().catch(() => ({}));
  const tweets = Array.isArray(payload?.data) ? payload.data : [];

  return tweets
    .map((tweet) => ({
      handle,
      text: String(tweet?.text || '').trim(),
      time: tweet?.created_at || new Date().toISOString(),
      url: `https://x.com/${encodeURIComponent(handle)}/status/${encodeURIComponent(tweet.id || '')}`,
      likes: Number(tweet?.public_metrics?.like_count || 0),
      reposts: Number(tweet?.public_metrics?.retweet_count || 0),
      source: 'X API'
    }))
    .filter((item) => item.text);
}

function parseRssItems(xml, handle, limit) {
  const items = [];
  const matches = String(xml || '').match(/<item>([\s\S]*?)<\/item>/g) || [];
  for (let i = 0; i < matches.length && items.length < limit; i += 1) {
    const row = matches[i];
    const title = (row.match(/<title>([\s\S]*?)<\/title>/i) || [])[1] || '';
    const link = (row.match(/<link>([\s\S]*?)<\/link>/i) || [])[1] || '';
    const pubDate = (row.match(/<pubDate>([\s\S]*?)<\/pubDate>/i) || [])[1] || '';
    const text = stripHtml(title).replace(/^RT by [^:]+:\s*/i, '').trim();
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

async function fetchNitterPosts(handle, limit) {
  for (const base of NITTER_INSTANCES) {
    try {
      const url = `${base}/${encodeURIComponent(handle)}/rss`;
      const res = await fetchWithTimeout(url, { headers: { 'User-Agent': 'BBS-Terminal/1.0' } }, 1600);
      if (!res.ok) continue;
      const xml = await res.text();
      const items = parseRssItems(xml, handle, limit);
      if (items.length) return items;
    } catch (error) {
      // Try the next instance.
    }
  }
  return [];
}

function buildFallbackPosts(provider, handles, limit) {
  const now = Date.now();
  const templates = {
    claude: [
      'We are rolling out a new medical reasoning workflow for clinical teams.',
      'New enterprise feature: agentic analysis with compliance controls.',
      'Expanded coding agent capabilities for complex repos.'
    ],
    openai: [
      'Launching deeper research workflows for enterprise knowledge teams.',
      'New model release with stronger coding and tool use behavior.',
      'Rolling out healthcare-safe assistant patterns with evaluation guardrails.'
    ],
    perplexity: [
      'Introducing faster answer-engine retrieval for finance and policy.',
      'New enterprise search release with private knowledge graph support.',
      'Shipping deeper research agent capabilities for analysts.'
    ]
  };

  const source = templates[provider] || ['New platform update released for enterprise users.'];
  return source.slice(0, limit).map((text, idx) => ({
    handle: handles[0] || provider,
    text,
    time: new Date(now - idx * 17 * 60 * 1000).toISOString(),
    url: `https://x.com/${encodeURIComponent(handles[0] || provider)}`,
    likes: null,
    reposts: null,
    source: 'BBS Fallback'
  }));
}

function detectImpacts(text) {
  const normalized = String(text || '').toLowerCase();
  const matched = [];

  IMPACT_RULES.forEach((rule) => {
    const hits = rule.keywords.filter((kw) => normalized.includes(kw));
    if (!hits.length) return;
    matched.push({ rule, hits });
  });

  const isLaunch = LAUNCH_WORDS.some((kw) => normalized.includes(kw));
  return { matched, isLaunch };
}

function hashSeed(value) {
  const s = String(value || '');
  let h = 0;
  for (let i = 0; i < s.length; i += 1) {
    h = (h << 5) - h + s.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h).toString(36);
}

function buildSignals(provider, label, posts, minConfidence) {
  const signals = [];
  posts.forEach((post) => {
    const { matched, isLaunch } = detectImpacts(post.text);
    if (!matched.length) return;

    const keywordHits = matched.reduce((acc, row) => acc + row.hits.length, 0);
    const engagement = Math.min(14, Math.floor((Number(post.likes || 0) + Number(post.reposts || 0) * 2) / 200));
    let confidence = 50 + keywordHits * 7 + (isLaunch ? 12 : 0) + engagement;
    if (!isLaunch) confidence -= 8;
    confidence = Math.max(35, Math.min(98, confidence));
    if (confidence < minConfidence) return;

    const industries = [];
    const shortIdeas = [];
    const longIdeas = [];
    matched.forEach(({ rule, hits }) => {
      rule.shortTargets.forEach((target) => {
        industries.push({
          industry: target.industry,
          side: 'SHORT',
          thesis: target.thesis,
          score: Math.min(99, confidence + hits.length * 2),
          symbol: target.symbol
        });
        shortIdeas.push({
          side: 'SHORT',
          symbol: target.symbol,
          industry: target.industry,
          thesis: target.thesis
        });
      });
      rule.longTargets.forEach((target) => {
        longIdeas.push({
          side: 'LONG',
          symbol: target.symbol,
          industry: target.industry,
          thesis: target.thesis
        });
      });
    });

    const uniqueIndustries = [];
    industries.forEach((row) => {
      if (!uniqueIndustries.some((item) => item.industry === row.industry)) uniqueIndustries.push(row);
    });

    const id = `${provider}_${hashSeed(`${post.time}|${post.text}`)}`;
    signals.push({
      id,
      provider,
      providerLabel: label,
      handle: post.handle,
      postText: post.text,
      postTime: post.time,
      postUrl: post.url,
      source: post.source,
      confidence,
      catalystType: isLaunch ? 'Feature Launch' : 'Strategic Signal',
      themes: matched.map(({ rule }) => rule.id),
      industries: uniqueIndustries,
      shortIdeas,
      longIdeas
    });
  });

  return signals;
}

function buildIndustryBoard(signals) {
  const board = new Map();
  signals.forEach((signal) => {
    signal.industries.forEach((row) => {
      const key = `${row.side}:${row.industry}`;
      const prev = board.get(key) || {
        industry: row.industry,
        side: row.side,
        pressureScore: 0,
        symbols: []
      };
      prev.pressureScore += row.score;
      if (row.symbol && !prev.symbols.includes(row.symbol)) prev.symbols.push(row.symbol);
      board.set(key, prev);
    });
  });

  return Array.from(board.values())
    .map((row) => ({
      ...row,
      pressureScore: Math.min(100, Math.round(row.pressureScore / Math.max(1, row.symbols.length)))
    }))
    .sort((a, b) => b.pressureScore - a.pressureScore);
}

module.exports = async (req, res) => {
  if (req.method && req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const providers = parseProviders(req.query?.providers);
  const limit = normalizeLimit(req.query?.limit, 4);
  const minConfidence = normalizeMinConfidence(req.query?.minConfidence);
  const bearerToken = String(process.env.X_BEARER_TOKEN || '').trim();

  let mode = 'SIM';
  let source = 'fallback';
  const signals = [];

  try {
    for (const provider of providers) {
      const cfg = PROVIDER_MAP[provider];
      if (!cfg) continue;
      let posts = [];

      if (bearerToken) {
        for (const handle of cfg.handles.map(sanitizeHandle).filter(Boolean)) {
          const xPosts = await fetchXPosts(handle, bearerToken, limit);
          posts.push(...xPosts);
          if (posts.length >= limit) break;
        }
        if (posts.length) {
          mode = 'LIVE';
          source = 'x_api';
        }
      }

      if (!posts.length) {
        for (const handle of cfg.handles.map(sanitizeHandle).filter(Boolean)) {
          const rssPosts = await fetchNitterPosts(handle, limit);
          posts.push(...rssPosts);
          if (posts.length >= limit) break;
        }
        if (posts.length) {
          mode = 'LIVE';
          source = source === 'x_api' ? 'mixed' : 'nitter_rss';
        }
      }

      if (!posts.length) {
        posts = buildFallbackPosts(provider, cfg.handles, limit);
      }

      posts.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());
      const providerSignals = buildSignals(provider, cfg.label, posts.slice(0, limit + 2), minConfidence);
      signals.push(...providerSignals);
    }

    signals.sort((a, b) => {
      if (b.confidence !== a.confidence) return b.confidence - a.confidence;
      return new Date(b.postTime).getTime() - new Date(a.postTime).getTime();
    });

    const limitedSignals = signals.slice(0, 24);
    const industryBoard = buildIndustryBoard(limitedSignals);

    res.setHeader('Cache-Control', 's-maxage=20, stale-while-revalidate=60');
    res.status(200).json({
      mode,
      source,
      scannedAt: new Date().toISOString(),
      providers,
      minConfidence,
      signalCount: limitedSignals.length,
      signals: limitedSignals,
      industryBoard
    });
  } catch (error) {
    res.status(500).json({
      error: 'provider-impact fetch failed',
      message: error && error.message ? error.message : 'Unknown error'
    });
  }
};
