/*
 * offline-boot.js — injected into the single-file offline build only.
 *
 * A page opened by double-clicking runs on file:// where the browser refuses to
 * fetch() the sibling Ruffle files. So the offline build embeds Ruffle's JS, its
 * two webpack chunks and both WASM modules into the same .html file, and this
 * shim hands them to Ruffle without touching the network.
 *
 * Order of operations matters:
 *   1. collect the embedded assets (base64 <script type="text/plain"> tags)
 *   2. install a fetch() shim that serves .wasm from memory
 *   3. run Ruffle's own ruffle.js
 *   4. run its core chunk(s) — they register with the webpack runtime, which is
 *      what stops Ruffle from re-downloading them
 */
(function () {
  "use strict";

  const assets = {};
  const encodings = {};
  document.querySelectorAll("script[data-asset]").forEach((node) => {
    const name = node.dataset.asset;
    assets[name] = node.textContent.trim();
    encodings[name] = node.dataset.encoding || "text";
  });

  const decodeCache = new Map();
  function bytesOf(name) {
    if (decodeCache.has(name)) return decodeCache.get(name);
    const stored = assets[name] || "";
    let bytes;
    if (encodings[name] === "base64") {
      const raw = atob(stored);
      bytes = new Uint8Array(raw.length);
      for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
    } else {
      bytes = new TextEncoder().encode(stored);
    }
    decodeCache.set(name, bytes);
    return bytes;
  }
  function textOf(name) {
    return assets[name] || "";
  }
  function has(name) {
    return typeof assets[name] === "string" && assets[name].length > 0;
  }

  // Ruffle asks for ".../172de42e6619eac8f371.wasm" or the other hash; match on the
  // file name so the base path in the URL never matters.
  const wasmAssets = Object.keys(assets).filter((key) => key.endsWith(".wasm"));

  const nativeFetch = typeof window.fetch === "function" ? window.fetch.bind(window) : null;
  window.fetch = function (input, init) {
    let url = "";
    if (typeof input === "string") url = input;
    else if (input && typeof input.url === "string") url = input.url;
    else if (input) url = String(input);

    const fileName = url.split(/[?#]/)[0].split("/").pop();
    if (fileName && wasmAssets.includes(fileName)) {
      const bytes = bytesOf(fileName);
      return Promise.resolve(
        new Response(bytes, {
          status: 200,
          headers: {
            "content-type": "application/wasm",
            "content-length": String(bytes.byteLength),
          },
        })
      );
    }
    if (nativeFetch) return nativeFetch(input, init);
    return Promise.reject(new Error("offline"));
  };

  // Expose the embed to the app layer (catalog + game files).
  window.__OFFLINE_ASSETS__ = { has, bytesOf, textOf, names: Object.keys(assets) };
  window.__ARCADE_OFFLINE__ = true;

  function runGlobalScript(source, label) {
    try {
      // Indirect eval keeps the script in global scope, just like a <script> tag.
      (0, eval)(source);
    } catch (error) {
      console.error("offline boot: failed to run " + label, error);
      throw error;
    }
  }

  // A copy that was interrupted mid-transfer would otherwise fail with a cryptic error.
  if (!has("ruffle.js") || !wasmAssets.length || !has("core.simd.js")) {
    window.__OFFLINE_TRUNCATED__ = true;
    return;
  }

  if (has("ruffle.js")) runGlobalScript(textOf("ruffle.js"), "ruffle.js");

  // Pre-register the lazy chunks so Ruffle never tries to load them from disk.
  ["core.simd.js", "core.vanilla.js"].forEach((name) => {
    if (has(name)) runGlobalScript(textOf(name), name);
  });
})();
