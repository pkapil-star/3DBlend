// Test G / H: validates the exported GLB outside Blender.
//   node viewer/validate_glb.mjs export/astronaut_digital_twin.glb
// 1. Khronos glTF-Validator (spec conformance)  2. Three.js GLTFLoader (the loader the app will use)
// Writes build/validation_glb.json and exits non-zero when a check fails.
import fs from 'node:fs';
import path from 'node:path';
import validator from 'gltf-validator';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const file = path.resolve(process.argv[2] ?? path.join(ROOT, 'export/astronaut_digital_twin.glb'));
const mani = (n) => JSON.parse(fs.readFileSync(path.join(ROOT, 'manifests', n), 'utf8'));
const anatomy = mani('astronaut_anatomy_manifest.json');
const anchorsM = mani('astronaut_sensor_anchors.json');
const regionsM = mani('astronaut_body_regions.json');
const contract = mani('astronaut_visualization_contract.json');

const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); };
const buf = fs.readFileSync(file);

// ---------------------------------------------------------------- 1. Khronos validator
const report = await validator.validateBytes(new Uint8Array(buf), { maxIssues: 200 });
const iss = report.issues;
check('Khronos glTF-Validator: 0 errors', iss.numErrors === 0, `errors ${iss.numErrors}, warnings ${iss.numWarnings}, infos ${iss.numInfos}`);
const warnCodes = {};
for (const m of iss.messages) if (m.severity <= 1) warnCodes[m.code] = (warnCodes[m.code] ?? 0) + 1;

// ---------------------------------------------------------------- 2. Three.js
const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
const gltf = await new Promise((res, rej) => new GLTFLoader().parse(ab, '', res, rej));
const scene = gltf.scene;
scene.updateMatrixWorld(true);
const nodes = new Map();
scene.traverse((o) => nodes.set(o.name, o));

const box = new THREE.Box3().setFromObject(nodes.get('BODY_Skin'));
const size = box.getSize(new THREE.Vector3());
check('Scale: skin is 1.75 m tall along +Y', Math.abs(size.y - 1.75) < 0.01 && box.min.y > -0.01 && box.min.y < 0.02,
  `height ${size.y.toFixed(4)} m, feet at y=${box.min.y.toFixed(4)}`);

const wpos = (n) => nodes.get(n).getWorldPosition(new THREE.Vector3());
const chest = wpos('ANCHOR_SENSOR_CHEST'), back = wpos('ANCHOR_SENSOR_UPPER_BACK'), fore = wpos('ANCHOR_SENSOR_LEFT_FOREARM');
check('Orientation: subject faces +Z, subject left is +X', chest.z > back.z && fore.x > 0.2,
  `chest z ${chest.z.toFixed(3)} > back z ${back.z.toFixed(3)}; left forearm x ${fore.x.toFixed(3)}`);

const expected = anatomy.structures.map((s) => s.node_name);
const missing = expected.filter((n) => !nodes.has(n));
check('Every manifest node is present by exact name', missing.length === 0, `${expected.length - missing.length}/${expected.length}` + (missing.length ? ' missing: ' + missing.slice(0, 8).join(', ') : ''));

const names = [];
scene.traverse((o) => { if (o.isMesh || o.userData.anatomy_id) names.push(o.name); });
const dup = names.filter((n, i) => names.indexOf(n) !== i);
const generic = names.filter((n) => /^(Cube|Sphere|Object|Mesh|Empty|Plane)(\.|_|$)|\.\d{3}$/.test(n));
check('Names unique and descriptive', dup.length === 0 && generic.length === 0, `dupes ${dup.length}, generic ${generic.length}`);

