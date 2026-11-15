# Validation results

Run on 2026-11-14 with Blender 5.3.0 and Three.js r187 / glTF-Validator 2.0.0-dev.3.10.
Re-run: `scripts/build_all.sh` (tests A–F: `scripts/06_validate_blend.py`; tests G–H: `npm run validate`).

## Tests A–F (master .blend)

| Test | Check | Result | Detail |
|---|---|---|---|
| A | all ten systems present with geometry | PASS | {"external": 4, "skeletal": 91, "muscular": 112, "cardiovascular": 93, "respiratory": 12, "nervous": 42, "digestive": 12, "urinary": 6, "endocrine": 6, "lymphatic": 17} |
| A | required collections exist | PASS | 17/17 |
| A | reference stature 1.75 m standing on Z=0 | PASS | z 0.0007 .. 1.7498 |
| A | every structure required by the brief exists | PASS | 89/89 |
| B | each system hides and shows independently | PASS | 10 systems toggled, others unaffected |
| C | unique descriptive names, none generic | PASS | 472 objects, generic 0 |
| C | every mesh carries anatomy metadata | PASS |  |
| C | _L / _R follow the subject's own side (+X = left) | PASS | 302 lateral meshes checked |
| D | three required sensor anchors exist | PASS |  |
| D | anchors within 2 mm of the skin, oriented along its normal | PASS | 11 anchors, max 0.00 mm, max normal deviation 0.0 deg |
| D | required anchors lie in the intended body regions | PASS | ANCHOR_SENSOR_CHEST=CHEST_ANTERIOR, ANCHOR_SENSOR_UPPER_BACK=CHEST_POSTERIOR, ANCHOR_SENSOR_LEFT_FOREARM=FOREARM_LEFT |
| D | anchors hidden in the normal presentation | PASS |  |
| E | skin is one continuous mesh | PASS | 22452 / 22452 vertices connected |
| E | manifold, consistently wound, open only at the eyelids | PASS | non-manifold 0, flipped 0, boundary edges 42 (2 eyelid rims x 21) |
| E | normals point outwards | PASS | sole normal z -1.00, vertex normal z 1.00 |
| E | UV map present | PASS | UV_Skin |
| E | region ids on every face, right deltoid region present | PASS | 162 deltoid faces |
| E | surface picking returns point and normal | PASS | hit (0.08, -0.131, 1.3) normal (0.16, -0.98, 0.14) |
| F | heart, lung and profile shape keys exist with the agreed names | PASS | 15 meshes |
| F | neutral state equals the basis; deformations stay small | PASS | max: heart 7.7 mm, lungs 13.9 mm, diaphragm 12.0 mm, Profile_B 27.7 mm |
| F | deformation rig is separate from the anatomical skeleton | PASS | 52 bones in 14_RIG_AND_ARMATURE |
| File | no external file dependencies | PASS | images 0, libraries 0 |

## Tests G–H (exported GLB, loaded with Three.js GLTFLoader in Node)

