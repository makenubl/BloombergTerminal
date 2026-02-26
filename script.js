const liveTime = document.getElementById("live-time");
const tickerTrack = document.getElementById("ticker-track");
const moversBody = document.getElementById("movers-body");
const headlineText = document.getElementById("headline-text");
const curveLine = document.getElementById("curve-line");
const curveArea = document.getElementById("curve-area");
const cmdInput = document.getElementById("cmd-input");
const cmdRun = document.getElementById("cmd-run");
const cmdFeedback = document.getElementById("cmd-feedback");

const tickerData = [
  { symbol: "SPX", price: "5,182.44", chg: "+0.56%" },
  { symbol: "NDX", price: "18,902.10", chg: "+0.83%" },
  { symbol: "EURUSD", price: "1.0842", chg: "-0.42%" },
  { symbol: "US10Y", price: "4.31%", chg: "+0.07%" },
  { symbol: "WTI", price: "79.22", chg: "+1.90%" },
  { symbol: "BTC", price: "64,540", chg: "+2.20%" },
  { symbol: "XAU", price: "2,114", chg: "-0.80%" }
];

const moversData = [
  { symbol: "NVDA", price: "921.37", chg: "+4.8%" },
  { symbol: "MSFT", price: "427.91", chg: "+1.3%" },
  { symbol: "TSLA", price: "191.44", chg: "-2.9%" },
  { symbol: "AMZN", price: "182.25", chg: "+1.1%" },
  { symbol: "META", price: "503.81", chg: "+2.4%" },
  { symbol: "AAPL", price: "192.63", chg: "-0.6%" }
];

const headlines = [
  "Global risk appetite strengthens as bond volatility cools after central bank comments.",
  "Oil extends gains on tighter shipping lanes while equities lean into AI-led earnings strength.",
  "Dollar momentum pauses as traders reprice rate path following mixed labor and inflation signals.",
  "Crypto liquidity broadens as institutional flows rotate toward large-cap digital assets."
];

const knownCommands = {
  TOP: "Opening top news monitor...",
  WEI: "World equity indices loaded.",
  ECO: "Economic calendar displayed.",
  BI: "Bloomberg intelligence brief ready.",
  FXIP: "FX implied pricing terminal initialized."
};

function tickClock() {
  const now = new Date();
  liveTime.textContent = now.toLocaleTimeString("en-US", { hour12: false });
}

function renderTicker() {
  const nodes = [...tickerData, ...tickerData]
    .map((item) => {
      const cls = item.chg.startsWith("-") ? "down" : "up";
      return `<span class="ticker-item">${item.symbol} ${item.price} <strong class="${cls}">${item.chg}</strong></span>`;
    })
    .join("");
  tickerTrack.innerHTML = nodes;
}

function renderMovers() {
  moversBody.innerHTML = moversData
    .map((row) => {
      const cls = row.chg.startsWith("-") ? "neg" : "pos";
      return `<tr><td>${row.symbol}</td><td>${row.price}</td><td class="${cls}">${row.chg}</td></tr>`;
    })
    .join("");
}

function rotateHeadline() {
  let idx = 0;
  headlineText.textContent = headlines[idx];
  setInterval(() => {
    idx = (idx + 1) % headlines.length;
    headlineText.textContent = headlines[idx];
  }, 4500);
}

function buildCurve() {
  const points = [];
  const width = 520;
  const height = 190;
  const steps = 24;

  for (let i = 0; i <= steps; i += 1) {
    const x = (i / steps) * width;
    const base = 98 + Math.sin(i * 0.5) * 26 + Math.cos(i * 0.25) * 16;
    const y = Math.max(28, Math.min(height - 22, base + (Math.random() - 0.5) * 16));
    points.push([x, y]);
  }

  const line = points.map(([x, y]) => `${x},${y}`).join(" ");
  const area = `${line} ${width},${height} 0,${height}`;
  curveLine.setAttribute("points", line);
  curveArea.setAttribute("points", area);
}

function runCommand() {
  const raw = cmdInput.value.trim();
  if (!raw) {
    cmdFeedback.textContent = "Enter a command.";
    return;
  }

  const key = raw.toUpperCase();
  cmdFeedback.textContent = knownCommands[key] || `Command "${raw}" not recognized.`;
  cmdInput.value = "";
}

cmdRun.addEventListener("click", runCommand);
cmdInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    runCommand();
  }
});

tickClock();
renderTicker();
renderMovers();
rotateHeadline();
buildCurve();
setInterval(tickClock, 1000);
setInterval(buildCurve, 3500);
