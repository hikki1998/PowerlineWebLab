import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(new URL("../package.json", import.meta.url)));
const endpoint = process.argv[2] || "http://localhost:5174?sample=1";
const debugBase = process.argv[3] || "http://localhost:9222";

class CdpClient {
  constructor(url) {
    this.url = url;
    this.nextId = 1;
    this.pending = new Map();
  }

  open() {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.url);
      this.ws.addEventListener("open", resolve, { once: true });
      this.ws.addEventListener("error", reject, { once: true });
      this.ws.addEventListener("message", (event) => {
        const message = JSON.parse(event.data);
        if (message.id && this.pending.has(message.id)) {
          const { resolve: done, reject: fail } = this.pending.get(message.id);
          this.pending.delete(message.id);
          if (message.error) fail(new Error(message.error.message));
          else done(message.result || {});
        }
      });
    });
  }

  send(method, params = {}) {
    const id = this.nextId++;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
  }

  close() {
    this.ws.close();
  }
}

const targetResponse = await fetch(`${debugBase}/json/new?${encodeURIComponent(endpoint)}`, { method: "PUT" });
if (!targetResponse.ok) {
  throw new Error(`Cannot create Chrome target: ${targetResponse.status} ${await targetResponse.text()}`);
}
const target = await targetResponse.json();
const client = new CdpClient(target.webSocketDebuggerUrl);
await client.open();
await client.send("Runtime.enable");
await client.send("Page.enable");
await client.send("Page.bringToFront");
await client.send("Page.navigate", { url: endpoint });
await wait(4000);
await client.send("Runtime.evaluate", {
  expression: `(() => {
    const frame = document.querySelector(".viewerFrame");
    if (frame && location.search && !new URL(frame.src, location.href).search) {
      frame.src = new URL(frame.getAttribute("src"), location.href).pathname + location.search;
    }
  })()`,
});
await wait(2000);

const result = await client.send("Runtime.evaluate", {
  returnByValue: true,
  awaitPromise: true,
  expression: `(() => {
    const frame = document.querySelector(".viewerFrame");
    const frameWindow = frame?.contentWindow || window;
    const frameDocument = frame?.contentDocument || document;
    const canvas = frameDocument.querySelector("#viewerCanvas");
    frameWindow.__viewerDebug?.renderer?.render?.();
    const gl = canvas && (canvas.getContext("webgl2") || canvas.getContext("webgl"));
    let nonBg = 0;
    let size = null;
    if (gl) {
      const w = canvas.width;
      const h = canvas.height;
      const sample = new Uint8Array(w * h * 4);
      gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, sample);
      for (let i = 0; i < sample.length; i += 4) {
        if (sample[i] > 18 || sample[i + 1] > 24 || sample[i + 2] > 34) nonBg++;
      }
      size = { width: w, height: h };
    }
    return {
      title: document.title,
      href: location.href,
      readyState: document.readyState,
      bodyText: frameDocument.body?.innerText?.slice(0, 300) || document.body?.innerText?.slice(0, 300) || "",
      hiddenEmptyState: frameDocument.querySelectorAll(".empty-state.hidden").length,
      statusPoints: frameDocument.querySelector("#statusPoints")?.textContent || "",
      metadata: frameDocument.querySelector("#metadataList")?.innerText || "",
      classRows: frameDocument.querySelectorAll(".class-item").length,
      webgl: Boolean(gl),
      canvas: size,
      nonBackgroundPixels: nonBg,
      rendererBadge: frameDocument.querySelector("#rendererBadge")?.textContent || "",
      hasFrame: Boolean(frame),
      rendererPointCount: frameWindow.__viewerDebug?.renderer?.pointCount || 0
    };
  })()`,
});

const value = result.result.value;
function fail(message) {
  console.error(JSON.stringify(value, null, 2));
  throw new Error(message);
}
if (!value.webgl) fail("WebGL context was not available in browser check.");
if (value.hiddenEmptyState !== 1) fail("Synthetic cloud did not hide the empty state.");
if (!value.statusPoints.includes("180,000") && !value.statusPoints.includes("180")) {
  fail(`Unexpected point status: ${value.statusPoints}`);
}
if (value.classRows < 3) fail(`Expected class filters, found ${value.classRows}`);
if (value.rendererPointCount < 1000) fail(`Renderer point count is too low: ${value.rendererPointCount}`);
if (value.nonBackgroundPixels < 8) fail(`Canvas pixel check looks blank: ${value.nonBackgroundPixels}`);

await mkdir(join(root, "public"), { recursive: true });
const screenshot = await client.send("Page.captureScreenshot", {
  format: "jpeg",
  quality: 88,
  captureBeyondViewport: false,
});
await writeFile(join(root, "public", "screenshot.jpeg"), Buffer.from(screenshot.data, "base64"));
await client.close();
console.log(JSON.stringify(value, null, 2));

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
