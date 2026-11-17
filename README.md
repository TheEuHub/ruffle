# Rewind Arcade

A static, browser-only Flash game library powered by [Ruffle](https://github.com/ruffle-rs/ruffle). It uses plain HTML, CSS, and JavaScript—no build step, framework, CDN, or backend. Locally selected SWF files are read with `FileReader`; this site does not upload them.

The four entries in `games.json` are placeholders. No game files are included; add SWFs that you own or that are freely licensed.

## File structure

```text
.
├── index.html
├── style.css
├── app.js
├── games.json
├── README.md
├── games/
│   └── .gitkeep
└── ruffle/
    ├── ruffle.js
    ├── core.ruffle.16d61072ac7fdc4d5013.js
    ├── core.ruffle.994eeef0a471a88cd0e3.js
    ├── 172de42e6619eac8f371.wasm
    ├── 878d548199cddef07035.wasm
    ├── LICENSE_APACHE
    ├── LICENSE_MIT
    └── VERSION.txt
```

Keep all Ruffle JavaScript and WebAssembly files together in `ruffle/`; the runtime loads those files locally. The included self-hosted build is Ruffle 0.7.1. Its license files are included alongside it.

## Add or remove a library game

1. Put a `.swf` file you are entitled to use in `games/`, for example `games/my-game.swf`.
2. Optionally add a thumbnail with the same base name: `games/my-game.png`. If the thumbnail is omitted or missing, the library displays its built-in artwork instead.
3. Add an entry to `games.json`:

   ```json
   {
     "title": "My Game",
     "file": "games/my-game.swf",
     "thumb": "games/my-game.png"
   }
   ```

   `thumb` is optional. Keep the file paths relative to this project and make sure the JSON commas and quotes are valid. You can replace the four example entries or add more entries to the array.
4. Refresh the site. To remove a game, delete its entry from `games.json` (and optionally delete its files from `games/`).

The Library is generated from `games.json` at page load. If the manifest is invalid or a listed SWF is missing, the site displays a helpful message. The **Load Your Own** tab also accepts a local `.swf` through the file picker or drag and drop; that file remains on your device.

## Ruffle self-hosted web build

The required self-hosted Ruffle files are already bundled in `ruffle/`, so the site does not depend on a CDN and works offline after the page and local assets are available.

To download or update the build, use the official [Ruffle GitHub Releases](https://github.com/ruffle-rs/ruffle/releases/latest) page and download the **web-selfhosted** archive (named like `ruffle-<version>-web-selfhosted.zip`). Extract its complete contents into `ruffle/`, keeping `ruffle.js`, its companion JavaScript files, and all `.wasm` files together. Do not use a browser-extension archive or rebuild Ruffle for this site. The official self-hosted package is also published as [`@ruffle-rs/ruffle`](https://www.npmjs.com/package/@ruffle-rs/ruffle); this project vendors its built files and does not require npm at runtime.

## Test locally

Run this from the project root:

```sh
python -m http.server 8000
```

Then open <http://localhost:8000/>. Use an HTTP server rather than opening `index.html` directly with `file://`; browsers restrict loading `games.json` from a file URL.

## Enable GitHub Pages

1. Push the project to GitHub.
2. Open **Settings → Pages** in the repository.
3. Under **Build and deployment**, select **Deploy from a branch**.
4. Choose **main** and **/ (root)**, then save.

All site assets and game paths are relative, so the page also works at a project URL such as `username.github.io/repo-name/`.

## Design credit

The visual review was guided by [unslop](https://github.com/heydamir/unslop) by Damir Sokolovsky, licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
