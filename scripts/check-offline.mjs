#!/usr/bin/env node
/**
 * check-offline.mjs — is offline.html still in sync with the site?
 *
 * Rebuilds in memory and compares against the committed file, so CI (and you)
 * can tell at a glance whether the single-file copy is stale.
 *
 *   node scripts/check-offline.mjs          # exit 1 if stale
 *   node scripts/check-offline.mjs --quiet  # only print on failure
 */
import { readFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { promisify } from "node:util";
import { createHash } from "node:crypto";

const run = promisify(execFile);
const root = resolve(dirname(new URL(import.meta.url).pathname), "..");
const quiet = process.argv.includes("--quiet");

const current = await readFile(join(root, "offline.html")).catch(() => null);
const currentCovers = await readFile(join(root, "offline.lock.json")).catch(() => null);

if (!current) {
  console.error("offline.html is missing — run `npm run build-offline`.");
  process.exit(1);
}

// Build to a temp file so the working copy is never touched by a check.
const tmp = join(root, ".offline-check.html");
await run(process.execPath, [join(root, "scripts", "build-offline.mjs"), `--out=${tmp}`]);
const rebuilt = await readFile(tmp);
const { unlink } = await import("node:fs/promises");
await unlink(tmp);

const same = current.equals(rebuilt);
const hash = (buffer) => createHash("sha256").update(buffer).digest("hex").slice(0, 16);

if (same) {
  if (!quiet) console.log(`offline.html is up to date (${(current.length / 1024 / 1024).toFixed(1)} MB, ${hash(current)}).`);
  process.exit(0);
}

console.error("offline.html is OUT OF DATE.");
console.error(`  committed: ${current.length} bytes (${hash(current)})`);
console.error(`  rebuild:   ${rebuilt.length} bytes (${hash(rebuilt)})`);
console.error("  Run `npm run build-offline` and commit the result.");
if (!currentCovers) console.error("  (offline.lock.json is also missing.)");
process.exit(1);
