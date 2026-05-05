#!/usr/bin/env node
/**
 * Backup Supabase Storage buckets (selfies, faces) → local filesystem.
 * Incremental: skip file đã có local.
 *
 * Env required:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *
 * Args:
 *   --dest=<dir>        (default: $BACKUP_DIR/storage hoặc /opt/chamcong/backups/storage)
 *   --buckets=a,b       (default: selfies,faces)
 *
 * Usage:
 *   node scripts/backup-storage.mjs --dest=/opt/chamcong/backups/storage
 */
import { createClient } from "@supabase/supabase-js";
import { mkdir, writeFile, stat } from "node:fs/promises";
import { dirname, join } from "node:path";

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, "").split("=");
    return [k, v ?? "true"];
  }),
);

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("ERROR: thiếu NEXT_PUBLIC_SUPABASE_URL hoặc SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const DEST = args.dest || process.env.BACKUP_DIR
  ? `${process.env.BACKUP_DIR ?? "/opt/chamcong/backups"}/storage`
  : "/opt/chamcong/backups/storage";
const BUCKETS = (args.buckets ?? "selfies,faces").split(",");

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
});

/**
 * List recursively all files in a bucket.
 * Supabase storage list không recursive sẵn — phải tự đệ quy theo folder.
 */
async function listAll(bucket, path = "") {
  const out = [];
  let offset = 0;
  // Page 1000 mỗi lần
  while (true) {
    const { data, error } = await supabase.storage.from(bucket).list(path, {
      limit: 1000,
      offset,
      sortBy: { column: "name", order: "asc" },
    });
    if (error) {
      console.error(`[${bucket}] list ${path} failed:`, error.message);
      break;
    }
    if (!data || data.length === 0) break;
    for (const item of data) {
      const itemPath = path ? `${path}/${item.name}` : item.name;
      // Folder: id is null + có metadata null
      if (item.id === null) {
        const sub = await listAll(bucket, itemPath);
        out.push(...sub);
      } else {
        out.push({ path: itemPath, size: item.metadata?.size ?? 0 });
      }
    }
    if (data.length < 1000) break;
    offset += 1000;
  }
  return out;
}

async function fileExistsWithSize(localPath, size) {
  try {
    const s = await stat(localPath);
    return s.size === size;
  } catch {
    return false;
  }
}

async function backupBucket(bucket) {
  const files = await listAll(bucket);
  console.log(`[${bucket}] ${files.length} file trên Storage`);

  let downloaded = 0;
  let skipped = 0;
  let failed = 0;

  for (const f of files) {
    const localPath = join(DEST, bucket, f.path);
    if (await fileExistsWithSize(localPath, f.size)) {
      skipped++;
      continue;
    }
    const { data, error } = await supabase.storage.from(bucket).download(f.path);
    if (error || !data) {
      failed++;
      console.error(`[${bucket}] download ${f.path} failed:`, error?.message);
      continue;
    }
    await mkdir(dirname(localPath), { recursive: true });
    const buf = Buffer.from(await data.arrayBuffer());
    await writeFile(localPath, buf);
    downloaded++;
  }
  console.log(`[${bucket}] downloaded=${downloaded} skipped=${skipped} failed=${failed}`);
  return { bucket, total: files.length, downloaded, skipped, failed };
}

const start = Date.now();
const results = [];
for (const bucket of BUCKETS) {
  const r = await backupBucket(bucket);
  results.push(r);
}
const elapsed = ((Date.now() - start) / 1000).toFixed(1);
console.log(`\n✓ Backup storage xong (${elapsed}s):`);
for (const r of results) {
  console.log(`  ${r.bucket}: ${r.downloaded}/${r.total} mới (${r.skipped} đã có, ${r.failed} fail)`);
}

if (results.some((r) => r.failed > 0)) process.exit(2);