const sideBad = [];
for (const s of anatomy.structures.filter((s) => s.type === 'mesh' && (s.side === 'left' || s.side === 'right'))) {
  let c = new THREE.Box3().setFromObject(nodes.get(s.node_name)).getCenter(new THREE.Vector3());
  if (s.node_name.startsWith('SYS_Nerve_Vagus')) {
    // the right vagus continues as the posterior vagal trunk to the stomach, left of the midline: test its cervical part
    const m = nodes.get(s.node_name), p = m.geometry.attributes.position, v = new THREE.Vector3();
    const pts = []; for (let i = 0; i < p.count; i++) pts.push(v.fromBufferAttribute(p, i).applyMatrix4(m.matrixWorld).clone());
    const ys = pts.map((q) => q.y).sort((a, b) => a - b), cut = ys[Math.floor(ys.length * 0.75)];
    const top = pts.filter((q) => q.y >= cut); c = top.reduce((a, q) => a.add(q), new THREE.Vector3()).divideScalar(top.length);
  }
  if ((s.side === 'left') !== (c.x > 0)) sideBad.push(s.node_name);
}
check("Left/right labels match the subject's own side (_L at +X)", sideBad.length === 0, sideBad.length ? sideBad.join(', ') : 'all lateral objects on the correct side');

const sysOk = Object.entries(contract.system_group_nodes).map(([k, g]) => {
  const n = nodes.get(g); let meshes = 0;
  n?.traverse((o) => { if (o.isMesh) meshes++; });
  return [k, meshes];
});
check('Each anatomical system is a separate subtree', sysOk.every(([, m]) => m > 0), sysOk.map(([k, m]) => `${k}:${m}`).join(' '));

const meta = nodes.get('ORG_Heart_LeftVentricle').userData;
check('Custom properties survive as userData (extras)', meta.anatomy_id === 'ORG_HEART_LEFTVENTRICLE' && meta.anatomy_system === 'cardiovascular' && meta.default_visible === true,
  JSON.stringify({ anatomy_id: meta.anatomy_id, anatomy_system: meta.anatomy_system, visualization_type: meta.visualization_type }));
check('Pancreas is its own node', nodes.get('ORG_Pancreas')?.isMesh === true);

const mats = new Set();
scene.traverse((o) => { if (o.isMesh) mats.add(o.material.name); });
const wantMats = ['MAT_Body_Base', 'MAT_Skeleton_Base', 'MAT_Muscular_Base', 'MAT_Cardiovascular_Base', 'MAT_Respiratory_Base', 'MAT_Nervous_Base', 'MAT_Organ_Base'];
check('Semantic PBR materials preserved', wantMats.every((m) => mats.has(m)), `${mats.size} materials: ${[...mats].sort().join(', ')}`);

// morph targets
const morphNodes = Object.values(contract.morph_targets).flatMap((g) => g.nodes.map((n) => [n, g.targets]));
const morphBad = morphNodes.filter(([n, t]) => !t.every((k) => nodes.get(n)?.morphTargetDictionary && k in nodes.get(n).morphTargetDictionary));
check('Shape keys exported as named morph targets', morphBad.length === 0, `${morphNodes.length - morphBad.length}/${morphNodes.length} nodes` + (morphBad.length ? ' bad: ' + morphBad.map((m) => m[0]).join(', ') : ''));
function morphDisplacement(n, key) {
  const m = nodes.get(n); const g = m.geometry; const i = m.morphTargetDictionary[key];
  const arr = g.morphAttributes.position[i].array; let mx = 0;
  for (let k = 0; k < arr.length; k += 3) mx = Math.max(mx, Math.hypot(arr[k], arr[k + 1], arr[k + 2]));
  return { max: mx, neutral: m.morphTargetInfluences.every((v) => v === 0) };
}
const hd = morphDisplacement('ORG_Heart_LeftVentricle', 'Heart_Contract'), ld = morphDisplacement('ORG_Lung_L_InferiorLobe', 'Lungs_Inhale');
check('Morph targets neutral at load and bounded', hd.neutral && ld.neutral && hd.max > 0.002 && hd.max < 0.03 && ld.max > 0.002 && ld.max < 0.03,
  `heart max ${(hd.max * 1000).toFixed(1)} mm, lung max ${(ld.max * 1000).toFixed(1)} mm`);

