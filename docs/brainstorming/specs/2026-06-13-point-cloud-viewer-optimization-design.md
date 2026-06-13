# Point Cloud Viewer Optimization Design

## Goal
Improve the first LAS viewer into a smoother inspection workstation by reducing idle CPU/GPU work, adding EDL depth enhancement, allowing classification color editing, supporting mouse button inversion, and making measurement visible and continuous.

## Rendering Performance
The renderer keeps the existing WebGL architecture. It should stop rendering continuously while the camera and scene are idle. Camera movement, resize, display changes, EDL changes, point-size changes, and cloud replacement mark the renderer dirty and schedule a frame. Walk mode keeps scheduling frames while movement keys are active.

Color and filter rebuilding should avoid large temporary JavaScript arrays. The color builder should preallocate typed arrays sized to the source point count, fill them in one pass, then slice to the visible count. This reduces GC pressure when users switch elevation, RGB, classification, class filters, or clipping.

## EDL
EDL is implemented as an optional WebGL post-process. When enabled and framebuffer support is available, the scene renders into an offscreen color texture whose alpha channel stores clip-space depth. A fullscreen pass samples neighboring depth values and darkens discontinuities to make wires, poles, vegetation edges, and terrain relief easier to read.

The UI exposes EDL enabled, strength, and radius controls. If framebuffer setup fails, the renderer falls back to direct rendering and the UI remains recoverable.

## Classification Colors
The class list remains the main classification workflow. Each class row includes visibility, a color swatch, and a color picker. Defaults use the current LAS classification palette already present in the project. User color edits update the classification display immediately and do not change class visibility.

## Mouse Interaction
Orbit mode defaults to left-button rotate and right-button pan. A new setting reverses left/right behavior. Walk mode keeps drag-to-look behavior because it is a navigation mode rather than a map-style orbit tool.

## Measurement
Measurement becomes a continuous polyline workflow. In measure mode:

- Left click picks the nearest rendered point and appends it to the measurement chain.
- Right click removes the last measurement point.
- The canvas overlay draws selected point markers, segment lines, per-segment distance labels, and a total length summary.
- The measurement panel lists point count, total length, and the latest segment length.

Right-click rollback should not open the browser context menu. Measurement data is cleared when a new cloud loads or when measurement mode is toggled off.

## Validation
Validation requires the project build and LAS parser test to pass. Browser smoke validation should confirm the synthetic cloud renders, WebGL is available, EDL controls are present, class color controls exist after loading a cloud, and the measurement overlay can draw a visible polyline state.
