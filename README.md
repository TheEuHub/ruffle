# Ruffle Arcade

A tiny, self-hosted Flash game arcade built with **only HTML, CSS and JavaScript**.
It runs [Ruffle](https://github.com/ruffle-rs/ruffle) (a WebAssembly Flash Player) entirely
in the browser — no plugins, no build step, no server. It is made to live on **GitHub Pages**.

- **Library tab** — four MIT-licensed Flash games are already installed. Click a card and it plays.
- **Play your own tab** — drop any `.swf` file in, or paste a URL. Files you drop never leave your browser.
- Adding or removing a game is one line of JSON (or one command).
- **Works offline:** `offline.html` is a single self-contained file — double-click it, no server, no internet.

---

## Quick start

Because browsers block file:// pages from loading the WebAssembly player, run a tiny static server:

```bash
npm start           # → http://localhost:8080
```

`npm start` runs `scripts/serve.mjs`, which serves the folder with the correct
`application/wasm` MIME type (Ruffle needs it). Any static host works just as well.

Then open <http://localhost:8080>, click a game, play.

---

## Offline: double-click one file

`offline.html` in the repository root is the **whole arcade in a single HTML file** — Ruffle, both
WASM modules and all four games are embedded inside it (≈43 MB).

Just **double-click `offline.html`**. It opens in your browser, shows the same two tabs, and plays
every game with no server and no internet connection. You can copy it to a USB stick, email it, or
put it on a desktop and it keeps working.

That is the whole installation procedure. Nothing else to run.

### Keeping it up to date

`offline.html` is generated. After changing any site file or adding/removing a game:

```bash
npm run build-offline     # regenerate offline.html
npm run check-offline     # verify it matches the site (CI runs this too)
```

`add-game` and `remove-game` rebuild it for you automatically, and the deploy workflow fails if
`offline.html` is stale, so the committed copy never drifts from the hosted site.

### How it works

Browsers refuse to `fetch()` sibling files from a `file://` page, which is why a plain static site
cannot just be double-clicked. So the build step:

1. inlines `css/style.css`, the four site scripts and `games.json` (plus the cover art as data URLs)
   directly into the page;
2. embeds Ruffle's `ruffle.js`, its two lazy webpack chunks and both `.wasm` modules as base64 in
   `<script type="text/plain">` tags, along with every `.swf`;
3. ships `js/offline-boot.js`, which decodes those blobs, **shims `fetch()` for the `.wasm` files**,
   and runs Ruffle's chunks in global scope so its loader never requests anything from disk;
4. hands Ruffle the embedded game bytes instead of a URL.

Nothing is fetched from a CDN, so the file works on a plane, on `file://`, or from a USB stick.

> Editing `offline.html` by hand is not supported — it is a build artifact. Edit the sources and rebuild.

### Offline caveats

- **"Play your own"** still works: dropping a `.swf` reads it locally, exactly as on the hosted site.
  Only the *URL* option needs a network, plus CORS on the remote server.
- Some SWFs try to be online on their own (high-score tables, multiplayer servers). Ruffle blocks
  those requests, exactly as it does on the hosted site, and the game simply carries on.
- Because the file is ~43 MB, a very slow machine may take a few seconds to open it the first time.

---

## Deploy to GitHub Pages

The whole repo **is** the website.

1. Push this repository to GitHub.
2. Go to **Settings → Pages** and set **Source** to **GitHub Actions**.
3. Push to `main`. The included workflow (`.github/workflows/deploy-pages.yml`) validates
   `games.json` and publishes the site.

Your arcade will be live at `https://<user>.github.io/<repo>/`.

Visitors can grab a standalone copy any time with the **Offline** button in the header, which
downloads `offline.html`.

> Prefer no Actions? Set **Source: Deploy from a branch → main / (root)** instead.
> The `.nojekyll` file is already there, and all paths are relative, so sub-folder
> hosting (`/<repo>/`) works without any configuration.

---

## Adding a game (30 seconds)

**Option A — the one-liner**

```bash
npm run add-game -- path/to/mygame.swf "My Game" \
  --author="Jane Doe" \
  --description="A one-sentence pitch." \
  --tags=Arcade,Action \
  --players="1 player" \
  --controls="Arrow keys to move, space to jump." \
  --license=MIT \
  --source=https://github.com/janedoe/mygame
```

It copies the SWF to `assets/games/my-game/game.swf`, reads the real stage size out of the
SWF header, and inserts the entry at the top of `games.json`.

**Option B — by hand**

1. Make a folder: `assets/games/my-game/` and drop your file in as `game.swf`
   (any filename works — just match `"file"`).
2. Add a block to the `games` array in **`games.json`**:

```json
{
  "id": "my-game",
  "title": "My Game",
  "file": "game.swf",
  "author": "Jane Doe",
  "players": "1 player",
  "description": "A one-sentence pitch.",
  "tags": ["Arcade", "Action"],
  "controls": "Arrow keys to move, space to jump.",
  "cover": "cover.svg",
  "width": 800,
  "height": 600,
  "license": "MIT",
  "source": "https://github.com/janedoe/mygame"
}
```

3. Commit, push, done. The site rebuilds itself.

**Only `id`, `title` and `file` really matter.** Everything else is optional and has a
sensible default (`800x600` stage, no tags, no cover — a generated placeholder is shown).

### Covers

Drop any image (`cover.png`, `cover.jpg`, `cover.svg`…) into the game's folder and point
`"cover"` at it. A 16:10 image looks best. No cover? The card shows a generated gradient
tile with the game's initials, so nothing ever looks broken.

---

## Removing a game

```bash
npm run remove-game -- my-game           # remove from games.json
npm run remove-game -- my-game --delete  # …and delete assets/games/my-game/
```

Or just delete its block from `games.json`. Nothing else references it.

---

## Verifying before you push

```bash
npm run check-games     # every game in games.json has a real SWF on disk
npm run check-offline   # offline.html matches the current site
```

Confirms every entry in `games.json` points at a real SWF with a valid header, that covers
exist, and that ids are unique. The GitHub Actions workflow runs this too, so a broken
entry never gets deployed.

---

## How it works

| File | Job |
| --- | --- |
| `index.html` | The two tabs, the library grid, and the player overlay. |
| `games.json` | **The whole game list.** The only file you edit to add/remove games. |
| `js/catalog.js` | Fetches `games.json` and normalises entries (defaults, paths, aspect ratio). |
| `js/app.js` | Tabs, routing (`#/library`, `#/own`, `#/play/<id>`), search, filters, player controls. |
| `js/player.js` | The only file that talks to Ruffle: loads it, mounts a SWF, pause/restart/mute/fullscreen. |
| `css/style.css` | The whole design system — dark + light themes, responsive. |
| `assets/ruffle/` | Self-hosted Ruffle 0.7.1 (`ruffle.js` + WASM). Nothing is loaded from a CDN. |
| `offline.html` | Generated single-file build — open it directly from disk, fully offline. |
| `js/offline-boot.js` | Offline bootstrap: decodes the embedded blobs and shims `fetch()` for WASM. |
| `scripts/build-offline.mjs` | Builds `offline.html` by inlining everything. |
| `assets/games/<id>/` | One folder per game: the `.swf` plus an optional cover. |
| `scripts/serve.mjs` | Dev server with the correct `.wasm` MIME type. |
| `scripts/add-game.mjs` / `remove-game.mjs` / `check-games.mjs` | Maintenance helpers. |

There is no bundler, no framework, no runtime dependency. `package.json` exists only to
expose the helper scripts.

### URL routes

- `#/library` — the library tab
- `#/own` — the "play your own" tab
- `#/play/pacman` — opens the player straight onto a game (linkable, and back/forward work)

Esc closes the player, `R` restarts, `M` mutes, `F` goes fullscreen.

---

## The included games

All four are MIT-licensed by their authors, and each card links back to its source repo.

| Game | Author | Source |
| --- | --- | --- |
| Pac-Man | Roy Massaad | [roymasad/pacman-flash-game](https://github.com/roymasad/pacman-flash-game) |
| Fruit Madness | Vladimir "Leinstay" Belyaev | [leinstay/fruitmadness](https://github.com/leinstay/fruitmadness) |
| Pixel Shooter | Ian Ramzy | [ianramzy/pixel-shooter](https://github.com/ianramzy/pixel-shooter) |
| Mofle Game | Sindre Sorhus | [sindresorhus/moflegame](https://github.com/sindresorhus/moflegame) |

Swap them for your own favourites at any time — see *Adding a game* above.

---

## Licensing notes

- **Ruffle** is dual-licensed MIT / Apache-2.0. Its license files are kept in `assets/ruffle/`.
- **Each SWF** keeps its own license, recorded per game in `games.json` (`license`, `source`).
  Only bundle games you have the right to redistribute.
- **This site's code** is free to reuse.

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| `Incorrect response MIME type` for `.wasm` | Your host is not sending `application/wasm`. Use `npm start` locally; GitHub Pages is fine. |
| A game shows "connection lost" / a login screen | It is a multiplayer or server-backed SWF. It needs the original server, so pick a single-player game instead. |
| A game asks for more `.swf`/asset files | SWFs that load extra files at runtime expect them next to the movie — put them in the same folder as `game.swf`. |
| Uploaded file shows nothing | Check that it is a real, uncompressed-too-large `.swf`. Ruffle supports Flash 1–32. |
| Audio is muted | Browsers block sound until you click. Click the game, or press our **Mute/Unmute** button. |
| Double-clicking `index.html` shows an empty page | That is expected — `index.html` needs a server. Double-click **`offline.html`** instead. |
| `offline.html` shows "this file looks incomplete" | The copy was cut short while saving/copying. Copy it again, or rebuild with `npm run build-offline`. |
