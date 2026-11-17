/*
 * player.js — the only place in this project that talks to Ruffle.
 *
 * Ruffle is loaded from ./assets/ruffle/ (self-hosted, works on GitHub Pages).
 * Public surface:
 *   RufflePlayer.create(containerElement, options) -> controller
 *
 * Controller: { play(), pause(), restart(), toggleMute(), isPlaying, volume, destroy() }
 */

const RUFFLE_BASE = "assets/ruffle/";

/**
 * Where Ruffle can come from, in order:
 *   1. assets/ruffle/ next to this page (normal case, works offline on a server)
 *   2. the payload extracted from offline.html (the self-healing path)
 *   3. Ruffle's official CDN (last resort: assets/ missing but there is a network)
 * The offline single-file build always answers with (2) because the payload is in the page.
 */
const DEFAULT_SOURCES = [
  { kind: "local", base: "assets/ruffle/" },
  { kind: "payload", base: "assets/ruffle/", requiresPayload: true },
  // Last resort: a real network, using Ruffle's own published builds.
  { kind: "cdn", base: "https://unpkg.com/@ruffle-rs/ruffle@0.7.1/" },
  { kind: "cdn", base: "https://cdn.jsdelivr.net/npm/@ruffle-rs/ruffle@0.7.1/" },
];

function ruffleSources() {
  const configured = window.RUFFLE_SOURCES;
  if (Array.isArray(configured) && configured.length) return configured;
  return DEFAULT_SOURCES;
}

let ruffleReady = null;

function waitForRufflePlayer(timeoutMs = 6000) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const tick = () => {
      const player = window.RufflePlayer;
      if (player && typeof player.newest === "function") {
        const source = player.newest();
        if (source) return resolve(source);
      }
      if (Date.now() > deadline) return reject(new Error("Ruffle did not register a player"));
      setTimeout(tick, 60);
    };
    tick();
  });
}

/** Inject ruffle.js from a URL. Rejects on network errors or if it never registers. */
function loadRuffleScript(url) {
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = url;
    script.async = true;
    let settled = false;
    const done = (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) {
        script.remove();
        reject(error);
      } else {
        resolve();
      }
    };
    // A blocked or hanging request must not stall the whole player forever.
    const timer = setTimeout(() => done(new Error("timed out loading " + url)), 12000);
    script.onload = () => done();
    script.onerror = () => done(new Error("could not load " + url));
    document.head.appendChild(script);
  });
}

/** Run Ruffle straight out of the embedded/sidecar payload (no network at all). */
function loadRuffleFromPayload() {
  const assets = window.__OFFLINE_ASSETS__;
  if (!assets || !assets.has("ruffle.js")) throw new Error("no embedded Ruffle payload");
  window.RufflePlayer = window.RufflePlayer || {};
  window.RufflePlayer.config = ruffleConfig(window.RufflePlayer.config || {});
  (0, eval)(assets.textOf("ruffle.js"));
  ["core.simd.js", "core.vanilla.js"].forEach((name) => {
    if (assets.has(name)) (0, eval)(assets.textOf(name));
  });
}

function ruffleConfig(existing) {
  return Object.assign(
    {
      publicPath: RUFFLE_BASE,
      autoplay: "on",
      unmuteOverlay: "visible",
      letterbox: "on",
      scale: "showAll",
      quality: "high",
      allowScriptAccess: false,
      upgradeToHttps: false,
      warnOnUnsupportedContent: false,
      showSwfDownload: false,
      // Only shows without GPU acceleration; the games still run, so keep the stage clean.
      showHardwareAccelerationNotification: false,
    },
    existing
  );
}

/**
 * Load Ruffle exactly once, trying each source in turn. Resolves with the registered
 * player source, or rejects with every failure collected so the UI can explain it.
 */
function loadRuffle() {
  if (ruffleReady) return ruffleReady;

  ruffleReady = (async () => {
    window.RufflePlayer = window.RufflePlayer || {};
    window.RufflePlayer.config = ruffleConfig(window.RufflePlayer.config || {});

    const failures = [];
    for (const source of ruffleSources()) {
      try {
        if (source.kind === "cdn" && navigator.onLine === false) {
          failures.push("cdn: browser is offline");
          continue;
        }
        if (source.kind === "payload") {
          // A payload is only present when the page actually has one embedded.
          if (!window.__OFFLINE_ASSETS__ || !window.__OFFLINE_ASSETS__.has("ruffle.js")) {
            failures.push("embedded payload: not available");
            continue;
          }
          loadRuffleFromPayload();
        } else {
          if (source.kind === "local" && window.__ARCADE_HEALED_PAYLOAD__) {
            // The page already told us the local files are broken; skip straight on.
            failures.push("local files: unavailable");
            continue;
          }
          await loadRuffleScript(source.base + "ruffle.js");
        }
        const registered = await waitForRufflePlayer(source.kind === "cdn" ? 12000 : 6000);
        if (source.kind !== "local") {
          console.info("Ruffle Arcade: using the " + source.kind + " Ruffle source.");
        }
        return registered;
      } catch (error) {
        failures.push(source.kind + ": " + error.message);
        console.warn("Ruffle Arcade: " + source.kind + " source failed — " + error.message);
        // A half-registered player would block the next attempt; start clean.
        try {
          delete window.RufflePlayer.sources.local;
        } catch (_) {
          /* ignore */
        }
      }
    }

    throw new Error("Ruffle could not be loaded. " + failures.join(" | "));
  })();

  // Let the next call retry if every source failed.
  ruffleReady.catch(() => {
    ruffleReady = null;
  });

  return ruffleReady;
}

