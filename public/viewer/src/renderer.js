import {
  add,
  cross,
  length,
  lookAt,
  multiplyMat4,
  normalize,
  perspective,
  scale,
  sub,
  transformPoint,
  vec3,
} from "./math3d.js";

const VERTEX_SHADER = `
attribute vec3 a_position;
attribute vec3 a_color;
uniform mat4 u_matrix;
uniform float u_pointSize;
uniform bool u_pointAttenuation;
varying vec3 v_color;
void main() {
  gl_Position = u_matrix * vec4(a_position, 1.0);
  float baseSize = max(u_pointSize, 1.8);
  float attenuatedSize = clamp(baseSize * (260.0 / max(gl_Position.w, 1.0)), 1.8, baseSize * 3.0);
  gl_PointSize = u_pointAttenuation ? attenuatedSize : baseSize;
  v_color = a_color;
}`;

const FRAGMENT_SHADER = `
precision mediump float;
varying vec3 v_color;
uniform bool u_encodeDepth;
void main() {
  vec2 d = gl_PointCoord - vec2(0.5);
  float r2 = dot(d, d);
  if (r2 > 0.25) discard;
  float edge = smoothstep(0.25, 0.16, r2);
  gl_FragColor = vec4(v_color, u_encodeDepth ? gl_FragCoord.z : edge);
}`;

const POST_VERTEX_SHADER = `
attribute vec2 a_position;
varying vec2 v_uv;
void main() {
  v_uv = a_position * 0.5 + 0.5;
  gl_Position = vec4(a_position, 0.0, 1.0);
}`;

const EDL_FRAGMENT_SHADER = `
precision mediump float;
uniform sampler2D u_scene;
uniform vec2 u_texel;
uniform float u_strength;
uniform float u_radius;
varying vec2 v_uv;
void main() {
  vec4 center = texture2D(u_scene, v_uv);
  float depth = center.a;
  vec2 r = u_texel * u_radius;
  float response = 0.0;
  response += abs(texture2D(u_scene, v_uv + vec2( r.x,  0.0)).a - depth);
  response += abs(texture2D(u_scene, v_uv + vec2(-r.x,  0.0)).a - depth);
  response += abs(texture2D(u_scene, v_uv + vec2( 0.0,  r.y)).a - depth);
  response += abs(texture2D(u_scene, v_uv + vec2( 0.0, -r.y)).a - depth);
  response += abs(texture2D(u_scene, v_uv + vec2( r.x,  r.y)).a - depth);
  response += abs(texture2D(u_scene, v_uv + vec2(-r.x,  r.y)).a - depth);
  response += abs(texture2D(u_scene, v_uv + vec2( r.x, -r.y)).a - depth);
  response += abs(texture2D(u_scene, v_uv + vec2(-r.x, -r.y)).a - depth);
  float shade = exp(-response * u_strength * 42.0);
  gl_FragColor = vec4(center.rgb * clamp(shade, 0.22, 1.0), 1.0);
}`;

const SOLID_VERTEX_SHADER = `
attribute vec3 a_position;
uniform mat4 u_matrix;
uniform float u_pointSize;
void main() {
  gl_Position = u_matrix * vec4(a_position, 1.0);
  gl_PointSize = u_pointSize;
}`;

const SOLID_FRAGMENT_SHADER = `
precision mediump float;
uniform vec4 u_color;
uniform bool u_roundPoint;
void main() {
  if (u_roundPoint) {
    vec2 d = gl_PointCoord - vec2(0.5);
    if (dot(d, d) > 0.25) discard;
  }
  gl_FragColor = u_color;
}`;

