import { buildColors } from "./color.js";
import { className, classColor } from "./color.js";
import { createSyntheticCloud, parseLas } from "./las.js";
import { PointCloudRenderer } from "./renderer.js";

const MAX_RENDER_POINTS = 2_000_000;
const els = {
  canvas: document.getElementById("viewerCanvas"),
  overlay: document.getElementById("measureOverlay"),
  rendererBadge: document.getElementById("rendererBadge"),
  fileInput: document.getElementById("fileInput"),
  chooseFileButton: document.getElementById("chooseFileButton"),
  openFileButton: document.getElementById("openFileButton"),
  emptyOpenButton: document.getElementById("emptyOpenButton"),
  sampleButton: document.getElementById("sampleButton"),
  emptySampleButton: document.getElementById("emptySampleButton"),
  resetViewButton: document.getElementById("resetViewButton"),
  orbitButton: document.getElementById("orbitButton"),
  walkButton: document.getElementById("walkButton"),
  measureButton: document.getElementById("measureButton"),
  clipButton: document.getElementById("clipButton"),
  dropZone: document.getElementById("dropZone"),
  emptyState: document.getElementById("emptyState"),
  toast: document.getElementById("toast"),
  fileStatus: document.getElementById("fileStatus"),
  metadataList: document.getElementById("metadataList"),
  classList: document.getElementById("classList"),
  displayModeGroup: document.getElementById("displayModeGroup"),
  rgbModeButton: document.getElementById("rgbModeButton"),
  pointSize: document.getElementById("pointSize"),
  minElevation: document.getElementById("minElevation"),
  maxElevation: document.getElementById("maxElevation"),
  resetElevationButton: document.getElementById("resetElevationButton"),
  clipPanel: document.getElementById("clipPanel"),
  resetClipButton: document.getElementById("resetClipButton"),
  measureInfo: document.getElementById("measureInfo"),
  statusMode: document.getElementById("statusMode"),
  statusPoints: document.getElementById("statusPoints"),
  statusSampling: document.getElementById("statusSampling"),
  statusCoords: document.getElementById("statusCoords"),
};

const clipInputs = {
  minX: document.getElementById("clipMinX"),
  maxX: document.getElementById("clipMaxX"),
  minY: document.getElementById("clipMinY"),
  maxY: document.getElementById("clipMaxY"),
  minZ: document.getElementById("clipMinZ"),
  maxZ: document.getElementById("clipMaxZ"),
};

const state = {
  cloud: null,
  displayMode: "elevation",
  visibleClasses: new Set(),
  elevationMin: 0,
  elevationMax: 1,
  measurement: [],
  measureMode: false,
  clipEnabled: false,
  clipPercent: { minX: 0, maxX: 100, minY: 0, maxY: 100, minZ: 0, maxZ: 100 },
};

let renderer;

init();

function init() {
  detectGraphics();
  renderer = new PointCloudRenderer(els.canvas, {
    onMeasurePick: (hit) => addMeasurePoint(hit.point),
  });
  window.__viewerDebug = { renderer, state };
  wireControls();
  setMode("orbit");
  if (new URLSearchParams(window.location.search).get("sample") === "1") {
    loadCloud(createSyntheticCloud(), "测试点云已生成");
  }
  renderOverlayLoop();
}

function detectGraphics() {
  const hasWebGpu = Boolean(navigator.gpu);
  els.rendererBadge.textContent = hasWebGpu
    ? "WebGL 渲染 / WebGPU 可用"
    : "WebGL 渲染 / WebGPU 不可用";
}

