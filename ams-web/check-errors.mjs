import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";

const envText = readFileSync(".env.local", "utf8");
const env = {};
for (const line of envText.split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^"(.*)"$/, "$1");
}

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const { data, error } = await supabase
  .from("error_logs")
  .select("id, source, message, stack, context, created_at")
  .eq("source", "client:render")
  .order("created_at", { ascending: false })
  .limit(5);

if (error) {
  console.log("QUERY ERROR", error);
} else {
  for (const row of data) {
    console.log("=====", row.created_at, "=====");
    console.log("message:", row.message);
    console.log("context:", JSON.stringify(row.context));
    console.log("stack:", row.stack);
    console.log();
  }
}
