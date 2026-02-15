const fs = require("node:fs/promises");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const DIST = path.join(ROOT, "dist");

async function rmDir(dir) {
  await fs.rm(dir, { recursive: true, force: true });
}

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

async function copyFileRel(relPath) {
  const src = path.join(ROOT, relPath);
  const dst = path.join(DIST, relPath);
  await ensureDir(path.dirname(dst));
  await fs.copyFile(src, dst);
}

async function copyDataDir() {
  const srcDir = path.join(ROOT, "data");
  const entries = await fs.readdir(srcDir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    await copyFileRel(path.join("data", entry.name));
  }
}

async function main() {
  await rmDir(DIST);
  await ensureDir(DIST);
  await copyFileRel("index.html");
  await copyFileRel("app.js");
  await copyFileRel("styles.css");
  await copyDataDir();
  console.log(`dist built: ${DIST}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
