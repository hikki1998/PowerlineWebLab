export function parseInspectionRoute(input, fileName = "inspection-route.json") {
  const data = typeof input === "string" ? JSON.parse(input) : input;
  if (!data || typeof data !== "object") {
    throw new Error("航线 JSON 根节点必须是对象。");
  }
  const points = requireArray(data.points, "points");
  const powerline = data.powerline;
  if (!powerline || typeof powerline !== "object") {
    throw new Error("航线 JSON 缺少 powerline 对象。");
  }
  const waypoints = requireArray(powerline.waypoint, "powerline.waypoint");
  if (points.length !== waypoints.length) {
    throw new Error(`points.length (${points.length}) 必须等于 powerline.waypoint.length (${waypoints.length})。`);
  }

  const partPoints = requireArray(powerline.keyPoint, "powerline.keyPoint").map(normalizePartPoint);
  const partById = new Map(partPoints.map((part) => [String(part.fileId), part]));
  const normalizedWaypoints = points.map((point, index) => {
    const waypoint = { ...point, ...waypoints[index] };
    const mainPart = partById.get(String(waypoint.keyID));
    const captureTargets = normalizeCaptureTargets(point, waypoints[index], partById);
    const label = waypointLabel(index, waypoint, captureTargets, mainPart);
    return {
      sequenceIndex: index,
      keyID: waypoint.keyID,
      towerName: waypoint.towerName,
      SIMainWayPointType: waypoint.SIMainWayPointType,
      lng: numberOrNull(waypoint.lng),
      lat: numberOrNull(waypoint.lat),
      dh: numberOrNull(waypoint.dh),
      height: numberOrNull(waypoint.height),
      aircraftYaw: numberOrNull(waypoint.aircraftYaw),
      gimbalPitch: numberOrNull(waypoint.gimbalPitch),
      pX: requireNumber(waypoint.pX, `waypoint[${index}].pX`),
      pY: requireNumber(waypoint.pY, `waypoint[${index}].pY`),
      pZ: requireNumber(waypoint.pZ, `waypoint[${index}].pZ`),
      mainPart,
      captureTargets,
      label,
      rawPoint: point,
      rawWaypoint: waypoints[index],
    };
  });

  const route = {
    root: data,
    fileName,
    taskname: data.taskname,
    date: data.date,
    updateTime: data.updateTime,
    points,
    powerline,
    parts: partPoints,
    waypointObjects: normalizedWaypoints,
    render: buildRenderData(normalizedWaypoints, partPoints),
  };
  route.bounds = routeBounds(route.render);
  return route;
}

export function rebuildInspectionRoute(route) {
  return parseInspectionRoute(route.root, route.fileName);
}

export function exportInspectionRouteJson(route) {
  return JSON.stringify(route.root, null, 2);
}

export function updateWaypointFields(route, index, fields) {
  const point = route.root.points[index];
  const waypoint = route.root.powerline.waypoint[index];
  if (!point || !waypoint) throw new Error("航点索引无效。");
  for (const [key, value] of Object.entries(fields)) {
    if (["pX", "pY", "pZ", "lng", "lat", "dh", "height", "aircraftYaw", "gimbalPitch"].includes(key)) {
      const next = numericValue(value);
      waypoint[key] = next;
      point[key] = next;
    } else {
      waypoint[key] = value;
      point[key] = value;
    }
  }
}

export function addWaypoint(route, sourceIndex = route.root.points.length - 1) {
  const sourcePoint = route.root.points[sourceIndex] || {};
  const sourceWaypoint = route.root.powerline.waypoint[sourceIndex] || {};
  const nextIndex = route.root.points.length;
  const point = structuredCloneCompat(sourcePoint);
  const waypoint = structuredCloneCompat(sourceWaypoint);
  point.towerName = `${point.towerName || "WP"} 副本`;
  waypoint.towerName = point.towerName;
  waypoint.pX = numericValue(waypoint.pX) + 5;
  waypoint.pY = numericValue(waypoint.pY) + 5;
  waypoint.pZ = numericValue(waypoint.pZ);
  point.keyID = waypoint.keyID ?? point.keyID ?? "";
  waypoint.keyID = point.keyID;
  point.SIMainWayPointType = waypoint.SIMainWayPointType ?? point.SIMainWayPointType ?? 0;
  waypoint.SIMainWayPointType = point.SIMainWayPointType;
  point.yawPitchArray = Array.isArray(point.yawPitchArray) ? structuredCloneCompat(point.yawPitchArray) : [];
  waypoint.yawPitchArray = Array.isArray(waypoint.yawPitchArray) ? structuredCloneCompat(waypoint.yawPitchArray) : [];
  route.root.points.splice(nextIndex, 0, point);
  route.root.powerline.waypoint.splice(nextIndex, 0, waypoint);
  return nextIndex;
}

export function deleteWaypoint(route, index) {
  if (route.root.points.length <= 1) throw new Error("至少保留一个航点。");
  route.root.points.splice(index, 1);
  route.root.powerline.waypoint.splice(index, 1);
}

