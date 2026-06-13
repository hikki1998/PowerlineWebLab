export const CLASS_NAMES = {
  0: "创建点、未分类",
  1: "未分类点",
  2: "地面点",
  3: "低矮植被点",
  4: "中等植被点",
  5: "高植被点",
  6: "建筑物点",
  7: "低点",
  8: "模型关键点",
  9: "临时建筑物",
  10: "桥梁",
  11: "铁路",
  12: "公路",
  13: "不通航河流",
  14: "湖泊",
  15: "变电站",
  16: "导线",
  17: "杆塔",
  18: "交叉跨越上",
  19: "交叉跨越下",
  20: "地线",
  21: "其他",
  22: "船舶/汽车",
  23: "其他线路",
  24: "建在线下的",
  25: "通航河流",
  26: "铁路承力索及接触线",
  27: "绝缘子",
  28: "引流线",
  29: "塔身",
  30: "Reserved30",
  31: "垂落区域",
};

export const CLASS_COLORS = {
  0: [148, 163, 184],
  1: [100, 116, 139],
  2: [146, 108, 74],
  3: [190, 242, 100],
  4: [74, 222, 128],
  5: [22, 163, 74],
  6: [251, 146, 60],
  7: [239, 68, 68],
  8: [140, 16, 255],
  9: [14, 165, 233],
  10: [101, 120, 173],
  11: [96, 96, 96],
  12: [120, 120, 120],
  13: [168, 85, 247],
  14: [28, 126, 214],
  15: [171, 71, 188],
  16: [255, 128, 0],
  17: [96, 96, 96],
  18: [255, 150, 204],
  19: [255, 124, 124],
  20: [255, 142, 10],
  21: [188, 188, 188],
  22: [77, 182, 172],
  23: [0, 150, 136],
  24: [121, 85, 72],
  25: [3, 169, 244],
  26: [255, 193, 7],
  27: [255, 194, 52],
  28: [245, 192, 192],
  29: [86, 86, 86],
  30: [176, 176, 176],
  31: [233, 30, 99],
};

const GRADIENT = [
  [38, 88, 184],
  [34, 167, 220],
  [90, 205, 150],
  [245, 210, 84],
  [232, 108, 74],
];

export function className(classification) {
  return CLASS_NAMES[classification] || "其他/未知";
}

export function classColor(classification) {
  return CLASS_COLORS[classification] || [255, 85, 0];
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
  const { displayMode, elevationMin, elevationMax, visibleClasses, classColors, clip } = state;
  const positions = cloud.positions;
  const sourceColors = cloud.rgb;
  const count = positions.length / 3;
  const outPositions = new Float32Array(positions.length);
  const outColors = new Uint8Array(count * 3);
  let dst = 0;

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

    outPositions[dst * 3] = px;
    outPositions[dst * 3 + 1] = py;
    outPositions[dst * 3 + 2] = pz;

    let color;
    if (displayMode === "rgb" && sourceColors) {
      color = [
        sourceColors[i * 3],
        sourceColors[i * 3 + 1],
        sourceColors[i * 3 + 2],
      ];
    } else if (displayMode === "classification") {
      color = classColors?.get(cls) || classColor(cls);
    } else {
      color = elevationColor(z, elevationMin, elevationMax);
    }
    outColors[dst * 3] = color[0];
    outColors[dst * 3 + 1] = color[1];
    outColors[dst * 3 + 2] = color[2];
    dst += 1;
  }

  return {
    positions: outPositions.slice(0, dst * 3),
    colors: outColors.slice(0, dst * 3),
    count: dst,
  };
}
