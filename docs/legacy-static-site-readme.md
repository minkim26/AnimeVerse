> Archived from the project's root `README.md`. Describes the original static multi-page HTML/CSS/vanilla-JS frontend plus the Node/Express auth API and four independent Flask microservices, before the React + Vite + TypeScript / Express + Prisma + Zod rewrite. That version of the codebase is preserved under the `legacy-static-site` git tag.

# AnimeVerse

AnimeVerse is an anime recommendation web app. Users sign up, pick genre preferences, and get personalized, trending, new-release, and random anime recommendations pulled from the [Kitsu API](https://kitsu.io/api/edge/anime). A profile page lets users manage their account and play with a handful of anime-themed microservices (random profile picture, random anime, random title, random quote).

The app is split into a static frontend and four independently run backend services. There is no build step for the frontend and no single command that starts everything — each piece is started on its own port, as described below.

> Looking for the old profile-image microservice README that used to live here? It's archived at [docs/microservice-a-profile-image.md](microservice-a-profile-image.md).

## Features

- **Signup / Login** — email + password auth against the Node backend, JWT stored in `localStorage`.
- **Preferences** — pick favorite genres (action, comedy, fantasy, horror, mystery, romance, thriller), saved to `localStorage`.
- **Recommendations** — genre-matched picks, trending-now, new releases, and a random selection, all fetched live from Kitsu.
- **Profile** — change password, view saved preferences, and fetch a random profile picture, random anime, random anime title, and random anime quote from the local microservices.
- **Auth gating** — `preferences.html`, `recommendations.html`, and `profile.html` redirect to `login.html` if no token is present (see `app.js`).

## Architecture

```
Browser (static HTML/CSS/vanilla JS, served on :3001)
  |
  |-- calls -----------------------------> Kitsu public API (recommendations.js)
  |
  |-- calls -----------------------------> Node/Express auth API      (server.js,              :3000)
  |-- calls -----------------------------> Flask: profile image       (microservice.py,         :5000)
  |-- calls -----------------------------> Flask: anime quote         (animeQuoteService.py,    :5001)
  |-- calls -----------------------------> Flask: random anime        (animePictureService.py,  :5002)
  |-- calls -----------------------------> Flask: anime title         (animeTitleService.py,    :5003)
```

Every service is hardcoded to `http://localhost:<port>` on both the frontend (see `login.js`, `signup.js`, `profile.js`) and backend side, so all of them need to be running locally, on their expected ports, for a page to work fully. There's no reverse proxy or gateway in front of them.

One naming quirk to be aware of: `animePictureService.py` does **not** serve profile pictures — despite the name, it returns a random anime (title/image/synopsis) fetched from Kitsu, on port 5002. The actual profile-picture service is `anime-verse-backend/microserviceA/CS361_microserviceA/microservice.py`, on port 5000.

The Node auth API (`server.js`) keeps all user data (accounts, preferences, watchlists, reviews) in in-memory JS objects — nothing persists across a server restart, and `mongoose` is a listed dependency but not yet wired to a database.

## Prerequisites

- Node.js and npm
- Python 3.x and pip

## Setup and Running

Each block below runs in its own terminal (or its own tab/pane), since every service blocks its terminal while running.

### 1. Frontend

```bash
npm install
npm start        # serves the static site at http://localhost:3001
```

### 2. Auth API (Node/Express)

```bash
cd anime-verse-backend
npm install
node server.js    # http://localhost:3000
```

### 3. Anime quote service (Flask)

```bash
cd anime-verse-backend
pip install flask flask-cors
python3 animeQuoteService.py    # http://localhost:5001
```

### 4. Random anime service (Flask, calls Kitsu)

```bash
cd anime-verse-backend
pip install flask flask-cors requests
python3 animePictureService.py  # http://localhost:5002
```

### 5. Anime title service (Flask)

```bash
cd anime-verse-backend
pip install flask flask-cors
python3 animeTitleService.py    # http://localhost:5003
```

### 6. Profile image microservice (Flask)

This one lives in its own subfolder with its own `requirements.txt`, and it reads `config.txt` relative to its working directory, so run it from inside that folder:

```bash
cd anime-verse-backend/microserviceA/CS361_microserviceA
pip install -r requirements.txt
python3 microservice.py         # http://localhost:5000
```

Update `config.txt` (`image_directory=images`) or drop your own images into the `images/` folder to change what gets served.

### Running everything together

To use every feature (especially the profile page), start all six of the above in parallel: the frontend, the Node auth API, and the four Flask services. The homepage and recommendations page only need the frontend, since recommendations are fetched directly from Kitsu.

## API Reference

### Auth API — `http://localhost:3000` (`server.js`)

| Method | Path | Body | Notes |
|---|---|---|---|
| POST | `/api/login` | `{ email, password }` | Returns `{ success, token }` |
| POST | `/api/signup` | `{ email, password }` | Returns `{ success, message }` |
| POST | `/api/updatePassword` | `{ email, oldPassword, newPassword }` | |
| POST | `/api/updateUsername` | `{ email, newUsername }` | |
| GET | `/api/preferences/:email` | — | |
| POST | `/api/preferences` | `{ email, preferences }` | |
| GET | `/api/watchlist/:email` | — | |
| POST | `/api/watchlist` | `{ email, watchlist }` | |
| GET | `/api/reviews/:email` | — | |
| POST | `/api/reviews` | `{ email, animeId, review }` | |

### Profile image — `http://localhost:5000`

| Method | Path | Response |
|---|---|---|
| GET | `/random-profile-image` | `{ image_url }` |
| GET | `/images/<filename>` | Serves the image file |

### Anime quote — `http://localhost:5001`

| Method | Path | Response |
|---|---|---|
| GET | `/random-anime-quote` | `{ quote, character, anime }` |

### Random anime (Kitsu-backed) — `http://localhost:5002`

| Method | Path | Response |
|---|---|---|
| GET | `/random-anime` | `{ title, image_url, description }` |

### Anime title — `http://localhost:5003`

| Method | Path | Response |
|---|---|---|
| GET | `/random-anime-title` | `{ title, episodes }` |

## Project Structure

```
.
├── index.html / login.html / signup.html      # entry pages
├── preferences.html / recommendations.html    # genre selection + recommendations
├── profile.html                               # account + microservice playground
├── privacy-policy.html
├── app.js                                     # shared auth-gate/logout logic
├── login.js / signup.js / preferences.js      # per-page logic
├── recommendations.js                         # Kitsu-backed recommendations
├── profile.js                                 # calls the Node API + all 4 microservices
├── styles.css
├── docs/
│   └── microservice-a-profile-image.md        # archived original README
└── anime-verse-backend/
    ├── server.js                              # Express auth API (:3000)
    ├── animeQuoteService.py                   # Flask (:5001)
    ├── animePictureService.py                 # Flask (:5002) — random anime, not a picture
    ├── animeTitleService.py                   # Flask (:5003)
    └── microserviceA/CS361_microserviceA/
        ├── microservice.py                    # Flask (:5000) — actual profile-image service
        ├── config.txt
        └── images/
```

## Known Limitations

- The auth API stores all data in memory; restarting `server.js` wipes every account, preference, watchlist, and review.
- The JWT signing secret in `server.js` is a hardcoded placeholder (`'your-secret-key'`), not something pulled from the environment.
- Both `package.json` files define Cypress scripts (`cy:open`, `cy:run`, `test`), but no `cypress/` config or test files currently exist in the repo.

## Deployment

`.github/workflows/static.yml` deploys the repository as-is to GitHub Pages on every push to `main`. Since GitHub Pages only serves static files, the deployed site will not have the Node or Flask backends available — those must be run locally (or hosted separately) for the backend-dependent features to work.