function wireControls() {
  const openPicker = () => els.fileInput.click();
  els.chooseFileButton.addEventListener("click", openPicker);
  els.openFileButton.addEventListener("click", openPicker);
  els.emptyOpenButton.addEventListener("click", openPicker);
  els.fileInput.addEventListener("change", (event) => {
    const file = event.target.files?.[0];
    if (file) loadFile(file);
    event.target.value = "";
  });

  for (const button of [els.sampleButton, els.emptySampleButton]) {
    button.addEventListener("click", () => loadCloud(createSyntheticCloud(), "测试点云已生成"));
  }

  els.resetViewButton.addEventListener("click", () => {
    if (state.cloud) renderer.fitToBounds(state.cloud.localBounds);
  });
  els.orbitButton.addEventListener("click", () => setMode("orbit"));
  els.walkButton.addEventListener("click", () => setMode("walk"));
  els.measureButton.addEventListener("click", () => {
    state.measureMode = !state.measureMode;
    state.measurement = [];
    renderer.setMeasureMode(state.measureMode);
    els.measureButton.classList.toggle("active", state.measureMode);
    els.measureInfo.textContent = state.measureMode ? "请在点云上点击第一个点。" : "开启测距后，在点云上依次点击两个点。";
    drawMeasurement();
  });

  els.clipButton.addEventListener("click", () => {
    state.clipEnabled = !state.clipEnabled;
    els.clipButton.classList.toggle("active", state.clipEnabled);
    els.clipPanel.classList.toggle("muted", !state.clipEnabled);
    applyRenderState();
  });

  els.displayModeGroup.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-mode]");
    if (!button || button.disabled) return;
    state.displayMode = button.dataset.mode;
    for (const item of els.displayModeGroup.querySelectorAll("button")) item.classList.toggle("active", item === button);
    applyRenderState();
  });

  els.pointSize.addEventListener("input", () => renderer.setPointSize(els.pointSize.value));
  els.minElevation.addEventListener("change", updateElevationFromInputs);
  els.maxElevation.addEventListener("change", updateElevationFromInputs);
  els.resetElevationButton.addEventListener("click", () => resetElevationFilter(true));

  for (const [key, input] of Object.entries(clipInputs)) {
    input.addEventListener("input", () => {
      state.clipPercent[key] = Number(input.value);
      normalizeClipRanges(key);
      applyRenderState();
    });
  }
  els.resetClipButton.addEventListener("click", () => {
    state.clipPercent = { minX: 0, maxX: 100, minY: 0, maxY: 100, minZ: 0, maxZ: 100 };
    syncClipInputs();
    applyRenderState();
  });

  for (const zone of [document.body, els.dropZone]) {
    zone.addEventListener("dragover", (event) => {
      event.preventDefault();
      els.dropZone.classList.add("dragging");
    });
    zone.addEventListener("dragleave", () => els.dropZone.classList.remove("dragging"));
    zone.addEventListener("drop", (event) => {
      event.preventDefault();
      els.dropZone.classList.remove("dragging");
      const file = event.dataTransfer?.files?.[0];
      if (file) loadFile(file);
    });
  }
}

async function loadFile(file) {
  if (!file.name.toLowerCase().endsWith(".las")) {
    showToast("请打开 .las 文件；第一版暂不支持 .laz。", "error");
    return;
  }
  setFileStatus([`正在读取 ${file.name}`, `${formatBytes(file.size)}，本地解析中...`], "busy");
  try {
    const buffer = await file.arrayBuffer();
    const cloud = await parseLas(buffer, {
      fileName: file.name,
      maxRenderPoints: MAX_RENDER_POINTS,
    }, (progress) => {
      const ratio = Math.round((progress.loaded / progress.total) * 100);
      setFileStatus([`正在解析 ${file.name}`, `${ratio}%`], "busy");
    });
    loadCloud(cloud, `${file.name} 加载完成`);
  } catch (error) {
    console.error(error);
    showToast(error.message || "LAS 解析失败。", "error");
    setFileStatus([file.name, error.message || "解析失败"], "error");
  }
}

function loadCloud(cloud, message) {
  state.cloud = cloud;
  state.visibleClasses = new Set([...cloud.classCounts.keys()]);
  state.displayMode = cloud.rgb ? state.displayMode : (state.displayMode === "rgb" ? "elevation" : state.displayMode);
  state.measurement = [];
  state.measureMode = false;
  renderer.setMeasureMode(false);
  els.measureButton.classList.remove("active");
  els.emptyState.classList.add("hidden");
  resetElevationFilter(false);
  syncClipInputs();
  updateMetadata();
  updateClassList();
  updateDisplayButtons();
  applyRenderState(true);
  renderer.fitToBounds(cloud.localBounds);
  showToast(message);
}