export class PointCloudRenderer {
  constructor(canvas, callbacks = {}) {
    this.canvas = canvas;
    this.callbacks = callbacks;
    const contextOptions = { antialias: true, alpha: false, preserveDrawingBuffer: true };
    this.gl = canvas.getContext("webgl2", contextOptions)
      || canvas.getContext("webgl", contextOptions);
    if (!this.gl) {
      throw new Error("当前浏览器不支持 WebGL，无法渲染点云。");
    }

    this.program = createProgram(this.gl, VERTEX_SHADER, FRAGMENT_SHADER);
    this.postProgram = createProgram(this.gl, POST_VERTEX_SHADER, EDL_FRAGMENT_SHADER);
    this.solidProgram = createProgram(this.gl, SOLID_VERTEX_SHADER, SOLID_FRAGMENT_SHADER);
    this.positionBuffer = this.gl.createBuffer();
    this.colorBuffer = this.gl.createBuffer();
    this.quadBuffer = this.gl.createBuffer();
    this.routeLineBuffer = this.gl.createBuffer();
    this.routeWaypointBuffer = this.gl.createBuffer();
    this.routePartBuffer = this.gl.createBuffer();
    this.routeSelectedBuffer = this.gl.createBuffer();
    this.routeTargetLineBuffer = this.gl.createBuffer();
    this.routeTargetBuffer = this.gl.createBuffer();
    this.routePrimaryTargetBuffer = this.gl.createBuffer();
    this.routeFrustumBuffer = this.gl.createBuffer();
    this.edlTarget = null;
    this.edlAvailable = true;
    this.edl = { enabled: false, strength: 1.4, radius: 1.4 };
    this.pointCount = 0;
    this.route = null;
    this.positions = new Float32Array();
    this.colors = new Uint8Array();
    this.pointSize = 2;
    this.pointAttenuation = true;
    this.mode = "orbit";
    this.measureMode = false;
    this.profileMode = false;
    this.annotationMode = false;
    this.routeEditMode = false;
    this.routeDrag = null;
    this.navigation = {
      invertRotateX: false,
      invertRotateY: false,
      invertPanX: false,
      invertPanY: false,
      invertWheelZoom: false,
      rotateSpeed: 1,
      panSpeed: 1,
      zoomSpeed: 1,
      walkSpeed: 1,
    };
    this.stats = { lastRenderMs: 0, fps: 0, lastRenderAt: 0 };
    this.bounds = { min: [-1, -1, -1], max: [1, 1, 1] };
    this.viewportCssWidth = 1;
    this.viewportCssHeight = 1;
    this.needsResize = true;
    this.interacting = false;
    this.camera = {
      target: vec3(),
      distance: 500,
      yaw: Math.PI / 4,
      pitch: -0.45,
      flyPosition: vec3(0, 80, 260),
      flyYaw: Math.PI,
      flyPitch: -0.15,
    };
    this.pointer = { down: false, button: 0, x: 0, y: 0 };
    this.keys = new Set();
    this.lastFrame = performance.now();
    this.matrix = perspective(Math.PI / 4, 1, 0.1, 1000);
    this.viewInfo = null;
    this.frameHandle = 0;
    this.needsRender = true;

    this.initQuad();
    this.attachEvents();
    this.resize();
    this.requestRender();
  }

  setPointSize(value) {
    this.pointSize = Number(value);
    this.requestRender();
  }

  setPointAttenuation(enabled) {
    this.pointAttenuation = Boolean(enabled);
    this.requestRender();
  }

  setMode(mode) {
    this.mode = mode;
    this.requestRender();
  }

  setMeasureMode(enabled) {
    this.measureMode = enabled;
  }

  setProfileMode(enabled) {
    this.profileMode = Boolean(enabled);
  }

  setAnnotationMode(enabled) {
    this.annotationMode = Boolean(enabled);
  }

  setNavigationSettings(settings = {}) {
    this.navigation = {
      ...this.navigation,
      ...settings,
      rotateSpeed: clamp(Number(settings.rotateSpeed ?? this.navigation.rotateSpeed) || 1, 0.05, 10),
      panSpeed: clamp(Number(settings.panSpeed ?? this.navigation.panSpeed) || 1, 0.05, 10),
      zoomSpeed: clamp(Number(settings.zoomSpeed ?? this.navigation.zoomSpeed) || 1, 0.05, 10),
      walkSpeed: clamp(Number(settings.walkSpeed ?? this.navigation.walkSpeed) || 1, 0.05, 20),
    };
  }

  setMouseInversion({ rotate = false, pan = false } = {}) {
    this.setNavigationSettings({
      invertRotateX: Boolean(rotate),
      invertRotateY: Boolean(rotate),
      invertPanX: Boolean(pan),
      invertPanY: Boolean(pan),
    });
  }

  setInvertMouseButtons(enabled) {
    this.setMouseInversion({ rotate: Boolean(enabled), pan: Boolean(enabled) });
  }

  getStats() {
    return {
      pointCount: this.pointCount,
      mode: this.mode,
      edl: { ...this.edl },
      pointSize: this.pointSize,
      pointAttenuation: this.pointAttenuation,
      lastRenderMs: this.stats.lastRenderMs,
      fps: this.stats.fps,
      navigation: { ...this.navigation },
    };
  }

  setEdl({ enabled = this.edl.enabled, strength = this.edl.strength, radius = this.edl.radius } = {}) {
    this.edl = {
      enabled: Boolean(enabled),
      strength: Number(strength),
      radius: Number(radius),
    };
    this.requestRender();
  }

