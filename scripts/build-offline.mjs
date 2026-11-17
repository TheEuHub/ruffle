#!/usr/bin/env node
/**
 * build-offline.mjs — produce ONE self-contained .html file that can be opened
 * by double-clicking it, with no server and no internet connection.
 *
 *   node scripts/build-offline.mjs            → offline.html
 *   node scripts/build-offline.mjs --out=...  → write somewhere else
 *
 * It takes the normal site (index.html + css + js + Ruffle + the games) and
 * inlines all of it: CSS in a <style>, JS in <script>, Ruffle's JS/WASM and every
 * .swf as base64 in <script type="text/plain"> tags. Browsers refuse to fetch()
 * sibling files from file://, so inlining is the only way this can work offline.
 *
 * Re-run it after adding a game or changing any site file. `npm run check-offline`
 * will tell you if offline.html is out of date.
 */
import { readFile, writeFile, stat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { createHash } from "node:crypto";

const root = resolve(dirname(new URL(import.meta.url).pathname), "..");
const outArg = process.argv.find((a) => a.startsWith("--out="));
const outFile = outArg ? resolve(outArg.slice(6)) : join(root, "offline.html");

/* ------------------------------------------------------------------ helpers */
const read = (rel) => readFile(join(root, rel));
const readText = async (rel) => (await read(rel)).toString("utf8");

function dataUrl(mime, buffer) {
  return `data:${mime};base64,${buffer.toString("base64")}`;
}

/**
 * String.prototype.replace treats `$&`, `$1`, `$$`... in the *replacement* as
 * instructions, which would silently corrupt minified code (Ruffle uses `${...}`
 * all over the place). Always splice via a function so the text stays literal.
 */
function inject(text, marker, replacement) {
  const at = text.indexOf(marker);
  if (at === -1) throw new Error(`build-offline: marker not found in template: ${marker.slice(0, 40)}...`);
  return text.slice(0, at) + replacement + text.slice(at + marker.length);
}

function replaceOnce(text, pattern, replacement) {
  if (!pattern.test(text)) throw new Error("build-offline: pattern not found: " + pattern);
  return text.replace(pattern, () => replacement);
}

/** Escape "</script" so embedded text can never terminate its tag early. */
function safeForScriptTag(text) {
  return text.replace(/<\/script/gi, "<\\/script");
}

function humanSize(bytes) {
  return bytes > 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.round(bytes / 1024)} KB`;
}

/* ------------------------------------------------------------------- build */
async function build() {
  const started = Date.now();

  const html = await readText("index.html");
  const css = await readText("css/style.css");
  const catalogSource = await readText("games.json");
  await readText("js/boot.js"); // must exist in the repo, even though the offline build inlines
  const js = {
    catalog: await readText("js/catalog.js"),
    player: await readText("js/player.js"),
    offline: await readText("js/offline-boot.js"),
    boot: await readText("js/boot.js"),
    app: await readText("js/app.js"),
  };

  // The catalog is compiled in: rewriting the fetch means one less thing to go wrong.
  const catalogInline =
    `(function(){\n  const DATA = ${catalogSource.trim()};\n  window.__OFFLINE_CATALOG__ = DATA;\n})();`;

  const ruffleAssets = [
    "ruffle.js",
    "core.ruffle.16d61072ac7fdc4d5013.js",
    "core.ruffle.994eeef0a471a88cd0e3.js",
    "172de42e6619eac8f371.wasm",
    "878d548199cddef07035.wasm",
  ];

  // Which core chunk is which build? 110 = SIMD-capable, 993 = vanilla fallback.
  // Confirm from Ruffle's own loader so the mapping is never guessed wrong.
  const ruffleSource = await readText("assets/ruffle/ruffle.js");
  const simdFirst = ruffleSource.indexOf("a.e(110)") < ruffleSource.indexOf("a.e(993)");
  const simdChunk = "core.ruffle.16d61072ac7fdc4d5013.js";
  const vanillaChunk = "core.ruffle.994eeef0a471a88cd0e3.js";
  const chunkNames = simdFirst
    ? { simd: simdChunk, vanilla: vanillaChunk }
    : { simd: vanillaChunk, vanilla: simdChunk };

  const embedded = [];
  const push = (name, content, encoding = "text") =>
    embedded.push(
      `<script type="text/plain" data-asset="${name}" data-encoding="${encoding}">${safeForScriptTag(content)}</script>`
    );

  for (const name of ruffleAssets) {
    const buffer = await read(`assets/ruffle/${name}`);
    if (name.endsWith(".wasm")) push(name, buffer.toString("base64"), "base64");
    else push(name, buffer.toString("utf8"), "text");
  }
  push("core.simd.js", await readText(`assets/ruffle/${chunkNames.simd}`));
  push("core.vanilla.js", await readText(`assets/ruffle/${chunkNames.vanilla}`));

  // Games: read games.json, then embed every SWF + cover mentioned in it.
  const catalog = JSON.parse(catalogSource);
  const games = Array.isArray(catalog) ? catalog : catalog.games;
  const gameImages = [];
  for (const game of games) {
    const swfName = `game:${game.id}`;
    const buffer = await read(`assets/games/${game.id}/${game.file || "game.swf"}`);
    push(swfName, buffer.toString("base64"), "base64");

    if (game.cover) {
      const coverPath = `assets/games/${game.id}/${game.cover}`;
      const coverBuffer = await read(coverPath).catch(() => null);
      if (coverBuffer) {
        const ext = game.cover.split(".").pop().toLowerCase();
        const mime = ext === "svg" ? "image/svg+xml" : ext === "png" ? "image/png" : "image/jpeg";
        gameImages.push({ id: game.id, url: dataUrl(mime, coverBuffer) });
      }
    }
  }

  const favicon = await read("assets/favicon.svg").catch(() => null);

  const coversTable = `window.__OFFLINE_COVERS__ = ${JSON.stringify(
    Object.fromEntries(gameImages.map((g) => [g.id, g.url]))
  )};`;
  void stat;

  /* ---------------------------------------------------------------- splice */
  let out = html;

  // 1. CSS + favicon become inline
  out = replaceOnce(out, /<link rel="stylesheet" href="css\/style\.css"\s*\/?>/, `<style>\n${safeForScriptTag(css)}\n</style>`);
  if (favicon) {
    out = replaceOnce(
      out,
      /<link rel="icon" href="assets\/favicon\.svg" type="image\/svg\+xml"\s*\/?>/,
      `<link rel="icon" href="${dataUrl("image/svg+xml", favicon)}" />`
    );
  }

  // 2. the site scripts become inline code (catalog + covers, then the app)
  const inline = (body, id) => `<script data-inline="${id}">${safeForScriptTag(body)}</script>`;
  const scriptTags = [
    `<script>${safeForScriptTag(catalogInline)}</script>`,
    `<script>${safeForScriptTag(coversTable)}</script>`,
    inline(js.catalog, "catalog.js"),
    inline(js.player, "player.js"),
    inline(js.offline, "offline-boot.js"),
    inline(js.app, "app.js"),
    inline(js.boot, "boot.js"),
  ].join("\n  ");

  // index.html loads the app through <script src="js/boot.js">. In the single file
  // everything it would have fetched is inline, and boot.js itself runs last.
  out = replaceOnce(
    out,
    /<script src="js\/boot\.js"[^>]*><\/script>/,
    scriptTags
  );

  // 3. the offline payload goes in <head>, after the metadata: one <script> tag per
  //    asset, before the app scripts run.
  //
  //    A copy cut short mid-download is the most likely failure of a 43 MB file, so a
  //    tiny inline guard sits *before* the payload: if the document never ends, the page
  //    still explains itself instead of showing a blank screen.
  const truncationGuard =
    "<script>window.__ARCADE_TRUNCATION_CHECK__=setTimeout(function(){" +
    "if(window.__ARCADE_DOC_COMPLETE__)return;" +
    "var t=document.getElementById('splash-title');if(!t)return;" +
    "t.textContent='This offline file is incomplete';" +
    "document.getElementById('splash-message').textContent=" +
    "'It was cut short while saving or copying — a full copy is about 43 MB. Copy it again, then reopen.';" +
    "var b=document.getElementById('splash-bar');if(b)b.hidden=true;" +
    "document.getElementById('splash-actions').hidden=false;" +
    "},1500);</script>";

  out = inject(
    out,
    "  <!-- ================= LIBRARY ================= -->",
    "  " +
      truncationGuard +
      "\n  " +
      embedded.join("\n  ") +
      "\n\n  <!-- ================= LIBRARY ================= -->"
  );

  // 4. mark the build, and mark the document as complete at its very end
  out = inject(out, "<title>", "<title>Offline — ");
  if (!/id="splash"/.test(out)) throw new Error("build-offline: splash markup missing from index.html");
  if (!out.includes("</body>")) throw new Error("build-offline: no </body> to append to");
  out = inject(
    out,
    "</body>",
    "<script>window.__ARCADE_DOC_COMPLETE__=true;clearTimeout(window.__ARCADE_TRUNCATION_CHECK__);</script>\n</body>"
  );
  out = inject(
    out,
    '<meta name="theme-color" content="#0b0f16" />',
    '<meta name="theme-color" content="#0b0f16" />\n  <meta name="offline-build" content="true" />'
  );

  await writeFile(outFile, out);
  void stat; // (imported for future size checks)

  const bytes = Buffer.byteLength(out);
  const hash = createHash("sha256").update(out).digest("hex").slice(0, 16);
  await writeFile(
    join(root, "offline.lock.json"),
    JSON.stringify({ builtAt: new Date().toISOString(), bytes, sha256: hash, games: games.map((g) => g.id) }, null, 2) + "\n"
  );

  console.log(`offline.html written — ${humanSize(bytes)} (${games.length} games, ${embedded.length} embedded assets)`);
  console.log(`  ${outFile}`);
  console.log(`  took ${Date.now() - started} ms`);
  return { bytes, hash };
}

build().catch((error) => {
  console.error("build-offline failed:", error.message);
  process.exit(1);
});
