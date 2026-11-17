#!/usr/bin/env node
/**
 * check-games.mjs — validate games.json against the folders on disk.
 * Run it before you push (the GitHub Actions workflow runs it too).
 *
 *   node scripts/check-games.mjs
 */
import { readFile, stat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

const root = resolve(dirname(new URL(import.meta.url).pathname), "..");
const problems = [];
const warnings = [];

const catalog = JSON.parse(await readFile(join(root, "games.json"), "utf8"));
const games = Array.isArray(catalog) ? catalog : catalog.games || [];

if (!games.length) problems.push("games.json contains no games.");

const seen = new Set();
for (const [i, game] of games.entries()) {
  const where = `games[${i}] (${game.id || "no id"})`;
  if (!game.id) problems.push(`${where}: missing "id"`);
  if (!game.title) warnings.push(`${where}: missing "title"`);
  if (game.id && seen.has(game.id)) problems.push(`${where}: duplicate id`);
  if (game.id) seen.add(game.id);

  const file = game.file || "game.swf";
  const swf = join(root, "assets", "games", game.id || "", file);
  const info = await stat(swf).catch(() => null);
  if (!info) problems.push(`${where}: ${swf.replace(root + "/", "")} does not exist`);
  else {
    const head = (await readFile(swf)).subarray(0, 3).toString("latin1");
    if (!["FWS", "CWS", "ZWS"].includes(head)) problems.push(`${where}: ${file} is not a SWF file`);
  }

  if (game.cover) {
    const cover = join(root, "assets", "games", game.id, game.cover);
    if (!(await stat(cover).catch(() => null))) problems.push(`${where}: cover ${game.cover} does not exist`);
  }
  if (!game.license) warnings.push(`${where}: no "license" — please credit the game author`);
  if (!game.source) warnings.push(`${where}: no "source" link`);
}

for (const warning of warnings) console.warn("warn  " + warning);
for (const problem of problems) console.error("ERROR " + problem);

if (problems.length) {
  console.error(`\n${problems.length} problem(s) found.`);
  process.exit(1);
}
console.log(`OK — ${games.length} games, all files present.`);
