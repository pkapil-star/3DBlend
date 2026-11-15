# Crew Health Check — Anatomical Digital Twin: Implementation Plan

Status: **built (2026-11-14). This file is the original plan; see [README.md](README.md) for what was delivered.**
Deviations from this plan: MPFB was not used. The external body is the Z-Anatomy skin welded into one mesh, so skin and
internals come from the same scan and need no fitting. The A-pose was applied as a geometric re-pose instead of through the
rig. The rig deforms the external body only. The second body profile is a skin shape key, not an MPFB slider set.

## 0. Environment (inspected 2026-11-14)

| Item | Found |
|---|---|
| Blender | 5.3.0 (Flatpak `org.blender.Blender`), headless `--background` works, `io_scene_gltf2` present |
| Blender MCP | Connected, live session with default scene (Cube/Camera/Light) |
| Node / npm | v22.23.1 (for glTF validation and Three.js test viewer) |
| Python | system python3 |
| GPU | Intel UHD + RTX 3050 6 GB (EEVEE renders; Workbench fallback) |
| RAM / disk | 15 GB / 428 GB free |
| Project folder | empty |

## 1. Core strategy: assemble licensed anatomy, don't invent it

Organs, bones, vessels and nerves modelled from Python primitives would not be anatomically credible (the brief forbids this, §14 and §18). So the plan is:

| Layer | Source | License | Why |
|---|---|---|---|
| Internal anatomy (bones, muscles, heart, vessels, lungs, airway, brain, nerves, GI, urinary, endocrine, lymphatic) | **Z-Anatomy** (Blender-native atlas, derived from BodyParts3D / FMA) | CC BY-SA 4.0 (Z-Anatomy), CC BY-SA 2.1 JP (BodyParts3D, DBCLS) | Only free, Blender-ready, whole-body atlas covering every system in §6 |
| External skin + deformation rig + proportion variant | **MPFB2** (MakeHuman for Blender extension) + MakeHuman system assets | Extension code GPL; generated/exported characters CC0 | Clean quad topology, UVs, built-in rig and weights, proportion sliders for the second body variant |
| Gaps (parathyroid, schematic lymph pathways if missing, sensor/measure locators) | Built by script, flagged `"schematic": true` in the manifest | Ours | Documented as schematic, never presented as anatomical geometry |

Every license is re-checked against the LICENSE file at download time and recorded in `docs/LICENSES.md`.

> **Consequence you must accept:** CC BY-SA is ShareAlike. The GLB and .blend that contain Z-Anatomy geometry must be distributed under CC BY-SA 4.0 with attribution. This suits a hackathon, but the 3D asset can't be relicensed as proprietary. It does not affect the license of your app code.

## 2. Conventions (fixed before any modelling)

- **Units:** metric, 1 BU = 1 m. Reference stature 1.75 m, soles at Z = 0, midline at X = 0.
- **Axes (Blender):** Z up, subject faces **−Y**, subject's left = **+X**. After glTF export (Y-up): subject faces **+Z** (toward the default Three.js camera), left = +X.
- **Root:** one empty `ROOT_CrewHealthCheck` at the origin. Every system is parented under it. Same root and transforms for the integrated GLB and every per-system GLB.
- **Sides:** `_L` / `_R` = the subject's own left and right, enforced by a validation check (`_L` objects must have centroid X > 0).
- **Names:** prefixes `BODY_`, `BONE_`, `MUSCLE_`, `ORG_`, `VESSEL_`, `SYS_`, `NERVE_`, `LYMPH_`, `GLAND_`, `ANCHOR_`, `REGION_`, `MEASURE_`, `MAT_`, `RIG_`. A mapping table translates Z-Anatomy/FMA names to these. The original FMA/Latin name is kept in `anatomy_name_source`.
- **Metadata (glTF `extras`):** `anatomy_id, anatomy_system, anatomy_name, anatomy_name_source, side, default_visible, interactive, visualization_type, schematic, asset_version`. The same records go in the JSON manifest.

## 3. Repository layout

```
VoidShifters/
  blender/crew_health_check_master.blend     # master quality, all assets packed
  scripts/                                    # numbered, re-runnable headless pipeline
    00_scene_setup.py   01_import_body.py   02_import_anatomy.py
    03_fit_and_repose.py 04_rename_metadata.py 05_materials.py
    06_regions_anchors_measures.py 07_shape_keys.py 08_optimize_web.py
    09_export.py  10_render_previews.py  11_validate_blend.py
    mapping/zanatomy_to_chc.csv                # source-name -> stable id table
  export/astronaut_digital_twin.glb           # integrated, web quality
  export/systems/<system>.glb                 # per-system, same root
  manifests/astronaut_anatomy_manifest.json  astronaut_sensor_anchors.json
            astronaut_body_regions.json      astronaut_visualization_contract.json
  previews/anatomy_preview_*.png             # 9 renders from §16
  viewer/index.html + validate_glb.mjs       # Three.js test viewer + Node checks
  docs/README.md  LICENSES.md  VALIDATION.md  INTEGRATION_THREEJS.md
```

