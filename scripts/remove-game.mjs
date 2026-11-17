#!/usr/bin/env node
/**
 * remove-game.mjs — delete a game from the arcade.
 *
 *   node scripts/remove-game.mjs <id>            # drop it from games.json only
 *   node scripts/remove-game.mjs <id> --delete   # also delete assets/games/<id>/
 */
import { readFile, writeFile, rm } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

const root = resolve(dirname(new URL(import.meta.url).pathname), "..");
const argv = process.argv.slice(2);
const id = argv.find((a) => !a.startsWith("--"));
const deleteFiles = argv.includes("--delete");

if (!id) {
  console.log("Usage: node scripts/remove-game.mjs <id> [--delete]");
  process.exit(1);
}

const catalogPath = join(root, "games.json");
const catalog = JSON.parse(await readFile(catalogPath, "utf8"));
const games = Array.isArray(catalog) ? catalog : catalog.games || [];
const next = games.filter((g) => g.id !== id);

if (next.length === games.length) {
  console.error(`No game with id "${id}". Known ids: ${games.map((g) => g.id).join(", ")}`);
  process.exit(1);
}

const output = Array.isArray(catalog) ? next : { ...catalog, games: next };
await writeFile(catalogPath, JSON.stringify(output, null, 2) + "\n");
console.log(`Removed “${id}” from games.json (${next.length} left).`);

if (deleteFiles) {
  await rm(join(root, "assets", "games", id), { recursive: true, force: true });
  console.log(`Deleted assets/games/${id}/`);
} else {
  console.log(`Its files are still in assets/games/${id}/ — pass --delete to remove them too.`);
}
