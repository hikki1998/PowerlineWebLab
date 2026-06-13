export const DEFAULT_WIRE_CLASSES = [16, 20, 23, 26, 28];
export const DEFAULT_OBSTACLE_CLASSES = [2, 3, 4, 5, 6, 9, 12, 18, 19, 21, 22, 24, 25, 31];

export function analyzeClearance(cloud, options = {}) {
  const positions = cloud?.positions || new Float32Array();
  const classifications = cloud?.classifications || new Uint8Array();
  const radius = Number(options.radius ?? 3);
  const threshold = Number(options.threshold ?? 8);
  const maxWireChecks = Number(options.maxWireChecks ?? 80_000);
  const wireClasses = new Set(options.wireClasses || DEFAULT_WIRE_CLASSES);
  const obstacleClasses = new Set(options.obstacleClasses || DEFAULT_OBSTACLE_CLASSES);
  const cellSize = Math.max(radius, 0.5);
  const grid = new Map();
  const total = Math.min(positions.length / 3, classifications.length);
  let wireCount = 0;
  let obstacleCount = 0;

  for (let i = 0; i < total; i += 1) {
    const cls = classifications[i];
    if (wireClasses.has(cls)) wireCount += 1;
    if (!obstacleClasses.has(cls)) continue;
    obstacleCount += 1;
    const point = [positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]];
    const key = gridKey(point[0], point[2], cellSize);
    const bucket = grid.get(key) || [];
    bucket.push({ index: i, point, cls });
    grid.set(key, bucket);
  }

  const wireStride = Math.max(1, Math.ceil(wireCount / Math.max(maxWireChecks, 1)));
  let visitedWire = 0;
  let checkedWire = 0;
  let minClearance = Infinity;
  let minPair = null;
  const risks = [];

  for (let i = 0; i < total; i += 1) {
    const wireCls = classifications[i];
    if (!wireClasses.has(wireCls)) continue;
    visitedWire += 1;
    if ((visitedWire - 1) % wireStride !== 0) continue;
    const wire = [positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]];
    const nearest = nearestObstacleBelow(wire, grid, cellSize, radius);
    if (!nearest) continue;
    checkedWire += 1;
    const clearance = wire[1] - nearest.point[1];
    if (clearance < minClearance) {
      minClearance = clearance;
      minPair = { wire, obstacle: nearest.point, wireClass: wireCls, obstacleClass: nearest.cls, clearance };
    }
    if (clearance <= threshold) {
      risks.push({ wire, obstacle: nearest.point, wireClass: wireCls, obstacleClass: nearest.cls, clearance });
    }
  }

  risks.sort((a, b) => a.clearance - b.clearance);
  return {
    radius,
    threshold,
    wireCount,
    obstacleCount,
    checkedWire,
    minClearance,
    minPair,
    risks: risks.slice(0, options.maxRisks ?? 200),
  };
}

function nearestObstacleBelow(wire, grid, cellSize, radius) {
  const cx = Math.floor(wire[0] / cellSize);
  const cz = Math.floor(wire[2] / cellSize);
  const range = Math.max(1, Math.ceil(radius / cellSize));
  let best = null;
  let bestHorizontal = Infinity;
  for (let ix = cx - range; ix <= cx + range; ix += 1) {
    for (let iz = cz - range; iz <= cz + range; iz += 1) {
      const bucket = grid.get(`${ix},${iz}`);
      if (!bucket) continue;
      for (const item of bucket) {
        if (item.point[1] > wire[1]) continue;
        const horizontal = Math.hypot(item.point[0] - wire[0], item.point[2] - wire[2]);
        if (horizontal <= radius && horizontal < bestHorizontal) {
          bestHorizontal = horizontal;
          best = item;
        }
      }
    }
  }
  return best;
}

function gridKey(x, z, cellSize) {
  return `${Math.floor(x / cellSize)},${Math.floor(z / cellSize)}`;
}
