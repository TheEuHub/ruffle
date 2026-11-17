/*
 * catalog.js — reads games.json and normalises it into a tidy list.
 *
 * This file is the single source of truth for "what games exist".
 * No build step: index.html fetches it at runtime, which works on GitHub Pages.
 */
(function () {
  const DEFAULTS = {
    file: "game.swf",
    width: 800,
    height: 600,
    tags: [],
    description: "",
    players: "",
    controls: "",
    author: "",
    license: "",
    source: "",
    cover: "",
  };

  /** Where the SWF for a catalog entry lives, relative to the site root. */
  function swfPathFor(game, basePath) {
    return `${basePath || ""}assets/games/${game.id}/${game.file}`;
  }

  function normalise(raw, index, basePath) {
    const game = Object.assign({}, DEFAULTS, raw);
    game.title = game.title || game.id || `Game ${index + 1}`;
    game.id = game.id || game.title.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    game.swfPath = swfPathFor(game, basePath);
    game.coverPath = game.cover ? `${basePath || ""}assets/games/${game.id}/${game.cover}` : "";
    game.tags = Array.isArray(game.tags) ? game.tags.filter(Boolean) : [];
    game.aspect = game.width && game.height ? game.width / game.height : 4 / 3;
    return game;
  }

  /**
   * Load the catalog.
   * `basePath` lets the site live in a subfolder (e.g. /ruffle/) on GitHub Pages.
   *
   * In the single-file offline build (offline.html) there is no games.json to fetch:
   * the list is compiled into the page and covers are embedded as data URLs, so an
   * entry can be played by double-clicking the file with no server at all.
   */
  async function load(basePath) {
    const embedded = window.__OFFLINE_CATALOG__;
    let data;
    if (embedded) {
      data = embedded;
    } else {
      const response = await fetch(`${basePath || ""}games.json`, { cache: "no-cache" });
      if (!response.ok) throw new Error(`Could not load games.json (HTTP ${response.status})`);
      data = await response.json();
    }
    const list = Array.isArray(data) ? data : data.games || [];
    const covers = window.__OFFLINE_COVERS__ || {};
    return list.map((entry, i) => {
      const game = normalise(entry, i, basePath);
      if (covers[game.id]) game.coverPath = covers[game.id];
      // Offline builds read the SWF out of the page instead of the network.
      if (window.__OFFLINE_ASSETS__ && window.__OFFLINE_ASSETS__.has(`game:${game.id}`)) {
        game.embedded = true;
      }
      return game;
    });
  }

  window.Catalog = { load, swfPathFor, DEFAULTS };
})();