export function updatePartFields(route, index, fields) {
  const part = route.root.powerline.keyPoint[index];
  if (!part) throw new Error("部件索引无效。");
  for (const [key, value] of Object.entries(fields)) {
    if (["index", "lng", "lat", "dh", "pX", "pY", "pZ"].includes(key)) part[key] = numericValue(value);
    else part[key] = value;
  }
}

export function addPart(route) {
  const parts = route.root.powerline.keyPoint;
  const last = parts.at(-1) || {};
  const nextIndex = parts.length;
  const part = {
    ...structuredCloneCompat(last),
    index: nextIndex,
    ID: `part-${Date.now()}`,
    partName: "新部件",
    pX: numericValue(last.pX) + 5,
    pY: numericValue(last.pY) + 5,
    pZ: numericValue(last.pZ),
  };
  parts.push(part);
  return nextIndex;
}

export function deletePart(route, index) {
  const part = route.root.powerline.keyPoint[index];
  if (!part) return;
  const id = String(part.ID);
  route.root.powerline.keyPoint.splice(index, 1);
  for (const point of route.root.points) {
    point.yawPitchArray = (point.yawPitchArray || []).filter((target) => String(target.photoKeyID ?? target.keyID) !== id);
  }
  for (const waypoint of route.root.powerline.waypoint) {
    waypoint.yawPitchArray = (waypoint.yawPitchArray || []).filter((target) => String(target.photoKeyID ?? target.keyID) !== id);
  }
}

export function updateTargetFields(route, waypointIndex, targetIndex, fields) {
  const { pointTarget, waypointTarget } = ensureTarget(route, waypointIndex, targetIndex);
  for (const [key, value] of Object.entries(fields)) {
    const next = ["keyPosX", "keyPosY", "keyPosZ", "cameraYaw", "cameraPitch", "FocalLengthRatio"].includes(key)
      ? numericValue(value)
      : value;
    pointTarget[key] = next;
    waypointTarget[key] = next;
  }
}

export function addTarget(route, waypointIndex) {
  const point = route.root.points[waypointIndex];
  const waypoint = route.root.powerline.waypoint[waypointIndex];
  if (!point || !waypoint) throw new Error("航点索引无效。");
  const part = route.root.powerline.keyPoint[0] || {};
  const target = {
    photoKeyID: part.ID ?? "",
    keyID: part.ID ?? "",
    photoKeyName: part.partName ?? "新目标",
    keyName: part.partName ?? "新目标",
    keyPosX: numericValue(part.pX),
    keyPosY: numericValue(part.pY),
    keyPosZ: numericValue(part.pZ),
    cameraYaw: 0,
    cameraPitch: -35,
    FocalLengthRatio: 1,
  };
  point.yawPitchArray = Array.isArray(point.yawPitchArray) ? point.yawPitchArray : [];
  waypoint.yawPitchArray = Array.isArray(waypoint.yawPitchArray) ? waypoint.yawPitchArray : [];
  point.yawPitchArray.push({ ...target });
  waypoint.yawPitchArray.push({ ...target });
  return point.yawPitchArray.length - 1;
}

export function deleteTarget(route, waypointIndex, targetIndex) {
  const pointTargets = route.root.points[waypointIndex]?.yawPitchArray;
  const waypointTargets = route.root.powerline.waypoint[waypointIndex]?.yawPitchArray;
  if (Array.isArray(pointTargets)) pointTargets.splice(targetIndex, 1);
  if (Array.isArray(waypointTargets)) waypointTargets.splice(targetIndex, 1);
}

export function routeToCloudLocal(route, cloudCenter) {
  if (!route || !Array.isArray(cloudCenter)) return route;
  const convert = ([x, y, z]) => [
    x - cloudCenter[0],
    z - cloudCenter[2],
    -(y - cloudCenter[1]),
  ];
  const render = {
    ...route.render,
    waypoints: route.render.waypoints.map(convert),
    partPoints: route.render.partPoints.map(convert),
    waypointTargetPoints: route.render.waypointTargetPoints.map((targets) => targets.map(convert)),
  };
  return {
    ...route,
    displayMode: "cloud-local",
    sourceBounds: route.bounds,
    render,
    bounds: routeBounds(render),
  };
}

function normalizePartPoint(part) {
  return {
    partIndex: part.index,
    fileId: part.ID,
    partName: part.partName,
    lng: numberOrNull(part.lng),
    lat: numberOrNull(part.lat),
    dh: numberOrNull(part.dh),
    pX: requireNumber(part.pX, `keyPoint[${part.index ?? "?"}].pX`),
    pY: requireNumber(part.pY, `keyPoint[${part.index ?? "?"}].pY`),
    pZ: requireNumber(part.pZ, `keyPoint[${part.index ?? "?"}].pZ`),
    raw: part,
  };
}

