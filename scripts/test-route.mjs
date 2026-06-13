import {
  addTarget,
  addWaypoint,
  exportInspectionRouteJson,
  parseInspectionRoute,
  rebuildInspectionRoute,
  routeToCloudLocal,
  updateTargetFields,
  updateWaypointFields,
} from "../public/viewer/src/route.js";

const fixture = {
  taskname: "巡检任务 A",
  date: "2026-06-13",
  updateTime: "2026-06-13 09:30:00",
  points: [
    {
      keyID: "wire-1",
      towerName: "T001",
      SIMainWayPointType: 1,
      yawPitchArray: [
        { photoKeyID: "wire-1", photoKeyName: "导线 A", keyPosX: 0, keyPosY: 0, keyPosZ: 0, cameraYaw: 12, cameraPitch: -35, FocalLengthRatio: 2 },
      ],
    },
    {
      keyID: "tower-1",
      towerName: "T002",
      SIMainWayPointType: 0,
      yawPitchArray: [
        { keyID: "tower-1", keyName: "杆塔主材", keyPosX: 16, keyPosY: 6, keyPosZ: 3, cameraYaw: 90 },
      ],
    },
  ],
  powerline: {
    keyPoint: [
      { index: 0, ID: "wire-1", partName: "导线部件", lng: 114, lat: 30, dh: 42, pX: 10, pY: 2, pZ: 1 },
      { index: 1, ID: "tower-1", partName: "杆塔部件", lng: 114.1, lat: 30.1, dh: 45, pX: 15, pY: 5, pZ: 3 },
    ],
    waypoint: [
      { keyID: "wire-1", lng: 114, lat: 30, dh: 120, height: 80, aircraftYaw: 10, gimbalPitch: -30, pX: 8, pY: 1, pZ: 0 },
      { keyID: "tower-1", lng: 114.1, lat: 30.1, dh: 125, height: 85, aircraftYaw: 20, gimbalPitch: -40, pX: 18, pY: 4, pZ: 2 },
    ],
  },
};

const route = parseInspectionRoute(fixture, "fixture.json");
assert(route.taskname === "巡检任务 A", "taskname should be preserved");
assert(route.parts.length === 2, "part count");
assert(route.waypointObjects.length === 2, "waypoint count");
assert(route.render.waypoints.length === 2, "render waypoint count");
assert(route.render.partPoints.length === 2, "render part count");
assert(route.render.waypointTargetPoints.length === 2, "target point rows");
assert(route.render.waypointTargetMeta[0][0].partIndex === 0, "target part index");
assert(route.render.waypointTargetMeta[0][0].cameraYaw === 12, "camera yaw");
assert(route.render.waypointTargetMeta[0][0].cameraPitch === -35, "camera pitch");
assert(route.render.waypointTargetMeta[0][0].focalLengthRatio === 2, "focal ratio");
assert(route.render.waypointTargetPoints[0][0][0] === 10, "zero target position falls back to part pX");
assert(route.render.waypointTargetPoints[1][0][0] === 16, "explicit target pX is kept");
assert(route.render.waypointLabels[0] === "导线 A", "target label priority");
assert(route.render.waypointLabels[1] === "杆塔主材", "keyName label priority");
assert(route.bounds.min[0] === 8 && route.bounds.max[0] === 18, "route x bounds");
assert(route.bounds.min[1] === 1 && route.bounds.max[1] === 6, "route y bounds");

const displayRoute = routeToCloudLocal(route, [10, 2, 1]);
assert(displayRoute.render.waypoints[0][0] === -2, "cloud-local x");
assert(displayRoute.render.waypoints[0][1] === -1, "cloud-local y from z-centerZ");
assert(displayRoute.render.waypoints[0][2] === 1, "cloud-local z from negative y-centerY");
assert(displayRoute.bounds.min[0] === -2 && displayRoute.bounds.max[0] === 8, "cloud-local bounds x");

updateWaypointFields(route, 0, { pX: 11, towerName: "T001-edited" });
let edited = rebuildInspectionRoute(route);
assert(edited.waypointObjects[0].pX === 11, "edited waypoint pX");
assert(edited.root.points[0].pX === 11, "point side pX should stay synchronized");
assert(edited.root.points[0].towerName === "T001-edited", "point side towerName");

const newTargetIndex = addTarget(edited, 0);
updateTargetFields(edited, 0, newTargetIndex, { photoKeyID: "tower-1", keyPosX: 20, keyPosY: 6, keyPosZ: 4 });
edited = rebuildInspectionRoute(edited);
assert(edited.waypointObjects[0].captureTargets.at(-1).fileId === "tower-1", "new target association");
assert(edited.waypointObjects[0].captureTargets.at(-1).pX === 20, "new target position");

const newWaypointIndex = addWaypoint(edited, 0);
edited = rebuildInspectionRoute(edited);
assert(edited.waypointObjects.length === 3, "added waypoint");
assert(edited.root.points.length === edited.root.powerline.waypoint.length, "points and waypoint arrays stay aligned");
assert(newWaypointIndex === 2, "new waypoint appended");
assert(exportInspectionRouteJson(edited).includes("T001-edited"), "export contains edits");

let mismatch = false;
try {
  parseInspectionRoute({
    points: [{ pX: 0, pY: 0, pZ: 0 }],
    powerline: { keyPoint: [], waypoint: [] },
  });
} catch (error) {
  mismatch = error.message.includes("points.length");
}
assert(mismatch, "points/waypoint length mismatch should throw");

console.log("Route JSON validation completed.");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
