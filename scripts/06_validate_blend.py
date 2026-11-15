"""Stage 6: acceptance tests A-F on the master .blend (G/H run on the GLB: viewer/validate_glb.mjs).

blender --background blender/crew_health_check_master.blend --python scripts/06_validate_blend.py
Writes build/validation_blend.json. Read-only: the .blend is not saved.
"""
import bpy, bmesh, os, sys, re, json
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "scripts"))
import chc_mapping as M
import chc_morphs as MO

results = []
def check(test, name, ok, detail=""):
    results.append({"test": test, "name": name, "ok": bool(ok), "detail": detail})
    print("VALIDATE %s %s  %s  %s" % ("PASS" if ok else "FAIL", test, name, detail), flush=True)

objs = {o.name: o for o in bpy.data.objects}
meshes = [o for o in bpy.data.objects if o.type == "MESH"]
colls = {c.name: c for c in bpy.data.collections}
dg = bpy.context.evaluated_depsgraph_get()

# ---------------- A: complete body
counts = {k: sum(1 for o in colls[c].all_objects if o.type == "MESH") for k, (c, _) in M.SYSTEMS.items()}
check("A", "all ten systems present with geometry", all(counts.values()), json.dumps(counts))
check("A", "required collections exist", all(c in colls for c in M.COLLECTIONS), "%d/%d" % (sum(c in colls for c in M.COLLECTIONS), len(M.COLLECTIONS)))
skin = objs["BODY_Skin"]
zs = np.array([v.co.z for v in skin.data.vertices])
check("A", "reference stature 1.75 m standing on Z=0", abs(zs.max() - 1.75) < 0.005 and abs(zs.min()) < 0.005, "z %.4f .. %.4f" % (zs.min(), zs.max()))
must = ["ORG_Heart_LeftAtrium", "ORG_Heart_RightAtrium", "ORG_Heart_LeftVentricle", "ORG_Heart_RightVentricle", "ORG_Heart_Septum",
        "VESSEL_Aorta_Ascending", "VESSEL_Aorta_Arch", "VESSEL_Aorta_Thoracic", "VESSEL_VenaCava_Superior", "VESSEL_VenaCava_Inferior",
        "VESSEL_Carotid_L", "VESSEL_Carotid_R", "VESSEL_Femoral_L", "VESSEL_Popliteal_R", "VESSEL_Radial_L", "VESSEL_Ulnar_R",
        "ORG_Lung_L_SuperiorLobe", "ORG_Lung_R_MiddleLobe", "SYS_Trachea", "SYS_Bronchi_L", "MUSCLE_Diaphragm", "SYS_Larynx", "SYS_Pharynx",
        "ORG_Brain_Cerebrum", "ORG_Brain_Cerebellum", "ORG_Brain_Brainstem", "SYS_SpinalCord", "SYS_Nerve_Sciatic_L", "SYS_Nerve_BrachialPlexus_R",
        "ORG_Esophagus", "ORG_Stomach", "ORG_Liver", "ORG_Gallbladder", "ORG_Pancreas", "ORG_SmallIntestine", "ORG_LargeIntestine", "ORG_Rectum",
        "ORG_Kidney_L", "ORG_Kidney_R", "SYS_Ureter_L", "SYS_Ureter_R", "ORG_Bladder", "SYS_Urethra",
        "GLAND_Pituitary", "GLAND_Thyroid", "GLAND_Parathyroid", "GLAND_Adrenal_L", "GLAND_Adrenal_R",
        "ORG_Spleen", "ORG_Thymus", "LYMPH_Nodes_Thoracic", "LYMPH_ThoracicDuct",
        "BONE_Skull", "BONE_Mandible", "BONE_Vertebra_C1", "BONE_Vertebra_L5", "BONE_Sacrum", "BONE_Coccyx", "BONE_Sternum", "BONE_Rib_12_R",
        "BONE_Clavicle_L", "BONE_Scapula_R", "BONE_Humerus_L", "BONE_Carpals_R", "BONE_Phalanges_Hand_L", "BONE_Hip_R", "BONE_Femur_L",
        "BONE_Patella_R", "BONE_Tibia_L", "BONE_Fibula_R", "BONE_Tarsals_L", "BONE_Phalanges_Foot_R",
        "MUSCLE_PectoralisMajor_L", "MUSCLE_RectusAbdominis_R", "MUSCLE_ExternalOblique_L", "MUSCLE_LatissimusDorsi_R", "MUSCLE_Trapezius_L",
        "MUSCLE_ErectorSpinae_Longissimus_R", "MUSCLE_Deltoid_R", "MUSCLE_Biceps_L", "MUSCLE_Triceps_R", "MUSCLE_ForearmFlexors_L",
        "MUSCLE_ForearmExtensors_R", "MUSCLE_GluteusMaximus_L", "MUSCLE_Quadriceps_R", "MUSCLE_Hamstrings_L", "MUSCLE_Gastrocnemius_R",
        "MUSCLE_Soleus_L", "MUSCLE_TibialisAnterior_R"]
