import { buildColors } from "./color.js";
import { className, classColor } from "./color.js";
import { analyzeClearance } from "./clearance.js";
import { createSyntheticCloud, parseLas } from "./las.js";
import { PointCloudRenderer } from "./renderer.js";
import {
  addPart,
  addTarget,
  addWaypoint,
  deletePart,
  deleteTarget,
  deleteWaypoint,
  exportInspectionRouteJson,
  parseInspectionRoute,
  rebuildInspectionRoute,
  routeToCloudLocal,
  updatePartFields,
  updateTargetFields,
  updateWaypointFields,
} from "./route.js";

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
  profileButton: document.getElementById("profileButton"),
  annotationButton: document.getElementById("annotationButton"),
  clipButton: document.getElementById("clipButton"),
  screenshotButton: document.getElementById("screenshotButton"),
  dropZone: document.getElementById("dropZone"),
  emptyState: document.getElementById("emptyState"),
  toast: document.getElementById("toast"),
  viewGizmoSvg: document.getElementById("viewGizmoSvg"),
  fileStatus: document.getElementById("fileStatus"),
  projectTree: document.getElementById("projectTree"),
  metadataList: document.getElementById("metadataList"),
  classList: document.getElementById("classList"),
  routeInfo: document.getElementById("routeInfo"),
  moduleTabs: document.getElementById("moduleTabs"),
  routeTabs: document.getElementById("routeTabs"),
  routeList: document.getElementById("routeList"),
  routeTargetList: document.getElementById("routeTargetList"),
  routeWaypointFilter: document.getElementById("routeWaypointFilter"),
  routePartFilter: document.getElementById("routePartFilter"),
  showRouteCoordinates: document.getElementById("showRouteCoordinates"),
  showRouteAngles: document.getElementById("showRouteAngles"),
  partList: document.getElementById("partList"),
  cameraPreview: document.getElementById("cameraPreview"),
  cameraPreviewTitle: document.getElementById("cameraPreviewTitle"),
  cameraPreviewSubtitle: document.getElementById("cameraPreviewSubtitle"),
  cameraPreviewSvg: document.getElementById("cameraPreviewSvg"),
  cameraPreviewMeta: document.getElementById("cameraPreviewMeta"),
  routeEditMode: document.getElementById("routeEditMode"),
  addWaypointButton: document.getElementById("addWaypointButton"),
  deleteWaypointButton: document.getElementById("deleteWaypointButton"),
  exportRouteButton: document.getElementById("exportRouteButton"),
  addPartButton: document.getElementById("addPartButton"),
  deletePartButton: document.getElementById("deletePartButton"),
  showWaypointLabels: document.getElementById("showWaypointLabels"),
  showPartLabels: document.getElementById("showPartLabels"),
  routeLabelOpacity: document.getElementById("routeLabelOpacity"),
  routeLabelOpacityValue: document.getElementById("routeLabelOpacityValue"),
  routeMap: document.getElementById("routeMap"),
  annotationMode: document.getElementById("annotationMode"),
  addViewBookmarkButton: document.getElementById("addViewBookmarkButton"),
  exportAnnotationsButton: document.getElementById("exportAnnotationsButton"),
  annotationHint: document.getElementById("annotationHint"),
  annotationList: document.getElementById("annotationList"),
  annotationEditor: document.getElementById("annotationEditor"),
  waypointEditor: document.getElementById("waypointEditor"),
  targetSelect: document.getElementById("targetSelect"),
  targetEditor: document.getElementById("targetEditor"),
  partEditor: document.getElementById("partEditor"),
  addTargetButton: document.getElementById("addTargetButton"),
  deleteTargetButton: document.getElementById("deleteTargetButton"),
  displayModeGroup: document.getElementById("displayModeGroup"),
  rgbModeButton: document.getElementById("rgbModeButton"),
  pointSize: document.getElementById("pointSize"),
  pointAttenuation: document.getElementById("pointAttenuation"),
  invertRotateDrag: document.getElementById("invertRotateDrag"),
  invertPanDrag: document.getElementById("invertPanDrag"),
  waypointDialog: document.getElementById("waypointDialog"),
  waypointDialogTitle: document.getElementById("waypointDialogTitle"),
  waypointDialogSummary: document.getElementById("waypointDialogSummary"),
  waypointDialogTargets: document.getElementById("waypointDialogTargets"),
  waypointDialogForm: document.getElementById("waypointDialogForm"),
  waypointDialogClose: document.getElementById("waypointDialogClose"),
  waypointDialogReset: document.getElementById("waypointDialogReset"),
  waypointDialogSave: document.getElementById("waypointDialogSave"),
  waypointDialogCancel: document.getElementById("waypointDialogCancel"),
  edlEnabled: document.getElementById("edlEnabled"),
  edlStrength: document.getElementById("edlStrength"),
  edlRadius: document.getElementById("edlRadius"),
  edlStrengthValue: document.getElementById("edlStrengthValue"),
  edlRadiusValue: document.getElementById("edlRadiusValue"),
  minElevation: document.getElementById("minElevation"),
  maxElevation: document.getElementById("maxElevation"),
  resetElevationButton: document.getElementById("resetElevationButton"),
  clipPanel: document.getElementById("clipPanel"),
  resetClipButton: document.getElementById("resetClipButton"),
  measureInfo: document.getElementById("measureInfo"),
  profileWidth: document.getElementById("profileWidth"),
  profileWidthValue: document.getElementById("profileWidthValue"),
  clearProfileButton: document.getElementById("clearProfileButton"),
  fitProfileButton: document.getElementById("fitProfileButton"),
  profileInfo: document.getElementById("profileInfo"),
  profileChart: document.getElementById("profileChart"),
  clearanceRadius: document.getElementById("clearanceRadius"),
  clearanceRadiusValue: document.getElementById("clearanceRadiusValue"),
  clearanceThreshold: document.getElementById("clearanceThreshold"),
  clearanceThresholdValue: document.getElementById("clearanceThresholdValue"),
  runClearanceButton: document.getElementById("runClearanceButton"),
  clearanceInfo: document.getElementById("clearanceInfo"),
  clearanceList: document.getElementById("clearanceList"),
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
  projectOrigin: null,
  datasets: [],
  routes: [],
  activeDatasetId: null,
  activeRouteId: null,
  cloud: null,
  route: null,
  displayRoute: null,
  selectedWaypointIndex: 0,
  selectedPartIndex: 0,
  selectedTargetIndex: 0,
  showWaypointLabels: true,
  showPartLabels: true,
  showRouteCoordinates: false,
  showRouteAngles: true,
  routeWaypointFilter: "",
  routePartFilter: "",
  routeLabelOpacity: 0.9,
  routeMapDrag: null,
  dialogWaypointIndex: null,
  displayMode: "elevation",
  visibleClasses: new Set(),
  classColors: new Map(),
  pointAttenuation: true,
  elevationMin: 0,
  elevationMax: 1,
  measurement: [],
  measureMode: false,
  profileMode: false,
  profilePoints: [],
  profileWidth: 8,
  profileResult: null,
  clearanceRadius: 3,
  clearanceThreshold: 8,
  clearanceResult: null,
  selectedClearanceIndex: 0,
  annotations: [],
  selectedAnnotationId: null,
  annotationMode: false,
  clipEnabled: false,
  clipPercent: { minX: 0, maxX: 100, minY: 0, maxY: 100, minZ: 0, maxZ: 100 },
};

let renderer;

init();

function init() {
  detectGraphics();
  renderer = new PointCloudRenderer(els.canvas, {
    onMeasurePick: (hit) => addMeasurePoint(hit.point),
    onProfilePick: (hit) => addProfilePoint(hit.point),
    onProfileUndo: () => undoProfilePoint(),
    onAnnotationPick: (hit) => addIssueAnnotation(hit.point),
    onMeasureUndo: () => undoMeasurePoint(),
    onViewChange: () => updateViewOverlays(),
    onRouteWaypointSelect: (index) => updateRouteSelection(index),
    onRouteWaypointMove: (index, delta) => moveWaypointByDisplayDelta(index, delta),
  });
  window.__viewerDebug = { renderer, state };
  wireControls();
  setMode("orbit");
  if (new URLSearchParams(window.location.search).get("sample") === "1") {
    loadCloud(createSyntheticCloud(), "测试点云已生成");
  }
  updateAnnotationList();
  renderAnnotationEditor();
  renderProfile();
  renderProjectTree();
  drawMeasurement();
  updateViewGizmo();
}

function detectGraphics() {
  const hasWebGpu = Boolean(navigator.gpu);
  els.rendererBadge.textContent = hasWebGpu
    ? "WebGL 渲染 / WebGPU 可用"
    : "WebGL 渲染 / WebGPU 不可用";
}

