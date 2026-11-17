/*
 * boot.js — makes index.html survive almost anything.
 *
 * The normal site loads css + four JS files + Ruffle from disk. If any of those are
 * missing or blocked (double-clicked file, half-copied folder, broken deploy, web server
 * that refuses .js), this loader heals the page instead of leaving it blank:
 *
 *   1. inline build   — the scripts are already in the page (offline.html); just run them
 *   2. normal load    — pull js/*.js from disk
 *   3. self-heal      — fetch offline.html, pull the real scripts *and* Ruffle's payload
 *                       out of it, then register everything in memory. Works when js/ and
 *                       assets/ are gone, but not on file:// (no fetch there).
 *   4. recovery panel — explain what happened, point at offline.html / how to serve locally
 *
 * Whatever path it takes, the app receives the same globals, so no other file needs to
 * know which one was used.
 */
(function () {
  "use strict";

  const SITE_SCRIPTS = ["catalog.js", "player.js", "app.js"];
  const offlineBuild = () => window.__ARCADE_OFFLINE__ === true;

  /* ------------------------------------------------------------------ *
   * Recovery panel
   * ------------------------------------------------------------------ */
  const panel = {
    show(title, message, detail) {
      const $ = (id) => document.getElementById(id);
      const splash = $("splash");
      if (!splash) {
        // Last resort: there is no splash markup, so say something anyway.
        document.body.innerHTML =
          '<pre style="font:14px monospace;padding:24px;white-space:pre-wrap">' +
          title + "\n\n" + message + (detail ? "\n\n" + detail : "") +
          "</pre>";
        return;
      }
      splash.hidden = false;
      $("splash-title").textContent = title;
      $("splash-message").textContent = message;
      $("splash-bar").hidden = true;
      $("splash-actions").hidden = false;

      if (location.protocol === "file:") {
        $("splash-offline").classList.add("primary");
        $("splash-hint").hidden = false;
      }

      if (detail) {
        $("splash-detail").hidden = false;
        $("splash-detail").textContent = detail;
        $("splash-details-toggle").hidden = true;
      }
      wirePanelControls();
    },
    hide() {
      const splash = document.getElementById("splash");
      if (splash) splash.hidden = true;
    },
    progress(message) {
      const node = document.getElementById("splash-message");
      if (node) node.textContent = message;
    },
  };

  /** "Try again" reloads, "Details" reveals diagnostics — harmless to wire twice. */
  let panelWired = false;
  function wirePanelControls() {
    if (panelWired) return;
    panelWired = true;

    const retry = document.getElementById("splash-retry");
    if (retry) {
      retry.addEventListener("click", () => {
        retry.disabled = true;
        retry.textContent = "Reloading…";
        location.reload();
      });
    }

    const toggle = document.getElementById("splash-details-toggle");
    const detail = document.getElementById("splash-detail");
    if (toggle && detail) {
      toggle.addEventListener("click", () => {
        if (!detail.textContent) {
          detail.textContent =
            "Page: " + location.href + "\nProtocol: " + location.protocol +
            "\nScripts loaded: " + (Array.from(loaded).join(", ") || "none") +
            "\nOffline build: " + (offlineBuild() ? "yes" : "no") +
            "\nHealed from offline.html: " + (window.__ARCADE_HEALED__ ? "yes" : "no");
        }
        detail.hidden = !detail.hidden;
      });
    }
  }

  /* ------------------------------------------------------------------ *
   * Loader helpers
   * ------------------------------------------------------------------ */
  const loaded = new Set();

  function runScript(source, label) {
    try {
      // Indirect eval runs in global scope, exactly like a <script> tag.
      (0, eval)(source);
      loaded.add(label);
    } catch (error) {
      console.error("boot: " + label + " threw while running", error);
      throw error;
    }
  }

  function loadFromDisk(name) {
    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "js/" + name;
      script.async = false;
      script.onload = () => {
        loaded.add(name);
        resolve();
      };
      script.onerror = () => reject(new Error("js/" + name + " could not be loaded"));
      document.head.appendChild(script);
    });
  }

  /** In the single-file build the scripts are inline text in the page. */
  function inlineScriptAvailable(name) {
    const key = { "catalog.js": "catalog.js", "player.js": "player.js", "app.js": "app.js" }[name];
    return !!document.querySelector(`script[data-inline="${key}"]`);
  }

  /** Pull our scripts (and, if present, Ruffle's payload) out of offline.html. */
  async function healFromOfflineCopy() {
    if (location.protocol === "file:") throw new Error("file:// pages cannot read neighbour files");
    const response = await fetch("offline.html", { cache: "no-store" });
    if (!response.ok) throw new Error("offline.html returned HTTP " + response.status);
    const text = await response.text();

    const page = new DOMParser().parseFromString(text, "text/html");
    const inline = {};
    page.querySelectorAll("script[data-inline]").forEach((node) => {
      inline[node.dataset.inline] = node.textContent;
    });
    const payload = Array.from(page.querySelectorAll("script[data-asset]"));

    // The copy also carries the game list and cover art as plain data scripts.
    page.querySelectorAll("script:not([data-inline]):not([data-asset])").forEach((node) => {
      const code = node.textContent || "";
      if (code.indexOf("__OFFLINE_CATALOG__") !== -1 || code.indexOf("__OFFLINE_COVERS__") !== -1) {
        try {
          (0, eval)(code);
        } catch (error) {
          console.warn("boot: could not read recovered data", error);
        }
      }
    });

    if (!inline["catalog.js"] || !inline["app.js"]) {
      throw new Error("offline.html did not contain the expected scripts");
    }
    return { inline, payload };
  }

  /**
   * Register Ruffle's embedded files in memory before Ruffle is asked to run, so that
   * fetch() shim + global registration in offline-boot.js have something to work with.
   */
  function adoptPayload(payloadNodes) {
    const host = document.getElementById("arcade-offline-payload") || document.createElement("div");
    host.id = "arcade-offline-payload";
    host.hidden = true;
    host.textContent = "";
    payloadNodes.forEach((node) => {
      const clone = document.createElement("script");
      clone.type = "text/plain";
      clone.dataset.asset = node.dataset.asset;
      if (node.dataset.encoding) clone.dataset.encoding = node.dataset.encoding;
      clone.textContent = node.textContent;
      host.appendChild(clone);
    });
    if (!host.isConnected) document.body.appendChild(host);
    window.__ARCADE_HEALED_PAYLOAD__ = true;
  }

  /* ------------------------------------------------------------------ *
   * Boot
   * ------------------------------------------------------------------ */
  let booted = false;

  async function boot() {
    if (booted) return;
    booted = true;

    // (1) Single-file build: everything is already here.
    if (offlineBuild()) {
      if (window.__OFFLINE_TRUNCATED__) {
        panel.show(
          "This offline file is incomplete",
          "It was probably still being saved or copied when you opened it. Copy it again, then reopen.",
          "Expected embedded: ruffle.js, core chunks, both .wasm modules and every game."
        );
        window.ArcadeBoot.failed = true;
        return;
      }
      await startApp({ mode: "offline" });
      return;
    }

    // (1b) The inline watchdog already recovered the scripts from offline.html.
    if (window.__ARCADE_HEALED__ && window.ArcadeApp) {
      await startApp({ mode: "recovered" });
      return;
    }

    // A page opened straight from disk cannot read the files beside it. Rather than fail
    // with a network error, send people to the self-contained copy.
    if (location.protocol === "file:") {
      panel.show(
        "Open the offline copy",
        "Browsers do not let a page read the files next to it when you open it by double-clicking. " +
          "offline.html is the same arcade with the player and all four games built in — open that file instead.",
        "Or serve this folder and open it over http:// — for example: npm start"
      );
      window.ArcadeBoot.failed = true;
      return;
    }

    // (2) Normal load from disk.
    try {
      for (const name of SITE_SCRIPTS) await loadFromDisk(name);
      startApp({ mode: "site" });
      return;
    } catch (error) {
      console.warn("boot: normal load failed —", error.message);
    }

    // (3) Heal from the self-contained copy next door.
    try {
      panel.progress("Repairing the page from offline.html…");
      const { inline, payload } = await healFromOfflineCopy();
      adoptPayload(payload);
      // offline-boot.js installs the fetch() shim and runs Ruffle from the payload.
      runScript(inline["catalog.js"], "catalog.js");
      runScript(inline["player.js"] || "", "player.js");
      if (inline["offline-boot.js"]) runScript(inline["offline-boot.js"], "offline-boot.js");
      runScript(inline["app.js"], "app.js");
      await startApp({ mode: "recovered" });
      return;
    } catch (healError) {
      console.warn("boot: recovery failed —", healError.message);
    }

    // (4) Explain what happened.
    const isFile = location.protocol === "file:";
    panel.show(
      isFile ? "Open the offline copy instead" : "The arcade could not load its files",
      isFile
        ? "Browsers do not let a page read the files next to it when you open it directly. offline.html has the player and all four games inside it — just open that file."
        : "Some of the site's files were unreachable. If offline.html is present it can stand in for them.",
      isFile
        ? null
        : "Tried: js/catalog.js, js/player.js, js/app.js, then offline.html.\n" +
          "If you are opening this from disk, run `npm start` in the project folder instead."
    );
    window.ArcadeBoot.failed = true;
  }

  /** Hand over to js/app.js and make sure the splash always goes away. */
  async function startApp(info) {
    if (!window.ArcadeApp || typeof window.ArcadeApp.start !== "function") {
      panel.show(
        "The app script did not register",
        "js/app.js loaded but did not initialise, so there is nothing to show.",
        "This usually means a file is truncated or being served with the wrong type."
      );
      window.ArcadeBoot.failed = true;
      return;
    }
    window.__ARCADE_MODE__ = info.mode;
    try {
      await window.ArcadeApp.start();
      panel.hide();
      window.__ARCADE_READY__ = true;
      document.documentElement.dataset.arcadeReady = "true";
    } catch (error) {
      const message = String((error && error.message) || error);
      const catalogMissing = /games\.json|fetch|Failed to fetch/i.test(message);
      panel.show(
        "The arcade could not start",
        catalogMissing
          ? "The game list (games.json) could not be read, so there is nothing to show. " +
            "The offline copy of this page has the list and the games inside it."
          : "Something blocked the arcade from finishing startup.",
        message + "\n\nTry: the offline copy (offline.html), or serve the folder with `npm start`."
      );
      window.ArcadeBoot.failed = true;
    }
  }

  window.ArcadeBoot = Object.assign(window.ArcadeBoot || {}, {
    failed: false,
    panel,
    boot,
    loaded,
  });

  // Watch for late failures inside the app and surface them instead of a dead page.
  window.addEventListener("error", (event) => {
    if (window.__ARCADE_READY__ || window.ArcadeBoot.failed) return;
    const message = (event && event.message) || "";
    if (!message) return;
    panel.show("Something went wrong while starting", "The arcade hit an error before it finished loading.", message);
    window.ArcadeBoot.failed = true;
  });
  window.addEventListener("unhandledrejection", (event) => {
    if (window.__ARCADE_READY__ || window.ArcadeBoot.failed) return;
    const reason = event && event.reason;
    panel.show(
      "Something went wrong while starting",
      "The arcade hit an error before it finished loading.",
      String((reason && (reason.stack || reason.message)) || reason)
    );
    window.ArcadeBoot.failed = true;
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
