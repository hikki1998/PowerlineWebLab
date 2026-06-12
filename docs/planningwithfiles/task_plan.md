# Point Cloud Web Viewer Task Plan

## Goal
Create a Sites-compatible web application for loading LAS point clouds, browsing them in 3D, switching display modes by elevation, classification, and RGB, and providing common point-cloud viewer interactions.

## Current Phase
Local implementation and validation complete. Sites production deployment is blocked by an invalidated connector authentication token.

## Phases
- [x] Phase 1: Confirm scope and write approved design spec.
- [x] Phase 2: Scaffold or configure the web app structure.
- [x] Phase 3: Implement LAS loading, parsing, scene rendering, and camera controls.
- [x] Phase 4: Implement display modes, filtering, measurement, clipping, and viewer UI.
- [x] Phase 5: Validate locally with build and browser checks.
- [ ] Phase 6: Prepare Sites handoff or deployment when Sites authentication is available.

## Decisions
- Workspace is currently empty and not a Git repository.
- Default language for user communication is Chinese.
- User accepted visual companion support for design discussions.
- Local `.las` upload is the primary loading workflow.
- `.laz` support is out of scope for the first version.
- Large files should degrade gracefully with automatic sampling and visible status.
- UI direction is a professional dual-sidebar point-cloud workstation.

## Errors Encountered
| Error | Attempt | Resolution |
| --- | --- | --- |
| `git status --short` failed because the folder is not a Git repository. | Initial project discovery. | Treat as a new project unless later context says otherwise. |
| Sites `_create_site` failed with 401 `token_invalidated`. | Attempted production Sites project creation after local validation. | Local site and deployable `dist/` are ready; user needs to refresh Sites authentication before production deployment can continue. |
| Sites `_create_site` failed again with 401 `token_invalidated`. | Re-attempted after re-running build, LAS validation, and browser validation. | Same external authentication blocker remains; no additional local work is needed for site functionality. |
| Sites `_create_site` failed a third consecutive goal turn with 401 `token_invalidated`. | Re-attempted after confirming `dist/` and `.tmp/point-cloud-web-viewer-dist.tar.gz` exist. | Mark the active goal blocked until the Sites connector is re-authenticated. |