function applyRenderState(skipStatus = false) {
  if (!state.cloud) return;
  const clip = state.clipEnabled ? percentClipToBounds() : null;
  const buffers = buildColors(state.cloud, {
    displayMode: state.displayMode,
    elevationMin: state.elevationMin,
    elevationMax: state.elevationMax,
    visibleClasses: state.visibleClasses,
    clip,
  });
  renderer.setCloud({
    positions: buffers.positions,
    colors: buffers.colors,
    bounds: state.cloud.localBounds,
  });
  if (!skipStatus) showToast(`当前渲染 ${formatNumber(buffers.count)} 点`);
  updateStatus(buffers.count);
}

function setMode(mode) {
  renderer?.setMode(mode);
  els.orbitButton.classList.toggle("active", mode === "orbit");
  els.walkButton.classList.toggle("active", mode === "walk");
  els.statusMode.textContent = mode === "walk" ? "模式：漫游 W/A/S/D/Q/E" : "模式：轨道";
}

function resetElevationFilter(apply) {
  if (!state.cloud) return;
  const [min, max] = sampledMinMax(state.cloud.elevations, 200_000);
  state.elevationMin = round(min);
  state.elevationMax = round(max);
  els.minElevation.value = state.elevationMin;
  els.maxElevation.value = state.elevationMax;
  if (apply) applyRenderState();
}

function updateElevationFromInputs() {
  const min = Number(els.minElevation.value);
  const max = Number(els.maxElevation.value);
  if (!Number.isFinite(min) || !Number.isFinite(max) || min > max) {
    showToast("高程范围无效。", "error");
    return;
  }
  state.elevationMin = min;
  state.elevationMax = max;
  applyRenderState();
}

function updateMetadata() {
  const cloud = state.cloud;
  const bounds = cloud.sourceBounds || cloud.header.bounds;
  els.metadataList.innerHTML = `
    <div><dt>文件</dt><dd>${escapeHtml(cloud.header.fileName)}</dd></div>
    <div><dt>版本</dt><dd>${cloud.header.version}</dd></div>
    <div><dt>点格式</dt><dd>${cloud.header.pointFormat}</dd></div>
    <div><dt>原始点数</dt><dd>${formatNumber(cloud.sourcePointCount)}</dd></div>
    <div><dt>渲染点数</dt><dd>${formatNumber(cloud.renderedPointCount)}</dd></div>
    <div><dt>范围</dt><dd>${formatBounds(bounds)}</dd></div>
  `;
  const status = [
    cloud.header.fileName,
    cloud.sampled ? `已按 1/${cloud.stride} 抽样` : "完整渲染",
    ...cloud.warnings,
  ];
  setFileStatus(status, cloud.warnings.length ? "warn" : "ok");
}

function updateClassList() {
  const entries = [...state.cloud.classCounts.entries()].sort((a, b) => a[0] - b[0]);
  if (!entries.length) {
    els.classList.textContent = "未读取到类别信息";
    els.classList.classList.add("empty");
    return;
  }
  els.classList.classList.remove("empty");
  els.classList.innerHTML = entries.map(([cls, count]) => {
    const color = classColor(cls);
    return `
      <label class="class-item">
        <input type="checkbox" value="${cls}" checked />
        <span class="swatch" style="background: rgb(${color.join(",")})"></span>
        <span>${className(cls)}</span>
        <em>${formatNumber(count)}</em>
      </label>
    `;
  }).join("");
  els.classList.querySelectorAll("input").forEach((input) => {
    input.addEventListener("change", () => {
      const cls = Number(input.value);
      if (input.checked) state.visibleClasses.add(cls);
      else state.visibleClasses.delete(cls);
      applyRenderState();
    });
  });
}

function updateDisplayButtons() {
  els.rgbModeButton.disabled = !state.cloud.rgb;
  els.rgbModeButton.title = state.cloud.rgb ? "按 LAS RGB 着色" : "当前 LAS 不包含 RGB";
  for (const button of els.displayModeGroup.querySelectorAll("button")) {
    button.classList.toggle("active", button.dataset.mode === state.displayMode);
  }
}

