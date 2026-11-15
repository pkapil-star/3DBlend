# Using the model in React + Three.js

The file to load is `export/astronaut_digital_twin.glb` (15 MB, about 600k triangles, no compression, so no decoder is needed).
`viewer/index.html` is a working reference: serve the project folder (`python3 -m http.server`) and open `/viewer/index.html`.

## Coordinates

| | Up | Subject faces | Subject's left |
|---|---|---|---|
| glTF / Three.js | +Y | +Z (towards the default camera) | +X |
| Blender master | +Z | −Y | +X |

Units are metres. The feet stand on y = 0 and the top of the head is at y = 1.75. Every node hangs under
`ROOT_CrewHealthCheck`, and the per-system GLBs in `export/systems/` use the same root and coordinates, so they overlay exactly.

## Loading

```ts
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
const gltf = await new GLTFLoader().loadAsync('/models/astronaut_digital_twin.glb');
const root = gltf.scene;
const node = (name: string) => root.getObjectByName(name)!;
// glTF has no visibility flag: apply the default presentation from the extras
root.traverse(o => { if (o.userData.default_visible === false) o.visible = false; });
```

Blender custom properties arrive as `object.userData` (`anatomy_id`, `anatomy_system`, `anatomy_name`, `side`,
`default_visible`, `interactive`, `visualization_type`, `schematic`, …). The complete list for every node is in
`manifests/astronaut_anatomy_manifest.json`.

## Systems and presets

Each system is one subtree. Toggle a whole system by its group node:

| System | Group node |
|---|---|
| external body | `SYSTEM_ExternalBody` (`BODY_Skin`, `BODY_Eye_L/R`, `BODY_Nails`) |
| skeletal | `SYSTEM_Skeletal` |
| muscular | `SYSTEM_Muscular` |
| cardiovascular | `SYSTEM_Cardiovascular` |
| respiratory | `SYSTEM_Respiratory` |
| nervous | `SYSTEM_Nervous` |
| digestive | `SYSTEM_Digestive` |
| urinary | `SYSTEM_Urinary` |
| endocrine | `SYSTEM_Endocrine` |
| lymphatic | `SYSTEM_Lymphatic` |

The ten view presets of the brief (full body, external only, skin hidden, skeleton only, …) are listed as data in
`manifests/astronaut_visualization_contract.json → visibility_presets`. For the "skin hidden / internals exposed" look,
either hide `SYSTEM_ExternalBody` or give `BODY_Skin` a transparent clone of its material (opacity ≈ 0.2, `depthWrite: false`).

## Key node names

| Need | Node(s) |
|---|---|
| Heart (whole, pivot at its centre) | `ORG_Heart` → `ORG_Heart_RightAtrium`, `ORG_Heart_LeftAtrium`, `ORG_Heart_RightVentricle`, `ORG_Heart_LeftVentricle`, `ORG_Heart_Septum`, `ORG_Heart_Valves`, `VESSEL_CoronaryArteries`, `VESSEL_CardiacVeins` |
| Aorta / venae cavae | `VESSEL_Aorta` → `VESSEL_Aorta_Ascending`, `_Arch`, `_Thoracic`, `_Abdominal`; `VESSEL_VenaCava` → `VESSEL_VenaCava_Superior`, `_Inferior` |
| Pulse sites | `VESSEL_Carotid_L/R`, `VESSEL_Radial_L/R`, `VESSEL_Brachial_L/R`, `VESSEL_Femoral_L/R`, `VESSEL_Popliteal_L/R`, `VESSEL_Tibial_L/R` |
| Lungs | `ORG_Lung_L` → `ORG_Lung_L_SuperiorLobe`, `_InferiorLobe`; `ORG_Lung_R` → `_SuperiorLobe`, `_MiddleLobe`, `_InferiorLobe`; `SYS_Trachea`, `SYS_Bronchi_L/R`, `MUSCLE_Diaphragm` |
| Brain / spinal cord | `ORG_Brain` → `ORG_Brain_Cerebrum`, `_Cerebellum`, `_Brainstem`, `_DeepStructures`; `SYS_SpinalCord` |
| Metabolic context | `ORG_Pancreas`, `ORG_Liver`, `GLAND_Adrenal_L/R`, `GLAND_Thyroid` |
| Kidneys | `ORG_Kidney_L`, `ORG_Kidney_R` |
| Bones (bone-health overlays) | `BONE_Femur_L/R`, `BONE_Tibia_L/R`, `BONE_Hip_L/R`, `BONE_Vertebra_C1…L5`, `BONE_Sacrum`, `BONE_Rib_01_L…BONE_Rib_12_R`, `BONE_Humerus_L/R`, `BONE_Radius_L/R`, `BONE_Tarsals_L/R` (calcaneus, talus and the other tarsals) |
| Sensor anchors | `ANCHOR_SENSOR_CHEST`, `ANCHOR_SENSOR_UPPER_BACK`, `ANCHOR_SENSOR_LEFT_FOREARM` (+ `ANCHOR_OPT_*`) |

