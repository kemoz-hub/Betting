# GoalPredict Football Prediction Website

A browser-based football analytics website powered by API-Football.

## What it displays
- Today's fixtures
- Team and league search
- Home / Draw / Away probabilities
- Over / Under 2.5
- BTTS
- Top picks and confidence
- Correct-score estimates
- Match detail preview
- Calendar/date selection
- Responsive desktop/mobile interface

## Run locally
1. Install Node.js 18+.
2. Open this folder in a terminal.
3. Run `npm install`.
4. Copy `.env.example` to `.env` and put your API-Football key in it.
5. Start: `npm start`
6. Open http://localhost:3000

PowerShell alternative:
`$env:API_FOOTBALL_KEY="YOUR_KEY"; npm start`

The API key stays on the server and is not placed in the browser.

## Data source
API-Football / API-Sports. Their current site advertises football fixtures, standings, odds and predictions, including a free plan with 100 requests/day. Check current plan limits before production deployment.

## Production
Deploy the Node app to a Node-compatible host such as Render, Railway, Fly.io or a VPS. Set `API_FOOTBALL_KEY` as a server environment variable.

This is an analytics/prediction dashboard, not a guarantee of betting outcomes and it does not place bets automatically.
