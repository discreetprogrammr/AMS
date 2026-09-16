import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";

const envText = readFileSync(".env.local", "utf8");
const env = {};
for (const line of envText.split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^"(.*)"$/, "$1");
}

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

// Optional args: node check-errors.mjs [sourcePrefix] [limit]
//   node check-errors.mjs                 -> client:render, 5 rows (original behaviour)
//   node check-errors.mjs cron            -> every cron:* source
//   node check-errors.mjs cron 20         -> every cron:* source, 20 rows
//   node check-errors.mjs "" 20           -> all sources, 20 rows
const sourceArg = process.argv[2] ?? "client:render";
const limit = Number(process.argv[3] ?? 5);

let query = supabase
  .from("error_logs")
  .select("id, source, message, stack, context, created_at")
  .order("created_at", { ascending: false })
  .limit(limit);

if (sourceArg) {
  // Prefix match, so "cron" catches cron:compliance-check, cron:pm-due, etc.
  query = query.like("source", `${sourceArg}%`);
}

const { data, error } = await query;

if (error) {
  console.log("QUERY ERROR", error);
} else {
  for (const row of data) {
    console.log("=====", row.created_at, "|", row.source, "=====");
    console.log("message:", row.message);
    console.log("context:", JSON.stringify(row.context));
    console.log("stack:", row.stack);
    console.log();
  }
}