/**
 * Ruffle pops a "hardware acceleration is disabled" box over the game the first time the
 * mouse moves on machines rendering with a CPU adapter. The games still run fine, so we
 * hide that single modal inside Ruffle's shadow root instead of letting it cover play.
 * Anything else Ruffle shows (unmute overlay, save manager, context menu) is untouched.
 */
function quietPlayerChrome(player) {
  const patchRoot = () => {
    const root = player.shadowRoot;
    if (!root) return false;
    const modal = root.getElementById("hardware-acceleration-modal");
    if (!modal) return false;
    modal.style.display = "none";
    const style = document.createElement("style");
    style.textContent = "#hardware-acceleration-modal { display: none !important; }";
    root.appendChild(style);
    return true;
  };

  if (!patchRoot()) {
    // The shadow root is created when the element is connected; retry briefly.
    let tries = 0;
    const timer = setInterval(() => {
      tries += 1;
      if (patchRoot() || tries > 40) clearInterval(timer);
    }, 100);
  }
}

/**
 * Mount a SWF into `container` and return a small controller.
 * @param {HTMLElement} container
 * @param {{url?: string, data?: Uint8Array, fileName?: string, backgroundColor?: string}} source
 */
async function createPlayer(container, source) {
  const ruffle = await loadRuffle();

  container.innerHTML = "";
  const player = ruffle.createPlayer();
  player.className = "ruffle-player";
  player.id = "ruffle-" + Math.random().toString(36).slice(2, 9);
  container.appendChild(player);

  const config = {
    letterbox: "on",
    scale: "showAll",
    quality: "high",
  };
  if (source.backgroundColor) config.backgroundColor = source.backgroundColor;

  if (source.data) {
    // Uploaded / dragged-in files never touch the network: we hand Ruffle raw bytes.
    await player.ruffle().load(Object.assign({ data: source.data, swfFileName: source.fileName || "game.swf" }, config));
  } else {
    await player.ruffle().load(Object.assign({ url: source.url }, config));
  }

  quietPlayerChrome(player);

  const ruffleApi = () => player.ruffle();
  let muted = false;
  let lastVolume = 1;
  let paused = false;

  return {
    element: player,
    async play() {
      paused = false;
      ruffleApi().resume();
    },
    async pause() {
      paused = true;
      ruffleApi().suspend();
    },
    async restart() {
      paused = false;
      await ruffleApi().reload();
      ruffleApi().resume();
    },
    /**
     * Browsers block audio until the user interacts with the page. Ruffle shows a
     * "click to unmute" overlay for that. Our own Mute/unmute button counts as a user
     * gesture, so relay it to Ruffle's overlay to start audio immediately.
     */
    ensureAudio() {
      const root = player.shadowRoot;
      const overlay = root && root.getElementById("unmute-overlay");
      if (overlay && getComputedStyle(overlay).display !== "none") overlay.click();
    },
    /** Blur the SWF so keyboard focus does not get stuck inside the canvas. */
    blur() {
      try {
        const active = player.shadowRoot && player.shadowRoot.activeElement;
        if (active && typeof active.blur === "function") active.blur();
      } catch (_) {
        /* ignore */
      }
    },
    get isPaused() {
      return paused;
    },
    get isPlaying() {
      return ruffleApi().isPlaying;
    },
    get volume() {
      return ruffleApi().volume;
    },
    toggleMute() {
      muted = !muted;
      if (muted) {
        lastVolume = ruffleApi().volume || 1;
        ruffleApi().volume = 0;
      } else {
        ruffleApi().volume = lastVolume || 1;
      }
      return muted;
    },
    get isMuted() {
      return muted;
    },
    async fullscreen() {
      if (typeof ruffleApi().setFullscreen === "function") {
        ruffleApi().setFullscreen(true);
      }
    },
    destroy() {
      try {
        ruffleApi().destroy();
      } catch (_) {
        /* already gone */
      }
      container.innerHTML = "";
    },
  };
}

window.RuffleBridge = { loadRuffle, createPlayer, RUFFLE_BASE };