function wireControls() {
  bindTabs(els.moduleTabs);
  bindTabs(els.routeTabs);

  const openPicker = () => els.fileInput.click();
  els.chooseFileButton.addEventListener("click", openPicker);
  els.openFileButton.addEventListener("click", openPicker);
  els.emptyOpenButton.addEventListener("click", openPicker);
  els.fileInput.addEventListener("change", async (event) => {
    const files = [...(event.target.files || [])];
    for (const file of files) await loadFile(file);
    event.target.value = "";
  });

  for (const button of [els.sampleButton, els.emptySampleButton]) {
    button.addEventListener("click", () => loadCloud(createSyntheticCloud(), "测试点云已生成"));
  }

  els.resetViewButton.addEventListener("click", () => {
    const routeLayer = activeRouteLayer();
    const dataset = activeDatasetLayer();
    if (routeLayer?.visible && state.displayRoute?.bounds) renderer.fitToBounds(state.displayRoute.bounds);
    else if (dataset) renderer.fitToBounds(projectBoundsForCloud(dataset.cloud));
    else {
      const bounds = projectVisibleBounds();
      if (bounds) renderer.fitToBounds(bounds);
    }
  });
  els.orbitButton.addEventListener("click", () => setMode("orbit"));
  els.walkButton.addEventListener("click", () => setMode("walk"));
  els.measureButton.addEventListener("click", () => {
    state.measureMode = !state.measureMode;
    if (!state.measureMode) state.measurement = [];
    if (state.measureMode) {
      setAnnotationMode(false);
      setProfileMode(false);
    }
    renderer.setMeasureMode(state.measureMode);
    els.measureButton.classList.toggle("active", state.measureMode);
    updateMeasureInfo();
    drawMeasurement();
  });
  els.profileButton.addEventListener("click", () => setProfileMode(!state.profileMode));
  els.annotationButton.addEventListener("click", () => setAnnotationMode(!state.annotationMode));
  els.annotationMode.addEventListener("change", () => setAnnotationMode(els.annotationMode.checked));
  els.addViewBookmarkButton.addEventListener("click", addViewBookmark);
  els.exportAnnotationsButton.addEventListener("click", exportAnnotations);
  els.profileWidth.addEventListener("input", () => {
    state.profileWidth = Number(els.profileWidth.value);
    els.profileWidthValue.textContent = state.profileWidth.toFixed(1);
    computeProfile();
    renderProfile();
    drawMeasurement();
  });
  els.clearProfileButton.addEventListener("click", clearProfile);
  els.fitProfileButton.addEventListener("click", fitProfile);
  els.clearanceRadius.addEventListener("input", () => {
    state.clearanceRadius = Number(els.clearanceRadius.value);
    els.clearanceRadiusValue.textContent = state.clearanceRadius.toFixed(1);
  });
  els.clearanceThreshold.addEventListener("input", () => {
    state.clearanceThreshold = Number(els.clearanceThreshold.value);
    els.clearanceThresholdValue.textContent = state.clearanceThreshold.toFixed(1);
    renderClearance();
    drawMeasurement();
  });
  els.runClearanceButton.addEventListener("click", runClearanceAnalysis);

  els.clipButton.addEventListener("click", () => {
    state.clipEnabled = !state.clipEnabled;
    els.clipButton.classList.toggle("active", state.clipEnabled);
    els.clipPanel.classList.toggle("muted", !state.clipEnabled);
    applyRenderState();
  });
  els.screenshotButton.addEventListener("click", exportScreenshot);

  els.displayModeGroup.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-mode]");
    if (!button || button.disabled) return;
    state.displayMode = button.dataset.mode;
    for (const item of els.displayModeGroup.querySelectorAll("button")) item.classList.toggle("active", item === button);
    applyRenderState();
  });

  els.pointSize.addEventListener("input", () => renderer.setPointSize(els.pointSize.value));
  els.pointAttenuation.addEventListener("change", () => {
    state.pointAttenuation = els.pointAttenuation.checked;
    renderer.setPointAttenuation(state.pointAttenuation);
  });
  const syncMouseInversion = () => {
    renderer.setMouseInversion({
      rotate: els.invertRotateDrag.checked,
      pan: els.invertPanDrag.checked,
    });
    const enabled = [];
    if (els.invertRotateDrag.checked) enabled.push("旋转");
    if (els.invertPanDrag.checked) enabled.push("平移");
    showToast(enabled.length ? `已反转${enabled.join("、")}方向` : "已恢复默认鼠标方向");
  };
  els.invertRotateDrag.addEventListener("change", syncMouseInversion);
  els.invertPanDrag.addEventListener("change", syncMouseInversion);
  document.querySelectorAll("[data-view-preset]").forEach((button) => {
    button.addEventListener("click", () => renderer.setViewPreset(button.dataset.viewPreset));
  });
  els.routeEditMode.addEventListener("change", () => {
    renderer.setRouteEditMode(els.routeEditMode.checked);
    showToast(els.routeEditMode.checked ? "航线编辑模式已开启，可拖拽航点。" : "航线编辑模式已关闭。");
  });
  els.addWaypointButton.addEventListener("click", () => mutateRoute(() => {
    state.selectedWaypointIndex = addWaypoint(state.route, state.selectedWaypointIndex);
  }));
  els.deleteWaypointButton.addEventListener("click", () => mutateRoute(() => {
    deleteWaypoint(state.route, state.selectedWaypointIndex);
    state.selectedWaypointIndex = Math.max(0, state.selectedWaypointIndex - 1);
  }));
  els.exportRouteButton.addEventListener("click", exportRoute);
  els.addPartButton.addEventListener("click", () => mutateRoute(() => {
    state.selectedPartIndex = addPart(state.route);
  }));
  els.deletePartButton.addEventListener("click", () => mutateRoute(() => {
    deletePart(state.route, state.selectedPartIndex);
    state.selectedPartIndex = Math.max(0, state.selectedPartIndex - 1);
  }));
  els.routeWaypointFilter.addEventListener("input", () => {
    state.routeWaypointFilter = els.routeWaypointFilter.value.trim().toLowerCase();
    updateRouteList();
  });
  els.routePartFilter.addEventListener("input", () => {
    state.routePartFilter = els.routePartFilter.value.trim().toLowerCase();
    updatePartList();
  });
  els.showRouteCoordinates.addEventListener("change", () => {
    state.showRouteCoordinates = els.showRouteCoordinates.checked;
    updateRouteList();
  });
  els.showRouteAngles.addEventListener("change", () => {
    state.showRouteAngles = els.showRouteAngles.checked;
    updateRouteList();
    updateTargetList();
  });
  els.addTargetButton.addEventListener("click", () => mutateRoute(() => {
    state.selectedTargetIndex = addTarget(state.route, state.selectedWaypointIndex);
  }));
  els.deleteTargetButton.addEventListener("click", () => mutateRoute(() => {
    deleteTarget(state.route, state.selectedWaypointIndex, state.selectedTargetIndex);
    state.selectedTargetIndex = Math.max(0, state.selectedTargetIndex - 1);
  }));
  els.targetSelect.addEventListener("change", () => {
    state.selectedTargetIndex = Number(els.targetSelect.value || 0);
    renderEditors();
    syncRouteRenderer();
    updateTargetList();
    updateCameraPreview();
  });
  els.showWaypointLabels.addEventListener("change", () => {
    state.showWaypointLabels = els.showWaypointLabels.checked;
    drawMeasurement();
  });
  els.showPartLabels.addEventListener("change", () => {
    state.showPartLabels = els.showPartLabels.checked;
    drawMeasurement();
  });
  els.routeLabelOpacity.addEventListener("input", () => {
    state.routeLabelOpacity = Number(els.routeLabelOpacity.value);
    els.routeLabelOpacityValue.textContent = state.routeLabelOpacity.toFixed(2);
    drawMeasurement();
  });
  els.routeMap.addEventListener("pointerdown", (event) => {
    const node = event.target.closest?.(".map-waypoint");
    if (!node) return;
    state.routeMapDrag = Number(node.dataset.index);
    els.routeMap.setPointerCapture(event.pointerId);
    updateRouteSelection(state.routeMapDrag);
  });
  els.routeMap.addEventListener("pointermove", (event) => {
    if (state.routeMapDrag === null || state.routeMapDrag === undefined) return;
    const lngLat = mapEventToLngLat(event);
    if (!lngLat) return;
    updateWaypointFields(state.route, state.routeMapDrag, { lng: lngLat.lng, lat: lngLat.lat });
    state.route = rebuildInspectionRoute(state.route);
    const layer = activeRouteLayer();
    if (layer) layer.route = state.route;
    state.selectedWaypointIndex = state.routeMapDrag;
    syncRouteRenderer();
    updateRouteList();
    renderEditors();
    renderRouteMap();
  });
  els.routeMap.addEventListener("pointerup", () => {
    state.routeMapDrag = null;
  });
  els.waypointDialogClose.addEventListener("click", closeWaypointDialog);
  els.waypointDialogCancel.addEventListener("click", closeWaypointDialog);
  els.waypointDialogReset.addEventListener("click", renderWaypointDialog);
  els.waypointDialogSave.addEventListener("click", saveWaypointDialog);
  els.waypointDialog.addEventListener("click", (event) => {
    if (event.target === els.waypointDialog) closeWaypointDialog();
  });
  for (const input of [els.edlEnabled, els.edlStrength, els.edlRadius]) {
    input.addEventListener("input", updateEdl);
    input.addEventListener("change", updateEdl);
  }
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
      const files = [...(event.dataTransfer?.files || [])];
      files.forEach((file) => loadFile(file));
    });
  }
  els.projectTree.addEventListener("click", handleProjectTreeClick);
  els.projectTree.addEventListener("change", handleProjectTreeChange);
}

function updateViewOverlays() {
  drawMeasurement();
  updateViewGizmo();
}

function updateViewGizmo() {
  const view = renderer?.getViewState?.();
  if (!view) return;
  const axes = [
    { name: "X", color: "#ff6464", vector: [1, 0, 0] },
    { name: "Y", color: "#42d28b", vector: [0, 1, 0] },
    { name: "Z", color: "#60a5fa", vector: [0, 0, 1] },
  ].map((axis) => {
    const projected = projectAxis(axis.vector, view.yaw, view.pitch);
    return { ...axis, x: 44 + projected[0] * 28, y: 44 - projected[1] * 28, depth: projected[2] };
  }).sort((a, b) => a.depth - b.depth);
  els.viewGizmoSvg.innerHTML = `
    <circle class="gizmo-base" cx="44" cy="44" r="32" />
    ${axes.map((axis) => `
      <line x1="44" y1="44" x2="${axis.x}" y2="${axis.y}" style="stroke:${axis.color}" />
      <circle cx="${axis.x}" cy="${axis.y}" r="4" style="fill:${axis.color}" />
      <text x="${axis.x + 5}" y="${axis.y - 5}" style="fill:${axis.color}">${axis.name}</text>
    `).join("")}
  `;
}

function projectAxis(vector, yaw, pitch) {
  const cy = Math.cos(-yaw);
  const sy = Math.sin(-yaw);
  const cp = Math.cos(-pitch);
  const sp = Math.sin(-pitch);
  const x1 = vector[0] * cy - vector[2] * sy;
  const z1 = vector[0] * sy + vector[2] * cy;
  const y2 = vector[1] * cp - z1 * sp;
  const z2 = vector[1] * sp + z1 * cp;
  return [x1, y2, z2];
}

function bindTabs(tabList) {
  if (!tabList) return;
  tabList.querySelectorAll("button[data-panel]").forEach((button) => {
    button.addEventListener("click", () => {
      const panel = document.getElementById(button.dataset.panel);
      if (!panel) return;
      tabList.querySelectorAll("button[data-panel]").forEach((item) => {
        item.classList.toggle("active", item === button);
        item.setAttribute("aria-selected", item === button ? "true" : "false");
      });
      const scope = tabList.parentElement;
      scope.querySelectorAll(":scope > .tab-panel").forEach((item) => {
        item.classList.toggle("active", item === panel);
      });
      drawMeasurement();
    });
  });
}