Each script runs headless via `flatpak run org.blender.Blender --background <blend> --python scripts/NN_*.py`, so the whole asset can be rebuilt from the downloaded sources. The live MCP session is only used for inspection and screenshots.

## 4. Stages

### Stage 1: Scene and anatomy planning
- `00_scene_setup.py`: metric units, the 17 collections under `CREW_HEALTH_CHECK_MASTER` (§7), root empty, saved cameras (front, back, side L, side R, three-quarter), preview lights.
- Write `mapping/zanatomy_to_chc.csv` after inventorying Z-Anatomy's object list: which source objects go into each system and which get merged (e.g. each vertebra stays separate; small foramina and ligament details are dropped).

### Stage 2: External body
- Install MPFB2 and its system assets. Generate a neutral adult: 1.75 m, average muscle and weight, no clothing, no exaggerated physique. Keep the topology sex-neutral where MPFB allows, and keep genital geometry off the default skin.
- Fit to the Z-Anatomy skeleton: uniformly scale Z-Anatomy to 1.75 m (it is roughly 1.7 m, from a single male donor), then tune MPFB proportion sliders until the skin envelopes the skeleton and muscles. Checks: no bone or muscle pokes through the skin, measured on a ray grid.
- Second variant: same height, different proportions, stored as a shape key `Profile_B` on `BODY_Skin`. It only changes the outside, and this is documented.
- Single continuous `BODY_Skin` mesh, UV map `UV_Skin`, recalculated normals, manifold check.
- **Gate:** front, back, side and three-quarter screenshots reviewed before Stage 3.

### Stage 3: Skeletal system
- Import Z-Anatomy bones. Every listed bone (§6.2) is its own object: individual vertebrae C1–C7, T1–T12, L1–L5, ribs 01–12 L/R, carpals, tarsals and phalanges (phalanges may be grouped per digit to save objects; to be decided after counting).
- Validate: skeleton inside the skin, spinal canal aligned for the cord, left/right labels correct.

### Stage 4: Muscular system
- Import only the superficial groups listed in §6.3. Where Z-Anatomy splits a group into heads (e.g. quadriceps: 4 muscles, deltoid: 3 parts), join them into the named group object `MUSCLE_Quadriceps_L` and record the component names in the manifest.

### Stage 5: Internal organs
- **Cardiovascular (priority):** heart split into `ORG_Heart` (parent) plus chamber children `ORG_Heart_RightAtrium/LeftAtrium/RightVentricle/LeftVentricle/Septum`. If the source has no chamber split, cut it along anatomical planes and document that. Vessels per §6.4 grouped into `VESSEL_*` objects, artery and vein groups separate, connectivity checked visually.
- **Respiratory:** nasal airway, pharynx, larynx, `SYS_Trachea`, primary and lobar bronchi, `ORG_Lung_L` (2 lobes) / `ORG_Lung_R` (3 lobes) as lobe children if separable, `MUSCLE_Diaphragm` (also tagged respiratory).
- **Nervous:** `ORG_Brain` with cerebrum, cerebellum and brainstem children, `SYS_SpinalCord`, brachial plexus, major arm nerves, `SYS_Nerve_Sciatic_L/R` and its branches.
- **Digestive / Urinary / Endocrine / Lymphatic:** per §6.7–6.10. `ORG_Pancreas` is its own object. Parathyroids and any missing lymph pathways are built as clearly flagged schematic geometry.
- **Reproductive (§6.11):** skipped in v1 (the brief says optional). The empty collection is kept and documented. The source data is from a male donor, so no "universal" set is invented.
- Validate: the organ-to-skeleton relationships listed for each system (e.g. kidneys at T12–L3, liver under the right dome, heart behind the sternum and left of midline).

### Stage 6: Modular organization
- `04_rename_metadata.py`: apply the mapping, set extras, assign collections, origins at geometric centre (heart origin at the chamber centroid for pulsing, lungs at the hilum).
- `05_materials.py`: semantic PBR materials (`MAT_Body_Base` light silver; `MAT_Skin_Inspection`; `MAT_Skeleton_Base`; `MAT_Cardiovascular_Artery/Vein`; `MAT_Muscular_Base`; `MAT_Respiratory_Base`; `MAT_Nervous_Base`; `MAT_Organ_<name>`). Principled BSDF only, no Blender-only nodes, no baked status colours. About 20 materials in total.
- Visibility presets 1–10 (§7) written to the visualization contract as lists of collection and object ids, so the app can toggle them by name.

### Stage 7: Rig and visualization preparation
- **Rig:** the MPFB game-engine rig, renamed `RIG_*` (pelvis, spine, neck, head, clavicles, arms, hands, fingers, legs, feet, toes). The skin uses the MPFB weights.
- **A-pose:** the source anatomy stands in anatomical position (arms at the sides, palms forward). Arm-crossing internals (muscles, vessels, nerves) get weights copied from the skin with a Data Transfer modifier. Rigid structures (bones, organs) get one bone each. Pose the arms to about 30° abduction, apply, set as rest pose. Then check that shoulder vessels, nerves and muscles aren't kinked.
- **Shape keys** (animation controls only):
  - Heart chambers: `Heart_Basis` (basis) + `Heart_Contract` (ventricles shrink about 10–15% toward the chamber centroid, atria less, with smoothing).
  - Each lung: `Lungs_Basis` + `Lungs_Inhale` (expand mostly inferior and anterolateral) + `Lungs_Exhale`. Diaphragm gets matching keys so it doesn't pass through the lungs.
  - Note: glTF exports the basis as the base mesh, so only non-basis keys become morph targets. The contract documents `Heart_Contract`, `Lungs_Inhale` and `Lungs_Exhale` as the morph names.
