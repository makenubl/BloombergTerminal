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

async function fetchFromQuoteEndpoint(symbol) {
  const quoteUrl = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(symbol)}`;
  const response = await fetch(quoteUrl, {
    headers: { 'User-Agent': 'BBS-Terminal/1.0' }
  });
  if (!response.ok) return null;
  const data = await response.json();
  return data?.quoteResponse?.result?.[0] || null;
}

async function fetchFromChartEndpoint(symbol) {
  const chartUrl =
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}` +
    '?range=1d&interval=1m&includePrePost=false';

  const response = await fetch(chartUrl, {
    headers: { 'User-Agent': 'BBS-Terminal/1.0' }
  });
  if (!response.ok) return null;

  const data = await response.json();
  const result = data?.chart?.result?.[0];
  if (!result) return null;

  const meta = result.meta || {};
  const quote = result?.indicators?.quote?.[0] || {};
  const closes = (quote.close || []).map(Number).filter(Number.isFinite);
  const highs = (quote.high || []).map(Number).filter(Number.isFinite);
  const lows = (quote.low || []).map(Number).filter(Number.isFinite);
  const opens = (quote.open || []).map(Number).filter(Number.isFinite);
  const volumes = (quote.volume || []).map(Number).filter(Number.isFinite);

  const previousClose = Number(meta.previousClose || meta.chartPreviousClose || 0);
  const price = Number(meta.regularMarketPrice || closes[closes.length - 1] || 0);
  const change = Number.isFinite(previousClose) && previousClose
    ? price - previousClose
    : Number(closes.length > 1 ? closes[closes.length - 1] - closes[closes.length - 2] : 0);
  const changePctValue = Number.isFinite(previousClose) && previousClose
    ? (change / previousClose) * 100
    : 0;

  return {
    symbol: meta.symbol || symbol,
    regularMarketPrice: price,
    regularMarketChange: change,
    regularMarketChangePercent: changePctValue,
    regularMarketVolume: volumes.reduce((acc, v) => acc + v, 0),
    regularMarketOpen: Number(meta.regularMarketOpen || opens[0] || 0),
    regularMarketDayHigh: Number(meta.regularMarketDayHigh || (highs.length ? Math.max(...highs) : 0)),
    regularMarketDayLow: Number(meta.regularMarketDayLow || (lows.length ? Math.min(...lows) : 0)),
    regularMarketPreviousClose: previousClose,
    regularMarketTime: Number(meta.regularMarketTime || 0)
  };
}

module.exports = async (req, res) => {
  if (req.method && req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const symbol = normalizeSymbol(req.query?.symbol);

  try {
    const item = (await fetchFromQuoteEndpoint(symbol)) || (await fetchFromChartEndpoint(symbol));
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