function ensureTarget(route, waypointIndex, targetIndex) {
  const point = route.root.points[waypointIndex];
  const waypoint = route.root.powerline.waypoint[waypointIndex];
  if (!point || !waypoint) throw new Error("航点索引无效。");
  point.yawPitchArray = Array.isArray(point.yawPitchArray) ? point.yawPitchArray : [];
  waypoint.yawPitchArray = Array.isArray(waypoint.yawPitchArray) ? waypoint.yawPitchArray : [];
  while (point.yawPitchArray.length <= targetIndex) point.yawPitchArray.push({});
  while (waypoint.yawPitchArray.length <= targetIndex) waypoint.yawPitchArray.push({});
  return {
    pointTarget: point.yawPitchArray[targetIndex],
    waypointTarget: waypoint.yawPitchArray[targetIndex],
  };
}

function numericValue(value) {
  if (value === "" || value === null || value === undefined) return 0;
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function structuredCloneCompat(value) {
  return JSON.parse(JSON.stringify(value ?? {}));
}

function normalizeCaptureTargets(point, waypoint, partById) {
  const topTargets = Array.isArray(point?.yawPitchArray) ? point.yawPitchArray : [];
  const localTargets = Array.isArray(waypoint?.yawPitchArray) ? waypoint.yawPitchArray : [];
  const count = Math.max(topTargets.length, localTargets.length);
  const targets = [];
  for (let index = 0; index < count; index += 1) {
    const target = { ...(topTargets[index] || {}), ...(localTargets[index] || {}) };
    const partId = target.photoKeyID ?? target.keyID;
    const part = partById.get(String(partId));
    const targetPosition = targetLocalPosition(target, part);
    if (!targetPosition) continue;
    targets.push({
      targetIndex: index,
      part,
      partIndex: part?.partIndex ?? null,
      fileId: part?.fileId ?? partId ?? null,
      partName: target.photoKeyName || target.keyName || part?.partName || "未知目标",
      pX: targetPosition[0],
      pY: targetPosition[1],
      pZ: targetPosition[2],
      cameraYaw: numberOrNull(target.cameraYaw ?? target.yaw),
      cameraPitch: numberOrNull(target.cameraPitch ?? target.pitch),
      FocalLengthRatio: numberOrNull(target.FocalLengthRatio ?? target.focalLengthRatio),
      label: target.photoKeyName || target.keyName || part?.partName || "未知目标",
      raw: target,
    });
  }
  return targets;
}

function targetLocalPosition(target, part) {
  const hasTargetPosition = hasNumber(target.keyPosX) && hasNumber(target.keyPosY) && hasNumber(target.keyPosZ);
  if (hasTargetPosition) {
    const position = [Number(target.keyPosX), Number(target.keyPosY), Number(target.keyPosZ)];
    if (position.some((value) => value !== 0)) return position;
  }
  if (part) return [part.pX, part.pY, part.pZ];
  return null;
}

function waypointLabel(index, waypoint, captureTargets, mainPart) {
  if (captureTargets[0]?.partName) return captureTargets[0].partName;
  if (mainPart?.partName) return mainPart.partName;
  if (isAuxWaypoint(waypoint.SIMainWayPointType)) return `AUX ${index + 1}`;
  return `WP ${index + 1}`;
}

function buildRenderData(waypoints, partPoints) {
  return {
    waypoints: waypoints.map((point) => [point.pX, point.pY, point.pZ]),
    waypointLabels: waypoints.map((point) => point.label),
    partPoints: partPoints.map((point) => [point.pX, point.pY, point.pZ]),
    partLabels: partPoints.map((point) => point.partName || String(point.fileId ?? point.partIndex)),
    waypointTargetPoints: waypoints.map((point) => point.captureTargets.map((target) => [target.pX, target.pY, target.pZ])),
    waypointTargetMeta: waypoints.map((point) => point.captureTargets.map((target) => ({
      partIndex: target.partIndex,
      cameraYaw: target.cameraYaw,
      cameraPitch: target.cameraPitch,
      focalLengthRatio: target.FocalLengthRatio,
      label: target.label,
    }))),
  };
}

function routeBounds(render) {
  const all = [
    ...render.waypoints,
    ...render.partPoints,
    ...render.waypointTargetPoints.flat(),
  ];
  if (!all.length) return { min: [-1, -1, -1], max: [1, 1, 1] };
  const bounds = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
  for (const point of all) {
    for (let axis = 0; axis < 3; axis += 1) {
      bounds.min[axis] = Math.min(bounds.min[axis], point[axis]);
      bounds.max[axis] = Math.max(bounds.max[axis], point[axis]);
    }
  }
  return bounds;
}

function isAuxWaypoint(type) {
  const value = String(type ?? "").toLowerCase();
  return value === "0" || value.includes("aux") || value.includes("辅助");
}

function requireArray(value, name) {
  if (!Array.isArray(value)) throw new Error(`航线 JSON 缺少数组 ${name}。`);
  return value;
}

function requireNumber(value, name) {
  if (!hasNumber(value)) throw new Error(`${name} 必须是有效数字。`);
  return Number(value);
}

function numberOrNull(value) {
  return hasNumber(value) ? Number(value) : null;
}

function hasNumber(value) {
  return value !== null && value !== undefined && value !== "" && Number.isFinite(Number(value));
}