miss = [n for n in must if n not in objs]
check("A", "every structure required by the brief exists", not miss, "%d/%d" % (len(must) - len(miss), len(must)) + (" missing " + ", ".join(miss) if miss else ""))

# ---------------- B: independent visibility
def layer(lc, name):
    if lc.name == name:
        return lc
    for ch in lc.children:
        r = layer(ch, name)
        if r:
            return r
vl = bpy.context.view_layer
bad = []
for key, (cname, _) in M.SYSTEMS.items():
    lc = layer(vl.layer_collection, cname)
    others = [c for k, (c, _) in M.SYSTEMS.items() if k != key]
    sample_other = next(o for o in colls[others[0]].all_objects if o.type == "MESH")
    for state in (True, False):
        lc.exclude = state
        vis = [o.visible_get() for o in colls[cname].all_objects if o.type == "MESH"]
        if any(vis) == state or not sample_other.visible_get():
            bad.append("%s exclude=%s" % (key, state))
    lc.exclude = False
check("B", "each system hides and shows independently", not bad, ", ".join(bad) or "10 systems toggled, others unaffected")

# ---------------- C: names and sides
names = [o.name for o in bpy.data.objects]
generic = [n for n in names if re.match(r"^(Cube|Sphere|Object|Empty|Mesh|Plane|Cylinder|Curve)(\.\d+)?$", n) or re.search(r"\.\d{3}$", n)]
check("C", "unique descriptive names, none generic", len(set(names)) == len(names) and not generic, "%d objects, generic %d" % (len(names), len(generic)))
nometa = [o.name for o in meshes if "anatomy_id" not in o.keys()]
check("C", "every mesh carries anatomy metadata", not nometa, ", ".join(nometa[:5]))
wrong = []
for o in meshes:
    side = o.get("side")
    if side not in ("left", "right"):
        continue
    pts = np.array([(o.matrix_world @ v.co)[:] for v in o.data.vertices])
    if o.name.startswith("SYS_Nerve_Vagus"):          # posterior vagal trunk crosses to the stomach: test the cervical part
        pts = pts[pts[:, 2] >= np.quantile(pts[:, 2], 0.75)]
    cx = (pts[:, 0].min() + pts[:, 0].max()) / 2 if not o.name.startswith("SYS_Nerve_Vagus") else pts[:, 0].mean()
    if (side == "left") != (cx > 0):
        wrong.append(o.name)
check("C", "_L / _R follow the subject's own side (+X = left)", not wrong, ", ".join(wrong) or "%d lateral meshes checked" % sum(1 for o in meshes if o.get("side") in ("left", "right")))

# ---------------- D: sensor anchors on the surface
sv = [v.co.copy() for v in skin.data.vertices]
bvh = BVHTree.FromPolygons(sv, [tuple(p.vertices) for p in skin.data.polygons])
anchors = sorted(n for n in objs if n.startswith("ANCHOR_"))
req = ["ANCHOR_SENSOR_CHEST", "ANCHOR_SENSOR_UPPER_BACK", "ANCHOR_SENSOR_LEFT_FOREARM"]
check("D", "three required sensor anchors exist", all(r in objs for r in req))
dist = {n: bvh.find_nearest(objs[n].matrix_world.translation)[3] for n in anchors}
nrm_err = {}
for n in anchors:
    loc, nrm, _, _ = bvh.find_nearest(objs[n].matrix_world.translation)
    out = (objs[n].matrix_world.to_3x3() @ Vector((0, -1, 0))).normalized()
    nrm_err[n] = out.angle(nrm)
check("D", "anchors within 2 mm of the skin, oriented along its normal", max(dist.values()) < 0.002 and max(nrm_err.values()) < 0.5,
      "%d anchors, max %.2f mm, max normal deviation %.1f deg" % (len(anchors), 1000 * max(dist.values()), np.degrees(max(nrm_err.values()))))
reg_expect = {"ANCHOR_SENSOR_CHEST": "CHEST_ANTERIOR", "ANCHOR_SENSOR_UPPER_BACK": "CHEST_POSTERIOR", "ANCHOR_SENSOR_LEFT_FOREARM": "FOREARM_LEFT"}
check("D", "required anchors lie in the intended body regions", all(objs[k]["body_region"] == v for k, v in reg_expect.items()),
      ", ".join("%s=%s" % (k, objs[k]["body_region"]) for k in reg_expect))
check("D", "anchors hidden in the normal presentation", all(not objs[n].get("default_visible", True) for n in anchors) and colls["12_SENSOR_ANCHORS"].hide_render)

# ---------------- E: body surface
bm = bmesh.new()
bm.from_mesh(skin.data)
bm.verts.ensure_lookup_table()
seen, stack = {bm.verts[0]}, [bm.verts[0]]
while stack:
    v = stack.pop()
    for e in v.link_edges:
        w = e.other_vert(v)
        if w not in seen:
            seen.add(w)
            stack.append(w)