function createLayerId(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function activeDatasetLayer() {
  return state.datasets.find((item) => item.id === state.activeDatasetId) || null;
}

function activeRouteLayer() {
  return state.routes.find((item) => item.id === state.activeRouteId) || null;
}

function createDatasetLayer(cloud) {
  const [minElevation, maxElevation] = sampledMinMax(cloud.elevations, 200_000);
  return {
    id: createLayerId("cloud"),
    kind: "cloud",
    name: cloud.header.fileName,
    visible: true,
    cloud,
    visibleClasses: new Set([...cloud.classCounts.keys()]),
    classColors: new Map([...cloud.classCounts.keys()].map((cls) => [cls, classColor(cls)])),
    elevationMin: round(minElevation),
    elevationMax: round(maxElevation),
    renderCount: cloud.renderedPointCount,
  };
}

function createRouteLayer(route) {
  return {
    id: createLayerId("route"),
    kind: "route",
    name: route.fileName,
    visible: true,
    route,
    displayRoute: null,
  };
}

function activateDataset(id, options = {}) {
  const dataset = state.datasets.find((item) => item.id === id);
  if (!dataset) {
    state.activeDatasetId = null;
    state.cloud = null;
    return;
  }
  state.activeDatasetId = id;
  state.cloud = dataset.cloud;
  state.visibleClasses = dataset.visibleClasses;
  state.classColors = dataset.classColors;
  state.elevationMin = dataset.elevationMin;
  state.elevationMax = dataset.elevationMax;
  state.displayMode = state.cloud.rgb ? state.displayMode : (state.displayMode === "rgb" ? "elevation" : state.displayMode);
  syncElevationInputs();
  updateMetadata();
  updateClassList();
  updateDisplayButtons();
  renderProjectTree();
  syncRouteRenderer();
  if (options.updateRender !== false) applyRenderState(true);
}

function activateRoute(id, options = {}) {
  const layer = state.routes.find((item) => item.id === id);
  if (!layer) {
    state.activeRouteId = null;
    state.route = null;
    state.displayRoute = null;
    renderer.setRoute(null);
    return;
  }
  state.activeRouteId = id;
  state.route = layer.route;
  state.selectedWaypointIndex = Math.min(state.selectedWaypointIndex, Math.max(state.route.waypointObjects.length - 1, 0));
  state.selectedPartIndex = Math.min(state.selectedPartIndex, Math.max(state.route.parts.length - 1, 0));
  state.selectedTargetIndex = 0;
  syncRouteRenderer();
  updateRouteInfo();
  updateRouteList();
  updatePartList();
  updateTargetList();
  renderEditors();
  renderProjectTree();
  if (options.updateRender !== false) drawMeasurement();
}

function syncElevationInputs() {
  els.minElevation.value = state.elevationMin;
  els.maxElevation.value = state.elevationMax;
}

async function loadFile(file) {
  const name = file.name.toLowerCase();
  if (name.endsWith(".json")) {
    await loadRouteFile(file);
    return;
  }
  if (!name.endsWith(".las")) {
    showToast("请打开 .las 或航线 .json 文件；第一版暂不支持 .laz。", "error");
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

async function loadRouteFile(file) {
  setFileStatus([`正在读取航线 ${file.name}`, `${formatBytes(file.size)}，本地解析中...`], "busy");
  try {
    const text = await file.text();
    const route = parseInspectionRoute(text, file.name);
    loadRoute(route, `${file.name} 航线加载完成`);
  } catch (error) {
    console.error(error);
    showToast(error.message || "航线 JSON 解析失败。", "error");
    setFileStatus([file.name, error.message || "航线 JSON 解析失败"], "error");
  }
}

function loadCloud(cloud, message) {
  if (!state.projectOrigin) state.projectOrigin = [...cloud.center];
  const dataset = createDatasetLayer(cloud);
  state.datasets.push(dataset);
  activateDataset(dataset.id, { updateRender: false });
  state.measurement = [];
  state.measureMode = false;
  state.profilePoints = [];
  state.profileResult = null;
  state.clearanceResult = null;
  state.selectedClearanceIndex = 0;
  setProfileMode(false);
  state.annotations = [];
  state.selectedAnnotationId = null;
  setAnnotationMode(false);
  renderer.setMeasureMode(false);
  els.measureButton.classList.remove("active");
  updateMeasureInfo();
  renderProfile();
  renderClearance();
  updateAnnotationList();
  renderAnnotationEditor();
  els.emptyState.classList.add("hidden");
  syncElevationInputs();
  syncClipInputs();
  updateMetadata();
  updateClassList();
  updateDisplayButtons();
  renderProjectTree();
  applyRenderState(true);
  syncRouteRenderer();
  renderer.fitToBounds(projectBoundsForCloud(cloud));
  showToast(message);
}

function loadRoute(route, message) {
  const routeLayer = createRouteLayer(route);
  state.routes.push(routeLayer);
  activateRoute(routeLayer.id, { updateRender: false });
  state.selectedWaypointIndex = 0;
  state.selectedPartIndex = 0;
  state.selectedTargetIndex = 0;
  syncRouteRenderer();
  if (state.displayRoute?.bounds) renderer.fitToBounds(state.displayRoute.bounds);
  els.emptyState.classList.add("hidden");
  updateRouteInfo();
  updateRouteList();
  updatePartList();
  updateTargetList();
  renderEditors();
  renderProjectTree();
  updateRouteSelection(0);
  setFileStatus([
    route.fileName,
    `航点 ${formatNumber(route.render.waypoints.length)}，部件点 ${formatNumber(route.render.partPoints.length)}`,
    `任务：${route.taskname || "-"}`,
  ], "ok");
  showToast(message);
}

function syncRouteRenderer() {
  const routeLayer = activeRouteLayer();
  if (!routeLayer) {
    state.route = null;
    state.displayRoute = null;
    renderer.setRoute(null);
    updateRouteInfo();
    updateCameraPreview();
    drawMeasurement();
    renderRouteMap();
    return;
  }
  state.route = routeLayer.route;
  state.displayRoute = state.projectOrigin ? routeToCloudLocal(state.route, state.projectOrigin) : state.route;
  routeLayer.displayRoute = state.displayRoute;
  renderer.setRoute(routeLayer.visible ? state.displayRoute : null);
  if (routeLayer.visible) renderer.setSelectedWaypoint(state.selectedWaypointIndex, state.selectedTargetIndex);
  updateRouteInfo();
  updateCameraPreview();
  drawMeasurement();
  renderRouteMap();
}

function applyRenderState(skipStatus = false) {
  if (!state.datasets.length) {
    renderer.setCloud({ positions: new Float32Array(), colors: new Uint8Array(), bounds: { min: [-1, -1, -1], max: [1, 1, 1] } });
    updateStatus(0);
    drawMeasurement();
    return;
  }
  const composed = composeVisibleCloudBuffers();
  renderer.setCloud({
    positions: composed.positions,
    colors: composed.colors,
    bounds: composed.bounds || { min: [-1, -1, -1], max: [1, 1, 1] },
  });
  if (!skipStatus) showToast(`当前渲染 ${formatNumber(composed.count)} 点，来自 ${composed.layerCount} 个可见点云`);
  updateStatus(composed.count);
  renderProjectTree();
  drawMeasurement();
}

function composeVisibleCloudBuffers() {
  const visibleDatasets = state.datasets.filter((item) => item.visible);
  const built = visibleDatasets.map((dataset) => {
    const clip = state.clipEnabled && dataset.id === state.activeDatasetId ? percentClipToBounds() : null;
    const buffers = buildColors(dataset.cloud, {
      displayMode: state.displayMode,
      elevationMin: dataset.elevationMin,
      elevationMax: dataset.elevationMax,
      visibleClasses: dataset.visibleClasses,
      classColors: dataset.classColors,
      clip,
    });
    dataset.renderCount = buffers.count;
    return { dataset, buffers };
  });
  const total = built.reduce((sum, item) => sum + item.buffers.count, 0);
  const positions = new Float32Array(total * 3);
  const colors = new Uint8Array(total * 3);
  let cursor = 0;
  let bounds = null;
  for (const { dataset, buffers } of built) {
    const offset = projectOffsetForCloud(dataset.cloud);
    for (let i = 0; i < buffers.count; i += 1) {
      const src = i * 3;
      const dst = (cursor + i) * 3;
      positions[dst] = buffers.positions[src] + offset[0];
      positions[dst + 1] = buffers.positions[src + 1] + offset[1];
      positions[dst + 2] = buffers.positions[src + 2] + offset[2];
      colors[dst] = buffers.colors[src];
      colors[dst + 1] = buffers.colors[src + 1];
      colors[dst + 2] = buffers.colors[src + 2];
    }
    bounds = mergeBounds(bounds, projectBoundsForCloud(dataset.cloud));
    cursor += buffers.count;
  }
  return { positions, colors, count: total, layerCount: visibleDatasets.length, bounds };
}

function projectOffsetForCloud(cloud) {
  const origin = state.projectOrigin || cloud.center || [0, 0, 0];
  const center = cloud.center || [0, 0, 0];
  return [
    center[0] - origin[0],
    center[2] - origin[2],
    -(center[1] - origin[1]),
  ];
}

function projectBoundsForCloud(cloud) {
  const offset = projectOffsetForCloud(cloud);
  return {
    min: [
      cloud.localBounds.min[0] + offset[0],
      cloud.localBounds.min[1] + offset[1],
      cloud.localBounds.min[2] + offset[2],
    ],
    max: [
      cloud.localBounds.max[0] + offset[0],
      cloud.localBounds.max[1] + offset[1],
      cloud.localBounds.max[2] + offset[2],
    ],
  };
}

function projectVisibleBounds() {
  return state.datasets
    .filter((item) => item.visible)
    .reduce((bounds, item) => mergeBounds(bounds, projectBoundsForCloud(item.cloud)), null);
}

function mergeBounds(a, b) {
  if (!b) return a;
  if (!a) return { min: [...b.min], max: [...b.max] };
  return {
    min: a.min.map((value, index) => Math.min(value, b.min[index])),
    max: a.max.map((value, index) => Math.max(value, b.max[index])),
  };
}

function renderProjectTree() {
  if (!state.datasets.length && !state.routes.length) {
    els.projectTree.className = "project-tree empty";
    els.projectTree.textContent = "加载 LAS 或航线 JSON 后显示图层";
    return;
  }
  els.projectTree.className = "project-tree";
  els.projectTree.innerHTML = `
    ${projectTreeGroup("点云", "cloud", state.datasets, state.activeDatasetId)}
    ${projectTreeGroup("航线", "route", state.routes, state.activeRouteId)}
  `;
}

function projectTreeGroup(title, kind, items, activeId) {
  const rows = items.length ? items.map((item) => projectTreeRow(kind, item, item.id === activeId)).join("") : `
    <div class="tree-empty">暂无${title}</div>
  `;
  return `
    <div class="tree-group">
      <div class="tree-group-title">
        <span>${title}</span>
        <em>${items.length}</em>
      </div>
      <div class="tree-items">${rows}</div>
    </div>
  `;
}

function projectTreeRow(kind, item, active) {
  const meta = kind === "cloud"
    ? `${formatNumber(item.renderCount || item.cloud.renderedPointCount)} / ${formatNumber(item.cloud.sourcePointCount)}`
    : `航点 ${formatNumber(item.route.render.waypoints.length)}，部件 ${formatNumber(item.route.render.partPoints.length)}`;
  return `
    <div class="tree-item ${active ? "active" : ""} ${item.visible ? "" : "muted"}" data-kind="${kind}" data-id="${item.id}">
      <label class="tree-check">
        <input data-action="toggle" data-kind="${kind}" data-id="${item.id}" type="checkbox" ${item.visible ? "checked" : ""} />
      </label>
      <button class="tree-main" data-action="activate" data-kind="${kind}" data-id="${item.id}" type="button">
        <strong>${escapeHtml(item.name)}</strong>
        <span>${escapeHtml(meta)}</span>
      </button>
      <div class="tree-actions">
        <button data-action="locate" data-kind="${kind}" data-id="${item.id}" type="button" title="定位">定</button>
        <button data-action="remove" data-kind="${kind}" data-id="${item.id}" type="button" title="删除">删</button>
      </div>
    </div>
  `;
}

function handleProjectTreeClick(event) {
  const button = event.target.closest("button[data-action]");
  if (!button) return;
  const { action, kind, id } = button.dataset;
  if (action === "activate") {
    if (kind === "cloud") activateDataset(id);
    if (kind === "route") activateRoute(id);
    return;
  }
  if (action === "locate") {
    locateProjectLayer(kind, id);
    return;
  }
  if (action === "remove") removeProjectLayer(kind, id);
}

function handleProjectTreeChange(event) {
  const input = event.target.closest("input[data-action='toggle']");
  if (!input) return;
  setProjectLayerVisible(input.dataset.kind, input.dataset.id, input.checked);
}

function setProjectLayerVisible(kind, id, visible) {
  if (kind === "cloud") {
    const dataset = state.datasets.find((item) => item.id === id);
    if (!dataset) return;
    dataset.visible = visible;
    applyRenderState(true);
  } else {
    const route = state.routes.find((item) => item.id === id);
    if (!route) return;
    route.visible = visible;
    syncRouteRenderer();
  }
  renderProjectTree();
}

function locateProjectLayer(kind, id) {
  if (kind === "cloud") {
    const dataset = state.datasets.find((item) => item.id === id);
    if (!dataset) return;
    activateDataset(id, { updateRender: false });
    renderer.fitToBounds(projectBoundsForCloud(dataset.cloud));
    return;
  }
  const route = state.routes.find((item) => item.id === id);
  if (!route) return;
  activateRoute(id, { updateRender: false });
  if (state.displayRoute?.bounds) renderer.fitToBounds(state.displayRoute.bounds);
}

function removeProjectLayer(kind, id) {
  if (kind === "cloud") {
    state.datasets = state.datasets.filter((item) => item.id !== id);
    if (state.activeDatasetId === id) {
      const next = state.datasets[0];
      if (next) activateDataset(next.id, { updateRender: false });
      else {
        state.activeDatasetId = null;
        state.cloud = null;
        updateMetadata();
        updateClassList();
        updateDisplayButtons();
      }
    }
    if (!state.datasets.length) state.projectOrigin = null;
    applyRenderState(true);
    syncRouteRenderer();
  } else {
    state.routes = state.routes.filter((item) => item.id !== id);
    if (state.activeRouteId === id) {
      const next = state.routes[0];
      if (next) activateRoute(next.id, { updateRender: false });
      else {
        state.activeRouteId = null;
        state.route = null;
        state.displayRoute = null;
        renderer.setRoute(null);
        updateRouteInfo();
        updateRouteList();
        updatePartList();
        updateTargetList();
        renderEditors();
      }
    }
    syncRouteRenderer();
  }
  renderProjectTree();
}

function updateRouteInfo() {
  if (!state.route) {
    els.routeInfo.innerHTML = "<span>尚未加载航线 JSON</span>";
    return;
  }
  const route = state.route;
  const displayBounds = state.displayRoute?.bounds || route.bounds;
  els.routeInfo.innerHTML = [
    `任务：${route.taskname || "-"}`,
    `日期：${route.date || "-"}`,
    `更新：${route.updateTime || "-"}`,
    `航点：${formatNumber(route.render.waypoints.length)}`,
    `部件点：${formatNumber(route.render.partPoints.length)}`,
    `原始范围：${formatBounds(route.bounds)}`,
    `绘制范围：${formatBounds(displayBounds)}`,
  ].map((line) => `<span>${escapeHtml(line)}</span>`).join("");
}

function updateRouteList() {
  if (!state.route?.waypointObjects.length) {
    els.routeList.textContent = "加载航线 JSON 后显示航点";
    els.routeList.classList.add("empty");
    updateTargetList();
    return;
  }
  els.routeList.classList.remove("empty");
  const rows = state.route.waypointObjects
    .filter((waypoint) => routeWaypointMatchesFilter(waypoint))
    .map((waypoint) => {
      const target = waypoint.captureTargets[state.selectedTargetIndex] || waypoint.captureTargets[0];
      const coordinateCells = state.showRouteCoordinates
        ? `<td>${formatCoord(waypoint.pX)}</td><td>${formatCoord(waypoint.pY)}</td><td>${formatCoord(waypoint.pZ)}</td>`
        : "";
      const angleCells = state.showRouteAngles
        ? `<td>${formatAngle(waypoint.aircraftYaw)}</td><td>${formatAngle(waypoint.gimbalPitch)}</td><td>${formatAngle(target?.cameraYaw)}</td><td>${formatAngle(target?.cameraPitch)}</td>`
        : "";
      return `
        <tr class="route-row ${waypoint.sequenceIndex === state.selectedWaypointIndex ? "active" : ""}" data-index="${waypoint.sequenceIndex}" title="双击聚焦航点">
          <td>${waypoint.sequenceIndex + 1}</td>
          <td class="name-cell">${escapeHtml(waypoint.label || waypoint.towerName || "-")}</td>
          ${angleCells}
          ${coordinateCells}
          <td>${formatCoord(waypoint.height ?? waypoint.dh)}</td>
        </tr>
      `;
    }).join("");
  const angleHeaders = state.showRouteAngles ? "<th>机头偏航</th><th>云台俯仰</th><th>相机偏航</th><th>相机俯仰</th>" : "";
  const coordinateHeaders = state.showRouteCoordinates ? "<th>pX</th><th>pY</th><th>pZ</th>" : "";
  els.routeList.innerHTML = `
    <table class="route-table waypoint-table">
      <thead><tr><th>序号</th><th>关联部件</th>${angleHeaders}${coordinateHeaders}<th>高度</th></tr></thead>
      <tbody>${rows || "<tr><td colspan=\"8\">没有匹配的航点</td></tr>"}</tbody>
    </table>
  `;
  els.routeList.querySelectorAll(".route-row").forEach((row) => {
    row.addEventListener("click", () => updateRouteSelection(Number(row.dataset.index)));
    row.addEventListener("dblclick", () => openWaypointDialog(Number(row.dataset.index)));
  });
  updateTargetList();
}

function updatePartList() {
  if (!state.route?.parts.length) {
    els.partList.textContent = "加载航线 JSON 后显示部件";
    els.partList.classList.add("empty");
    return;
  }
  els.partList.classList.remove("empty");
  const rows = state.route.parts
    .map((part, index) => ({ part, index, type: inferPartType(part), phase: inferPartPhase(part) }))
    .filter((item) => routePartMatchesFilter(item))
    .map(({ part, index, type, phase }) => `
      <tr class="route-row part-row ${index === state.selectedPartIndex ? "part-active" : ""}" data-index="${index}" title="双击聚焦部件">
        <td>${index + 1}</td>
        <td class="name-cell">${escapeHtml(part.partName || part.fileId || `部件 ${index + 1}`)}</td>
        <td>${escapeHtml(type)}</td>
        <td>${escapeHtml(phase)}</td>
        <td>${captureAngleCount(part.fileId)}</td>
      </tr>
    `).join("");
  els.partList.innerHTML = `
    <table class="route-table part-table">
      <thead><tr><th>序号</th><th>部件名</th><th>硬件类型</th><th>相序</th><th>拍摄角度</th></tr></thead>
      <tbody>${rows || "<tr><td colspan=\"5\">没有匹配的部件</td></tr>"}</tbody>
    </table>
  `;
  els.partList.querySelectorAll(".route-row").forEach((row) => {
    row.addEventListener("click", () => updatePartSelection(Number(row.dataset.index)));
    row.addEventListener("dblclick", () => focusPart(Number(row.dataset.index)));
  });
}

function updateTargetList() {
  if (!state.route) {
    els.routeTargetList.textContent = "选择航点后显示目标";
    els.routeTargetList.classList.add("empty");
    return;
  }
  const waypoint = state.route.waypointObjects[state.selectedWaypointIndex];
  const targets = waypoint?.captureTargets || [];
  if (!targets.length) {
    els.routeTargetList.textContent = "当前航点没有目标";
    els.routeTargetList.classList.add("empty");
    return;
  }
  els.routeTargetList.classList.remove("empty");
  const rows = targets.map((target, index) => {
    const targetCells = state.showRouteCoordinates
      ? `<td>${formatCoord(target.pX)}, ${formatCoord(target.pY)}, ${formatCoord(target.pZ)}</td>`
      : "";
    return `
      <tr class="route-row target-row ${index === state.selectedTargetIndex ? "active" : ""}" data-index="${index}" title="双击聚焦目标部件">
        <td>${index + 1}</td>
        <td class="name-cell">${escapeHtml(target.label || target.partName || "-")}</td>
        <td>${formatCoord(target.FocalLengthRatio ?? 1)}</td>
        <td>${formatAngle(target.cameraYaw)}</td>
        <td>${formatAngle(target.cameraPitch)}</td>
        ${targetCells}
      </tr>
    `;
  }).join("");
  const targetHeader = state.showRouteCoordinates ? "<th>目标坐标</th>" : "";
  els.routeTargetList.innerHTML = `
    <table class="route-table target-table">
      <thead><tr><th>序号</th><th>关联部件</th><th>焦距倍率</th><th>相机偏航</th><th>相机俯仰</th>${targetHeader}</tr></thead>
      <tbody>${rows}</tbody>
    </table>
  `;
  els.routeTargetList.querySelectorAll(".target-row").forEach((row) => {
    row.addEventListener("click", () => {
      state.selectedTargetIndex = Number(row.dataset.index);
      renderEditors();
      syncRouteRenderer();
      updateRouteList();
      updateCameraPreview();
    });
    row.addEventListener("dblclick", () => {
      const target = targets[Number(row.dataset.index)];
      const partIndex = target?.partIndex;
      if (partIndex !== null && partIndex !== undefined) focusPart(partIndex);
    });
  });
}

function setAnnotationMode(enabled) {
  state.annotationMode = Boolean(enabled);
  if (state.annotationMode) {
    state.measureMode = false;
    setProfileMode(false);
    state.measurement = [];
    renderer.setMeasureMode(false);
    els.measureButton.classList.remove("active");
    updateMeasureInfo();
  }
  renderer.setAnnotationMode(state.annotationMode);
  els.annotationMode.checked = state.annotationMode;
  els.annotationButton.classList.toggle("active", state.annotationMode);
  els.annotationHint.textContent = state.annotationMode
    ? "标注模式已开启：左键点选点云添加问题点。"
    : "开启后，左键点选点云生成问题点；点击列表可回到位置。";
}

function setProfileMode(enabled) {
  state.profileMode = Boolean(enabled);
  if (state.profileMode) {
    state.measureMode = false;
    setAnnotationMode(false);
    state.measurement = [];
    renderer.setMeasureMode(false);
    els.measureButton.classList.remove("active");
    updateMeasureInfo();
  }
  renderer.setProfileMode(state.profileMode);
  els.profileButton.classList.toggle("active", state.profileMode);
  updateProfileInfo();
}

function addViewBookmark() {
  const view = renderer.getViewState();
  const annotation = {
    id: createAnnotationId(),
    type: "view",
    title: `视图书签 ${state.annotations.filter((item) => item.type === "view").length + 1}`,
    status: "待复核",
    severity: "信息",
    note: "",
    createdAt: new Date().toISOString(),
    view,
  };
  state.annotations.unshift(annotation);
  state.selectedAnnotationId = annotation.id;
  updateAnnotationList();
  renderAnnotationEditor();
  showToast("当前视图已保存为书签。");
}

function addIssueAnnotation(point) {
  const annotation = {
    id: createAnnotationId(),
    type: "issue",
    title: `问题点 ${state.annotations.filter((item) => item.type === "issue").length + 1}`,
    status: "待处理",
    severity: "一般",
    note: "",
    createdAt: new Date().toISOString(),
    point: point.map((value) => round(value)),
    view: renderer.getViewState(),
  };
  state.annotations.unshift(annotation);
  state.selectedAnnotationId = annotation.id;
  updateAnnotationList();
  renderAnnotationEditor();
  drawMeasurement();
  showToast("问题点已添加。");
}

function updateAnnotationList() {
  if (!state.annotations.length) {
    els.annotationList.className = "annotation-list empty";
    els.annotationList.textContent = "暂无标注或视图书签";
    return;
  }
  els.annotationList.className = "annotation-list";
  els.annotationList.innerHTML = state.annotations.map((item) => `
    <button class="annotation-item ${item.id === state.selectedAnnotationId ? "active" : ""}" data-id="${item.id}" type="button">
      <span class="annotation-kind">${item.type === "issue" ? "问题" : "视图"}</span>
      <strong>${escapeHtml(item.title)}</strong>
      <span>${escapeHtml(item.severity)} / ${escapeHtml(item.status)}</span>
    </button>
  `).join("");
  els.annotationList.querySelectorAll(".annotation-item").forEach((button) => {
    button.addEventListener("click", () => {
      selectAnnotation(button.dataset.id);
      focusAnnotation(button.dataset.id);
    });
  });
}

function selectAnnotation(id) {
  state.selectedAnnotationId = id;
  updateAnnotationList();
  renderAnnotationEditor();
  drawMeasurement();
}

function focusAnnotation(id) {
  const annotation = state.annotations.find((item) => item.id === id);
  if (!annotation) return;
  if (annotation.type === "issue" && annotation.point) renderer.focusOnPoint(annotation.point, 18);
  else renderer.setViewState(annotation.view);
}

function renderAnnotationEditor() {
  const annotation = state.annotations.find((item) => item.id === state.selectedAnnotationId);
  if (!annotation) {
    els.annotationEditor.className = "editor-grid empty";
    els.annotationEditor.textContent = "选择标注后可编辑标题、级别、状态和备注。";
    return;
  }
  els.annotationEditor.className = "editor-grid";
  els.annotationEditor.innerHTML = editorFields([
    ["title", "标题", annotation.title, "text", "wide"],
    ["severity", "级别", annotation.severity, "text"],
    ["status", "状态", annotation.status, "text"],
    ["note", "备注", annotation.note, "text", "wide"],
  ]) + `
    <button class="wide-button ghost annotation-delete" type="button">删除标注</button>
  `;
  bindEditorInputs(els.annotationEditor, (fields) => {
    Object.assign(annotation, fields);
    updateAnnotationList();
    drawMeasurement();
  });
  els.annotationEditor.querySelector(".annotation-delete").addEventListener("click", () => {
    state.annotations = state.annotations.filter((item) => item.id !== annotation.id);
    state.selectedAnnotationId = state.annotations[0]?.id || null;
    updateAnnotationList();
    renderAnnotationEditor();
    drawMeasurement();
  });
}

function updateCameraPreview() {
  if (!activeRouteLayer()?.visible) {
    els.cameraPreview.classList.add("hidden");
    return;
  }
  const waypoint = state.route?.waypointObjects[state.selectedWaypointIndex];
  const displayWaypoint = state.displayRoute?.render.waypoints[state.selectedWaypointIndex];
  const displayTargets = state.displayRoute?.render.waypointTargetPoints[state.selectedWaypointIndex] || [];
  const targets = waypoint?.captureTargets || [];
  if (!waypoint || !displayWaypoint || !targets.length) {
    els.cameraPreview.classList.add("hidden");
    return;
  }
  const selectedTargetIndex = Math.min(state.selectedTargetIndex, targets.length - 1);
  const selectedTarget = targets[selectedTargetIndex];
  const selectedDisplayTarget = displayTargets[selectedTargetIndex] || displayTargets[0];
  els.cameraPreview.classList.remove("hidden");
  els.cameraPreviewTitle.textContent = `航点相机预览 | ${waypoint.sequenceIndex + 1}`;
  els.cameraPreviewSubtitle.textContent = `目标 ${selectedTargetIndex + 1}/${targets.length}：${selectedTarget?.label || "-"}`;
  els.cameraPreviewSvg.innerHTML = buildCameraPreviewSvg(displayWaypoint, displayTargets, selectedTargetIndex, targets);
  els.cameraPreviewMeta.innerHTML = [
    `机头偏航 ${formatAngle(waypoint.aircraftYaw)}`,
    `云台俯仰 ${formatAngle(waypoint.gimbalPitch)}`,
    `相机偏航 ${formatAngle(selectedTarget?.cameraYaw)}`,
    `相机俯仰 ${formatAngle(selectedTarget?.cameraPitch)}`,
    selectedDisplayTarget ? `距离 ${distance(displayWaypoint, selectedDisplayTarget).toFixed(2)}` : "",
  ].filter(Boolean).map((item) => `<span>${escapeHtml(item)}</span>`).join("");
}

function buildCameraPreviewSvg(origin, displayTargets, selectedTargetIndex, targetMeta) {
  const width = 260;
  const height = 138;
  const selectedTarget = displayTargets[selectedTargetIndex] || displayTargets[0];
  const forward = selectedTarget ? normalizeVector(subVector(selectedTarget, origin)) : [0, 0, 1];
  const fallbackUp = Math.abs(forward[1]) > 0.92 ? [1, 0, 0] : [0, 1, 0];
  const right = normalizeVector(crossVector(forward, fallbackUp));
  const up = normalizeVector(crossVector(right, forward));
  const points = displayTargets.map((target, index) => {
    const vector = subVector(target, origin);
    const depth = Math.max(dotVector(vector, forward), 0.001);
    const scale = Math.min(70 / depth, 3.2);
    const x = clampNumber(width / 2 + dotVector(vector, right) * scale, 18, width - 18);
    const y = clampNumber(height / 2 - dotVector(vector, up) * scale, 18, height - 18);
    return { x, y, index, selected: index === selectedTargetIndex, label: targetMeta[index]?.label || `目标 ${index + 1}` };
  });
  const selected = points[selectedTargetIndex] || points[0] || { x: width / 2, y: height / 2 };
  const frustum = `M ${width / 2} ${height - 16} L ${selected.x - 28} ${selected.y + 18} M ${width / 2} ${height - 16} L ${selected.x + 28} ${selected.y + 18} M ${selected.x - 28} ${selected.y + 18} L ${selected.x + 28} ${selected.y + 18}`;
  const cloud = buildCameraPreviewCloud(origin, forward, right, up, width, height);
  const dots = points.map((point) => `
    <g>
      <circle class="${point.selected ? "preview-dot selected" : "preview-dot"}" cx="${point.x}" cy="${point.y}" r="${point.selected ? 5 : 3.5}" />
      <text x="${point.x + 7}" y="${point.y - 5}">${escapeHtml(point.label)}</text>
    </g>
  `).join("");
  return `
    <rect class="preview-bg" x="0" y="0" width="${width}" height="${height}" rx="4" />
    <path class="preview-grid" d="M ${width / 2} 14 V ${height - 14} M 14 ${height / 2} H ${width - 14}" />
    ${cloud}
    <path class="preview-frustum" d="${frustum}" />
    <circle class="preview-reticle" cx="${selected.x}" cy="${selected.y}" r="16" />
    ${dots}
  `;
}

function buildCameraPreviewCloud(origin, forward, right, up, width, height) {
  const positions = renderer.positions;
  const colors = renderer.colors;
  const count = Math.floor((positions?.length || 0) / 3);
  if (!count) return "";
  const maxDots = 1200;
  const stride = Math.max(1, Math.ceil(count / maxDots));
  const dots = [];
  const focal = 96;
  const maxDepth = Math.max(renderer.camera?.distance || 80, 80) * 1.8;
  for (let index = 0; index < count; index += stride) {
    const offset = index * 3;
    const vector = [
      positions[offset] - origin[0],
      positions[offset + 1] - origin[1],
      positions[offset + 2] - origin[2],
    ];
    const depth = dotVector(vector, forward);
    if (depth <= 0.2 || depth > maxDepth) continue;
    const px = dotVector(vector, right) / depth;
    const py = dotVector(vector, up) / depth;
    if (Math.abs(px) > 1.45 || Math.abs(py) > 0.9) continue;
    const x = width / 2 + px * focal;
    const y = height / 2 - py * focal;
    if (x < 2 || x > width - 2 || y < 2 || y > height - 2) continue;
    const r = colors?.[offset] ?? 73;
    const g = colors?.[offset + 1] ?? 222;
    const b = colors?.[offset + 2] ?? 128;
    const opacity = clampNumber(1 - depth / maxDepth, 0.28, 0.9);
    dots.push(`<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="0.75" fill="rgb(${r},${g},${b})" opacity="${opacity.toFixed(2)}" />`);
  }
  return dots.length ? `<g class="preview-cloud">${dots.join("")}</g>` : "";
}

function routeWaypointMatchesFilter(waypoint) {
  if (!state.routeWaypointFilter) return true;
  const text = [
    waypoint.sequenceIndex + 1,
    waypoint.label,
    waypoint.towerName,
    waypoint.captureTargets.map((target) => target.label).join(" "),
  ].join(" ").toLowerCase();
  return text.includes(state.routeWaypointFilter);
}

function routePartMatchesFilter({ part, type, phase }) {
  if (!state.routePartFilter) return true;
  const text = [part.partName, part.fileId, type, phase].join(" ").toLowerCase();
  return text.includes(state.routePartFilter);
}

function inferPartType(part) {
  const rawType = part.raw?.hardwareType || part.raw?.type || part.raw?.category || part.raw?.partType;
  if (rawType) return String(rawType);
  const name = String(part.partName || "");
  if (name.includes("绝缘子")) return "I型绝缘子";
  if (name.includes("地线")) return "地线";
  if (name.includes("导线")) return "导线";
  if (name.includes("塔") || name.includes("杆")) return "塔外貌";
  return "-";
}

function inferPartPhase(part) {
  const rawPhase = part.raw?.phaseName || part.raw?.phase || part.raw?.phaseSeq;
  if (rawPhase) return String(rawPhase);
  const name = String(part.partName || "");
  if (name.includes("上相")) return "上相";
  if (name.includes("中相")) return "中相";
  if (name.includes("下相")) return "下相";
  return "-";
}

function captureAngleCount(fileId) {
  const id = String(fileId);
  if (!state.route || !id) return 0;
  return state.route.waypointObjects.reduce((count, waypoint) => (
    count + waypoint.captureTargets.filter((target) => String(target.fileId) === id).length
  ), 0);
}

function updateRouteSelection(index) {
  if (!state.route) return;
  state.selectedWaypointIndex = Math.max(0, Math.min(index, state.route.waypointObjects.length - 1));
  state.selectedTargetIndex = Math.min(state.selectedTargetIndex, Math.max((state.route.waypointObjects[state.selectedWaypointIndex]?.captureTargets.length || 1) - 1, 0));
  renderer.setSelectedWaypoint(state.selectedWaypointIndex, state.selectedTargetIndex);
  els.routeList.querySelectorAll(".route-row").forEach((row) => {
    row.classList.toggle("active", Number(row.dataset.index) === state.selectedWaypointIndex);
  });
  const waypoint = state.route.waypointObjects[state.selectedWaypointIndex];
  els.statusCoords.textContent = `航点：${state.selectedWaypointIndex + 1} ${waypoint?.label || ""}`;
  updateTargetList();
  updateCameraPreview();
  renderEditors();
  renderRouteMap();
  drawMeasurement();
}

function updatePartSelection(index) {
  if (!state.route) return;
  state.selectedPartIndex = Math.max(0, Math.min(index, state.route.parts.length - 1));
  updatePartList();
  renderEditors();
}

function focusWaypoint(index) {
  updateRouteSelection(index);
  const point = state.displayRoute?.render.waypoints[index];
  renderer.focusOnPoint(point, 20);
}

function focusPart(index) {
  updatePartSelection(index);
  const point = state.displayRoute?.render.partPoints[index];
  renderer.focusOnPoint(point, 16);
}

function openWaypointDialog(index) {
  if (!state.route) return;
  updateRouteSelection(index);
  state.dialogWaypointIndex = state.selectedWaypointIndex;
  renderWaypointDialog();
  els.waypointDialog.classList.remove("hidden");
}

function closeWaypointDialog() {
  state.dialogWaypointIndex = null;
  els.waypointDialog.classList.add("hidden");
}

function renderWaypointDialog() {
  if (state.dialogWaypointIndex === null || !state.route) return;
  const index = Math.max(0, Math.min(state.dialogWaypointIndex, state.route.waypointObjects.length - 1));
  state.dialogWaypointIndex = index;
  const waypoint = state.route.waypointObjects[index];
  const targets = waypoint?.captureTargets || [];
  const targetIndex = Math.min(state.selectedTargetIndex, Math.max(targets.length - 1, 0));
  const target = targets[targetIndex];
  els.waypointDialogTitle.textContent = `编辑航线航点 #${index + 1}`;
  els.waypointDialogSummary.textContent = `${waypoint?.label || waypoint?.towerName || "-"} / 目标 ${targets.length ? targetIndex + 1 : 0}/${targets.length}`;
  els.waypointDialogTargets.className = targets.length ? "dialog-table" : "dialog-table empty";
  els.waypointDialogTargets.innerHTML = targets.length ? `
    <table class="route-table dialog-target-table">
      <thead><tr><th>序号</th><th>关联部件</th><th>焦距倍率</th><th>相机偏航</th><th>相机俯仰</th></tr></thead>
      <tbody>
        ${targets.map((item, itemIndex) => `
          <tr class="target-row ${itemIndex === targetIndex ? "active" : ""}" data-index="${itemIndex}">
            <td>${itemIndex + 1}</td>
            <td class="name-cell">${escapeHtml(item.label || item.partName || "-")}</td>
            <td>${formatCoord(item.FocalLengthRatio ?? 1)}</td>
            <td>${formatAngle(item.cameraYaw)}</td>
            <td>${formatAngle(item.cameraPitch)}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  ` : "当前航点没有目标";
  els.waypointDialogTargets.querySelectorAll(".target-row").forEach((row) => {
    row.addEventListener("click", () => {
      state.selectedTargetIndex = Number(row.dataset.index);
      renderer.setSelectedWaypoint(state.selectedWaypointIndex, state.selectedTargetIndex);
      updateTargetList();
      renderEditors();
      updateCameraPreview();
      drawMeasurement();
      renderWaypointDialog();
    });
  });
  els.waypointDialogForm.innerHTML = dialogFields("waypoint", [
    ["pX", "X", waypoint.pX, "number"],
    ["pY", "Y", waypoint.pY, "number"],
    ["pZ", "Z", waypoint.pZ, "number"],
    ["aircraftYaw", "机头偏航", waypoint.aircraftYaw ?? "", "number"],
    ["gimbalPitch", "云台俯仰", waypoint.gimbalPitch ?? "", "number"],
  ]) + dialogFields("target", [
    ["FocalLengthRatio", "焦距倍率", target?.FocalLengthRatio ?? "", "number"],
    ["cameraYaw", "相机偏航", target?.cameraYaw ?? "", "number"],
    ["cameraPitch", "相机俯仰", target?.cameraPitch ?? "", "number"],
  ], !target);
}

function dialogFields(scope, fields, disabled = false) {
  return fields.map(([key, label, value, type]) => `
    <label class="editor-field">
      <span>${label}</span>
      <input data-scope="${scope}" data-field="${key}" type="${type}" value="${escapeHtml(value ?? "")}" ${type === "number" ? "step=\"0.001\"" : ""} ${disabled ? "disabled" : ""} />
    </label>
  `).join("");
}

function saveWaypointDialog() {
  if (state.dialogWaypointIndex === null || !state.route) return;
  const waypointFields = {};
  const targetFields = {};
  els.waypointDialogForm.querySelectorAll("input[data-field]").forEach((input) => {
    if (input.disabled) return;
    if (input.dataset.scope === "waypoint") waypointFields[input.dataset.field] = input.value;
    if (input.dataset.scope === "target") targetFields[input.dataset.field] = input.value;
  });
  mutateRoute(() => {
    updateWaypointFields(state.route, state.dialogWaypointIndex, waypointFields);
    if (Object.keys(targetFields).length) {
      updateTargetFields(state.route, state.dialogWaypointIndex, state.selectedTargetIndex, targetFields);
    }
  }, { keepEditors: true });
  state.dialogWaypointIndex = state.selectedWaypointIndex;
  renderEditors();
  renderWaypointDialog();
  showToast(`航点 #${state.selectedWaypointIndex + 1} 已更新`);
}

function renderRouteMap() {
  if (!state.route) {
    els.routeMap.innerHTML = "<text x=\"12\" y=\"24\">加载航线后显示经纬度平面图</text>";
    return;
  }
  const bounds = routeMapBounds();
  if (!bounds) {
    els.routeMap.innerHTML = "<text x=\"12\" y=\"24\">航线缺少经纬度</text>";
    return;
  }
  const project = (lng, lat) => {
    const x = 14 + ((lng - bounds.minLng) / Math.max(bounds.maxLng - bounds.minLng, 1e-9)) * 232;
    const y = 166 - ((lat - bounds.minLat) / Math.max(bounds.maxLat - bounds.minLat, 1e-9)) * 152;
    return [x, y];
  };
  const waypointPoints = state.route.waypointObjects
    .filter((point) => Number.isFinite(point.lng) && Number.isFinite(point.lat))
    .map((point) => ({ point, xy: project(point.lng, point.lat) }));
  const line = waypointPoints.length ? `<polyline class="map-line" points="${waypointPoints.map((item) => item.xy.join(",")).join(" ")}" />` : "";
  const parts = state.route.parts
    .filter((part) => Number.isFinite(part.lng) && Number.isFinite(part.lat))
    .map((part, index) => {
      const [x, y] = project(part.lng, part.lat);
      return `<circle class="map-part" data-index="${index}" cx="${x}" cy="${y}" r="3" />`;
    });
  const waypoints = waypointPoints.map(({ point, xy }) => `
    <circle class="map-waypoint ${point.sequenceIndex === state.selectedWaypointIndex ? "active" : ""}" data-index="${point.sequenceIndex}" cx="${xy[0]}" cy="${xy[1]}" r="5" />
  `);
  els.routeMap.innerHTML = `${line}${parts.join("")}${waypoints.join("")}<text x="12" y="176">拖拽航点可编辑 lng/lat</text>`;
  els.routeMap.querySelectorAll(".map-waypoint").forEach((node) => {
    node.addEventListener("dblclick", () => openWaypointDialog(Number(node.dataset.index)));
  });
}

function mapEventToLngLat(event) {
  const bounds = routeMapBounds();
  if (!bounds) return null;
  const rect = els.routeMap.getBoundingClientRect();
  const x = Math.max(14, Math.min(246, event.clientX - rect.left));
  const y = Math.max(14, Math.min(166, event.clientY - rect.top));
  return {
    lng: bounds.minLng + ((x - 14) / 232) * Math.max(bounds.maxLng - bounds.minLng, 1e-9),
    lat: bounds.minLat + ((166 - y) / 152) * Math.max(bounds.maxLat - bounds.minLat, 1e-9),
  };
}

function routeMapBounds() {
  if (!state.route) return null;
  const coords = [
    ...state.route.waypointObjects.map((point) => [point.lng, point.lat]),
    ...state.route.parts.map((part) => [part.lng, part.lat]),
  ].filter(([lng, lat]) => Number.isFinite(lng) && Number.isFinite(lat));
  if (!coords.length) return null;
  const lngs = coords.map((item) => item[0]);
  const lats = coords.map((item) => item[1]);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const padLng = Math.max((maxLng - minLng) * 0.08, 1e-7);
  const padLat = Math.max((maxLat - minLat) * 0.08, 1e-7);
  return { minLng: minLng - padLng, maxLng: maxLng + padLng, minLat: minLat - padLat, maxLat: maxLat + padLat };
}

function renderEditors() {
  renderWaypointEditor();
  renderTargetEditor();
  renderPartEditor();
}

function renderWaypointEditor() {
  if (!state.route) {
    els.waypointEditor.className = "editor-grid empty";
    els.waypointEditor.textContent = "加载航线后可编辑航点。";
    return;
  }
  const waypoint = state.route.waypointObjects[state.selectedWaypointIndex];
  els.waypointEditor.className = "editor-grid";
  els.waypointEditor.innerHTML = editorFields([
    ["towerName", "杆塔名", waypoint.towerName || "", "text", "wide"],
    ["keyID", "keyID", waypoint.keyID || "", "text"],
    ["SIMainWayPointType", "类型", waypoint.SIMainWayPointType ?? "", "text"],
    ["pX", "pX", waypoint.pX, "number"],
    ["pY", "pY", waypoint.pY, "number"],
    ["pZ", "pZ", waypoint.pZ, "number"],
    ["lng", "经度", waypoint.lng ?? "", "number"],
    ["lat", "纬度", waypoint.lat ?? "", "number"],
    ["dh", "dh", waypoint.dh ?? "", "number"],
    ["height", "height", waypoint.height ?? "", "number"],
    ["aircraftYaw", "航向", waypoint.aircraftYaw ?? "", "number"],
    ["gimbalPitch", "云台俯仰", waypoint.gimbalPitch ?? "", "number"],
  ]);
  bindEditorInputs(els.waypointEditor, (fields) => mutateRoute(() => {
    updateWaypointFields(state.route, state.selectedWaypointIndex, fields);
  }, { keepEditors: true }));
}

function renderTargetEditor() {
  const waypoint = state.route?.waypointObjects[state.selectedWaypointIndex];
  const targets = waypoint?.captureTargets || [];
  els.targetSelect.innerHTML = targets.length
    ? targets.map((target, index) => `<option value="${index}">目标 ${index + 1} ${escapeHtml(target.label || "")}</option>`).join("")
    : "<option value=\"0\">无目标</option>";
  els.targetSelect.value = String(Math.min(state.selectedTargetIndex, Math.max(targets.length - 1, 0)));
  if (!state.route || !targets.length) {
    els.targetEditor.className = "editor-grid empty";
    els.targetEditor.textContent = "当前航点没有目标。";
    return;
  }
  const target = targets[Number(els.targetSelect.value)];
  els.targetEditor.className = "editor-grid";
  els.targetEditor.innerHTML = editorFields([
    ["photoKeyID", "photoKeyID", target.fileId || "", "text"],
    ["keyID", "keyID", target.fileId || "", "text"],
    ["photoKeyName", "目标名", target.partName || "", "text", "wide"],
    ["keyName", "keyName", target.label || "", "text", "wide"],
    ["keyPosX", "keyPosX", target.pX, "number"],
    ["keyPosY", "keyPosY", target.pY, "number"],
    ["keyPosZ", "keyPosZ", target.pZ, "number"],
    ["cameraYaw", "相机Yaw", target.cameraYaw ?? "", "number"],
    ["cameraPitch", "相机Pitch", target.cameraPitch ?? "", "number"],
    ["FocalLengthRatio", "焦距倍率", target.FocalLengthRatio ?? "", "number"],
  ]);
  bindEditorInputs(els.targetEditor, (fields) => mutateRoute(() => {
    updateTargetFields(state.route, state.selectedWaypointIndex, state.selectedTargetIndex, fields);
  }, { keepEditors: true }));
}

function renderPartEditor() {
  if (!state.route?.parts.length) {
    els.partEditor.className = "editor-grid empty";
    els.partEditor.textContent = "加载航线后可编辑部件。";
    return;
  }
  const part = state.route.parts[state.selectedPartIndex];
  els.partEditor.className = "editor-grid";
  els.partEditor.innerHTML = editorFields([
    ["ID", "ID", part.fileId || "", "text"],
    ["index", "index", part.partIndex ?? "", "number"],
    ["partName", "部件名", part.partName || "", "text", "wide"],
    ["pX", "pX", part.pX, "number"],
    ["pY", "pY", part.pY, "number"],
    ["pZ", "pZ", part.pZ, "number"],
    ["lng", "经度", part.lng ?? "", "number"],
    ["lat", "纬度", part.lat ?? "", "number"],
    ["dh", "dh", part.dh ?? "", "number"],
  ]);
  bindEditorInputs(els.partEditor, (fields) => mutateRoute(() => {
    updatePartFields(state.route, state.selectedPartIndex, fields);
  }, { keepEditors: true }));
}

function editorFields(fields) {
  return fields.map(([key, label, value, type, wide]) => `
    <label class="editor-field ${wide || ""}">
      <span>${label}</span>
      <input data-field="${key}" type="${type}" value="${escapeHtml(value ?? "")}" ${type === "number" ? "step=\"0.001\"" : ""} />
    </label>
  `).join("");
}

function bindEditorInputs(container, onChange) {
  container.querySelectorAll("[data-field]").forEach((input) => {
    input.addEventListener("change", () => onChange({ [input.dataset.field]: input.value }));
  });
}

function mutateRoute(mutator, options = {}) {
  if (!state.route) {
    showToast("请先加载航线 JSON。", "error");
    return;
  }
  try {
    mutator();
    state.route = rebuildInspectionRoute(state.route);
    const layer = activeRouteLayer();
    if (layer) layer.route = state.route;
    state.selectedWaypointIndex = Math.max(0, Math.min(state.selectedWaypointIndex, state.route.waypointObjects.length - 1));
    state.selectedPartIndex = Math.max(0, Math.min(state.selectedPartIndex, state.route.parts.length - 1));
    state.selectedTargetIndex = Math.max(0, state.selectedTargetIndex);
    syncRouteRenderer();
    updateRouteInfo();
    updateRouteList();
    updatePartList();
    updateRouteSelection(state.selectedWaypointIndex);
    updatePartSelection(state.selectedPartIndex);
    renderRouteMap();
    if (!options.keepEditors) renderEditors();
  } catch (error) {
    console.error(error);
    showToast(error.message || "航线编辑失败。", "error");
  }
}

function moveWaypointByDisplayDelta(index, delta) {
  if (!state.route) return;
  const waypoint = state.route.waypointObjects[index];
  if (!waypoint) return;
  const rawDelta = state.projectOrigin ? [delta[0], -delta[2], delta[1]] : delta;
  updateWaypointFields(state.route, index, {
    pX: waypoint.pX + rawDelta[0],
    pY: waypoint.pY + rawDelta[1],
    pZ: waypoint.pZ + rawDelta[2],
  });
  state.route = rebuildInspectionRoute(state.route);
  const layer = activeRouteLayer();
  if (layer) layer.route = state.route;
  state.selectedWaypointIndex = index;
  syncRouteRenderer();
  updateRouteList();
  renderEditors();
}

function exportRoute() {
  if (!state.route) {
    showToast("请先加载航线 JSON。", "error");
    return;
  }
  const blob = new Blob([exportInspectionRouteJson(state.route)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = state.route.fileName.replace(/\.json$/i, "") + "-edited.json";
  link.click();
  URL.revokeObjectURL(url);
}

function exportAnnotations() {
  if (!state.annotations.length) {
    showToast("暂无可导出的标注。", "error");
    return;
  }
  const payload = {
    exportedAt: new Date().toISOString(),
    cloudFile: state.cloud?.fileName || null,
    routeFile: state.route?.fileName || null,
    annotations: state.annotations,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `pointcloud-annotations-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
  link.click();
  URL.revokeObjectURL(url);
  showToast("标注 JSON 已导出。");
}

function exportScreenshot() {
  renderer.requestRender();
  requestAnimationFrame(() => {
    els.canvas.toBlob((blob) => {
      if (!blob) {
        showToast("截图导出失败，浏览器未返回图像。", "error");
        return;
      }
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      const time = new Date().toISOString().replace(/[:.]/g, "-");
      link.href = url;
      link.download = `pointcloud-view-${time}.png`;
      link.click();
      URL.revokeObjectURL(url);
      showToast("当前视图截图已导出。");
    }, "image/png");
  });
}

function updateEdl() {
  const strength = Number(els.edlStrength.value);
  const radius = Number(els.edlRadius.value);
  els.edlStrengthValue.textContent = strength.toFixed(1);
  els.edlRadiusValue.textContent = radius.toFixed(1);
  renderer.setEdl({
    enabled: els.edlEnabled.checked,
    strength,
    radius,
  });
}

function createAnnotationId() {
  return `ann-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
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
  const dataset = activeDatasetLayer();
  if (dataset) {
    dataset.elevationMin = state.elevationMin;
    dataset.elevationMax = state.elevationMax;
  }
  syncElevationInputs();
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
  const dataset = activeDatasetLayer();
  if (dataset) {
    dataset.elevationMin = min;
    dataset.elevationMax = max;
  }
  applyRenderState();
}

function updateMetadata() {
  const cloud = state.cloud;
  if (!cloud) {
    els.metadataList.innerHTML = `
      <div><dt>文件</dt><dd>-</dd></div>
      <div><dt>点格式</dt><dd>-</dd></div>
      <div><dt>原始点数</dt><dd>-</dd></div>
      <div><dt>渲染点数</dt><dd>-</dd></div>
      <div><dt>范围</dt><dd>-</dd></div>
    `;
    return;
  }
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
  if (!state.cloud) {
    els.classList.textContent = "加载点云后显示类别";
    els.classList.classList.add("empty");
    return;
  }
  const entries = [...state.cloud.classCounts.entries()].sort((a, b) => a[0] - b[0]);
  if (!entries.length) {
    els.classList.textContent = "未读取到类别信息";
    els.classList.classList.add("empty");
    return;
  }
  els.classList.classList.remove("empty");
  els.classList.innerHTML = entries.map(([cls, count]) => {
    const color = state.classColors.get(cls) || classColor(cls);
    const checked = state.visibleClasses.has(cls) ? "checked" : "";
    return `
      <label class="class-item">
        <input type="checkbox" value="${cls}" ${checked} />
        <input class="swatch" type="color" value="${rgbToHex(color)}" data-class="${cls}" title="设置 ${className(cls)} 颜色" />
        <span>${className(cls)}</span>
        <em>${formatNumber(count)}</em>
      </label>
    `;
  }).join("");
  els.classList.querySelectorAll("input[type='checkbox']").forEach((input) => {
    input.addEventListener("change", () => {
      const cls = Number(input.value);
      if (input.checked) state.visibleClasses.add(cls);
      else state.visibleClasses.delete(cls);
      applyRenderState();
    });
  });
  els.classList.querySelectorAll("input[type='color']").forEach((input) => {
    input.addEventListener("input", () => {
      state.classColors.set(Number(input.dataset.class), hexToRgb(input.value));
      if (state.displayMode === "classification") applyRenderState();
    });
  });
}

function updateDisplayButtons() {
  if (!state.cloud) {
    els.rgbModeButton.disabled = true;
    return;
  }
  els.rgbModeButton.disabled = !state.cloud.rgb;
  els.rgbModeButton.title = state.cloud.rgb ? "按 LAS RGB 着色" : "当前 LAS 不包含 RGB";
  for (const button of els.displayModeGroup.querySelectorAll("button")) {
    button.classList.toggle("active", button.dataset.mode === state.displayMode);
  }
}

function updateStatus(renderCount) {
  const visible = state.datasets.filter((item) => item.visible);
  const sourceTotal = visible.reduce((sum, item) => sum + item.cloud.sourcePointCount, 0);
  els.statusPoints.textContent = `点数：${formatNumber(renderCount)} / ${formatNumber(sourceTotal)}`;
  const active = activeDatasetLayer();
  els.statusSampling.textContent = active?.cloud.sampled ? `活动抽样：1/${active.cloud.stride}` : "活动抽样：无";
}

function addMeasurePoint(point) {
  state.measurement.push(point);
  updateMeasureInfo();
  drawMeasurement();
}

function undoMeasurePoint() {
  if (!state.measurement.length) return;
  state.measurement.pop();
  updateMeasureInfo();
  drawMeasurement();
}

function addProfilePoint(point) {
  if (state.profilePoints.length >= 2) state.profilePoints = [];
  state.profilePoints.push(point);
  if (state.profilePoints.length === 2) {
    computeProfile();
    setProfileMode(false);
  }
  renderProfile();
  drawMeasurement();
}

function undoProfilePoint() {
  if (!state.profilePoints.length) return;
  state.profilePoints.pop();
  state.profileResult = null;
  renderProfile();
  drawMeasurement();
}

function clearProfile() {
  state.profilePoints = [];
  state.profileResult = null;
  renderProfile();
  drawMeasurement();
}

function fitProfile() {
  if (!state.profilePoints.length) {
    showToast("请先选取剖面线。", "error");
    return;
  }
  const center = state.profilePoints.length === 1
    ? state.profilePoints[0]
    : [
        (state.profilePoints[0][0] + state.profilePoints[1][0]) / 2,
        (state.profilePoints[0][1] + state.profilePoints[1][1]) / 2,
        (state.profilePoints[0][2] + state.profilePoints[1][2]) / 2,
      ];
  renderer.focusOnPoint(center, Math.max(state.profileResult?.length || 20, 20));
}

function computeProfile() {
  if (!state.cloud || state.profilePoints.length < 2) {
    state.profileResult = null;
    return;
  }
  const [a, b] = state.profilePoints;
  const dx = b[0] - a[0];
  const dz = b[2] - a[2];
  const length2d = Math.hypot(dx, dz);
  if (length2d < 1e-6) {
    state.profileResult = null;
    return;
  }
  const ux = dx / length2d;
  const uz = dz / length2d;
  const halfWidth = state.profileWidth / 2;
  const positions = renderer.positions || new Float32Array();
  const total = positions.length / 3;
  const stride = Math.max(1, Math.ceil(total / 160_000));
  const samples = [];
  let minElevation = Infinity;
  let maxElevation = -Infinity;
  for (let i = 0; i < total; i += stride) {
    const px = positions[i * 3];
    const py = positions[i * 3 + 1];
    const pz = positions[i * 3 + 2];
    const relX = px - a[0];
    const relZ = pz - a[2];
    const along = relX * ux + relZ * uz;
    if (along < 0 || along > length2d) continue;
    const side = Math.abs(relX * -uz + relZ * ux);
    if (side > halfWidth) continue;
    samples.push([along, py]);
    minElevation = Math.min(minElevation, py);
    maxElevation = Math.max(maxElevation, py);
  }
  state.profileResult = {
    samples,
    length: length2d,
    width: state.profileWidth,
    minElevation,
    maxElevation,
    stride,
  };
}

function renderProfile() {
  updateProfileInfo();
  if (!state.profileResult?.samples.length) {
    els.profileChart.innerHTML = "<text x=\"14\" y=\"26\">选择两个点后生成剖面</text>";
    return;
  }
  const result = state.profileResult;
  const width = 360;
  const height = 180;
  const pad = { left: 36, right: 12, top: 16, bottom: 28 };
  const plotWidth = width - pad.left - pad.right;
  const plotHeight = height - pad.top - pad.bottom;
  const elevationRange = Math.max(result.maxElevation - result.minElevation, 1e-6);
  const points = result.samples
    .filter((_, index) => index % Math.max(1, Math.ceil(result.samples.length / 2200)) === 0)
    .map(([along, elevation]) => {
      const x = pad.left + (along / Math.max(result.length, 1e-6)) * plotWidth;
      const y = pad.top + (1 - (elevation - result.minElevation) / elevationRange) * plotHeight;
      return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="1.1" />`;
    }).join("");
  els.profileChart.innerHTML = `
    <rect x="${pad.left}" y="${pad.top}" width="${plotWidth}" height="${plotHeight}" />
    <line x1="${pad.left}" y1="${pad.top + plotHeight}" x2="${pad.left + plotWidth}" y2="${pad.top + plotHeight}" />
    <line x1="${pad.left}" y1="${pad.top}" x2="${pad.left}" y2="${pad.top + plotHeight}" />
    <text x="${pad.left}" y="${height - 8}">0m</text>
    <text x="${pad.left + plotWidth - 48}" y="${height - 8}">${result.length.toFixed(1)}m</text>
    <text x="4" y="${pad.top + 6}">${result.maxElevation.toFixed(1)}</text>
    <text x="4" y="${pad.top + plotHeight}">${result.minElevation.toFixed(1)}</text>
    <g class="profile-points">${points}</g>
  `;
}

function updateProfileInfo() {
  if (state.profileMode) {
    els.profileInfo.textContent = state.profilePoints.length
      ? "请选择剖面终点；右键可回退。"
      : "请选择剖面起点；右键可回退。";
    return;
  }
  if (!state.profileResult?.samples.length) {
    els.profileInfo.textContent = state.profilePoints.length === 1
      ? "已选择起点，请继续开启剖面选择终点。"
      : "点击工具栏“剖面”，在点云上选取起点和终点。";
    return;
  }
  const result = state.profileResult;
  els.profileInfo.innerHTML = `
    长度：<strong>${result.length.toFixed(2)}</strong><br />
    通道宽度：<strong>${result.width.toFixed(1)}</strong><br />
    命中点：<strong>${formatNumber(result.samples.length)}</strong><br />
    高程：<strong>${result.minElevation.toFixed(2)} - ${result.maxElevation.toFixed(2)}</strong>
  `;
}

function runClearanceAnalysis() {
  if (!state.cloud) {
    showToast("请先加载点云。", "error");
    return;
  }
  const result = analyzeClearance(state.cloud, {
    radius: state.clearanceRadius,
    threshold: state.clearanceThreshold,
  });
  state.clearanceResult = result;
  state.selectedClearanceIndex = 0;
  renderClearance();
  drawMeasurement();
  if (!result.wireCount) {
    showToast("未找到导线/地线分类点。", "error");
  } else if (!result.obstacleCount) {
    showToast("未找到可用于净空分析的地物/植被点。", "error");
  } else {
    showToast(`净空分析完成：${formatNumber(result.risks.length)} 个风险点。`);
  }
}

function renderClearance() {
  const result = state.clearanceResult;
  if (!result) {
    els.clearanceInfo.textContent = "基于当前抽样点云，估算导线/地线到地面、植被、建筑和交跨点的垂直距离。";
    els.clearanceList.className = "clearance-list empty";
    els.clearanceList.textContent = "暂无净空分析结果";
    return;
  }
  if (!result.wireCount || !result.obstacleCount || !Number.isFinite(result.minClearance)) {
    els.clearanceInfo.innerHTML = `
      导线/地线点：<strong>${formatNumber(result.wireCount)}</strong><br />
      地物/植被点：<strong>${formatNumber(result.obstacleCount)}</strong><br />
      未形成有效净空配对
    `;
    els.clearanceList.className = "clearance-list empty";
    els.clearanceList.textContent = "暂无风险点";
    return;
  }
  els.clearanceInfo.innerHTML = `
    最小净空：<strong>${result.minClearance.toFixed(2)}</strong><br />
    告警阈值：<strong>${result.threshold.toFixed(1)}</strong><br />
    已检查导线点：<strong>${formatNumber(result.checkedWire)}</strong><br />
    风险点：<strong>${formatNumber(result.risks.length)}</strong>
  `;
  if (!result.risks.length) {
    els.clearanceList.className = "clearance-list empty";
    els.clearanceList.textContent = "未发现低于阈值的净空风险";
    return;
  }
  els.clearanceList.className = "clearance-list";
  els.clearanceList.innerHTML = result.risks.slice(0, 20).map((risk, index) => `
    <button class="clearance-item ${index === state.selectedClearanceIndex ? "active" : ""}" data-index="${index}" type="button">
      <strong>${risk.clearance.toFixed(2)}</strong>
      <span>${className(risk.wireClass)} → ${className(risk.obstacleClass)}</span>
    </button>
  `).join("");
  els.clearanceList.querySelectorAll(".clearance-item").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedClearanceIndex = Number(button.dataset.index);
      renderClearance();
      drawMeasurement();
      const risk = state.clearanceResult.risks[state.selectedClearanceIndex];
      if (risk) renderer.focusOnPoint(risk.wire, 18);
    });
  });
}

function drawMeasurement() {
  els.overlay.innerHTML = "";
  els.overlay.setAttribute("viewBox", `0 0 ${els.canvas.clientWidth} ${els.canvas.clientHeight}`);
  const routeMarkup = drawRouteOverlay();
  const annotationMarkup = drawAnnotationOverlay();
  const profileMarkup = drawProfileOverlay();
  const clearanceMarkup = drawClearanceOverlay();
  if (!state.measurement.length) {
    els.overlay.innerHTML = `${routeMarkup}${profileMarkup}${clearanceMarkup}${annotationMarkup}`;
    return;
  }
  const points = state.measurement.map((p) => renderer.projectToScreen(p)).filter(Boolean);
  if (!points.length) {
    els.overlay.innerHTML = `${routeMarkup}${profileMarkup}${clearanceMarkup}${annotationMarkup}`;
    return;
  }
  const lines = [];
  const labels = [];
  for (let i = 1; i < points.length; i += 1) {
    const a = points[i - 1];
    const b = points[i];
    const d = distance(state.measurement[i - 1], state.measurement[i]);
    lines.push(`<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" />`);
    labels.push(`<text x="${(a.x + b.x) / 2 + 8}" y="${(a.y + b.y) / 2 - 8}">${d.toFixed(2)}</text>`);
  }
  const circles = points.map((p, index) => `
    <circle cx="${p.x}" cy="${p.y}" r="5" />
    <text x="${p.x + 8}" y="${p.y - 8}">${index + 1}</text>
  `).join("");
  els.overlay.innerHTML = `${routeMarkup}${profileMarkup}${clearanceMarkup}${annotationMarkup}${lines.join("")}${circles}${labels.join("")}`;
}

function drawRouteOverlay() {
  if (!activeRouteLayer()?.visible) return "";
  if (!state.route || !state.displayRoute) return "";
  const projections = renderer.getRouteLabelProjections();
  if (!projections) return "";
  const selectedPoint = state.displayRoute.render.waypoints[state.selectedWaypointIndex];
  const routeLines = [];
  const waypointScreen = selectedPoint ? renderer.projectToScreen(selectedPoint) : null;
  const targetPoints = state.displayRoute.render.waypointTargetPoints[state.selectedWaypointIndex] || [];
  targetPoints.forEach((target) => {
    const targetScreen = renderer.projectToScreen(target);
    if (waypointScreen && targetScreen) {
      routeLines.push(`<line class="route-target-line" x1="${waypointScreen.x}" y1="${waypointScreen.y}" x2="${targetScreen.x}" y2="${targetScreen.y}" />`);
    }
  });
  const opacity = `opacity="${state.routeLabelOpacity}"`;
  const waypointLabels = state.showWaypointLabels ? projections.waypointLabels
    .filter((item) => item.screen)
    .map((item) => `<text ${opacity} class="route-label ${item.selected ? "selected" : ""}" x="${item.screen.x + 8}" y="${item.screen.y - 10}">${escapeHtml(item.label)}</text>`) : [];
  const partLabels = state.showPartLabels ? projections.partLabels
    .filter((item) => item.screen)
    .map((item) => `<text ${opacity} class="route-label part ${item.primary ? "selected" : (item.highlighted ? "highlighted" : "")}" x="${item.screen.x + 8}" y="${item.screen.y + 16}">${escapeHtml(item.label)}</text>`) : [];
  return `${routeLines.join("")}${waypointLabels.join("")}${partLabels.join("")}`;
}

function drawAnnotationOverlay() {
  if (!state.annotations.length) return "";
  return state.annotations
    .filter((item) => item.type === "issue" && item.point)
    .map((item, index) => {
      const screen = renderer.projectToScreen(item.point);
      if (!screen) return "";
      const selected = item.id === state.selectedAnnotationId ? " selected" : "";
      return `
        <g class="annotation-marker${selected}" data-id="${item.id}">
          <circle cx="${screen.x}" cy="${screen.y}" r="8" />
          <text x="${screen.x}" y="${screen.y + 4}">${index + 1}</text>
          <text class="annotation-label" x="${screen.x + 12}" y="${screen.y - 10}">${escapeHtml(item.title)}</text>
        </g>
      `;
    }).join("");
}

function drawProfileOverlay() {
  if (!state.profilePoints.length) return "";
  const screens = state.profilePoints.map((point) => renderer.projectToScreen(point));
  const markers = screens.map((screen, index) => {
    if (!screen) return "";
    return `
      <g class="profile-marker">
        <circle cx="${screen.x}" cy="${screen.y}" r="6" />
        <text x="${screen.x + 8}" y="${screen.y - 8}">${index === 0 ? "A" : "B"}</text>
      </g>
    `;
  }).join("");
  if (state.profilePoints.length < 2 || !screens[0] || !screens[1]) return markers;
  const line = `<line class="profile-line" x1="${screens[0].x}" y1="${screens[0].y}" x2="${screens[1].x}" y2="${screens[1].y}" />`;
  const label = `<text class="profile-label" x="${(screens[0].x + screens[1].x) / 2 + 8}" y="${(screens[0].y + screens[1].y) / 2 - 8}">剖面 ${state.profileResult?.length?.toFixed(1) || ""}m</text>`;
  return `${line}${markers}${label}`;
}

function drawClearanceOverlay() {
  const risks = state.clearanceResult?.risks || [];
  if (!risks.length) return "";
  return risks.slice(0, 12).map((risk, index) => {
    const wire = renderer.projectToScreen(risk.wire);
    const obstacle = renderer.projectToScreen(risk.obstacle);
    if (!wire || !obstacle) return "";
    const selected = index === state.selectedClearanceIndex ? " selected" : "";
    return `
      <g class="clearance-marker${selected}">
        <line x1="${wire.x}" y1="${wire.y}" x2="${obstacle.x}" y2="${obstacle.y}" />
        <circle cx="${wire.x}" cy="${wire.y}" r="${selected ? 7 : 5}" />
        <circle class="obstacle" cx="${obstacle.x}" cy="${obstacle.y}" r="${selected ? 6 : 4}" />
        <text x="${wire.x + 8}" y="${wire.y - 8}">${risk.clearance.toFixed(1)}m</text>
      </g>
    `;
  }).join("");
}

function updateMeasureInfo() {
  const count = state.measurement.length;
  if (!count) {
    els.measureInfo.textContent = state.measureMode ? "左键添加测量点，右键回退上一个点。" : "开启测距后，左键连续添加点，右键回退。";
    els.statusCoords.textContent = "测距：-";
    return;
  }
  const total = measurementTotal();
  const last = count > 1 ? distance(state.measurement[count - 2], state.measurement[count - 1]) : 0;
  els.measureInfo.innerHTML = `
    点数：<strong>${count}</strong><br />
    总长度：<strong>${total.toFixed(3)}</strong><br />
    最新段：<strong>${last.toFixed(3)}</strong>
  `;
  els.statusCoords.textContent = `测距：${total.toFixed(3)}`;
}

function measurementTotal() {
  let total = 0;
  for (let i = 1; i < state.measurement.length; i += 1) {
    total += distance(state.measurement[i - 1], state.measurement[i]);
  }
  return total;
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

function formatCoord(value) {
  return Number.isFinite(Number(value)) ? Number(value).toFixed(2) : "-";
}

function formatAngle(value) {
  return Number.isFinite(Number(value)) ? Number(value).toFixed(2) : "-";
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

function clampNumber(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function subVector(a, b) {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function dotVector(a, b) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function crossVector(a, b) {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

function normalizeVector(vector) {
  const size = Math.hypot(vector[0], vector[1], vector[2]) || 1;
  return [vector[0] / size, vector[1] / size, vector[2] / size];
}

function round(value) {
  return Math.round(value * 1000) / 1000;
}

function rgbToHex(rgb) {
  return `#${rgb.map((value) => value.toString(16).padStart(2, "0")).join("")}`;
}

function hexToRgb(hex) {
  const value = hex.replace("#", "");
  return [
    parseInt(value.slice(0, 2), 16),
    parseInt(value.slice(2, 4), 16),
    parseInt(value.slice(4, 6), 16),
  ];
}
