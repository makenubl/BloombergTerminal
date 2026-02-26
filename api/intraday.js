'use strict';

function normalizeSymbol(raw) {
  const symbol = String(raw || 'AAPL').trim().toUpperCase();
  if (!symbol) return 'AAPL';
  return symbol.replace(/[^A-Z0-9.\-^=]/g, '').slice(0, 18) || 'AAPL';
}

function normalizeInterval(raw) {
  const value = String(raw || '5m').toLowerCase();
  const mapped = {
    '1min': '1m',
    '2min': '2m',
    '5min': '5m',
    '15min': '15m',
    '30min': '30m',
    '60min': '60m'
  };
  const candidate = mapped[value] || value;
  const allowed = new Set(['1m', '2m', '5m', '15m', '30m', '60m', '90m', '1h']);
  return allowed.has(candidate) ? candidate : '5m';
}

function normalizeRange(raw) {
  const candidate = String(raw || '1d').toLowerCase();
  const allowed = new Set(['1d', '5d', '1mo', '3mo', '6mo', '1y']);
  return allowed.has(candidate) ? candidate : '1d';
}

module.exports = async (req, res) => {
  if (req.method && req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const symbol = normalizeSymbol(req.query?.symbol);
  const interval = normalizeInterval(req.query?.interval);
  const range = normalizeRange(req.query?.range);

  const chartUrl =
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}` +
    `?range=${encodeURIComponent(range)}&interval=${encodeURIComponent(interval)}&includePrePost=false`;

  try {
    const response = await fetch(chartUrl, {
      headers: { 'User-Agent': 'BBS-Terminal/1.0' }
    });

    if (!response.ok) {
      res.status(502).json({ error: `Upstream intraday error: ${response.status}` });
      return;
    }

    const data = await response.json();
    const result = data?.chart?.result?.[0];
    const quote = result?.indicators?.quote?.[0];
    const timestamps = result?.timestamp || [];
    const opens = quote?.open || [];
    const highs = quote?.high || [];
    const lows = quote?.low || [];
    const closes = quote?.close || [];
    const volumes = quote?.volume || [];

    const candles = [];
    for (let i = 0; i < timestamps.length; i += 1) {
      const close = Number(closes[i]);
      const open = Number(opens[i]);
      const high = Number(highs[i]);
      const low = Number(lows[i]);
      if (!Number.isFinite(close)) continue;

      candles.push({
        timestamp: Number(timestamps[i] || 0),
        open: Number.isFinite(open) ? open : close,
        high: Number.isFinite(high) ? high : close,
        low: Number.isFinite(low) ? low : close,
        close,
        volume: Number.isFinite(Number(volumes[i])) ? Number(volumes[i]) : 0
      });
    }

    res.setHeader('Cache-Control', 's-maxage=10, stale-while-revalidate=30');
    res.status(200).json({
      symbol,
      interval,
      range,
      candles
    });
  } catch (error) {
    res.status(500).json({
      error: 'Intraday fetch failed',
      message: error && error.message ? error.message : 'Unknown error'
    });
  }
};

