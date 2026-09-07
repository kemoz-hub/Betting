const express = require("express");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;
const API_KEY = process.env.API_FOOTBALL_KEY;
const API_BASE = "https://v3.football.api-sports.io";

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const cache = new Map();
const CACHE_MS = 5 * 60 * 1000;

async function api(pathname, params = {}) {
  if (!API_KEY) throw new Error("API_FOOTBALL_KEY is not configured.");
  const qs = new URLSearchParams(params);
  const url = `${API_BASE}${pathname}?${qs.toString()}`;
  const key = url;
  const now = Date.now();
  const hit = cache.get(key);
  if (hit && now - hit.time < CACHE_MS) return hit.data;

  const r = await fetch(url, { headers: { "x-apisports-key": API_KEY } });
  if (!r.ok) throw new Error(`API request failed: ${r.status}`);
  const data = await r.json();
  if (data.errors && Object.keys(data.errors).length) {
    throw new Error(Object.values(data.errors).join(", "));
  }
  cache.set(key, { time: now, data });
  return data;
}

function poisson(k, lambda) {
  if (lambda <= 0) return k === 0 ? 1 : 0;
  let fact = 1;
  for (let i = 2; i <= k; i++) fact *= i;
  return Math.exp(-lambda) * Math.pow(lambda, k) / fact;
}

function modelFromApiPrediction(pred) {
  const p = pred?.response?.[0];
  if (!p) return null;
  const pct = p.predictions?.percent || {};
  const home = Number(String(pct.home || "0").replace("%",""));
  const draw = Number(String(pct.draw || "0").replace("%",""));
  const away = Number(String(pct.away || "0").replace("%",""));
  const advice = p.predictions?.advice || "No advice available";
  const winner = p.predictions?.winner?.name || "No clear winner";
  const underOver = p.predictions?.under_over || "";
  const goals = p.predictions?.goals || {};
  const hg = Number(goals.home) || 1.35;
  const ag = Number(goals.away) || 1.10;
  return { home, draw, away, advice, winner, underOver, hg, ag };
}

function poissonModel(hg, ag) {
  const matrix = [];
  let home = 0, draw = 0, away = 0, over25 = 0, btts = 0;
  for (let h = 0; h <= 7; h++) {
    for (let a = 0; a <= 7; a++) {
      const p = poisson(h,hg) * poisson(a,ag);
      matrix.push({h,a,p});
      if (h>a) home += p;
      else if (h===a) draw += p;
      else away += p;
      if (h+a >= 3) over25 += p;
      if (h>0 && a>0) btts += p;
    }
  }
  matrix.sort((x,y)=>y.p-x.p);
  return {
    home: home*100, draw: draw*100, away: away*100,
    over25: over25*100, under25: (1-over25)*100,
    btts: btts*100, noBtts:(1-btts)*100,
    scores: matrix.slice(0,5).map(x=>({score:`${x.h}-${x.a}`,p:x.p*100}))
  };
}

app.get("/api/status", (_req,res)=>res.json({
  ok: true, configured: Boolean(API_KEY),
  cacheMinutes: CACHE_MS/60000
}));

app.get("/api/fixtures", async (req,res)=>{
  try {
    const { date, from, to, league, season, next } = req.query;
    const params = {};
    if (date) params.date=date;
    else if (from && to) { params.from=from; params.to=to; }
    if (league) params.league=league;
    if (season) params.season=season;
    if (next) params.next=next;
    params.timezone = req.query.timezone || "Africa/Nairobi";
    const data = await api("/fixtures", params);
    const fixtures = data.response || [];
    const enriched = [];
    for (const f of fixtures.slice(0, 30)) {
      let prediction = null;
      try {
        const pd = await api("/predictions", { fixture: f.fixture.id });
        prediction = modelFromApiPrediction(pd);
      } catch {}
      const fallback = poissonModel(prediction?.hg || 1.35, prediction?.ag || 1.10);
      enriched.push({
        id:f.fixture.id,
        date:f.fixture.date,
        status:f.fixture.status?.short,
        league:f.league?.name,
        country:f.league?.country,
        leagueLogo:f.league?.logo,
        home:{id:f.teams?.home?.id,name:f.teams?.home?.name,logo:f.teams?.home?.logo},
        away:{id:f.teams?.away?.id,name:f.teams?.away?.name,logo:f.teams?.away?.logo},
        venue:f.fixture.venue?.name,
        score:f.goals,
        prediction: prediction ? {...prediction, poisson:fallback} : {winner:"Model estimate",poisson:fallback}
      });
    }
    res.json({results: enriched, count: enriched.length, source:"API-Football"});
  } catch(e) { res.status(500).json({error:e.message}); }
});

app.get("/api/match/:id", async (req,res)=>{
  try {
    const id=req.params.id;
    const [fx,pd,odds] = await Promise.allSettled([
      api("/fixtures",{id}),
      api("/predictions",{fixture:id}),
      api("/odds",{fixture:id})
    ]);
    res.json({
      fixture: fx.status==="fulfilled" ? fx.value.response?.[0] : null,
      prediction: pd.status==="fulfilled" ? pd.value.response?.[0] : null,
      odds: odds.status==="fulfilled" ? odds.value.response : []
    });
  } catch(e) { res.status(500).json({error:e.message}); }
});

app.get("/api/h2h", async (req,res)=>{
  try {
    const {home,away}=req.query;
    if(!home||!away) return res.status(400).json({error:"home and away are required"});
    const data=await api("/fixtures/headtohead",{h2h:`${home}-${away}`,last:10});
    res.json(data);
  } catch(e){res.status(500).json({error:e.message});}
});

app.get("/api/standings", async (req,res)=>{
  try {
    const data=await api("/standings",{league:req.query.league,season:req.query.season});
    res.json(data);
  } catch(e){res.status(500).json({error:e.message});}
});

app.get("*", (_req,res)=>res.sendFile(path.join(__dirname,"public","index.html")));

app.listen(PORT, ()=>console.log(`Football Prediction Website running on http://localhost:${PORT}`));
