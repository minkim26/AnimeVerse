# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

AnimeVerse is an anime recommendation web app: a static multi-page HTML/CSS/vanilla-JS frontend backed by one Node/Express auth API and three independent Flask microservices. There is no build step or bundler — pages are plain `.html` files that each load a matching `.js` file directly via `<script>` tags.

## Architecture

**Frontend** (repo root): Static pages, one per feature — `index.html`/`app.js` (landing + auth-gate logic), `login.html`/`login.js`, `signup.html`/`signup.js`, `preferences.html`/`preferences.js`, `profile.html`/`profile.js`, `recommendations.html`/`recommendations.js`. Auth state lives in `localStorage` (`token` key); `app.js` redirects unauthenticated users away from `preferences.html`, `recommendations.html`, and `profile.html`. `recommendations.js` calls the public Kitsu API (`https://kitsu.io/api/edge/...`) directly from the browser — it does not go through the Node backend.

**Backend** (`anime-verse-backend/`): Four separate services, each hardcoded to a specific `localhost` port and started independently (no orchestration script ties them together):
- `server.js` (Express, port **3000**) — auth and user data: `/api/login`, `/api/signup`, `/api/updatePassword`, `/api/updateUsername`, `/api/preferences/:email`, `/api/watchlist/:email`, `/api/reviews/:email`. All state is in-memory JS arrays/objects (`users`, `userPreferences`, `userWatchlists`, `userReviews`) — nothing persists across restarts, and Mongoose is a listed dependency but not yet wired to a real MongoDB connection.
- `microserviceA/CS361_microserviceA/microservice.py` (Flask, port **5000**) — `/random-profile-image`, `/images/<filename>`. Reads the image directory from its local `config.txt`, so it must be run with that directory as CWD. Has its own `README.md`, `requirements.txt`, and `images/`.
- `animeQuoteService.py` (Flask, port **5001**) — `/random-anime-quote`, serves a hardcoded in-file quote list.
- `animePictureService.py` (Flask, port **5002**) — `/random-anime`. Despite the filename, this does *not* serve profile pictures; it fetches random anime (title/image/synopsis) from the public Kitsu API.
- `animeTitleService.py` (Flask, port **5003**) — `/random-anime-title`, serves a hardcoded in-file anime/episode-count list.

Frontend JS files call these services by absolute `http://localhost:<port>` URLs (see `profile.js`, `login.js`, `signup.js`), so all relevant backend services must be running locally on their expected ports for a given page to work fully.

### Known quirks worth checking before assuming behavior

- File names don't match their function: `animePictureService.py` returns random anime info (not a picture), and the actual profile-picture service lives under `microserviceA/CS361_microserviceA/microservice.py`. Verify the `@app.route` and `app.run(port=...)` lines directly rather than trusting a filename.
- `server.js` uses a hardcoded JWT secret (`'your-secret-key'`) and in-memory storage — this is a prototype auth layer, not production-ready.
- The root `package.json` and `anime-verse-backend/package.json` both define `cy:open`/`cy:run`/`test` scripts referencing Cypress, but no `cypress/` directory or config currently exists in the repo.

## Common Commands

Frontend (repo root):
```bash
npm install
npm start        # serves the static frontend on http://localhost:3001
```

Backend — Node auth API:
```bash
cd anime-verse-backend
npm install
node server.js    # runs on http://localhost:3000
```

Backend — Flask microservices (each run separately, typically in their own terminal/venv):
```bash
cd anime-verse-backend
pip install flask flask-cors requests
python3 animeQuoteService.py     # port 5001
python3 animePictureService.py   # port 5002 (random anime via Kitsu, despite the name)
python3 animeTitleService.py     # port 5003
```

The profile-image microservice has its own requirements.txt and must be run from its own directory (it reads `config.txt` relative to CWD):
```bash
cd anime-verse-backend/microserviceA/CS361_microserviceA
pip install -r requirements.txt
python3 microservice.py          # port 5000
```

To exercise a full page (e.g. `profile.html`), the Node server and whichever Flask services that page calls must all be running concurrently on their expected ports.
