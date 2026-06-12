import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { parseLas, readLasHeader } from "../src/las.js";

const defaultDir = "E:\\code\\VibeCodingProject\\las_pointcloud_viewer\\test_data";
const dir = process.argv[2] || defaultDir;
const entries = (await readdir(dir)).filter((name) => name.toLowerCase().endsWith(".las")).sort();
const supportedFormats = new Set([0, 1, 2, 3, 5, 6, 7, 8, 10]);

if (!entries.length) {
  throw new Error(`No .las files found in ${dir}`);
}

console.log(`Found ${entries.length} LAS files in ${dir}`);

const headers = [];
for (const name of entries) {
  const path = join(dir, name);
  const info = await stat(path);
  const partial = await readFileSlice(path, Math.min(info.size, 4096));
  const arrayBuffer = toArrayBuffer(partial);
  const header = readLasHeader(arrayBuffer, name, info.size);
  headers.push({ name, size: info.size, header });
  console.log(`HEADER ${name}: format=${header.pointFormat}, points=${header.pointCount}, rgb=${header.hasRgb}, size=${formatMb(info.size)} MB`);
  if (!supportedFormats.has(header.pointFormat) || header.pointCount === 0) {
    console.log(`SKIP ${name}: unsupported or empty LAS, kept as invalid-file coverage.`);
  }
}

const supportedHeaders = headers
  .filter((item) => supportedFormats.has(item.header.pointFormat) && item.header.pointCount > 0)
  .sort((a, b) => a.size - b.size);

const parseTargets = supportedHeaders
  .filter((item) => item.size <= 150 * 1024 * 1024)
  .slice(0, 3);

const largestTarget = supportedHeaders.at(-1);
if (largestTarget && !parseTargets.some((item) => item.name === largestTarget.name)) {
  parseTargets.push(largestTarget);
}

for (const target of parseTargets) {
  const path = join(dir, target.name);
  const buffer = await readFile(path);
  const cloud = await parseLas(toArrayBuffer(buffer), {
    fileName: target.name,
    maxRenderPoints: 150_000,
    memoryLimitBytes: 900 * 1024 * 1024,
  });
  if (!cloud.renderedPointCount || !cloud.positions.length) {
    throw new Error(`Parsed zero points from ${target.name}`);
  }
  console.log(`PARSE ${target.name}: rendered=${cloud.renderedPointCount}, stride=${cloud.stride}, classes=${cloud.classCounts.size}`);
}

console.log("LAS validation completed.");

async function readFileSlice(path, length) {
  const handle = await import("node:fs/promises").then((fs) => fs.open(path, "r"));
  try {
    const buffer = Buffer.alloc(length);
    await handle.read(buffer, 0, length, 0);
    return buffer;
  } finally {
    await handle.close();
  }
}

function toArrayBuffer(buffer) {
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
}

function formatMb(bytes) {
  return (bytes / 1024 / 1024).toFixed(1);
}
