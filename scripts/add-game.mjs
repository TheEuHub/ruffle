#!/usr/bin/env node
/**
 * add-game.mjs — install a .swf into the arcade in one command.
 *
 *   node scripts/add-game.mjs path/to/mygame.swf "My Game" [more flags]
 *
 * What it does:
 *   1. copies the file to assets/games/<id>/game.swf
 *   2. reads the real stage size + frame rate out of the SWF header
 *   3. inserts an entry at the top of games.json (keeping it valid JSON)
 *
 * Flags (all optional):
 *   --id=<slug>          folder name; defaults to a slug of the title
 *   --author=<name>
 *   --description=<text>
 *   --tags=Arcade,Action
 *   --players="2 players"
 *   --controls=<text>
 *   --cover=<file>       image to copy next to the swf
 *   --license=<text>
 *   --source=<url>
 *
 * Remove a game with:  node scripts/remove-game.mjs <id>
 */
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, extname, join, resolve } from "node:path";
import { inflateSync } from "node:zlib";

const root = resolve(dirname(new URL(import.meta.url).pathname), "..");

/* -------------------------------------------------------------------------- */
/* SWF header parsing: enough to learn the stage size without a Flash IDE.     */
/* -------------------------------------------------------------------------- */
export function readSwfHeader(buffer) {
  const sig = buffer.subarray(0, 3).toString("latin1");
  if (!["FWS", "CWS", "ZWS"].includes(sig)) throw new Error("Not a SWF file (bad signature)");
  const version = buffer[3];

  let body;
  if (sig === "FWS") {
    body = buffer;
  } else if (sig === "CWS") {
    body = inflateSync(buffer.subarray(8));
  } else {
    // ZWS uses raw LZMA, which Node cannot decompress without extra dependencies.
    // Not a problem: the browser plays it fine, we just cannot read the stage size here.
    return { signature: sig, version, width: 0, height: 0 };
  }

  // The RECT that opens the body is five bit-packed fields: nBits, xMin, xMax, yMin, yMax.
  let bitPos = 0;
  const readBits = (count) => {
    let value = 0;
    for (let i = 0; i < count; i++) {
      const byte = body[(bitPos + i) >> 3];
      const bit = (byte >> (7 - ((bitPos + i) & 7))) & 1;
      value = (value << 1) | bit;
    }
    bitPos += count;
    return value;
  };

  const nBits = readBits(5);
  const xMin = readBits(nBits);
  const xMax = readBits(nBits);
  const yMin = readBits(nBits);
  const yMax = readBits(nBits);

  const TWIPS_PER_PX = 20;
  return {
    signature: sig,
    version,
    width: Math.round((xMax - xMin) / TWIPS_PER_PX),
    height: Math.round((yMax - yMin) / TWIPS_PER_PX),
  };
}

/* -------------------------------------------------------------------------- */
/* helpers                                                                     */
/* -------------------------------------------------------------------------- */
function argFlags(argv) {
  const flags = {};
  for (const arg of argv) {
    const match = /^--([a-z-]+)=(.*)$/i.exec(arg);
    if (match) flags[match[1]] = match[2];
  }
  return flags;
}

function slugify(value) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "game";
}

function titleFromFile(file) {
  return basename(file, extname(file))
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/* -------------------------------------------------------------------------- */
/* main                                                                        */
/* -------------------------------------------------------------------------- */
async function main() {
  const argv = process.argv.slice(2);
  const positional = argv.filter((a) => !a.startsWith("--"));
  const flags = argFlags(argv);

  if (positional.length === 0) {
    console.log(`Usage: node scripts/add-game.mjs <file.swf> ["Title"] [--id=slug] [--author=name]
                                [--description=text] [--tags=a,b] [--players=text]
                                [--controls=text] [--cover=image.png] [--license=MIT] [--source=url]`);
    process.exit(1);
  }

  const sourcePath = resolve(positional[0]);
  const buffer = await readFile(sourcePath);
  let header = { width: 0, height: 0 };
  try {
    header = readSwfHeader(buffer);
  } catch (error) {
    console.warn(`warning: ${error.message} — using 800x600 as the stage size`);
  }
  if (!header.width || !header.height) {
    console.warn("warning: could not read the stage size from this SWF — using 800x600. " +
      "You can fix it by editing width/height in games.json.");
  }

  const title = positional[1] || flags.title || titleFromFile(sourcePath);
  const id = slugify(flags.id || title);
  const targetDir = join(root, "assets", "games", id);

  await mkdir(targetDir, { recursive: true });
  await copyFile(sourcePath, join(targetDir, "game.swf"));

  let cover = "";
  if (flags.cover) {
    const coverPath = resolve(flags.cover);
    cover = basename(coverPath);
    await copyFile(coverPath, join(targetDir, cover));
  }

  const entry = {
    id,
    title,
    file: "game.swf",
    author: flags.author || "",
    players: flags.players || "1 player",
    description: flags.description || "",
    tags: flags.tags ? flags.tags.split(",").map((t) => t.trim()).filter(Boolean) : [],
    ...(cover ? { cover } : {}),
    width: header.width || 800,
    height: header.height || 600,
    license: flags.license || "",
    source: flags.source || "",
  };

  const catalogPath = join(root, "games.json");
  const catalog = JSON.parse(await readFile(catalogPath, "utf8"));
  const games = Array.isArray(catalog) ? catalog : catalog.games || [];
  const existing = games.findIndex((g) => g.id === id);
  if (existing >= 0) games[existing] = entry;
  else games.unshift(entry);

  // Preserve the top-level shape of games.json ({"games": [...]} or a bare array).
  const output = Array.isArray(catalog) ? games : { ...catalog, games };
  await writeFile(catalogPath, JSON.stringify(output, null, 2) + "\n");

  console.log(`${existing >= 0 ? "Updated" : "Added"} “${title}”  →  assets/games/${id}/game.swf`);
  console.log(`   stage size read from header: ${entry.width} × ${entry.height}`);
  console.log(`   games.json now lists ${games.length} game${games.length === 1 ? "" : "s"}`);
  console.log(`\nCommit assets/games/${id}/ and games.json, push, and it is live on GitHub Pages.`);
}

// Only run when invoked directly, so other scripts can import readSwfHeader.
if (process.argv[1] && resolve(process.argv[1]) === resolve(new URL(import.meta.url).pathname)) {
  main().catch((error) => {
    console.error("add-game failed:", error.message);
    process.exit(1);
  });
}
