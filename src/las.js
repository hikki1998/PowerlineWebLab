const HEADER = {
  signature: 0,
  versionMajor: 24,
  versionMinor: 25,
  headerSize: 94,
  pointDataOffset: 96,
  pointFormat: 104,
  pointRecordLength: 105,
  legacyPointCount: 107,
  scaleX: 131,
  scaleY: 139,
  scaleZ: 147,
  offsetX: 155,
  offsetY: 163,
  offsetZ: 171,
  maxX: 179,
  minX: 187,
  maxY: 195,
  minY: 203,
  maxZ: 211,
  minZ: 219,
  extendedPointCount: 247,
};

const SUPPORTED_FORMATS = new Set([0, 1, 2, 3, 5, 6, 7, 8, 10]);

export function readLasHeader(arrayBuffer, fileName = "local.las", fileSize = arrayBuffer.byteLength) {
  const view = new DataView(arrayBuffer);
  if (view.byteLength < 227) {
    throw new Error("文件太小，不像有效的 LAS 文件。");
  }
  if (readAscii(view, HEADER.signature, 4) !== "LASF") {
    throw new Error("没有找到 LASF 文件签名。");
  }

  const versionMajor = view.getUint8(HEADER.versionMajor);
  const versionMinor = view.getUint8(HEADER.versionMinor);
  const headerSize = view.getUint16(HEADER.headerSize, true);
  const pointDataOffset = view.getUint32(HEADER.pointDataOffset, true);
  const pointFormatRaw = view.getUint8(HEADER.pointFormat);
  const pointFormat = pointFormatRaw & 0x3f;
  const pointRecordLength = view.getUint16(HEADER.pointRecordLength, true);
  let pointCount = view.getUint32(HEADER.legacyPointCount, true);

  if (pointCount === 0 && view.byteLength >= HEADER.extendedPointCount + 8) {
    const extended = view.getBigUint64(HEADER.extendedPointCount, true);
    pointCount = Number(extended > BigInt(Number.MAX_SAFE_INTEGER) ? BigInt(Number.MAX_SAFE_INTEGER) : extended);
  }

  const scale = [
    view.getFloat64(HEADER.scaleX, true),
    view.getFloat64(HEADER.scaleY, true),
    view.getFloat64(HEADER.scaleZ, true),
  ];
  const offset = [
    view.getFloat64(HEADER.offsetX, true),
    view.getFloat64(HEADER.offsetY, true),
    view.getFloat64(HEADER.offsetZ, true),
  ];
  const bounds = {
    min: [
      view.getFloat64(HEADER.minX, true),
      view.getFloat64(HEADER.minY, true),
      view.getFloat64(HEADER.minZ, true),
    ],
    max: [
      view.getFloat64(HEADER.maxX, true),
      view.getFloat64(HEADER.maxY, true),
      view.getFloat64(HEADER.maxZ, true),
    ],
  };

  const availableRecords = Math.max(0, Math.floor((fileSize - pointDataOffset) / pointRecordLength));
  const usablePointCount = Math.min(pointCount || availableRecords, availableRecords);
  const layout = pointLayout(pointFormat, pointRecordLength);

  return {
    fileName,
    version: `${versionMajor}.${versionMinor}`,
    headerSize,
    pointDataOffset,
    pointFormat,
    pointFormatRaw,
    pointRecordLength,
    pointCount: usablePointCount,
    declaredPointCount: pointCount,
    availableRecords,
    scale,
    offset,
    bounds,
    hasRgb: layout.rgbOffset >= 0,
    hasClassification: layout.classificationOffset >= 0,
    layout,
  };
}