  setCloud({ positions, colors, bounds }) {
    this.positions = positions || new Float32Array();
    this.colors = colors || new Uint8Array();
    this.pointCount = this.positions.length / 3;
    this.bounds = bounds || this.bounds;
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, this.positions, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.colorBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, this.colors, gl.STATIC_DRAW);
    this.requestRender();
  }

  setRoute(route) {
    this.route = route ? {
      data: route,
      selectedIndex: 0,
      selectedTargetIndex: 0,
      waypoints: flattenPoints(route.render.waypoints),
      parts: flattenPoints(route.render.partPoints),
      selected: new Float32Array(),
      targetLines: new Float32Array(),
      targetPoints: new Float32Array(),
      primaryTarget: new Float32Array(),
      frustumLines: new Float32Array(),
    } : null;
    this.uploadRouteBaseBuffers();
    this.updateRouteSelection(this.route?.selectedIndex || 0, 0);
    this.requestRender();
  }

  setSelectedWaypoint(index, targetIndex = 0) {
    if (!this.route) return;
    this.updateRouteSelection(index, targetIndex);
    this.requestRender();
  }

  setRouteEditMode(enabled) {
    this.routeEditMode = Boolean(enabled);
  }

  setInteracting(enabled) {
    const next = Boolean(enabled);
    if (this.interacting === next) return;
    this.interacting = next;
    this.callbacks.onInteractionChange?.(next);
    if (!next) this.callbacks.onViewChange?.({ interactive: false, final: true });
  }

  focusOnPoint(point, radius = 35) {
    if (!point) return;
    this.camera.target = [point[0], point[1], point[2]];
    this.camera.distance = Math.max(radius * 2.4, 8);
    this.requestRender();
  }

  setViewPreset(preset) {
    const radius = Math.max(this.camera.distance, 8);
    if (preset === "top") {
      this.camera.yaw = 0;
      this.camera.pitch = -Math.PI / 2 + 0.02;
    } else if (preset === "front") {
      this.camera.yaw = Math.PI;
      this.camera.pitch = -0.02;
    } else if (preset === "right") {
      this.camera.yaw = Math.PI / 2;
      this.camera.pitch = -0.02;
    } else {
      this.camera.yaw = Math.PI / 4;
      this.camera.pitch = -0.55;
    }
    const dir = this.orbitDirection();
    this.camera.flyPosition = add(this.camera.target, scale(dir, radius));
    this.camera.flyYaw = this.camera.yaw;
    this.camera.flyPitch = this.camera.pitch;
    this.requestRender();
  }

  getViewState() {
    return {
      mode: this.mode,
      yaw: this.mode === "walk" ? this.camera.flyYaw : this.camera.yaw,
      pitch: this.mode === "walk" ? this.camera.flyPitch : this.camera.pitch,
      target: [...this.camera.target],
      distance: this.camera.distance,
    };
  }

  setViewState(view) {
    if (!view) return;
    this.mode = view.mode === "walk" ? "walk" : "orbit";
    if (Array.isArray(view.target)) this.camera.target = [...view.target];
    if (Number.isFinite(Number(view.distance))) this.camera.distance = Number(view.distance);
    if (Number.isFinite(Number(view.yaw))) this.camera.yaw = Number(view.yaw);
    if (Number.isFinite(Number(view.pitch))) this.camera.pitch = Number(view.pitch);
    if (Array.isArray(view.flyPosition)) this.camera.flyPosition = [...view.flyPosition];
    if (Number.isFinite(Number(view.flyYaw))) this.camera.flyYaw = Number(view.flyYaw);
    if (Number.isFinite(Number(view.flyPitch))) this.camera.flyPitch = Number(view.flyPitch);
    this.requestRender();
  }

  getRouteLabelProjections() {
    if (!this.route) return null;
    const data = this.route.data.render;
    return {
      waypointLabels: data.waypoints.map((point, index) => ({
        index,
        label: data.waypointLabels[index],
        screen: this.projectToScreen(point),
        selected: index === this.route.selectedIndex,
      })),
      partLabels: data.partPoints.map((point, index) => ({
        index,
        label: data.partLabels[index],
        screen: this.projectToScreen(point),
        highlighted: this.route.highlightedPartIndexes?.has(index) || false,
        primary: this.route.primaryPartIndex === index,
      })),
    };
  }

  fitToBounds(bounds = this.bounds) {
    this.bounds = bounds;
    const center = [
      (bounds.min[0] + bounds.max[0]) / 2,
      (bounds.min[1] + bounds.max[1]) / 2,
      (bounds.min[2] + bounds.max[2]) / 2,
    ];
    const size = sub(bounds.max, bounds.min);
    const radius = Math.max(length(size) / 2, 10);
    this.camera.target = center;
    this.camera.distance = radius * 2.4;
    this.camera.yaw = Math.PI / 4;
    this.camera.pitch = -0.45;
    this.camera.flyPosition = add(center, [0, radius * 0.45, radius * 1.5]);
    this.camera.flyYaw = Math.PI;
    this.camera.flyPitch = -0.12;
    this.requestRender();
  }

  fitRouteToBounds() {
    if (this.route?.data?.bounds) this.fitToBounds(this.route.data.bounds);
  }

  projectToScreen(point) {
    const clip = transformPoint(this.matrix, point);
    if (clip[3] <= 0 || clip[2] < -1 || clip[2] > 1) return null;
    return {
      x: (clip[0] * 0.5 + 0.5) * this.viewportCssWidth,
      y: (-clip[1] * 0.5 + 0.5) * this.viewportCssHeight,
      depth: clip[2],
    };
  }

  pickPoint(clientX, clientY) {
    if (!this.positions.length) return null;
    const rect = this.canvas.getBoundingClientRect();
    const sx = clientX - rect.left;
    const sy = clientY - rect.top;
    const total = this.positions.length / 3;
    const stride = Math.max(1, Math.ceil(total / 120_000));
    let best = null;
    let bestScore = Infinity;

    for (let i = 0; i < total; i += stride) {
      const point = [
        this.positions[i * 3],
        this.positions[i * 3 + 1],
        this.positions[i * 3 + 2],
      ];
      const screen = this.projectToScreen(point);
      if (!screen) continue;
      const dx = screen.x - sx;
      const dy = screen.y - sy;
      const dist2 = dx * dx + dy * dy;
      if (dist2 < bestScore && dist2 < 144) {
        bestScore = dist2;
        best = { index: i, point, screen };
      }
    }
    return best;
  }

  attachEvents() {
    window.addEventListener("resize", () => {
      this.needsResize = true;
      this.requestRender();
    });
    if (typeof ResizeObserver !== "undefined") {
      this.resizeObserver = new ResizeObserver(() => {
        this.needsResize = true;
        this.requestRender();
      });
      this.resizeObserver.observe(this.canvas);
    }
    window.addEventListener("keydown", (event) => {
      this.keys.add(event.key.toLowerCase());
      this.requestRender();
    });
    window.addEventListener("keyup", (event) => {
      this.keys.delete(event.key.toLowerCase());
      this.requestRender();
    });

    this.canvas.addEventListener("contextmenu", (event) => event.preventDefault());
    this.canvas.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      this.canvas.setPointerCapture(event.pointerId);
      this.pointer = { down: true, button: event.button, x: event.clientX, y: event.clientY };
      if (this.routeEditMode && event.button === 0) {
        const hit = this.pickRouteWaypoint(event.clientX, event.clientY);
        if (hit) {
          event.preventDefault();
          this.routeDrag = { index: hit.index };
          this.setInteracting(true);
          this.callbacks.onRouteWaypointSelect?.(hit.index);
          return;
        }
      }
      if (this.profileMode) {
        event.preventDefault();
        if (event.button === 2) {
          this.callbacks.onProfileUndo?.();
          return;
        }
        if (event.button === 0) {
          const hit = this.pickPoint(event.clientX, event.clientY);
          if (hit) this.callbacks.onProfilePick?.(hit);
        }
        return;
      }
      if (this.annotationMode) {
        event.preventDefault();
        if (event.button === 0) {
          const hit = this.pickPoint(event.clientX, event.clientY);
          if (hit) this.callbacks.onAnnotationPick?.(hit);
        }
        return;
      }
      if (this.measureMode) {
        event.preventDefault();
        if (event.button === 2) {
          this.callbacks.onMeasureUndo?.();
          return;
        }
        if (event.button === 0) {
          const hit = this.pickPoint(event.clientX, event.clientY);
          if (hit) this.callbacks.onMeasurePick?.(hit);
        }
        return;
      }
      if (!this.measureMode && !this.profileMode && !this.annotationMode) this.setInteracting(true);
    });
    this.canvas.addEventListener("pointerup", () => {
      this.pointer.down = false;
      this.routeDrag = null;
      this.setInteracting(false);
    });
    this.canvas.addEventListener("pointercancel", () => {
      this.pointer.down = false;
      this.routeDrag = null;
      this.setInteracting(false);
    });
    this.canvas.addEventListener("pointermove", (event) => {
      const dx = event.clientX - this.pointer.x;
      const dy = event.clientY - this.pointer.y;
      this.pointer.x = event.clientX;
      this.pointer.y = event.clientY;
      if (this.routeDrag) {
        const delta = this.screenDeltaToWorld(dx, dy);
        this.callbacks.onRouteWaypointMove?.(this.routeDrag.index, delta);
        this.requestRender();
        return;
      }
      if (!this.pointer.down || this.measureMode || this.profileMode || this.annotationMode) return;

      if (this.mode === "walk") {
        const rotateSignX = this.navigation.invertRotateX ? -1 : 1;
        const rotateSignY = this.navigation.invertRotateY ? -1 : 1;
        this.camera.flyYaw -= dx * 0.004 * this.navigation.rotateSpeed * rotateSignX;
        this.camera.flyPitch = clamp(this.camera.flyPitch - dy * 0.003 * this.navigation.rotateSpeed * rotateSignY, -1.35, 1.35);
        this.requestRender();
        return;
      }

      if (this.orbitAction(event) === "pan") {
        const panSignX = this.navigation.invertPanX ? -1 : 1;
        const panSignY = this.navigation.invertPanY ? -1 : 1;
        this.pan(dx * panSignX, dy * panSignY);
      } else {
        const rotateSignX = this.navigation.invertRotateX ? -1 : 1;
        const rotateSignY = this.navigation.invertRotateY ? -1 : 1;
        this.camera.yaw -= dx * 0.005 * this.navigation.rotateSpeed * rotateSignX;
        this.camera.pitch = clamp(this.camera.pitch + dy * 0.004 * this.navigation.rotateSpeed * rotateSignY, -1.45, 1.45);
      }
      this.requestRender();
    });
    this.canvas.addEventListener("wheel", (event) => {
      event.preventDefault();
      const wheelDirection = (event.deltaY > 0 ? 1 : -1) * (this.navigation.invertWheelZoom ? -1 : 1);
      if (this.mode === "walk") {
        const dir = this.flyDirection();
        this.camera.flyPosition = add(this.camera.flyPosition, scale(dir, wheelDirection > 0 ? -18 * this.navigation.zoomSpeed : 18 * this.navigation.zoomSpeed));
      } else {
        const factor = Math.pow(1.12, wheelDirection * this.navigation.zoomSpeed);
        this.camera.distance = clamp(this.camera.distance * factor, 0.5, 1_000_000);
      }
      this.requestRender();
    }, { passive: false });
  }

  orbitAction(event) {
    if (event.shiftKey) return "pan";
    if (this.pointer.button === 1 || this.pointer.button === 2) return "pan";
    return "rotate";
  }

  pan(dx, dy) {
    const { right, up } = this.cameraBasis();
    const scaleFactor = (this.camera.distance / Math.max(this.viewportCssHeight, 1)) * this.navigation.panSpeed;
    this.camera.target = add(
      this.camera.target,
      add(scale(right, -dx * scaleFactor), scale(up, dy * scaleFactor)),
    );
  }

  screenDeltaToWorld(dx, dy) {
    const { right, up } = this.cameraBasis();
    const scaleFactor = this.camera.distance / Math.max(this.viewportCssHeight, 1);
    return add(scale(right, dx * scaleFactor), scale(up, -dy * scaleFactor));
  }

  pickRouteWaypoint(clientX, clientY) {
    if (!this.route) return null;
    const rect = this.canvas.getBoundingClientRect();
    const sx = clientX - rect.left;
    const sy = clientY - rect.top;
    let best = null;
    let bestScore = Infinity;
    this.route.data.render.waypoints.forEach((point, index) => {
      const screen = this.projectToScreen(point);
      if (!screen) return;
      const dx = screen.x - sx;
      const dy = screen.y - sy;
      const score = dx * dx + dy * dy;
      if (score < bestScore && score < 196) {
        bestScore = score;
        best = { index, point, screen };
      }
    });
    return best;
  }

  updateWalk(deltaSeconds) {
    if (this.mode !== "walk") return false;
    const speed = 120 * this.navigation.walkSpeed * deltaSeconds * (this.keys.has("shift") ? 4 : 1);
    const dir = this.flyDirection();
    const right = normalize(cross(dir, [0, 1, 0]));
    let movement = [0, 0, 0];
    if (this.keys.has("w")) movement = add(movement, dir);
    if (this.keys.has("s")) movement = sub(movement, dir);
    if (this.keys.has("d")) movement = add(movement, right);
    if (this.keys.has("a")) movement = sub(movement, right);
    if (this.keys.has("e")) movement = add(movement, [0, 1, 0]);
    if (this.keys.has("q")) movement = sub(movement, [0, 1, 0]);
    if (length(movement) === 0) return false;
    this.camera.flyPosition = add(this.camera.flyPosition, scale(normalize(movement), speed));
    return true;
  }

  cameraBasis() {
    const eye = this.orbitEye();
    const forward = normalize(sub(this.camera.target, eye));
    const right = normalize(cross(forward, [0, 1, 0]));
    const up = normalize(cross(right, forward));
    return { eye, forward, right, up };
  }

  orbitEye() {
    const cp = Math.cos(this.camera.pitch);
    return [
      this.camera.target[0] + this.camera.distance * cp * Math.sin(this.camera.yaw),
      this.camera.target[1] + this.camera.distance * Math.sin(this.camera.pitch),
      this.camera.target[2] + this.camera.distance * cp * Math.cos(this.camera.yaw),
    ];
  }

  orbitDirection() {
    const cp = Math.cos(this.camera.pitch);
    return normalize([
      cp * Math.sin(this.camera.yaw),
      Math.sin(this.camera.pitch),
      cp * Math.cos(this.camera.yaw),
    ]);
  }

  flyDirection() {
    const cp = Math.cos(this.camera.flyPitch);
    return normalize([
      Math.sin(this.camera.flyYaw) * cp,
      Math.sin(this.camera.flyPitch),
      Math.cos(this.camera.flyYaw) * cp,
    ]);
  }

  currentViewProjection() {
    const aspect = Math.max(this.viewportCssWidth / Math.max(this.viewportCssHeight, 1), 0.1);
    const size = length(sub(this.bounds.max, this.bounds.min)) || 1000;
    const far = Math.max(size * 8 + this.camera.distance * 2, 1000);
    const projection = perspective(Math.PI / 4, aspect, 0.05, far);
    let view;
    if (this.mode === "walk") {
      const dir = this.flyDirection();
      view = lookAt(this.camera.flyPosition, add(this.camera.flyPosition, dir), [0, 1, 0]);
      this.viewInfo = { eye: this.camera.flyPosition, target: add(this.camera.flyPosition, dir) };
    } else {
      const eye = this.orbitEye();
      view = lookAt(eye, this.camera.target, [0, 1, 0]);
      this.viewInfo = { eye, target: this.camera.target };
    }
    return multiplyMat4(projection, view);
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = this.canvas.getBoundingClientRect();
    this.viewportCssWidth = Math.max(1, rect.width);
    this.viewportCssHeight = Math.max(1, rect.height);
    const width = Math.max(1, Math.floor(this.viewportCssWidth * dpr));
    const height = Math.max(1, Math.floor(this.viewportCssHeight * dpr));
    this.needsResize = false;
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
      this.edlTarget = null;
      return true;
    }
    return false;
  }

  requestRender() {
    this.needsRender = true;
    if (!this.frameHandle) {
      this.frameHandle = requestAnimationFrame(() => this.animate());
    }
  }

  animate() {
    this.frameHandle = 0;
    const now = performance.now();
    const delta = Math.min(0.05, (now - this.lastFrame) / 1000);
    this.lastFrame = now;
    const moving = this.updateWalk(delta);
    if (this.needsResize && this.resize()) this.needsRender = true;
    if (this.needsRender || moving) this.render();
    if (moving) this.requestRender();
  }

  render() {
    const renderStart = performance.now();
    const gl = this.gl;
    const useEdl = this.edl.enabled && this.ensureEdlTarget();
    if (useEdl) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.edlTarget.framebuffer);
      this.renderScene(true);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      this.renderEdl();
    } else {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      this.renderScene(false);
    }
    this.needsRender = false;
    const renderEnd = performance.now();
    const frameGap = this.stats.lastRenderAt ? renderEnd - this.stats.lastRenderAt : 0;
    this.stats.lastRenderMs = renderEnd - renderStart;
    this.stats.fps = frameGap > 0 ? 1000 / frameGap : 0;
    this.stats.lastRenderAt = renderEnd;
    this.callbacks.onViewChange?.({ interactive: this.interacting || moving });
  }

  renderScene(encodeDepth) {
    const gl = this.gl;
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clearColor(0.035, 0.043, 0.055, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);

    this.matrix = this.currentViewProjection();
    if (this.pointCount) this.renderCloudPoints(encodeDepth);
    this.renderRoute();
  }

  renderCloudPoints(encodeDepth) {
    const gl = this.gl;
    gl.useProgram(this.program);
    if (encodeDepth) {
      gl.disable(gl.BLEND);
    } else {
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    }
    gl.uniformMatrix4fv(gl.getUniformLocation(this.program, "u_matrix"), false, new Float32Array(this.matrix));
    gl.uniform1f(gl.getUniformLocation(this.program, "u_pointSize"), this.pointSize * Math.min(window.devicePixelRatio || 1, 2));
    gl.uniform1i(gl.getUniformLocation(this.program, "u_encodeDepth"), encodeDepth ? 1 : 0);
    gl.uniform1i(gl.getUniformLocation(this.program, "u_pointAttenuation"), this.pointAttenuation ? 1 : 0);

    const positionLocation = gl.getAttribLocation(this.program, "a_position");
    gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
    gl.enableVertexAttribArray(positionLocation);
    gl.vertexAttribPointer(positionLocation, 3, gl.FLOAT, false, 0, 0);

    const colorLocation = gl.getAttribLocation(this.program, "a_color");
    gl.bindBuffer(gl.ARRAY_BUFFER, this.colorBuffer);
    gl.enableVertexAttribArray(colorLocation);
    gl.vertexAttribPointer(colorLocation, 3, gl.UNSIGNED_BYTE, true, 0, 0);

    gl.drawArrays(gl.POINTS, 0, this.pointCount);
    if (!encodeDepth) gl.disable(gl.BLEND);
  }

  renderRoute() {
    if (!this.route) return;
    const gl = this.gl;
    gl.useProgram(this.solidProgram);
    gl.uniformMatrix4fv(gl.getUniformLocation(this.solidProgram, "u_matrix"), false, new Float32Array(this.matrix));
    gl.disable(gl.DEPTH_TEST);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.lineWidth(2);

    this.drawRouteArray(this.routeLineBuffer, this.route.data.render.waypoints.length, gl.LINE_STRIP, [0.18, 0.82, 0.95, 1], false, 1);
    this.drawRouteArray(this.routeTargetLineBuffer, this.route.targetLines.length / 3, gl.LINES, [0.58, 0.22, 0.82, 0.55], false, 1);
    this.drawRouteArray(this.routePartBuffer, this.route.data.render.partPoints.length, gl.POINTS, [1, 0.52, 0.12, 0.92], true, 7);
    this.drawRouteArray(this.routeWaypointBuffer, this.route.data.render.waypoints.length, gl.POINTS, [0.22, 0.62, 1, 1], true, 8);
    this.drawRouteArray(this.routeTargetBuffer, this.route.targetPoints.length / 3, gl.POINTS, [1, 0.86, 0.2, 1], true, 11);
    this.drawRouteArray(this.routePrimaryTargetBuffer, this.route.primaryTarget.length / 3, gl.POINTS, [1, 0.98, 0.42, 1], true, 15);
    this.drawRouteArray(this.routeFrustumBuffer, this.route.frustumLines.length / 3, gl.LINES, [1, 0.5, 0.04, 0.95], false, 1);
    this.drawRouteArray(this.routeSelectedBuffer, this.route.selected.length / 3, gl.POINTS, [1, 0.82, 0.08, 1], true, 17);

    gl.disable(gl.BLEND);
  }

  drawRouteArray(buffer, count, mode, color, roundPoint, pointSize) {
    if (!count) return;
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    const location = gl.getAttribLocation(this.solidProgram, "a_position");
    gl.enableVertexAttribArray(location);
    gl.vertexAttribPointer(location, 3, gl.FLOAT, false, 0, 0);
    gl.uniform4fv(gl.getUniformLocation(this.solidProgram, "u_color"), color);
    gl.uniform1i(gl.getUniformLocation(this.solidProgram, "u_roundPoint"), roundPoint ? 1 : 0);
    gl.uniform1f(gl.getUniformLocation(this.solidProgram, "u_pointSize"), pointSize * Math.min(window.devicePixelRatio || 1, 2));
    gl.drawArrays(mode, 0, count);
  }

  uploadRouteBaseBuffers() {
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.routeLineBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, this.route?.waypoints || new Float32Array(), gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.routeWaypointBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, this.route?.waypoints || new Float32Array(), gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.routePartBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, this.route?.parts || new Float32Array(), gl.STATIC_DRAW);
  }

  updateRouteSelection(index, targetIndex = 0) {
    if (!this.route) return;
    const waypointCount = this.route.data.render.waypoints.length;
    this.route.selectedIndex = clamp(Math.round(Number(index) || 0), 0, Math.max(waypointCount - 1, 0));
    this.route.selectedTargetIndex = Math.max(0, Math.round(Number(targetIndex) || 0));
    const selectedPoint = this.route.data.render.waypoints[this.route.selectedIndex];
    const targetPoints = this.route.data.render.waypointTargetPoints[this.route.selectedIndex] || [];
    const targetMeta = this.route.data.render.waypointTargetMeta[this.route.selectedIndex] || [];
    const primaryTargetIndex = clamp(this.route.selectedTargetIndex, 0, Math.max(targetPoints.length - 1, 0));
    const targetLines = [];
    for (const target of targetPoints) {
      targetLines.push(...selectedPoint, ...target);
    }
    this.route.selected = selectedPoint ? new Float32Array(selectedPoint) : new Float32Array();
    this.route.targetPoints = flattenPoints(targetPoints);
    this.route.primaryTarget = targetPoints[primaryTargetIndex] ? new Float32Array(targetPoints[primaryTargetIndex]) : new Float32Array();
    this.route.targetLines = new Float32Array(targetLines);
    this.route.frustumLines = buildFrustumLines(selectedPoint, targetPoints[primaryTargetIndex], targetMeta[primaryTargetIndex]);
    this.route.highlightedPartIndexes = new Set(targetMeta.map((item) => item.partIndex).filter((item) => item !== null && item !== undefined));
    this.route.primaryPartIndex = targetMeta[primaryTargetIndex]?.partIndex ?? null;

    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.routeSelectedBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, this.route.selected, gl.DYNAMIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.routeTargetBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, this.route.targetPoints, gl.DYNAMIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.routeTargetLineBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, this.route.targetLines, gl.DYNAMIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.routePrimaryTargetBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, this.route.primaryTarget, gl.DYNAMIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.routeFrustumBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, this.route.frustumLines, gl.DYNAMIC_DRAW);
  }

  initQuad() {
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
      -1, -1,
      1, -1,
      -1, 1,
      1, 1,
    ]), gl.STATIC_DRAW);
  }

  ensureEdlTarget() {
    if (!this.edlAvailable || !this.canvas.width || !this.canvas.height) return false;
    if (this.edlTarget?.width === this.canvas.width && this.edlTarget?.height === this.canvas.height) return true;

    const gl = this.gl;
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, this.canvas.width, this.canvas.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);

    const depth = gl.createRenderbuffer();
    gl.bindRenderbuffer(gl.RENDERBUFFER, depth);
    gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, this.canvas.width, this.canvas.height);

    const framebuffer = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, depth);

    const complete = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    if (!complete) {
      this.edlAvailable = false;
      return false;
    }
    this.edlTarget = { framebuffer, texture, depth, width: this.canvas.width, height: this.canvas.height };
    return true;
  }

  renderEdl() {
    const gl = this.gl;
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.disable(gl.DEPTH_TEST);
    gl.useProgram(this.postProgram);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.edlTarget.texture);
    gl.uniform1i(gl.getUniformLocation(this.postProgram, "u_scene"), 0);
    gl.uniform2f(gl.getUniformLocation(this.postProgram, "u_texel"), 1 / this.canvas.width, 1 / this.canvas.height);
    gl.uniform1f(gl.getUniformLocation(this.postProgram, "u_strength"), this.edl.strength);
    gl.uniform1f(gl.getUniformLocation(this.postProgram, "u_radius"), this.edl.radius);

    const location = gl.getAttribLocation(this.postProgram, "a_position");
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuffer);
    gl.enableVertexAttribArray(location);
    gl.vertexAttribPointer(location, 2, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }
}

