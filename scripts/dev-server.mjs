import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";
import { readFile, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const root = dirname(fileURLToPath(new URL("../package.json", import.meta.url)));
const args = new Map(process.argv.slice(2).map((item, index, all) => item.startsWith("--") ? [item.slice(2), all[index + 1]] : []));
const host = args.get("host") || "127.0.0.1";
const port = Number(args.get("port") || process.env.PORT || 5173);

const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
};

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url || "/", `http://${request.headers.host}`);
    const pathname = decodeURIComponent(url.pathname);
    const filePath = safePath(pathname === "/" ? "/index.html" : pathname);
    let body;
    let type = types[extname(filePath)] || "application/octet-stream";
    try {
      const info = await stat(filePath);
      if (!info.isFile()) throw new Error("not a file");
      body = await readFile(filePath);
    } catch {
      body = await readFile(join(root, "index.html"));
      type = types[".html"];
    }
    response.writeHead(200, { "content-type": type });
    response.end(body);
  } catch (error) {
    response.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
    response.end(error.message);
  }
});

server.listen(port, host, () => {
  console.log(`LAS Point Cloud Viewer dev server: http://${host === "127.0.0.1" ? "localhost" : host}:${port}`);
});

function safePath(pathname) {
  const resolved = normalize(join(root, pathname));
  if (!resolved.startsWith(root)) throw new Error("Invalid path");
  return resolved;
}

