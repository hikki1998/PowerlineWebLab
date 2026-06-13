# Multi Dataset Tree Design

## Goal
Upgrade the viewer from a single LAS plus single route workspace into a project-style workspace that can load multiple LAS point clouds and multiple route JSON files, manage them in a modern directory/layer tree, and keep existing tools working against the active layer.

## Recommended Approach
Use a project data model with multiple layers, but keep WebGL rendering simple in the first implementation by composing visible point-cloud layers into one render buffer. This gives the product the expected multi-data workflow now, while leaving room to replace the composition step with true multi-buffer layers and LOD later.

## Data Model
The app state gains:

- `projectOrigin`: source coordinate origin shared by all loaded clouds and routes.
- `datasets`: loaded LAS point-cloud layers.
- `routes`: loaded route JSON layers.
- `activeDatasetId`: the LAS layer whose metadata, class filters, elevation range, and analysis settings are edited.
- `activeRouteId`: the route layer whose waypoint, part, target, and route editor panels are edited.

Each dataset stores its original cloud plus per-layer UI state: visible flag, class visibility, class colors, elevation range, rendered count, and warnings. Each route stores its original route plus visible flag and the current display route converted into project-local coordinates.

## Coordinate Strategy
The first loaded LAS defines `projectOrigin`. Later LAS layers are converted from their own local coordinates into the shared project-local coordinate system by applying the difference between their LAS center and the project origin. Routes are also converted relative to the same project origin.

This keeps multiple LAS files and route JSON files spatially aligned while retaining float-friendly local WebGL coordinates.

## UI
Add a project tree panel on the left below the file status:

- Point clouds group: each LAS has visible toggle, active selection, locate button, and remove button.
- Routes group: each route has visible toggle, active selection, locate button, and remove button.
- Empty states explain that loaded files appear in the tree.

The existing right-side panels remain focused on the active dataset or active route. This avoids overcrowding the UI while still making multiple loaded files manageable.

## Rendering
For visible datasets:

1. Build colors and filters for each layer independently.
2. Transform positions into project-local coordinates where needed.
3. Concatenate visible positions and colors into a composed render buffer.
4. Upload the composed buffer through the existing `renderer.setCloud()`.

For visible routes:

- First implementation renders and edits the active visible route in WebGL.
- Non-active visible routes are still tracked in the tree and can be activated, hidden, removed, or focused.
- The architecture keeps `routes` as a collection so later work can render all route overlays at once.

## Existing Tool Compatibility
Existing metadata, class list, elevation filter, clip controls, profile, clearance, annotations, and route editors continue to operate on the active dataset or active route. Loading a new dataset no longer clears routes. Loading a new route no longer replaces the point cloud. Analysis tools read the composed render buffer, so visible datasets participate in measurement/profile/clearance.

## Error Handling
If a non-LAS/non-JSON file is loaded, keep the current error toast. If all datasets are hidden or removed, clear the WebGL point buffer and show an empty project-tree state while preserving any loaded routes.

## Validation
Validation should include:

- `npm run validate`.
- Loading at least two LAS files keeps both in the project tree.
- Toggling a point-cloud layer changes the composed render count.
- Loading at least two route JSON files keeps both in the project tree.
- Activating a route updates the waypoint/part editors.
