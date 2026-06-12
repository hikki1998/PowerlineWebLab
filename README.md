# PowerlineWebLab

PowerlineWebLab is an early-stage web lab for electric-power 3D point-cloud inspection workflows. The current version focuses on browser-based LAS viewing for transmission and substation scenarios, with room to grow into rendering optimization, route display and editing, and lightweight point-cloud processing.

## Current Capabilities

- Local `.las` file loading in the browser.
- WebGL point-cloud rendering with automatic sampling for large files.
- Orbit browsing and walk/fly navigation.
- Display modes for elevation, classification, and RGB.
- Classification and elevation filtering.
- Basic clipping controls and two-point measurement.
- Sites-compatible `vinext` shell for deployment.

## Project Layout

- `app/` - Sites/vinext app shell.
- `public/viewer/` - The actual point-cloud viewer UI and WebGL/LAS logic.
- `worker/` - Cloudflare Worker entry used by the Sites runtime.
- `scripts/test-las.mjs` - LAS validation against local fixture data.
- `scripts/browser-check.mjs` - Browser/WebGL smoke check used during development.

## Development

```powershell
npm install
npm run dev
```

Then open the local URL printed by `vinext`.

## Validation

```powershell
npm run validate
```

By default, LAS validation uses:

```text
E:\code\VibeCodingProject\las_pointcloud_viewer\test_data
```

You can pass a different LAS directory:

```powershell
node scripts/test-las.mjs D:\path\to\las-data
```

## Deployment

The project is built with:

```powershell
npm run build
```

It is currently configured for OpenAI Sites through `.openai/hosting.json`.