- **Body regions (§6.1, §10):** skin stays one mesh. Per-vertex attribute `_REGION_ID` (exported by glTF as `_REGION_ID`) plus a duplicate in `COLOR_0` as a fallback. `astronaut_body_regions.json` maps ID → `HEAD … FOOT_R` + `REGION_SHOULDER_RIGHT_DELTOID` (a sub-region with its own ID). `REGION_*` empties sit at each region's centroid. Arbitrary soreness pins use `{x,y,z, nx,ny,nz}` in `BODY_Skin` local space, which needs nothing predefined.
- **Sensor anchors:** empties `ANCHOR_SENSOR_CHEST`, `ANCHOR_SENSOR_UPPER_BACK`, `ANCHOR_SENSOR_LEFT_FOREARM` and optional `ANCHOR_OPT_*` (forehead, neck, upper chest, abdomen, upper arm, wrist, thigh, lower leg). Placed by raycasting onto the skin. Local +Z = outward surface normal; the post-export axis is verified in the viewer. Hidden by default (`default_visible: false`).
- **Measurement markers:** `MEASURE_*` empties for the nine §13 measurements, with the reference profile's measured values in the manifest. No fitting logic.

### Stage 8: Export
- `08_optimize_web.py` works on a copy of the scene: decimate per system to a triangle budget (target about 500k in total, with skin about 60k, heart and lungs kept higher, small bones lower), drop hidden internal faces, merge doubles.
- `09_export.py`: glTF exporter with `export_extras`, `export_attributes`, morph targets with normals, skinning, Y-up, no Draco. Then `@gltf-transform/cli` adds meshopt compression and quantization, which keeps morph targets (Three.js needs `MeshoptDecoder`). Integrated GLB plus one GLB per system, all with the same root.
- Write the four JSON manifests from the scene, so they can't drift from the names in the GLB.

### Stage 9: Validation (scripts, results in `docs/VALIDATION.md`)
- `11_validate_blend.py` runs tests A–F (§19): system presence, per-collection hide/show, unique non-generic names, `_L`/`_R` side check, anchors within 5 mm of the skin surface, skin continuity, normals, UVs, shape keys at 0 equal to basis, max displacement at 1.
- `viewer/validate_glb.mjs` covers test G (headless): Khronos `gltf-validator` with zero errors, every manifest id present as a node, extras present, morph target names present, anchors present, bounding box about 1.75 m tall and facing +Z.
- Test G (visual): load the GLB in `viewer/index.html` (Three.js GLTFLoader + MeshoptDecoder) in the in-app browser. Toggle systems, drive the morph sliders, raycast a click and show the returned point, normal and region id. Screenshot each.
- Test H: file size and triangle count per system and in total, recorded against the 25 MB / 300–700k targets.

### Stage 10: Documentation and previews
- `10_render_previews.py`: EEVEE renders of the 9 previews from the saved cameras and visibility presets.
- `README.md` (handover checklist §22), `LICENSES.md` (sources, licenses, attribution text, modifications), `INTEGRATION_THREEJS.md` (exact object names, loading code, morph and region usage), lists of included and omitted structures, known limitations.

## 5. Known limitations (stated up front)

- Internal anatomy comes from a single male donor dataset (BodyParts3D). Pelvis and organ proportions reflect that. It is **not** medically validated and not a specific astronaut.
- The external body (MPFB) and internals come from different sources and are fitted, not co-registered from one scan. The fit is checked for penetration, not for clinical accuracy.
- The `Profile_B` proportion variant changes only the outer body.
- Schematic items (parathyroids, any synthesized lymph pathways) are flagged in the manifest.
- Microscopic structures, capillaries, trabecular bone and individual neurons are out of scope, as the brief says.

## 6. Out of scope (§21)

No physiology maths, flow/respiration/bone/immune/glucose/thermal models, sensor ingestion, diagnosis, thresholds, React frontend or backend.

## 7. Decisions needed before starting

1. **Download approval:** Z-Anatomy source .blend (GitHub `LluisV/Z-Anatomy`, likely several hundred MB to about 1–2 GB; I'll confirm the exact size before downloading), the MPFB2 extension (Blender extensions platform) and MakeHuman system assets (about 100–300 MB). npm dev tools (`three`, `@gltf-transform/cli`, `gltf-validator`) go in a local `package.json`.
2. **License:** accept CC BY-SA 4.0 ShareAlike for the anatomical asset (§1).
3. **Reproductive module:** skip in v1 (recommended) or include a documented male-profile module from the same dataset.
