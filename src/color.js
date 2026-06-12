export const CLASS_NAMES = {
  0: "未分类",
  1: "未指定",
  2: "地面",
  3: "低植被",
  4: "中植被",
  5: "高植被",
  6: "建筑",
  7: "低点",
  8: "模型关键点",
  9: "水体",
  10: "铁路",
  11: "道路",
  12: "重叠",
  13: "导线",
  14: "杆塔",
  15: "杆塔结构",
  16: "线缆连接器",
  17: "桥面",
  18: "高噪声",
};

export const CLASS_COLORS = {
  0: [154, 164, 178],
  1: [185, 190, 199],
  2: [128, 106, 74],
  3: [120, 190, 96],
  4: [70, 160, 74],
  5: [30, 120, 56],
  6: [205, 194, 178],
  7: [235, 80, 80],
  8: [255, 208, 88],
  9: [72, 148, 230],
  10: [180, 180, 190],
  11: [96, 96, 105],
  12: [202, 152, 230],
  13: [255, 190, 60],
  14: [220, 120, 70],
  15: [210, 92, 130],
  16: [255, 145, 90],
  17: [170, 145, 120],
  18: [255, 70, 120],
};

const GRADIENT = [
  [38, 88, 184],
  [34, 167, 220],
  [90, 205, 150],
  [245, 210, 84],
  [232, 108, 74],
];

export function className(classification) {
  return CLASS_NAMES[classification] || `类别 ${classification}`;
}

export function classColor(classification) {
  return CLASS_COLORS[classification] || hashColor(classification);
}

function hashColor(value) {
  const hue = (value * 47) % 360;
  const c = 0.72;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = 0.22;
  let rgb;
  if (hue < 60) rgb = [c, x, 0];
  else if (hue < 120) rgb = [x, c, 0];
  else if (hue < 180) rgb = [0, c, x];
  else if (hue < 240) rgb = [0, x, c];
  else if (hue < 300) rgb = [x, 0, c];
  else rgb = [c, 0, x];
  return rgb.map((v) => Math.round((v + m) * 255));
}

export function elevationColor(value, min, max) {
  const span = Math.max(max - min, 1e-9);
  const t = Math.min(1, Math.max(0, (value - min) / span));
  const scaled = t * (GRADIENT.length - 1);
  const index = Math.min(GRADIENT.length - 2, Math.floor(scaled));
  const local = scaled - index;
  const a = GRADIENT[index];
  const b = GRADIENT[index + 1];
  return [
    Math.round(a[0] + (b[0] - a[0]) * local),
    Math.round(a[1] + (b[1] - a[1]) * local),
    Math.round(a[2] + (b[2] - a[2]) * local),
  ];
}

export function buildColors(cloud, state) {
  const { displayMode, elevationMin, elevationMax, visibleClasses, clip } = state;
  const positions = cloud.positions;
  const sourceColors = cloud.rgb;
  const outPositions = [];
  const outColors = [];
  const count = positions.length / 3;

  for (let i = 0; i < count; i += 1) {
    const cls = cloud.classifications[i];
    if (visibleClasses && !visibleClasses.has(cls)) continue;

    const z = cloud.elevations[i];
    if (z < elevationMin || z > elevationMax) continue;

    const px = positions[i * 3];
    const py = positions[i * 3 + 1];
    const pz = positions[i * 3 + 2];
    if (clip) {
      if (px < clip.minX || px > clip.maxX) continue;
      if (py < clip.minY || py > clip.maxY) continue;
      if (pz < clip.minZ || pz > clip.maxZ) continue;
    }

    outPositions.push(px, py, pz);

    let color;
    if (displayMode === "rgb" && sourceColors) {
      color = [
        sourceColors[i * 3],
        sourceColors[i * 3 + 1],
        sourceColors[i * 3 + 2],
      ];
    } else if (displayMode === "classification") {
      color = classColor(cls);
    } else {
      color = elevationColor(z, elevationMin, elevationMax);
    }
    outColors.push(color[0], color[1], color[2]);
  }

  return {
    positions: new Float32Array(outPositions),
    colors: new Uint8Array(outColors),
    count: outPositions.length / 3,
  };
}

