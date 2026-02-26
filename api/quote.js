'use strict';

function toSignedPercent(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return '0.00%';
  return `${num >= 0 ? '+' : ''}${num.toFixed(2)}%`;
}

function normalizeSymbol(raw) {
  const symbol = String(raw || 'AAPL').trim().toUpperCase();
  if (!symbol) return 'AAPL';
  return symbol.replace(/[^A-Z0-9.\-^=]/g, '').slice(0, 18) || 'AAPL';
}

module.exports = async (req, res) => {
  if (req.method && req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const symbol = normalizeSymbol(req.query?.symbol);
  const quoteUrl = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(symbol)}`;

  try {
    const response = await fetch(quoteUrl, {
      headers: { 'User-Agent': 'BBS-Terminal/1.0' }
    });

    if (!response.ok) {
      res.status(502).json({ error: `Upstream quote error: ${response.status}` });
      return;
    }

    const data = await response.json();
    const item = data?.quoteResponse?.result?.[0];
    if (!item) {
      res.status(404).json({ error: `No quote found for ${symbol}` });
      return;
    }

    const marketTime = Number(item.regularMarketTime || 0);
    const latestTradingDay = marketTime
      ? new Date(marketTime * 1000).toISOString().slice(0, 10)
      : new Date().toISOString().slice(0, 10);

    const price = Number(item.regularMarketPrice || 0);
    const change = Number(item.regularMarketChange || 0);
    const changePercent = toSignedPercent(item.regularMarketChangePercent);

    res.setHeader('Cache-Control', 's-maxage=10, stale-while-revalidate=30');
    res.status(200).json({
      symbol: item.symbol || symbol,
      price,
      change,
      changePercent,
      volume: Number(item.regularMarketVolume || 0),
      open: Number(item.regularMarketOpen || 0),
      high: Number(item.regularMarketDayHigh || 0),
      low: Number(item.regularMarketDayLow || 0),
      previousClose: Number(item.regularMarketPreviousClose || 0),
      latestTradingDay
    });
  } catch (error) {
    res.status(500).json({
      error: 'Quote fetch failed',
      message: error && error.message ? error.message : 'Unknown error'
    });
  }
};

