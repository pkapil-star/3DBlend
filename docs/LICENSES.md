# Licences and attribution

## Licence of this asset

`blender/crew_health_check_master.blend`, every GLB in `export/` and the preview renders contain geometry derived from
Z-Anatomy and BodyParts3D. They are therefore distributed under **Creative Commons Attribution-ShareAlike 4.0
International (CC BY-SA 4.0)**: https://creativecommons.org/licenses/by-sa/4.0/

ShareAlike means that anyone redistributing the 3D asset, or a modified version of it, must use the same licence and keep the
attribution below. It does **not** apply to application code that merely loads the GLB.

The build scripts in `scripts/` and `viewer/` were written for this project.

## Required attribution (copy this wherever the model is shown or shared)

> Anatomical model derived from **Z-Anatomy – The libre 3D atlas of anatomy** (CC BY-SA 4.0) and
> **BodyParts3D, © The Database Center for Life Science (DBCLS)** (CC BY-SA 2.1 Japan).
> Modified for Crew Health Check (re-posed, merged, renamed, decimated). Licensed CC BY-SA 4.0.

## Third-party sources used

| Source | Where it came from | Licence | Used for |
|---|---|---|---|
| Z-Anatomy template `Z-Anatomy.zip` → `Startup.blend` (file version 3.5) | https://github.com/Z-Anatomy/Models-of-human-anatomy (downloaded 2026-11-14; licence text in `sources/z-anatomy/License.txt`) | CC BY-SA 4.0 | All anatomical geometry: skin, skeleton, muscles, heart, vessels, airway, lungs, brain, nerves, digestive, urinary, endocrine, lymphoid organs |
| BodyParts3D (DBCLS), via Z-Anatomy | https://dbarchive.biosciencedbc.jp/en/bodyparts3d/download.html | CC BY-SA 2.1 JP | Original source of most Z-Anatomy meshes |

Z-Anatomy's own attribution list also names "Brainder" / "White matter" (University of Washington), "Cranial Nerves and
Foramina" (University of Dundee, CC BY 4.0), "Anatomy of the Inner Ear" (University of Dundee, **CC BY-NC-SA 4.0**) and
"Kidney" by Lissie Cowley (**CC BY-NC 4.0**) as references or adapted material.

- **Inner ear:** not included. Inner and middle ear structures are dropped by the mapping (`scripts/chc_mapping.py`).
- **Kidney:** the atlas mesh "Kidney" is used for `ORG_Kidney_L` / `ORG_Kidney_R`. Z-Anatomy does not say whether this mesh is
  the Lissie Cowley model or only used it as a reference. **Before any commercial use**, confirm this with Z-Anatomy or replace
  the kidneys with the original BodyParts3D kidney; otherwise the non-commercial clause may apply to those two meshes.

MPFB 2.0.18 (GPL-3.0) was downloaded during planning but **was not used**. Nothing from it is in the asset.

## Modifications made to the source geometry

- Modifiers and curve bevels baked to meshes; vessel, nerve and duct curves converted to 8–12 sided tubes.
- Uniform scale ×1.02367 (source stature 1.7095 m → 1.75 m), feet placed on Z = 0.
- Arms re-posed from anatomical position to a 30° A-pose (smooth blend field about the glenohumeral joint).
- Skin patches welded into one continuous mesh; seams and nostrils closed and the ears stitched to the head; genitalia removed
  and the opening closed with a neutral surface; nails split into their own object.
- Source structures merged into named groups (for example the four quadriceps heads → `MUSCLE_Quadriceps_L`); the complete
  mapping is in `scripts/mapping/zanatomy_to_chc.csv`.
- `ORG_Rectum` cut from the atlas mesh "Sigmoid colon" at S3; `ORG_Heart_Septum` cut from the left ventricle wall;
  the urethra trimmed to its pelvic part.
- Added geometry that is not atlas anatomy (flagged `schematic: true`): thoracic duct and cisterna chyli, lymphatic trunks,
  upper- and lower-limb lymphatic pathways.
- New materials, UVs on the skin, region attributes, shape keys, rig and skin weights, anchors and markers.
- Web export decimated to about 600k triangles.