// anchors
let anchorErr = 0, normalErr = 0;
for (const a of anchorsM.anchors) {
  const n = nodes.get(a.node_name); if (!n) { anchorErr = Infinity; continue; }
  anchorErr = Math.max(anchorErr, n.getWorldPosition(new THREE.Vector3()).distanceTo(new THREE.Vector3(...a.position_gltf)));
  const z = new THREE.Vector3(0, 0, 1).transformDirection(n.matrixWorld);
  normalErr = Math.max(normalErr, z.angleTo(new THREE.Vector3(...a.normal_gltf)));
}
check('Sensor anchor nodes found at manifest positions, local +Z = surface normal', anchorErr < 1e-4 && normalErr < 0.01,
  `${anchorsM.anchors.length} anchors, max position error ${(anchorErr * 1000).toFixed(3)} mm, max normal error ${(normalErr * 180 / Math.PI).toFixed(2)} deg`);

// skin surface distance of anchors (raycast along -normal from 5 cm outside)
const skin = nodes.get('BODY_Skin');
const ray = new THREE.Raycaster();
let surfMax = 0;
for (const a of anchorsM.anchors) {
  const p = new THREE.Vector3(...a.position_gltf), nrm = new THREE.Vector3(...a.normal_gltf);
  ray.set(p.clone().addScaledVector(nrm, 0.05), nrm.clone().negate());
  const hit = ray.intersectObject(skin, false)[0];
  surfMax = Math.max(surfMax, hit ? hit.point.distanceTo(p) : Infinity);
}
check('Anchors sit on the skin surface (raycast in Three.js)', surfMax < 0.002, `max distance ${(surfMax * 1000).toFixed(2)} mm`);

// region attribute + picking
const attr = skin.geometry.attributes._region_id;
check('Skin carries the _REGION_ID vertex attribute', !!attr, attr ? `${attr.count} vertices` : 'missing');
check('Skin is a SkinnedMesh bound to RIG_Armature', skin.isSkinnedMesh && skin.skeleton.bones.length === 52, `${skin.skeleton?.bones.length} bones`);
const pick = (from, dir) => {
  ray.set(from, dir.normalize());
  const h = ray.intersectObject(skin, false)[0];
  return h && attr ? { region: attr.getX(h.face.a), point: h.point.toArray().map((v) => +v.toFixed(4)), normal: h.face.normal.toArray().map((v) => +v.toFixed(3)) } : null;
};
const ids = Object.fromEntries(regionsM.regions.map((r) => [r.region_name, r.region_id]));
const sh = nodes.get('REGION_SHOULDER_RIGHT').getWorldPosition(new THREE.Vector3());
const tests = [
  ['CHEST_ANTERIOR', pick(new THREE.Vector3(0.08, chest.y - 0.05, 1), new THREE.Vector3(0, 0, -1))],
  ['CHEST_POSTERIOR', pick(new THREE.Vector3(0.05, back.y, -1), new THREE.Vector3(0, 0, 1))],
  ['SHOULDER_RIGHT', pick(new THREE.Vector3(sh.x - 0.3, sh.y + 0.05, sh.z), new THREE.Vector3(1, -0.15, 0))],
  ['THIGH_LEFT', pick(new THREE.Vector3(0.09, 0.65, 1), new THREE.Vector3(0, 0, -1))],
];
const pickBad = tests.filter(([want, h]) => !h || h.region !== ids[want]);
check('Surface picking returns point, normal and the right region id', pickBad.length === 0,
  tests.map(([w, h]) => `${w}:${h ? h.region : 'miss'}(want ${ids[w]})`).join(' ') + `; e.g. chest hit ${JSON.stringify(tests[0][1])}`);
check('Right deltoid region overlay present', nodes.get('REGION_SHOULDER_RIGHT_DELTOID')?.isMesh === true);

// performance
let tris = 0;
scene.traverse((o) => { if (o.isMesh) tris += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3; });
check('Performance: 300k–700k triangles, ≤ 25 MB', tris >= 300000 && tris <= 700000 && buf.length <= 25e6, `${Math.round(tris)} triangles, ${(buf.length / 1e6).toFixed(2)} MB`);

const out = { file: path.relative(ROOT, file), bytes: buf.length, triangles: Math.round(tris), three_version: THREE.REVISION,
  validator: { version: report.validatorVersion, errors: iss.numErrors, warnings: iss.numWarnings, infos: iss.numInfos, warning_codes: warnCodes },
  picks: Object.fromEntries(tests), checks: results };
fs.mkdirSync(path.join(ROOT, 'build'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'build', 'validation_glb.json'), JSON.stringify(out, null, 1));
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
