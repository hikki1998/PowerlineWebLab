# Repository Guidelines

## Project Structure & Module Organization

This repository is a Vinext/React app for browser-based LAS point-cloud viewing.

- `app/` contains the Vinext app shell, including `layout.tsx`, `page.tsx`, and global CSS.
- `public/viewer/` contains the standalone viewer UI. Core LAS parsing, rendering, math, color, and interaction code live in `public/viewer/src/`.
- `worker/` contains the Cloudflare Worker entry used by the Sites runtime.
- `scripts/` contains development and validation utilities, including LAS parsing checks and browser smoke checks.
- `docs/` stores planning notes and design specs.

## Build, Test, and Development Commands

- `npm install` installs dependencies. Use Node `>=22.13.0`.
- `npm run dev` starts the local Vinext development server.
- `npm run build` builds the app for deployment.
- `npm run test:las` validates LAS loading against the default local fixture directory.
- `node scripts/test-las.mjs D:\path\to\las-data` validates a custom fixture directory.
- `npm run validate` runs the production build and LAS validation together.

## Coding Style & Naming Conventions

Use ES modules throughout. TypeScript is configured with `strict: true`; prefer explicit data shapes for shared interfaces and parsing results. React components use PascalCase; helper functions and viewer modules use camelCase. Keep LAS parsing, WebGL rendering, navigation, filtering, and measurement logic in focused modules under `public/viewer/src/`.

Follow the existing formatting style: two-space indentation in JSON and JavaScript/TypeScript, double quotes, and concise comments only for non-obvious parsing, math, or rendering behavior.

## Testing Guidelines

The primary validation path is `npm run validate`. For viewer changes, also run `npm run test:las` with representative `.las` files, especially when changing `las.js`, renderer sampling, classification handling, clipping, or measurement behavior. Test scripts live in `scripts/` and use descriptive names such as `test-las.mjs`.

## Commit & Pull Request Guidelines

Recent commits use short, imperative summaries such as `Fix Sites runtime shell for viewer` and `Document Sites runtime redeploy`. Follow that style: start with a verb and describe the user-visible or operational change.

Pull requests should include a summary, validation results, and screenshots or screen recordings for UI or rendering changes. Link related issues when available, and call out fixture data, deployment, or Cloudflare assumptions.

## Security & Configuration Tips

Do not commit local LAS datasets, generated build output, `.wrangler/`, or environment-specific secrets. Keep deployment configuration changes small and document any runtime assumptions in `README.md` or `docs/`.