| Check | Result | Detail |
|---|---|---|
| Khronos glTF-Validator: 0 errors | PASS | errors 0, warnings 4, infos 8 |
| Scale: skin is 1.75 m tall along +Y | PASS | height 1.7491 m, feet at y=0.0007 |
| Orientation: subject faces +Z, subject left is +X | PASS | chest z 0.093 > back z -0.112; left forearm x 0.407 |
| Every manifest node is present by exact name | PASS | 418/418 |
| Names unique and descriptive | PASS | dupes 0, generic 0 |
| Left/right labels match the subject's own side (_L at +X) | PASS | all lateral objects on the correct side |
| Each anatomical system is a separate subtree | PASS | external:4 skeletal:91 muscular:112 cardiovascular:93 respiratory:12 nervous:42 digestive:12 urinary:6 endocrine:6 lymphatic:17 |
| Custom properties survive as userData (extras) | PASS | {"anatomy_id":"ORG_HEART_LEFTVENTRICLE","anatomy_system":"cardiovascular","visualization_type":"morph_animation"} |
| Pancreas is its own node | PASS |  |
| Semantic PBR materials preserved | PASS | 23 materials: MAT_Body_Base, MAT_Cardiovascular_Artery, MAT_Cardiovascular_Base, MAT_Cardiovascular_Vein, MAT_Endocrine_Base, MAT_Lymphatic_Base, MAT_Muscular_Base, MAT_Nervous_Base, MAT_Nervous_Nerve, MAT_Organ_Base, MA |
| Shape keys exported as named morph targets | PASS | 15/15 nodes |
| Morph targets neutral at load and bounded | PASS | heart max 7.7 mm, lung max 13.9 mm |
| Sensor anchor nodes found at manifest positions, local +Z = surface normal | PASS | 11 anchors, max position error 0.006 mm, max normal error 0.00 deg |
| Anchors sit on the skin surface (raycast in Three.js) | PASS | max distance 0.08 mm |
| Skin carries the _REGION_ID vertex attribute | PASS | 25072 vertices |
| Skin is a SkinnedMesh bound to RIG_Armature | PASS | 52 bones |
| Surface picking returns point, normal and the right region id | PASS | CHEST_ANTERIOR:3(want 3) CHEST_POSTERIOR:4(want 4) SHOULDER_RIGHT:8(want 8) THIGH_LEFT:15(want 15); e.g. chest hit {"region":3,"point":[0.08,1.3313,0.1214],"normal":[0.189,0.408,0.893]} |
| Right deltoid region overlay present | PASS |  |
| Performance: 300k–700k triangles, ≤ 25 MB | PASS | 599615 triangles, 14.99 MB |

Validator warnings: 4 × `NODE_SKINNED_MESH_NON_ROOT` (the skinned skin, nails and eyes sit under `SYSTEM_ExternalBody`, whose transform is identity; Three.js handles this correctly). Every per-system GLB also validates with 0 errors.

A visual check was also done in Chrome with `viewer/index.html`: the GLB loads, system toggles and see-through skin work, `Heart_Contract` deforms the heart, and clicking the skin returned `region 5 ABDOMEN` with its point and normal.

## Test H: performance

| System | Master triangles | Web triangles | System GLB |
|---|---:|---:|---:|
| external | 64,690 | 64,690 | 3.21 MB |
| skeletal | 704,595 | 66,920 | 1.32 MB |
| muscular | 1,794,260 | 165,488 | 3.11 MB |
| cardiovascular | 682,320 | 155,503 | 3.83 MB |
| respiratory | 139,746 | 22,432 | 0.85 MB |
| nervous | 663,974 | 91,627 | 1.94 MB |
| digestive | 110,776 | 12,675 | 0.25 MB |
| urinary | 12,684 | 2,615 | 0.06 MB |
| endocrine | 11,308 | 1,620 | 0.04 MB |
| lymphatic | 140,930 | 15,840 | 0.37 MB |
| **total** | **4,325,561** | **599,688** | integrated GLB **15.0 MB** |

Targets: 300k–700k triangles and ≤ 25 MB. Both are met without mesh compression, so no Draco or meshopt decoder is required.
Rigid meshes were decimated with a shared keep ratio (about 10%); the heart, lungs, kidneys and pancreas keep 3× more detail and tube-like vessels and nerves 2×. The skin is exported at full resolution (64.7k triangles) because it is skinned and carries the region ids.

Smaller download if needed: `npx gltf-transform meshopt` brought the file from 15.0 MB to 4.0 MB in a test (2.7 MB served gzipped; the uncompressed GLB gzips to 10.6 MB). The app then needs `MeshoptDecoder`. During that test the tool's prune step removed one glTF skin, so re-run `npm run validate` on any compressed copy before using it. A lighter LOD could also drop facial muscles, intracranial arteries and deep brain structures.
