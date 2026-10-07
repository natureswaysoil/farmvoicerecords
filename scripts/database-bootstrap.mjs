import { readFile, readdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
const root = new URL("../", import.meta.url);
export async function bootstrapSources() {
  const paths = JSON.parse(await readFile(new URL("supabase/bootstrap-manifest.json", root), "utf8"));
  const migrations = (await readdir(new URL("supabase/migrations/", root))).filter(p => p.endsWith(".sql"));
  if (new Set(paths).size !== paths.length || migrations.some(p => !paths.includes(`supabase/migrations/${p}`)))
    throw new Error("Bootstrap manifest must include each migration exactly once.");
  return Promise.all(paths.map(async path => ({ path, sql: await readFile(new URL(path, root), "utf8") })));
}
export async function bootstrapSql() {
  return "-- EMPTY Supabase projects only. Never replay against an existing project.\nbegin;\n" +
    (await bootstrapSources()).map(({path,sql}) => `\n-- Source: ${path}\n${sql.replace(/^\s*(begin|commit);\s*$/gim, '')}`).join("\n") + "\ncommit;\n";
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const output = process.argv[2];
  if (!output) throw new Error("Usage: node scripts/database-bootstrap.mjs OUTPUT.sql");
  await writeFile(output, await bootstrapSql());
  console.log(`Wrote fresh-project bootstrap to ${output}`);
}