boundary = [e for e in bm.edges if e.is_boundary]
nonman = [e for e in bm.edges if len(e.link_faces) > 2]
flip = [e for e in bm.edges if len(e.link_loops) == 2 and e.link_loops[0].vert == e.link_loops[1].vert]
check("E", "skin is one continuous mesh", len(seen) == len(bm.verts), "%d / %d vertices connected" % (len(seen), len(bm.verts)))
check("E", "manifold, consistently wound, open only at the eyelids", not nonman and not flip and len(boundary) == 42,
      "non-manifold %d, flipped %d, boundary edges %d (2 eyelid rims x 21)" % (len(nonman), len(flip), len(boundary)))
low = min(bm.faces, key=lambda f: f.calc_center_median().z)
top = max(bm.faces, key=lambda f: f.calc_center_median().z)
check("E", "normals point outwards", low.normal.z < 0 and top.normal.z > 0, "sole normal z %.2f, vertex normal z %.2f" % (low.normal.z, top.normal.z))
bm.free()
check("E", "UV map present", "UV_Skin" in skin.data.uv_layers, ", ".join(u.name for u in skin.data.uv_layers))
check("E", "region ids on every face, right deltoid region present",
      "_REGION_ID" in skin.data.attributes and M.DELTOID_REGION_NAME in objs and len(objs[M.DELTOID_REGION_NAME].data.polygons) > 50,
      "%d deltoid faces" % len(objs[M.DELTOID_REGION_NAME].data.polygons))
hit = bvh.ray_cast(Vector((0.08, -1.0, 1.30)), Vector((0, 1, 0)))
check("E", "surface picking returns point and normal", hit[0] is not None, "hit %s normal %s" % (tuple(round(c, 3) for c in hit[0]), tuple(round(c, 2) for c in hit[1])))

# ---------------- F: animation controls
want = {**{n: list(MO.HEART_KEYS) for n in MO.HEART_OBJECTS}, **{n: list(MO.LUNG_KEYS) for n in MO.LUNG_OBJECTS + (MO.DIAPHRAGM,)},
        "BODY_Skin": ["Body_Basis", "Profile_B"]}
badk, disp = [], {}
for n, keys in want.items():
    sk = objs[n].data.shape_keys
    if not sk or [k.name for k in sk.key_blocks] != keys:
        badk.append(n)
        continue
    base = np.array([v.co[:] for v in sk.key_blocks[0].data])
    for k in sk.key_blocks[1:]:
        d = np.linalg.norm(np.array([v.co[:] for v in k.data]) - base, axis=1)
        disp["%s:%s" % (n, k.name)] = float(d.max())
        if k.value != 0 or not np.isfinite(d).all() or d.max() > 0.04:
            badk.append(n)
    ev = objs[n].evaluated_get(dg).to_mesh()
    if np.abs(np.array([v.co[:] for v in ev.vertices]) - np.array([v.co[:] for v in objs[n].data.vertices])).max() > 1e-6 and n != "BODY_Skin":
        badk.append(n + " (neutral != basis)")
    objs[n].evaluated_get(dg).to_mesh_clear()
check("F", "heart, lung and profile shape keys exist with the agreed names", not badk, ", ".join(badk) or "%d meshes" % len(want))
check("F", "neutral state equals the basis; deformations stay small", not badk,
      "max: heart %.1f mm, lungs %.1f mm, diaphragm %.1f mm, Profile_B %.1f mm" % (
          1000 * max(v for k, v in disp.items() if k.startswith(("ORG_Heart", "VESSEL_"))),
          1000 * max(v for k, v in disp.items() if k.startswith("ORG_Lung")),
          1000 * max(v for k, v in disp.items() if k.startswith("MUSCLE_Diaphragm")), 1000 * disp["BODY_Skin:Profile_B"]))
rig = objs["RIG_Armature"]
check("F", "deformation rig is separate from the anatomical skeleton", rig.type == "ARMATURE" and len(rig.data.bones) == 52
      and all(not o.name.startswith("BONE_") for o in rig.children), "%d bones in 14_RIG_AND_ARMATURE" % len(rig.data.bones))

# ---------------- file health
missing_files = [i.filepath for i in bpy.data.images if i.filepath and not i.packed_file and not os.path.exists(bpy.path.abspath(i.filepath))]
check("File", "no external file dependencies", not missing_files and not bpy.data.libraries, "images %d, libraries %d" % (len(bpy.data.images), len(bpy.data.libraries)))
json.dump({"file": "blender/crew_health_check_master.blend", "blender_version": bpy.app.version_string, "checks": results},
          open(os.path.join(ROOT, "build", "validation_blend.json"), "w"), indent=1)
print("VALIDATE %d/%d passed" % (sum(r["ok"] for r in results), len(results)))
