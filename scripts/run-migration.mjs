// One-off migration runner. Usage:
//   DATABASE_URL="postgresql://..." node scripts/run-migration.mjs <path-to-sql>
import { readFileSync } from "node:fs";
import pg from "pg";

const sqlPath = process.argv[2];
const url = process.env.DATABASE_URL;
if (!url || !sqlPath) {
  console.error("Usage: DATABASE_URL=... node scripts/run-migration.mjs <file.sql>");
  process.exit(1);
}

const sql = readFileSync(sqlPath, "utf8");
const client = new pg.Client({
  connectionString: url,
  ssl: { rejectUnauthorized: false },
});

try {
  await client.connect();
  console.log("→ Connected");
  await client.query(sql);
  console.log("→ Migration applied");

  // Quick verify
  const r = await client.query(
    "select table_name from information_schema.tables where table_schema='public' order by table_name",
  );
  console.log("Tables:", r.rows.map((x) => x.table_name).join(", "));

  const o = await client.query("select id, name, latitude, longitude from public.offices order by name");
  console.log("Offices seeded:");
  for (const row of o.rows) console.log(" -", row.name, row.latitude + ", " + row.longitude);
} catch (e) {
  console.error("✗", e.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