function createProgram(gl, vertexSource, fragmentSource) {
  const vertexShader = compileShader(gl, gl.VERTEX_SHADER, vertexSource);
  const fragmentShader = compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource);
  const program = gl.createProgram();
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(gl.getProgramInfoLog(program) || "WebGL program link failed.");
  }
  return program;
}

function compileShader(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    throw new Error(gl.getShaderInfoLog(shader) || "WebGL shader compile failed.");
  }
  return shader;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function flattenPoints(points) {
  const out = new Float32Array(points.length * 3);
  points.forEach((point, index) => {
    out[index * 3] = point[0];
    out[index * 3 + 1] = point[1];
    out[index * 3 + 2] = point[2];
  });
  return out;
}

function buildFrustumLines(origin, target, meta) {
  if (!origin) return new Float32Array();
  const forward = target ? normalize(sub(target, origin)) : directionFromYawPitch(meta?.cameraYaw || 0, meta?.cameraPitch || -35);
  const fallbackUp = Math.abs(forward[1]) > 0.92 ? [1, 0, 0] : [0, 1, 0];
  const right = normalize(cross(forward, fallbackUp));
  const up = normalize(cross(right, forward));
  const lengthScale = Math.max(target ? length(sub(target, origin)) : 25, 12);
  const focal = Math.max(Number(meta?.focalLengthRatio) || 1, 0.2);
  const halfWidth = lengthScale * 0.34 / focal;
  const halfHeight = lengthScale * 0.22 / focal;
  const center = add(origin, scale(forward, lengthScale));
  const nearCenter = add(origin, scale(forward, Math.min(lengthScale * 0.2, 5)));
  const nearHalfWidth = Math.max(halfWidth * 0.18, 0.7);
  const nearHalfHeight = Math.max(halfHeight * 0.18, 0.45);
  const corners = [
    add(add(center, scale(right, -halfWidth)), scale(up, -halfHeight)),
    add(add(center, scale(right, halfWidth)), scale(up, -halfHeight)),
    add(add(center, scale(right, halfWidth)), scale(up, halfHeight)),
    add(add(center, scale(right, -halfWidth)), scale(up, halfHeight)),
  ];
  const nearCorners = [
    add(add(nearCenter, scale(right, -nearHalfWidth)), scale(up, -nearHalfHeight)),
    add(add(nearCenter, scale(right, nearHalfWidth)), scale(up, -nearHalfHeight)),
    add(add(nearCenter, scale(right, nearHalfWidth)), scale(up, nearHalfHeight)),
    add(add(nearCenter, scale(right, -nearHalfWidth)), scale(up, nearHalfHeight)),
  ];
  const lines = [];
  lines.push(...origin, ...center);
  for (const corner of corners) lines.push(...origin, ...corner);
  for (let i = 0; i < corners.length; i += 1) {
    lines.push(...corners[i], ...corners[(i + 1) % corners.length]);
    lines.push(...nearCorners[i], ...nearCorners[(i + 1) % nearCorners.length]);
    lines.push(...nearCorners[i], ...corners[i]);
  }
  return new Float32Array(lines);
}

function directionFromYawPitch(yawDegrees, pitchDegrees) {
  const yaw = (Number(yawDegrees) || 0) * Math.PI / 180;
  const pitch = (Number(pitchDegrees) || 0) * Math.PI / 180;
  const cp = Math.cos(pitch);
  return normalize([
    Math.sin(yaw) * cp,
    Math.sin(pitch),
    Math.cos(yaw) * cp,
  ]);
}
