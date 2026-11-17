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

/** Load ruffle.js exactly once and resolve when window.RufflePlayer is ready. */
let ruffleReady = null;
function loadRuffle() {
  if (ruffleReady) return ruffleReady;

  ruffleReady = new Promise((resolve, reject) => {
    // Sensible global defaults for a game site: no autoplay surprises, clickable links.
    window.RufflePlayer = window.RufflePlayer || {};
    window.RufflePlayer.config = Object.assign(
      {
        // Files live next to this page, so let Ruffle fetch relative paths.
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
        // The banner only appears on machines without GPU acceleration; the games still run,
        // so keep the stage clean instead of covering the top of the game.
        showHardwareAccelerationNotification: false,
      },
      window.RufflePlayer.config || {}
    );

    const script = document.createElement("script");
    script.src = RUFFLE_BASE + "ruffle.js";
    script.async = true;
    script.onload = () => {
      // ruffle.js registers itself on load; give the polyfill a tick to settle.
      const waitFor = (tries = 0) => {
        if (window.RufflePlayer && typeof window.RufflePlayer.newest === "function") {
          const source = window.RufflePlayer.newest();
          if (source) return resolve(source);
        }
        if (tries > 100) return reject(new Error("Ruffle failed to register a player source."));
        setTimeout(() => waitFor(tries + 1), 50);
      };
      waitFor();
    };
    script.onerror = () => reject(new Error("Could not load " + RUFFLE_BASE + "ruffle.js"));
    document.head.appendChild(script);
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
