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

// ===============================
// API-FOOTBALL REQUEST
// ===============================

async function api(endpoint, params = {}) {
  if (!API_KEY) {
    throw new Error("API_FOOTBALL_KEY is not configured.");
  }

  const query = new URLSearchParams(params);
  const url = `${API_BASE}${endpoint}?${query.toString()}`;

  const now = Date.now();
  const cached = cache.get(url);

  if (cached && now - cached.time < CACHE_MS) {
    return cached.data;
  }

  const response = await fetch(url, {
    headers: {
      "x-apisports-key": API_KEY
    }
  });

  if (!response.ok) {
    throw new Error(`API request failed: ${response.status}`);
  }

  const data = await response.json();

  if (data.errors && Object.keys(data.errors).length > 0) {
    throw new Error(Object.values(data.errors).join(", "));
  }

  cache.set(url, {
    time: now,
    data
  });

  return data;
}

// ===============================
// POISSON MODEL
// ===============================

function poisson(k, lambda) {
  if (lambda <= 0) {
    return k === 0 ? 1 : 0;
  }

  let factorial = 1;

  for (let i = 2; i <= k; i++) {
    factorial *= i;
  }

  return (
    Math.exp(-lambda) *
    Math.pow(lambda, k) /
    factorial
  );
}

function poissonModel(homeGoals, awayGoals) {
  const matrix = [];

  let home = 0;
  let draw = 0;
  let away = 0;
  let over15 = 0;
  let over25 = 0;
  let over35 = 0;
  let over45 = 0;
  let btts = 0;

  for (let h = 0; h <= 7; h++) {
    for (let a = 0; a <= 7; a++) {

      const probability =
        poisson(h, homeGoals) *
        poisson(a, awayGoals);

      matrix.push({
        home: h,
        away: a,
        probability
      });

      if (h > a) {
        home += probability;
      } else if (h === a) {
        draw += probability;
      } else {
        away += probability;
      }

      if (h + a >= 2) over15 += probability;
      if (h + a >= 3) over25 += probability;
      if (h + a >= 4) over35 += probability;
      if (h + a >= 5) over45 += probability;

      if (h > 0 && a > 0) {
        btts += probability;
      }
    }
  }

  matrix.sort(
    (a, b) => b.probability - a.probability
  );

  return {
    home: home * 100,
    draw: draw * 100,
    away: away * 100,

    over15: over15 * 100,
    under15: (1 - over15) * 100,

    over25: over25 * 100,
    under25: (1 - over25) * 100,

    over35: over35 * 100,
    under35: (1 - over35) * 100,

    over45: over45 * 100,
    under45: (1 - over45) * 100,

    btts: btts * 100,
    noBtts: (1 - btts) * 100,

    scores: matrix
      .slice(0, 5)
      .map(item => ({
        score: `${item.home}-${item.away}`,
        probability: item.probability * 100
      }))
  };
}

// ===============================
// API-FOOTBALL PREDICTION
// ===============================

function parsePrediction(data) {
  const prediction = data?.response?.[0];

  if (!prediction) {
    return null;
  }

  const percentages =
    prediction.predictions?.percent || {};

  const goals =
    prediction.predictions?.goals || {};

  const home =
    Number(
      String(percentages.home || "0")
        .replace("%", "")
    );

  const draw =
    Number(
      String(percentages.draw || "0")
        .replace("%", "")
    );

  const away =
    Number(
      String(percentages.away || "0")
        .replace("%", "")
    );

  const homeGoals =
    Number(goals.home) || 1.35;

  const awayGoals =
    Number(goals.away) || 1.10;

  return {
    home,
    draw,
    away,

    winner:
      prediction.predictions?.winner?.name ||
      "No clear winner",

    advice:
      prediction.predictions?.advice ||
      "No advice available",

    underOver:
      prediction.predictions?.under_over ||
      "",

    homeGoals,
    awayGoals
  };
}

// ===============================
// STATUS
// ===============================

app.get("/api/status", (req, res) => {
  res.json({
    ok: true,
    configured: Boolean(API_KEY),
    cacheMinutes: CACHE_MS / 60000
  });
});

// ===============================
// FIXTURES
// ===============================