function updateStatus(renderCount) {
  const cloud = state.cloud;
  els.statusPoints.textContent = `点数：${formatNumber(renderCount)} / ${formatNumber(cloud.sourcePointCount)}`;
  els.statusSampling.textContent = cloud.sampled ? `抽样：1/${cloud.stride}` : "抽样：无";
}

function addMeasurePoint(point) {
  state.measurement.push(point);
  if (state.measurement.length > 2) state.measurement = [point];
  if (state.measurement.length === 1) {
    els.measureInfo.textContent = "已选择第一个点，请点击第二个点。";
  } else {
    const dist = distance(state.measurement[0], state.measurement[1]);
    els.measureInfo.innerHTML = `距离：<strong>${dist.toFixed(3)}</strong>（LAS 坐标单位）`;
    els.statusCoords.textContent = `测距：${dist.toFixed(3)}`;
  }
  drawMeasurement();
}

function drawMeasurement() {
  els.overlay.innerHTML = "";
  if (!state.measurement.length) return;
  const points = state.measurement.map((p) => renderer.projectToScreen(p)).filter(Boolean);
  if (!points.length) return;
  const circles = points.map((p) => `<circle cx="${p.x}" cy="${p.y}" r="5" />`).join("");
  const line = points.length === 2 ? `<line x1="${points[0].x}" y1="${points[0].y}" x2="${points[1].x}" y2="${points[1].y}" />` : "";
  els.overlay.innerHTML = `${line}${circles}`;
}

function renderOverlayLoop() {
  drawMeasurement();
  requestAnimationFrame(renderOverlayLoop);
}

function percentClipToBounds() {
  const b = state.cloud.localBounds;
  return {
    minX: mix(b.min[0], b.max[0], state.clipPercent.minX / 100),
    maxX: mix(b.min[0], b.max[0], state.clipPercent.maxX / 100),
    minY: mix(b.min[1], b.max[1], state.clipPercent.minY / 100),
    maxY: mix(b.min[1], b.max[1], state.clipPercent.maxY / 100),
    minZ: mix(b.min[2], b.max[2], state.clipPercent.minZ / 100),
    maxZ: mix(b.min[2], b.max[2], state.clipPercent.maxZ / 100),
  };
}

function normalizeClipRanges(changedKey) {
  const axis = changedKey.slice(-1);
  const minKey = `min${axis}`;
  const maxKey = `max${axis}`;
  if (state.clipPercent[minKey] > state.clipPercent[maxKey]) {
    if (changedKey.startsWith("min")) state.clipPercent[maxKey] = state.clipPercent[minKey];
    else state.clipPercent[minKey] = state.clipPercent[maxKey];
    syncClipInputs();
  }
}

function syncClipInputs() {
  for (const [key, input] of Object.entries(clipInputs)) input.value = state.clipPercent[key];
}

function setFileStatus(lines, tone = "idle") {
  els.fileStatus.className = `status-stack ${tone}`;
  els.fileStatus.innerHTML = lines.map((line) => `<span>${escapeHtml(line)}</span>`).join("");
}

function showToast(message, tone = "ok") {
  els.toast.textContent = message;
  els.toast.className = `toast show ${tone}`;
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => els.toast.classList.remove("show"), 2600);
}

function sampledMinMax(array, maxSamples) {
  const stride = Math.ceil(array.length / maxSamples);
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < array.length; i += stride) {
    min = Math.min(min, array[i]);
    max = Math.max(max, array[i]);
  }
  return [min, max];
}

function formatBounds(bounds) {
  if (!bounds?.min || !bounds?.max) return "-";
  const sx = (bounds.max[0] - bounds.min[0]).toFixed(2);
  const sy = (bounds.max[1] - bounds.min[1]).toFixed(2);
  const sz = (bounds.max[2] - bounds.min[2]).toFixed(2);
  return `${sx} x ${sy} x ${sz}`;
}

function formatBytes(bytes) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function formatNumber(value) {
  return new Intl.NumberFormat("zh-CN").format(value || 0);
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#039;",
  })[char]);
}

function distance(a, b) {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

function mix(a, b, t) {
  return a + (b - a) * t;
}

function round(value) {
  return Math.round(value * 1000) / 1000;
}
