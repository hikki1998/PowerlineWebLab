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
varying vec3 v_color;
void main() {
  gl_Position = u_matrix * vec4(a_position, 1.0);
  gl_PointSize = u_pointSize;
  v_color = a_color;
}`;

const FRAGMENT_SHADER = `
precision mediump float;
varying vec3 v_color;
void main() {
  vec2 d = gl_PointCoord - vec2(0.5);
  if (dot(d, d) > 0.25) discard;
  gl_FragColor = vec4(v_color, 1.0);
}`;

export class PointCloudRenderer {
  constructor(canvas, callbacks = {}) {
    this.canvas = canvas;
    this.callbacks = callbacks;
    this.gl = canvas.getContext("webgl2", { antialias: true, alpha: false })
      || canvas.getContext("webgl", { antialias: true, alpha: false });
    if (!this.gl) {
      throw new Error("当前浏览器不支持 WebGL，无法渲染点云。");
    }

    this.program = createProgram(this.gl, VERTEX_SHADER, FRAGMENT_SHADER);
    this.positionBuffer = this.gl.createBuffer();
    this.colorBuffer = this.gl.createBuffer();
    this.pointCount = 0;
    this.positions = new Float32Array();
    this.colors = new Uint8Array();
    this.pointSize = 2;
    this.mode = "orbit";
    this.measureMode = false;
    this.bounds = { min: [-1, -1, -1], max: [1, 1, 1] };
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

    this.attachEvents();
    this.resize();
    this.animate();
  }

  setPointSize(value) {
    this.pointSize = Number(value);
  }

  setMode(mode) {
    this.mode = mode;
  }

  setMeasureMode(enabled) {
    this.measureMode = enabled;
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
  }

  projectToScreen(point) {
    const clip = transformPoint(this.matrix, point);
    if (clip[3] <= 0 || clip[2] < -1 || clip[2] > 1) return null;
    return {
      x: (clip[0] * 0.5 + 0.5) * this.canvas.clientWidth,
      y: (-clip[1] * 0.5 + 0.5) * this.canvas.clientHeight,
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
    window.addEventListener("resize", () => this.resize());
    window.addEventListener("keydown", (event) => this.keys.add(event.key.toLowerCase()));
    window.addEventListener("keyup", (event) => this.keys.delete(event.key.toLowerCase()));

    this.canvas.addEventListener("contextmenu", (event) => event.preventDefault());
    this.canvas.addEventListener("pointerdown", (event) => {
      this.canvas.setPointerCapture(event.pointerId);
      this.pointer = { down: true, button: event.button, x: event.clientX, y: event.clientY };
      if (this.measureMode && event.button === 0) {
        const hit = this.pickPoint(event.clientX, event.clientY);
        if (hit && this.callbacks.onMeasurePick) this.callbacks.onMeasurePick(hit);
      }
    });
    this.canvas.addEventListener("pointerup", () => {
      this.pointer.down = false;
    });
    this.canvas.addEventListener("pointermove", (event) => {
      const dx = event.clientX - this.pointer.x;
      const dy = event.clientY - this.pointer.y;
      this.pointer.x = event.clientX;
      this.pointer.y = event.clientY;
      if (!this.pointer.down || this.measureMode) return;

      if (this.mode === "walk") {
        this.camera.flyYaw -= dx * 0.004;
        this.camera.flyPitch = clamp(this.camera.flyPitch - dy * 0.003, -1.35, 1.35);
        return;
      }

      if (this.pointer.button === 2 || event.shiftKey) {
        this.pan(dx, dy);
      } else {
        this.camera.yaw -= dx * 0.005;
        this.camera.pitch = clamp(this.camera.pitch - dy * 0.004, -1.45, 1.45);
      }
    });
    this.canvas.addEventListener("wheel", (event) => {
      event.preventDefault();
      if (this.mode === "walk") {
        const dir = this.flyDirection();
        this.camera.flyPosition = add(this.camera.flyPosition, scale(dir, event.deltaY > 0 ? -18 : 18));
      } else {
        const factor = event.deltaY > 0 ? 1.12 : 0.88;
        this.camera.distance = clamp(this.camera.distance * factor, 0.5, 1_000_000);
      }
    }, { passive: false });
  }

  pan(dx, dy) {
    const { right, up } = this.cameraBasis();
    const scaleFactor = this.camera.distance / Math.max(this.canvas.clientHeight, 1);
    this.camera.target = add(
      this.camera.target,
      add(scale(right, -dx * scaleFactor), scale(up, dy * scaleFactor)),
    );
  }

  updateWalk(deltaSeconds) {
    if (this.mode !== "walk") return;
    const speed = 120 * deltaSeconds * (this.keys.has("shift") ? 4 : 1);
    const dir = this.flyDirection();
    const right = normalize(cross(dir, [0, 1, 0]));
    let movement = [0, 0, 0];
    if (this.keys.has("w")) movement = add(movement, dir);
    if (this.keys.has("s")) movement = sub(movement, dir);
    if (this.keys.has("d")) movement = add(movement, right);
    if (this.keys.has("a")) movement = sub(movement, right);
    if (this.keys.has("e")) movement = add(movement, [0, 1, 0]);
    if (this.keys.has("q")) movement = sub(movement, [0, 1, 0]);
    if (length(movement) > 0) {
      this.camera.flyPosition = add(this.camera.flyPosition, scale(normalize(movement), speed));
    }
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

  flyDirection() {
    const cp = Math.cos(this.camera.flyPitch);
    return normalize([
      Math.sin(this.camera.flyYaw) * cp,
      Math.sin(this.camera.flyPitch),
      Math.cos(this.camera.flyYaw) * cp,
    ]);
  }

  currentViewProjection() {
    const aspect = Math.max(this.canvas.clientWidth / Math.max(this.canvas.clientHeight, 1), 0.1);
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
    const width = Math.max(1, Math.floor(this.canvas.clientWidth * dpr));
    const height = Math.max(1, Math.floor(this.canvas.clientHeight * dpr));
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
  }

  animate() {
    const now = performance.now();
    const delta = Math.min(0.05, (now - this.lastFrame) / 1000);
    this.lastFrame = now;
    this.updateWalk(delta);
    this.render();
    requestAnimationFrame(() => this.animate());
  }

  render() {
    this.resize();
    const gl = this.gl;
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clearColor(0.035, 0.043, 0.055, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);
    if (!this.pointCount) return;

    this.matrix = this.currentViewProjection();
    gl.useProgram(this.program);
    gl.uniformMatrix4fv(gl.getUniformLocation(this.program, "u_matrix"), false, new Float32Array(this.matrix));
    gl.uniform1f(gl.getUniformLocation(this.program, "u_pointSize"), this.pointSize * Math.min(window.devicePixelRatio || 1, 2));

    const positionLocation = gl.getAttribLocation(this.program, "a_position");
    gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
    gl.enableVertexAttribArray(positionLocation);
    gl.vertexAttribPointer(positionLocation, 3, gl.FLOAT, false, 0, 0);

    const colorLocation = gl.getAttribLocation(this.program, "a_color");
    gl.bindBuffer(gl.ARRAY_BUFFER, this.colorBuffer);
    gl.enableVertexAttribArray(colorLocation);
    gl.vertexAttribPointer(colorLocation, 3, gl.UNSIGNED_BYTE, true, 0, 0);

    gl.drawArrays(gl.POINTS, 0, this.pointCount);
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

