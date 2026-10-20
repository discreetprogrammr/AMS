// Checks that every server action and API route refuses a read-only "viewer"
// (lib/viewer-guard.ts, schema_step54.sql). From ams-web/:  node check-viewer-guards.mjs
// An action is covered if its first lines call requireStaff(), requireSuperAdmin()
// or assertNotViewer(): a viewer fails all three. A route is covered if it calls
// forbidViewer(), or is a cron route (protected by CRON_SECRET, never a viewer).
import { readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".next") continue;
    const p = join(dir, name);
    statSync(p).isDirectory() ? walk(p, out) : out.push(p);
  }
  return out;
}

const SKIP = new Set(["login", "logout", "nextAssetTag", "resolveSiteId", "nextInternalAssetTag"]);
const missing = [];
let actions = 0;
let routes = 0;

for (const f of [...walk("app"), ...walk("lib")]) {
  const s = readFileSync(f, "utf8");
  if (/actions?\.ts$|-actions\.ts$/.test(f) && s.includes('"use server"')) {
    for (const m of s.matchAll(/export async function (\w+)\(/g)) {
      if (SKIP.has(m[1])) continue;
      actions++;
      const rest = s.slice(m.index);
      const next = rest.indexOf("\nexport ", 1);
      const head = rest.slice(0, next === -1 ? rest.length : next).split("\n").slice(0, 14).join("\n");
      if (!/requireStaff\(|requireSuperAdmin\(|assertNotViewer\(/.test(head)) missing.push(`action ${f}: ${m[1]}`);
    }
  }
  if (f.endsWith("route.ts") && f.includes("app/api/") && !f.includes("/cron/")) {
    routes++;
    if (!s.includes("forbidViewer(")) missing.push(`route ${f}`);
  }
}

console.log(`Checked ${actions} server actions and ${routes} API routes (cron excluded).`);
if (missing.length) {
  console.log("NOT guarded against a viewer:");
  for (const m of missing) console.log("  " + m);
  process.exit(1);
}
console.log("All guarded.");
