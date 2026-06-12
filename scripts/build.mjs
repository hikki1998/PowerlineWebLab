import { cp, mkdir, rm, writeFile, copyFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";

const root = dirname(fileURLToPath(new URL("../package.json", import.meta.url)));
const dist = join(root, "dist");

await rm(dist, { recursive: true, force: true });
await mkdir(join(dist, "client"), { recursive: true });
await mkdir(join(dist, "server"), { recursive: true });
await mkdir(join(dist, ".openai"), { recursive: true });

await copyFile(join(root, "index.html"), join(dist, "client", "index.html"));
await cp(join(root, "src"), join(dist, "client", "src"), { recursive: true });
if (existsSync(join(root, "public"))) {
  await cp(join(root, "public"), join(dist, "client"), { recursive: true });
}
await copyFile(join(root, ".openai", "hosting.json"), join(dist, ".openai", "hosting.json"));

await writeFile(join(dist, "server", "index.js"), `export default {
  async fetch(request, env) {
    if (env && env.ASSETS && typeof env.ASSETS.fetch === "function") {
      return env.ASSETS.fetch(request);
    }
    return new Response("LAS Point Cloud Viewer build is ready.", {
      headers: { "content-type": "text/plain; charset=utf-8" }
    });
  }
};
`);

console.log("Built static client and Sites worker output in dist/");