app.get("/api/fixtures", async (req, res) => {

  try {

    const {
      date,
      from,
      to,
      league,
      season,
      next
    } = req.query;

    const params = {};

    if (date) {
      params.date = date;
    }

    if (from && to) {
      params.from = from;
      params.to = to;
    }

    if (league) {
      params.league = league;
    }

    if (season) {
      params.season = season;
    }

    if (next) {
      params.next = next;
    }

    params.timezone =
      req.query.timezone ||
      "Africa/Nairobi";

    const data =
      await api("/fixtures", params);

    const fixtures =
      data.response || [];

    const enriched = [];

    // Limit requests so the free API plan is not
    // consumed too quickly.

    for (
      const fixture of fixtures.slice(0, 20)
    ) {

      let prediction = null;

      try {

        const predictionData =
          await api("/predictions", {
            fixture: fixture.fixture.id
          });

        prediction =
          parsePrediction(predictionData);

      } catch (error) {

        console.log(
          "Prediction unavailable:",
          fixture.fixture.id
        );
      }

      const homeGoals =
        prediction?.homeGoals || 1.35;

      const awayGoals =
        prediction?.awayGoals || 1.10;

      const model =
        poissonModel(
          homeGoals,
          awayGoals
        );

      enriched.push({

        id: fixture.fixture.id,

        date: fixture.fixture.date,

        status:
          fixture.fixture.status?.short,

        league:
          fixture.league?.name,

        country:
          fixture.league?.country,

        leagueLogo:
          fixture.league?.logo,

        home: {
          id: fixture.teams?.home?.id,
          name: fixture.teams?.home?.name,
          logo: fixture.teams?.home?.logo
        },

        away: {
          id: fixture.teams?.away?.id,
          name: fixture.teams?.away?.name,
          logo: fixture.teams?.away?.logo
        },

        venue:
          fixture.fixture.venue?.name,

        score:
          fixture.goals,

        prediction: {

          api: prediction,

          winner:
            prediction?.winner ||
            "Model estimate",

          advice:
            prediction?.advice ||
            "",

          poisson: model

        }

      });
    }

    res.json({

      results: enriched,

      count: enriched.length,

      source: "API-Football"

    });

  } catch (error) {

    console.error(error);

    res.status(500).json({
      error: error.message
    });

  }

});

// ===============================
// MATCH DETAILS
// ===============================

app.get("/api/match/:id", async (req, res) => {

  try {

    const id = req.params.id;

    const results =
      await Promise.allSettled([

        api("/fixtures", {
          id
        }),

        api("/predictions", {
          fixture: id
        }),

        api("/odds", {
          fixture: id
        })

      ]);

    res.json({

      fixture:
        results[0].status === "fulfilled"
          ? results[0].value.response?.[0]
          : null,

      prediction:
        results[1].status === "fulfilled"
          ? results[1].value.response?.[0]
          : null,

      odds:
        results[2].status === "fulfilled"
          ? results[2].value.response || []
          : []

    });

  } catch (error) {

    res.status(500).json({
      error: error.message
    });

  }

});

// ===============================
// HEAD TO HEAD
// ===============================

app.get("/api/h2h", async (req, res) => {

  try {

    const {
      home,
      away
    } = req.query;

    if (!home || !away) {

      return res.status(400).json({
        error:
          "home and away are required"
      });

    }

    const data =
      await api(
        "/fixtures/headtohead",
        {
          h2h: `${home}-${away}`,
          last: 10
        }
      );

    res.json(data);

  } catch (error) {

    res.status(500).json({
      error: error.message
    });

  }

});

// ===============================
// STANDINGS
// ===============================

app.get("/api/standings", async (req, res) => {

  try {

    const {
      league,
      season
    } = req.query;

    if (!league || !season) {

      return res.status(400).json({
        error:
          "league and season are required"
      });

    }

    const data =
      await api(
        "/standings",
        {
          league,
          season
        }
      );

    res.json(data);

  } catch (error) {

    res.status(500).json({
      error: error.message
    });

  }

});

// ===============================
// FRONTEND FALLBACK
// Express 5 compatible
// ===============================

app.use((req, res) => {

  res.sendFile(
    path.join(
      __dirname,
      "public",
      "index.html"
    )
  );

});

// ===============================
// START SERVER
// ===============================

app.listen(
  PORT,
  "0.0.0.0",
  () => {

    console.log(
      `GoalPredict running on port ${PORT}`
    );

  }
);
