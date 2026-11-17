/*
 * app.js — tabs, library grid, search/filter, and the player overlay.
 *
 * URL routes (hash-based so it works on GitHub Pages without rewrites):
 *   #/library            library tab
 *   #/own                "play your own" tab
 *   #/play/<game-id>     library tab + player open on that game
 */
(function () {
  "use strict";

  const state = {
    games: [],
    tab: "library",
    query: "",
    tag: "all",
    activeGame: null,
    controller: null,
    loading: false,
    loadToken: 0,
    recent: [],
  };

  const $ = (sel) => document.querySelector(sel);
  const el = {
    tabs: Array.from(document.querySelectorAll(".tab")),
    panels: {
      library: $("#panel-library"),
      own: $("#panel-own"),
    },
    grid: $("#game-grid"),
    gridEmpty: $("#grid-empty"),
    count: $("#library-count"),
    search: $("#search"),
    tagFilters: $("#tag-filters"),
    stage: $("#stage"),
    stageTitle: $("#stage-title"),
    stageSub: $("#stage-sub"),
    stageFoot: $("#stage-foot"),
    stageLoading: $("#stage-loading"),
    mount: $("#player-mount"),
    btnPause: $("#btn-pause"),
    btnRestart: $("#btn-restart"),
    btnMute: $("#btn-mute"),
    btnFullscreen: $("#btn-fullscreen"),
    btnClose: $("#btn-close"),
    dropzone: $("#dropzone"),
    fileInput: $("#file-input"),
    urlForm: $("#url-form"),
    urlInput: $("#url-input"),
    ownError: $("#own-error"),
    recentWrap: $("#recent-wrap"),
    recentList: $("#recent-list"),
    themeToggle: $("#theme-toggle"),
    offlineNote: $("#offline-note"),
    downloadLink: $(".download-link"),
  };

  /* ------------------------------------------------------------------ *
   * Small helpers
   * ------------------------------------------------------------------ */
  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  function placeholderCover(game) {
    const hue = [...game.id].reduce((acc, ch) => (acc * 31 + ch.charCodeAt(0)) % 360, 7);
    const initials = game.title
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w[0])
      .join("")
      .toUpperCase();
    return (
      `<div class="cover-fallback" style="--hue:${hue}">` +
      `<span class="cover-initials">${escapeHtml(initials)}</span>` +
      `<span class="cover-scan"></span>` +
      `</div>`
    );
  }

  function coverMarkup(game) {
    const fallback = placeholderCover(game);
    if (!game.coverPath) return fallback;
    return (
      `<img src="${escapeHtml(game.coverPath)}" alt="" loading="lazy" ` +
      `onerror="this.parentNode.innerHTML=this.dataset.fallback" data-fallback="${escapeHtml(fallback)}">`
    );
  }

  /* ------------------------------------------------------------------ *
   * Routing / tabs
   * ------------------------------------------------------------------ */
  function setTab(tab, { push = true } = {}) {
    state.tab = tab;
    el.tabs.forEach((btn) => {
      const selected = btn.dataset.tab === tab;
      btn.setAttribute("aria-selected", String(selected));
      btn.classList.toggle("is-active", selected);
    });
    Object.entries(el.panels).forEach(([name, panel]) => {
      panel.hidden = name !== tab;
    });
    if (push) history.replaceState(null, "", tab === "own" ? "#/own" : "#/library");
  }

  // `hashchange` and `popstate` both fire for the same navigation, so make route()
  // idempotent: re-entering the URL we are already on must not remount the player.
  let lastRoute = null;

  function route() {
    const current = location.hash || "#/library";
    if (current === lastRoute) return;
    lastRoute = current;

    const hash = current.replace(/^#\/?/, "");
    const [head, ...rest] = hash.split("/");
    if (head === "play" && rest.length) {
      const id = decodeURIComponent(rest.join("/"));
      setTab("library", { push: false });
      const game = state.games.find((g) => g.id === id);
      if (game) openCatalogGame(game);
      return;
    }
    if (head === "own") {
      setTab("own", { push: false });
      return;
    }
    setTab("library", { push: false });
    closeStage({ fromRoute: true });
  }

  /* ------------------------------------------------------------------ *
   * Library rendering
   * ------------------------------------------------------------------ */
  function allTags() {
    const tags = new Set();
    state.games.forEach((g) => g.tags.forEach((t) => tags.add(t)));
    return [...tags].sort((a, b) => a.localeCompare(b));
  }

  function renderTagFilters() {
    const tags = ["all", ...allTags()];
    el.tagFilters.innerHTML = tags
      .map(
        (tag) =>
          `<button class="chip${tag === state.tag ? " is-active" : ""}" data-tag="${escapeHtml(tag)}" type="button">` +
          (tag === "all" ? "All games" : escapeHtml(tag)) +
          `</button>`
      )
      .join("");
  }

  function visibleGames() {
    const q = state.query.trim().toLowerCase();
    return state.games.filter((game) => {
      const matchesTag = state.tag === "all" || game.tags.includes(state.tag);
      if (!matchesTag) return false;
      if (!q) return true;
      return [game.title, game.author, game.description, ...game.tags].join(" ").toLowerCase().includes(q);
    });
  }

  function renderGrid() {
    const games = visibleGames();
    el.grid.innerHTML = games
      .map(
        (game) => `
        <article class="card" data-id="${escapeHtml(game.id)}">
          <a class="card-link" href="#/play/${encodeURIComponent(game.id)}" aria-label="Play ${escapeHtml(game.title)}">
            <div class="card-cover">${coverMarkup(game)}<span class="card-play" aria-hidden="true">
              <svg viewBox="0 0 24 24"><path d="M8 5.5v13l11-6.5-11-6.5Z"/></svg>
            </span></div>
            <div class="card-body">
              <h3>${escapeHtml(game.title)}</h3>
              <p>${escapeHtml(game.description)}</p>
              <div class="card-meta">
                ${game.author ? `<span>${escapeHtml(game.author)}</span>` : ""}
                ${game.players ? `<span>${escapeHtml(game.players)}</span>` : ""}
              </div>
              <div class="card-tags">
                ${game.tags.map((t) => `<span class="tag">${escapeHtml(t)}</span>`).join("")}
              </div>
            </div>
          </a>
        </article>`
      )
      .join("");
    el.gridEmpty.hidden = games.length > 0;
    el.count.textContent = String(state.games.length);
  }

  /* ------------------------------------------------------------------ *
   * Player overlay
   * ------------------------------------------------------------------ */
  function closeStage({ fromRoute = false } = {}) {
    if (state.controller) {
      state.controller.destroy();
      state.controller = null;
    }
    state.activeGame = null;
    state.loading = false;
    state.loadToken++;
    el.stage.hidden = true;
    document.body.classList.remove("stage-open");
    el.mount.innerHTML = "";
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    if (!fromRoute && location.hash.startsWith("#/play/")) {
      history.replaceState(null, "", "#/library");
      lastRoute = "#/library";
    }
  }

  function setPauseLabel(paused) {
    el.btnPause.querySelector("span").textContent = paused ? "Resume" : "Pause";
    el.btnPause.classList.toggle("is-paused", !!paused);
  }

  async function mountPlayer(game, source) {
    const token = ++state.loadToken;
    state.activeGame = game;
    state.loading = true;

    el.stageTitle.textContent = game.title;
    el.stageSub.textContent = [game.author, game.players].filter(Boolean).join(" · ");
    el.stageFoot.innerHTML = [
      game.controls ? `<p><strong>Controls:</strong> ${escapeHtml(game.controls)}</p>` : "",
      game.license || game.source
        ? `<p class="credit">Game file: ${escapeHtml(game.license || "unknown license")}` +
          (game.source ? ` · <a href="${escapeHtml(game.source)}" target="_blank" rel="noreferrer noopener">source</a>` : "") +
          `</p>`
        : "",
    ].join("");

    el.stage.hidden = false;
    document.body.classList.add("stage-open");
    el.stageLoading.hidden = false;
    const loadingText = el.stageLoading.querySelector("p");
    if (loadingText) {
      loadingText.textContent = window.__ARCADE_OFFLINE__
        ? "Starting the offline player…"
        : "Booting Ruffle…";
    }
    el.mount.innerHTML = "";
    setPauseLabel(false);

    try {
      const controller = await window.RuffleBridge.createPlayer(el.mount, source);
      if (token !== state.loadToken) {
        controller.destroy();
        return;
      }
      state.controller = controller;
      state.loading = false;
      el.stageLoading.hidden = true;
      // Match the SWF's own aspect ratio so the stage has no wasted space.
      el.mount.style.aspectRatio = `${game.width} / ${game.height}`;
      el.mount.style.maxWidth = `min(100%, calc((100vh - 260px) * ${game.aspect}))`;
    } catch (error) {
      if (token !== state.loadToken) return;
      state.loading = false;
      el.stageLoading.hidden = true;
      el.mount.innerHTML =
        `<div class="stage-error"><h3>Ruffle could not start this file</h3>` +
        `<p>${escapeHtml(error && error.message ? error.message : String(error))}</p>` +
        `<p class="muted">If this is a remote file, the server may be blocking cross-origin requests.</p></div>`;
    }
  }

  function openCatalogGame(game) {
    if (state.activeGame && state.activeGame.id === game.id && (state.controller || state.loading)) {
      el.stage.hidden = false;
      return;
    }
    closeStage({ fromRoute: true });
    // Offline build: the .swf is embedded in this page — hand Ruffle the bytes.
    if (game.embedded && window.__OFFLINE_ASSETS__) {
      mountPlayer(game, { data: window.__OFFLINE_ASSETS__.bytesOf(`game:${game.id}`), fileName: game.file });
    } else {
      mountPlayer(game, { url: game.swfPath });
    }
  }

  function openOwnFile({ data, fileName, url }) {
    const pseudoGame = {
      id: "own-file",
      title: fileName || "Your file",
      author: "Local file",
      players: "",
      controls: "",
      description: "",
      tags: [],
      width: 800,
      height: 600,
      license: "",
      source: "",
    };
    state.tab = "own";
    if (data) rememberRecent({ label: fileName, kind: "file", data, fileName });
    if (url) rememberRecent({ label: url, kind: "url", url });
    mountPlayer(pseudoGame, data ? { data, fileName } : { url });
  }

  /* ------------------------------------------------------------------ *
   * "Play your own" tab
   * ------------------------------------------------------------------ */
  function rememberRecent(entry) {
    state.recent = [entry, ...state.recent.filter((r) => r.label !== entry.label)].slice(0, 5);
    el.recentWrap.hidden = state.recent.length === 0;
    el.recentList.innerHTML = state.recent
      .map(
        (r, i) =>
          `<li><button type="button" class="recent-item" data-recent="${i}">` +
          `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l11-6.5-11-6.5Z"/></svg>` +
          `<span>${escapeHtml(r.label)}</span></button></li>`
      )
      .join("");
  }

  function showOwnError(message) {
    el.ownError.hidden = !message;
    el.ownError.textContent = message || "";
  }

  async function handleFile(file) {
    showOwnError("");
    if (!file) return;
    if (!/\.swf$/i.test(file.name)) {
      showOwnError("That is not a .swf file. Flash games and animations end in .swf.");
      return;
    }
    const buffer = await file.arrayBuffer();
    openOwnFile({ data: new Uint8Array(buffer), fileName: file.name });
  }

  function wireOwnTab() {
    el.dropzone.addEventListener("click", () => el.fileInput.click());
    el.dropzone.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        el.fileInput.click();
      }
    });
    el.fileInput.addEventListener("change", () => {
      handleFile(el.fileInput.files && el.fileInput.files[0]);
      el.fileInput.value = "";
    });

    ["dragenter", "dragover"].forEach((type) =>
      el.dropzone.addEventListener(type, (e) => {
        e.preventDefault();
        el.dropzone.classList.add("is-over");
      })
    );
    ["dragleave", "drop"].forEach((type) =>
      el.dropzone.addEventListener(type, (e) => {
        e.preventDefault();
        el.dropzone.classList.remove("is-over");
      })
    );
    el.dropzone.addEventListener("drop", (e) => {
      const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      handleFile(file);
    });

    // Accept a .swf dropped anywhere on the page, from either tab.
    let dragDepth = 0;
    const isSwfDrag = (e) =>
      Array.from((e.dataTransfer && e.dataTransfer.items) || []).some(
        (item) => item.kind === "file" && (!item.type || /swf|shockwave|octet-stream/.test(item.type))
      );

    window.addEventListener("dragenter", (e) => {
      if (!isSwfDrag(e)) return;
      dragDepth += 1;
      document.body.classList.add("dragging-file");
    });
    window.addEventListener("dragover", (e) => {
      if (isSwfDrag(e)) e.preventDefault();
    });
    window.addEventListener("dragleave", () => {
      dragDepth = Math.max(0, dragDepth - 1);
      if (dragDepth === 0) document.body.classList.remove("dragging-file");
    });
    window.addEventListener("drop", (e) => {
      dragDepth = 0;
      document.body.classList.remove("dragging-file");
      if (e.target.closest("#dropzone")) return; // the dropzone has its own handler
      const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (!file) return;
      e.preventDefault();
      handleFile(file);
    });

    el.urlForm.addEventListener("submit", (e) => {
      e.preventDefault();
      showOwnError("");
      const url = el.urlInput.value.trim();
      if (!url) return;
      if (!/^https?:\/\//i.test(url)) {
        showOwnError("Please paste a full http(s) URL, or drop a file instead.");
        return;
      }
      openOwnFile({ url });
    });

    el.recentList.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-recent]");
      if (!btn) return;
      const entry = state.recent[Number(btn.dataset.recent)];
      if (!entry) return;
      mountPlayer(
        {
          id: "own-file",
          title: entry.label,
          author: "",
          players: "",
          controls: "",
          description: "",
          tags: [],
          width: 800,
          height: 600,
          license: "",
          source: "",
        },
        entry.kind === "file" ? { data: entry.data, fileName: entry.fileName } : { url: entry.url }
      );
    });
  }

  /* ------------------------------------------------------------------ *
   * Player controls
   * ------------------------------------------------------------------ */
  function wireStage() {
    el.btnClose.addEventListener("click", () => closeStage());
    el.stage.addEventListener("click", (e) => {
      if (e.target === el.stage) closeStage();
    });

    // Starting audio on the first click anywhere in the player keeps the game uncovered.
    el.mount.addEventListener("click", () => {
      if (state.controller) state.controller.ensureAudio();
    });

    el.btnPause.addEventListener("click", () => {
      if (!state.controller) return;
      if (state.controller.isPaused) {
        state.controller.play();
        setPauseLabel(false);
      } else {
        state.controller.pause();
        setPauseLabel(true);
      }
    });

    el.btnRestart.addEventListener("click", () => {
      if (!state.controller) return;
      state.controller.restart();
      setPauseLabel(false);
    });

    el.btnMute.addEventListener("click", () => {
      if (!state.controller) return;
      state.controller.ensureAudio();
      const muted = state.controller.toggleMute();
      el.btnMute.classList.toggle("is-muted", muted);
      el.btnMute.querySelector("span").textContent = muted ? "Unmute" : "Mute";
    });

    el.btnFullscreen.addEventListener("click", () => {
      if (!state.controller) return;
      state.controller.fullscreen();
    });

    document.addEventListener("keydown", (e) => {
      if (el.stage.hidden) return;
      const typing = /input|textarea|select/i.test(document.activeElement.tagName);
      if (typing) return;
      if (e.key === "Escape") closeStage();
      else if (e.key === "r" || e.key === "R") el.btnRestart.click();
      else if (e.key === "m" || e.key === "M") el.btnMute.click();
      else if (e.key === "f" || e.key === "F") el.btnFullscreen.click();
      else if (e.key === " " && state.tab !== "library") e.preventDefault();
    });
  }

  /* ------------------------------------------------------------------ *
   * Theme
   * ------------------------------------------------------------------ */
  function wireTheme() {
    const stored = localStorage.getItem("ruffle-arcade-theme");
    if (stored) document.documentElement.dataset.theme = stored;
    el.themeToggle.addEventListener("click", () => {
      const next = document.documentElement.dataset.theme === "light" ? "dark" : "light";
      document.documentElement.dataset.theme = next;
      localStorage.setItem("ruffle-arcade-theme", next);
    });
  }

  /* ------------------------------------------------------------------ *
   * Boot
   * ------------------------------------------------------------------ */
  async function boot() {
    if (window.__OFFLINE_TRUNCATED__) {
      document.body.insertAdjacentHTML(
        "afterbegin",
        '<p class="error" style="margin:16px;padding:14px;border-radius:12px">' +
          "This offline file looks incomplete — it was probably still being saved or copied. " +
          "Copy it again, or use the hosted version instead.</p>"
      );
      return;
    }

    // Single-file build: say so, and point people at the download on the hosted site.
    if (window.__ARCADE_OFFLINE__ && el.offlineNote) el.offlineNote.hidden = false;
    if (window.__ARCADE_OFFLINE__ && el.downloadLink) {
      el.downloadLink.hidden = true;        // you already have the file
      el.downloadLink.style.display = "none";
    }

    wireTheme();
    wireStage();
    wireOwnTab();

    el.tabs.forEach((btn) =>
      btn.addEventListener("click", () => {
        const hash = btn.dataset.tab === "own" ? "#/own" : "#/library";
        if (btn.dataset.tab === "library") closeStage({ fromRoute: true });
        setTab(btn.dataset.tab, { push: false });
        if (location.hash !== hash) {
          history.pushState(null, "", hash);
          lastRoute = hash;
        }
      })
    );

    try {
      // Same folder as index.html: works at / and at /repo-name/ on GitHub Pages.
      state.games = await window.Catalog.load("");
    } catch (error) {
      el.grid.innerHTML = `<p class="error">Could not load the game list: ${escapeHtml(error.message)}</p>`;
      return;
    }
    renderTagFilters();
    renderGrid();

    el.search.addEventListener("input", () => {
      state.query = el.search.value;
      renderGrid();
    });
    el.tagFilters.addEventListener("click", (e) => {
      const chip = e.target.closest("[data-tag]");
      if (!chip) return;
      state.tag = chip.dataset.tag;
      renderTagFilters();
      renderGrid();
    });

    window.addEventListener("hashchange", route);
    window.addEventListener("popstate", route);
    route();

    // Warm Ruffle up in the background so the first click feels instant.
    if ("requestIdleCallback" in window) {
      requestIdleCallback(() => window.RuffleBridge.loadRuffle().catch(() => {}), { timeout: 4000 });
    } else {
      setTimeout(() => window.RuffleBridge.loadRuffle().catch(() => {}), 2500);
    }
  }

  document.addEventListener("DOMContentLoaded", boot);
})();
