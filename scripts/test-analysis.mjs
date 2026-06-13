import { analyzeClearance } from "../public/viewer/src/clearance.js";
import { createSyntheticCloud } from "../public/viewer/src/las.js";

const cloud = createSyntheticCloud(60_000);
const result = analyzeClearance(cloud, { radius: 6, threshold: 30 });

assert(result.wireCount > 0, "synthetic cloud should contain wire points");
assert(result.obstacleCount > 0, "synthetic cloud should contain obstacle points");
assert(result.checkedWire > 0, "clearance analysis should check wire points");
assert(Number.isFinite(result.minClearance), "minimum clearance should be finite");
assert(result.minPair, "minimum clearance pair should exist");
assert(result.risks.length > 0, "synthetic cloud should produce threshold risks");
assert(result.risks[0].clearance <= result.threshold, "first risk should be below threshold");
assert(result.risks.every((risk, index, items) => index === 0 || items[index - 1].clearance <= risk.clearance), "risks should be sorted");

console.log("Point-cloud analysis validation completed.");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