## Animation controls (morph targets)

```ts
function setMorph(nodes: string[], target: string, v: number) {
  for (const n of nodes) {
    const m = node(n) as THREE.Mesh;
    const i = m.morphTargetDictionary?.[target];
    if (i !== undefined) m.morphTargetInfluences![i] = v;
  }
}
const HEART = ['ORG_Heart_LeftVentricle','ORG_Heart_RightVentricle','ORG_Heart_LeftAtrium','ORG_Heart_RightAtrium',
               'ORG_Heart_Septum','ORG_Heart_Valves','VESSEL_CoronaryArteries','VESSEL_CardiacVeins'];
setMorph(HEART, 'Heart_Contract', 0.7);           // 0 = relaxed, 1 = contracted (visual only)
setMorph(['ORG_Lung_L_SuperiorLobe','ORG_Lung_L_InferiorLobe','ORG_Lung_R_SuperiorLobe','ORG_Lung_R_MiddleLobe',
          'ORG_Lung_R_InferiorLobe','MUSCLE_Diaphragm'], 'Lungs_Inhale', 0.5);
setMorph(['BODY_Skin'], 'Profile_B', 1);          // second fictional body proportion
```

These are animation controls only. They encode no physiology; the app decides when and how far to drive them.
Alternatively, pulse `ORG_Heart` with a small scale animation: its pivot is at the centre of the heart.

## Surface picking and soreness pins

`BODY_Skin` is one continuous `SkinnedMesh` carrying two custom vertex attributes:

- `geometry.attributes._region_id`: the region id (1–22, names in `manifests/astronaut_body_regions.json`)
- `geometry.attributes._subregion_id`: 1 = right outer shoulder / deltoid (`REGION_SHOULDER_RIGHT_DELTOID`), 2 = left outer shoulder

```ts
const ray = new THREE.Raycaster();
ray.setFromCamera(pointerNdc, camera);
const hit = ray.intersectObject(node('BODY_Skin'), false)[0];
if (hit) {
  const skin = node('BODY_Skin') as THREE.SkinnedMesh;
  const regionId = skin.geometry.attributes._region_id.getX(hit.face!.a);
  const local = skin.parent!.worldToLocal(hit.point.clone());     // store this: it follows the body when the model moves
  const pin = { regionId, point: local.toArray(), normal: hit.face!.normal.toArray(), createdAt: Date.now() };
}
```

Pins can go on any surface point; region ids are a convenience, not a constraint. Add the pin mesh as a child of
`BODY_Skin.parent` (`SYSTEM_ExternalBody`) so it moves with the model.

## Anchors

Anchors are empty nodes. Node-local +Z is the outward skin normal and local +Y runs "up" along the surface, so a device
mesh added as a child sits flat on the body. Positions and normals are also in `manifests/astronaut_sensor_anchors.json`.
They are attachment references, not validated sensor placements.

## Materials

There are 22 named glTF PBR materials (`MAT_Body_Base`, `MAT_Skeleton_Base`, `MAT_Cardiovascular_Artery`, …), shared
between meshes. To tint one structure (a bone-density colour, a highlighted organ), **clone** its material first:
`mesh.material = mesh.material.clone()`. Nothing health-related is baked into colours or geometry. `BODY_Skin` also carries
white vertex colours (`COLOR_0`) that can be overwritten for a temperature-style heatmap; set `material.vertexColors = true`
when doing so.

## Rig

`RIG_Armature` (52 `RIG_*` bones) deforms only the external body (skin, nails, eyes). Internal anatomy is rigid and does
not follow pose changes, so keep the model in its A-pose while internal systems are visible. The validator reports
`NODE_SKINNED_MESH_NON_ROOT` because the skin sits under `SYSTEM_ExternalBody`. This is harmless in Three.js because the
group transforms are identity.