export async function parseLas(arrayBuffer, options = {}, onProgress = () => {}) {
  const maxRenderPoints = options.maxRenderPoints || 2_000_000;
  const memoryLimitBytes = options.memoryLimitBytes || 1_250_000_000;
  const fileName = options.fileName || "local.las";

  if (arrayBuffer.byteLength > memoryLimitBytes) {
    throw new Error(`文件大小 ${(arrayBuffer.byteLength / 1024 / 1024).toFixed(1)} MB，超过当前浏览器安全解析预算。`);
  }

  const view = new DataView(arrayBuffer);
  const header = readLasHeader(arrayBuffer, fileName);
  if (!SUPPORTED_FORMATS.has(header.pointFormat)) {
    throw new Error(`暂不支持 LAS 点格式 ${header.pointFormat}。`);
  }
  if (header.pointCount <= 0) {
    throw new Error("没有可读取的点记录。");
  }

  const stride = Math.max(1, Math.ceil(header.pointCount / maxRenderPoints));
  const renderCount = Math.ceil(header.pointCount / stride);
  const positions = new Float32Array(renderCount * 3);
  const elevations = new Float32Array(renderCount);
  const classifications = new Uint8Array(renderCount);
  const intensities = new Uint16Array(renderCount);
  const rgb = header.hasRgb ? new Uint8Array(renderCount * 3) : null;
  const classCounts = new Map();
  const center = [
    midpoint(header.bounds.min[0], header.bounds.max[0]),
    midpoint(header.bounds.min[1], header.bounds.max[1]),
    midpoint(header.bounds.min[2], header.bounds.max[2]),
  ];

  const localBounds = {
    min: [Infinity, Infinity, Infinity],
    max: [-Infinity, -Infinity, -Infinity],
  };
  let dst = 0;

  for (let src = 0; src < header.pointCount; src += stride) {
    const base = header.pointDataOffset + src * header.pointRecordLength;
    if (base + header.pointRecordLength > view.byteLength) break;

    const rawX = view.getInt32(base, true);
    const rawY = view.getInt32(base + 4, true);
    const rawZ = view.getInt32(base + 8, true);
    const x = rawX * header.scale[0] + header.offset[0];
    const y = rawY * header.scale[1] + header.offset[1];
    const z = rawZ * header.scale[2] + header.offset[2];
    const px = x - center[0];
    const py = z - center[2];
    const pz = -(y - center[1]);

    positions[dst * 3] = px;
    positions[dst * 3 + 1] = py;
    positions[dst * 3 + 2] = pz;
    elevations[dst] = z;
    intensities[dst] = safeUint16(view, base + 12);

    const cls = header.layout.classificationOffset >= 0 ? view.getUint8(base + header.layout.classificationOffset) : 0;
    classifications[dst] = cls;
    classCounts.set(cls, (classCounts.get(cls) || 0) + 1);

    if (rgb) {
      const ro = base + header.layout.rgbOffset;
      const r = safeUint16(view, ro);
      const g = safeUint16(view, ro + 2);
      const b = safeUint16(view, ro + 4);
      rgb[dst * 3] = clampColor(r);
      rgb[dst * 3 + 1] = clampColor(g);
      rgb[dst * 3 + 2] = clampColor(b);
    }

    expand(localBounds, px, py, pz);
    dst += 1;

    if (dst % 100_000 === 0) {
      onProgress({ phase: "parse", loaded: Math.min(src + 1, header.pointCount), total: header.pointCount });
      await yieldToUi();
    }
  }

  const finalPositions = dst === renderCount ? positions : positions.slice(0, dst * 3);
  const finalElevations = dst === renderCount ? elevations : elevations.slice(0, dst);
  const finalClassifications = dst === renderCount ? classifications : classifications.slice(0, dst);
  const finalIntensities = dst === renderCount ? intensities : intensities.slice(0, dst);
  const finalRgb = rgb ? (dst === renderCount ? rgb : rgb.slice(0, dst * 3)) : null;

  return {
    header,
    positions: finalPositions,
    elevations: finalElevations,
    classifications: finalClassifications,
    intensities: finalIntensities,
    rgb: finalRgb,
    classCounts,
    localBounds,
    center,
    sourceBounds: header.bounds,
    sourcePointCount: header.pointCount,
    renderedPointCount: dst,
    stride,
    sampled: stride > 1,
    warnings: buildWarnings(header, stride, dst),
  };
}

