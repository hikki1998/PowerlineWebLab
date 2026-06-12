# LAS Point Cloud Web Viewer Design

## Goal
Build a Sites-compatible web application that loads local `.las` point cloud files in the browser and provides a professional point-cloud workstation experience: 3D viewing, orbit navigation, walk/fly navigation, display modes by RGB/elevation/classification, filtering, clipping, measuring, and clear file/performance feedback.

## Scope
The first version supports `.las` files only. `.laz` compressed files are out of scope for this version.

The app prioritizes local file upload. Users drag a `.las` file onto the viewer or choose it from a file picker. File bytes stay in the browser.

Large files are handled with graceful degradation. The parser reads metadata and point records from the local file, then automatically samples points down to a safe render limit when needed. The UI must show the original point count, rendered point count, and sampling ratio so users understand what happened.

## Interface
The UI uses a professional dual-sidebar layout.

- Center: full-height 3D point cloud canvas.
- Top toolbar: open file, reset view, orbit mode, walk/fly mode, measure, and clipping controls. Screenshot/export is out of scope for the first version.
- Left sidebar: file status, LAS metadata, layer summary, class list, and upload/drop zone.
- Right sidebar: display mode controls, point size, elevation range, class filters, RGB availability state, clipping box controls, and measurement results.
- Bottom status bar: cursor coordinates when available, point count, rendered count, sampling state, active display mode, and rendering/performance state.

The first screen is the usable viewer, not a landing page. Empty state content appears inside the viewer workspace and invites the user to drop or choose a `.las` file.

## Core Data Flow
1. User selects or drops a `.las` file.
2. Browser reads the file as an `ArrayBuffer`.
3. LAS parser reads header fields, scale, offset, min/max bounds, point format, point count, point data offset, record length, and available attributes.
4. Parser extracts positions and available attributes:
   - XYZ from integer coordinates plus scale and offset.
   - RGB when the point format includes color.
   - Classification when present.
   - Intensity when present, stored for future use even if not emphasized in the first UI.
5. If source point count exceeds the configured render cap, the app samples at a deterministic stride.
6. Viewer normalizes the cloud around its bounding center for stable camera controls while preserving metadata coordinates for display.
7. Renderer builds GPU buffers and updates colors according to the active display mode.

## Rendering and Interaction
Rendering uses Three.js with `BufferGeometry` and per-vertex colors. The app includes:

- Orbit browsing with rotate, pan, zoom.
- Walk/fly navigation for roaming through the cloud.
- View reset that frames the current cloud bounds.
- Point size control.
- RGB display mode when RGB exists; otherwise the UI disables it and explains why.
- Elevation gradient display mode based on sampled or full bounds.
- Classification display mode with common LAS class colors and user toggles.
- Height/elevation range filtering.
- Classification filtering.
- Basic clipping box or axis-aligned clipping range controls.
- Two-point distance measurement on the point cloud viewport, with visible result in the right panel.

## Error Handling
The app must reject unsupported files with a clear message:

- Non-`.las` extension.
- LAS signature not found.
- Unsupported or unknown point data format.
- Missing point records.
- File too large to parse safely in the current browser memory budget.

Parser and renderer failures should return the UI to a recoverable state without reloading the page. The previous loaded cloud may remain visible only if the new file fails before replacing scene data.

## Performance Policy
The implementation should define a render cap, such as 1.5 to 3 million points depending on practical browser performance. Files above the cap are sampled deterministically. Sampling is not hidden: the status bar and file panel show both original and rendered counts.

The first version does not implement octree streaming, worker-based parsing, persistent storage, remote uploads, or LAZ decompression.

## Testing and Validation
Validation should include:

- `npm run build` or the equivalent project build command.
- Browser check of the local site.
- Empty state and invalid file state.
- Synthetic in-app point cloud smoke test if no real LAS sample is available.
- At least one parser-focused test or fixture when feasible.

If a real `.las` sample exists in the workspace, use it for a manual upload test. If no sample exists, report that real-file validation could not be performed and rely on parser/unit checks plus synthetic render checks.

## Implementation Approach
Create a Sites-compatible React/Vite-style web app in this empty workspace. Keep point-cloud logic separated into small modules:

- LAS parsing and metadata extraction.
- Point sampling and attribute normalization.
- Color mapping for RGB, elevation, and classification.
- Three.js scene/camera/interaction controller.
- React UI panels and toolbar.

Do not add server persistence or authentication for the first version because the requested workflow is local-file viewing.
