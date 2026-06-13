# Viewer Workstation Polish Design

## Goal

Deliver a focused V0.2/V0.3 polish pass based on `docs/technical-roadmap.md`: improve browsing feel, make interaction preferences more precise, expose runtime feedback, and make the right-side workstation feel closer to modern point-cloud products.

## Scope

- Add independent navigation controls for rotate X/Y inversion, pan X/Y inversion, wheel inversion, and navigation speeds.
- Keep the existing orbit/walk/measure/profile/annotation modes, but route all mouse movement through a shared navigation settings object in the renderer.
- Add a live performance/status card that reports current mode, visible layers, rendered points, frame time, FPS estimate, EDL state, and point-size strategy.
- Modernize panel styling without changing the main layout: clearer tab affordance, tighter control rows, dashboard-like metric tiles, and better visual hierarchy.

## Out of Scope

- Web Worker LAS parsing.
- LAS chunk/LOD indexing.
- Multi-route simultaneous WebGL overlay rendering.
- Large refactors of `main.js` into separate modules.

## Data Flow

HTML controls update `state.navigation`, then call `renderer.setNavigationSettings()`. The renderer applies those settings during pointer drag, wheel zoom, and walk movement. The renderer records lightweight frame stats after each render. Main UI reads `renderer.getStats()` when overlays refresh and paints the performance card.

## Validation

- `npm run validate` must pass.
- Browser smoke check should confirm the viewer loads, the navigation controls exist, the performance card updates after generating sample data, and no console errors appear besides expected favicon noise.