export function createSyntheticCloud(count = 180_000) {
  const positions = new Float32Array(count * 3);
  const elevations = new Float32Array(count);
  const classifications = new Uint8Array(count);
  const intensities = new Uint16Array(count);
  const rgb = new Uint8Array(count * 3);
  const classCounts = new Map();
  const localBounds = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };

  for (let i = 0; i < count; i += 1) {
    const line = i % 7;
    const t = (i / count) * 2 - 1;
    const jitter = pseudoRandom(i) - 0.5;
    const x = t * 360 + jitter * 8;
    const y = line < 3 ? 45 + Math.sin(t * Math.PI * 4 + line) * 8 : pseudoRandom(i + 8) * 55;
    const z = line < 3 ? (line - 1) * 12 + jitter * 1.5 : (pseudoRandom(i + 3) - 0.5) * 150;
    const cls = line < 3 ? 13 : (line === 3 ? 14 : (pseudoRandom(i + 9) > 0.72 ? 5 : 2));

    positions[i * 3] = x;
    positions[i * 3 + 1] = y;
    positions[i * 3 + 2] = z;
    elevations[i] = y;
    classifications[i] = cls;
    intensities[i] = Math.round(30000 + pseudoRandom(i + 4) * 20000);
    classCounts.set(cls, (classCounts.get(cls) || 0) + 1);
    rgb[i * 3] = cls === 13 ? 245 : 120;
    rgb[i * 3 + 1] = cls === 2 ? 130 : 190;
    rgb[i * 3 + 2] = cls === 5 ? 90 : 80;
    expand(localBounds, x, y, z);
  }

  return {
    header: {
      fileName: "synthetic-powerline.las",
      version: "synthetic",
      pointFormat: 3,
      pointRecordLength: 34,
      hasRgb: true,
      bounds: { min: [-360, -80, 0], max: [360, 80, 70] },
    },
    positions,
    elevations,
    classifications,
    intensities,
    rgb,
    classCounts,
    localBounds,
    center: [0, 0, 0],
    sourceBounds: { min: [-360, -80, 0], max: [360, 80, 70] },
    sourcePointCount: count,
    renderedPointCount: count,
    stride: 1,
    sampled: false,
    warnings: [],
  };
}

function pointLayout(pointFormat, pointRecordLength) {
  const classificationOffset = pointFormat >= 6 ? 16 : 15;
  let rgbOffset = -1;
  if (pointFormat === 2) rgbOffset = 20;
  if (pointFormat === 3 || pointFormat === 5) rgbOffset = 28;
  if (pointFormat === 7 || pointFormat === 8 || pointFormat === 10) rgbOffset = 30;

  if (classificationOffset >= pointRecordLength) {
    return { classificationOffset: -1, rgbOffset: -1 };
  }
  if (rgbOffset >= 0 && rgbOffset + 6 > pointRecordLength) {
    rgbOffset = -1;
  }
  return { classificationOffset, rgbOffset };
}

function buildWarnings(header, stride, renderedPointCount) {
  const warnings = [];
  if (header.declaredPointCount && header.availableRecords < header.declaredPointCount) {
    warnings.push("文件可用点记录少于头部声明点数，已按实际可读记录处理。");
  }
  if (stride > 1) {
    warnings.push(`原始点数较大，已按 1/${stride} 抽样渲染。`);
  }
  if (!header.hasRgb) {
    warnings.push("当前 LAS 点格式不包含 RGB，RGB 显示模式不可用。");
  }
  if (renderedPointCount === 0) {
    warnings.push("没有成功读取到可渲染点。");
  }
  return warnings;
}

function midpoint(a, b) {
  return Number.isFinite(a) && Number.isFinite(b) ? (a + b) / 2 : 0;
}

function readAscii(view, offset, length) {
  let out = "";
  for (let i = 0; i < length; i += 1) {
    out += String.fromCharCode(view.getUint8(offset + i));
  }
  return out;
}

function safeUint16(view, offset) {
  return offset + 2 <= view.byteLength ? view.getUint16(offset, true) : 0;
}

function clampColor(value) {
  const normalized = value > 255 ? Math.round(value / 257) : value;
  return Math.max(0, Math.min(255, normalized));
}

function expand(bounds, x, y, z) {
  bounds.min[0] = Math.min(bounds.min[0], x);
  bounds.min[1] = Math.min(bounds.min[1], y);
  bounds.min[2] = Math.min(bounds.min[2], z);
  bounds.max[0] = Math.max(bounds.max[0], x);
  bounds.max[1] = Math.max(bounds.max[1], y);
  bounds.max[2] = Math.max(bounds.max[2], z);
}

function pseudoRandom(seed) {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

function yieldToUi() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}
