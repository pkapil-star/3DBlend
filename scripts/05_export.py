"""Stage 5: web-quality GLBs and the JSON manifests.

Works on an in-memory copy of the master (the .blend on disk is never modified):
decimates every rigid mesh to a triangle budget, rebuilds the heart / lung shape keys
on the decimated meshes, strips build-only data, exports the integrated GLB and one
GLB per system (same root and coordinates), then writes the manifests from the scene
so the names in the JSON always match the names in the GLB.

blender --background blender/crew_health_check_master.blend --python scripts/05_export.py
"""
import bpy, os, sys, re, json, math, time, collections
import numpy as np
from mathutils import Vector

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "scripts"))
import chc_mapping as M
import chc_morphs as MO

EXPORT = os.path.join(ROOT, "export")
MANI = os.path.join(ROOT, "manifests")
os.makedirs(os.path.join(EXPORT, "systems"), exist_ok=True)
os.makedirs(MANI, exist_ok=True)
TARGET_TRIS = 600_000
MIN_TRIS = 240
t0 = time.time()
log = lambda *a: print("EXPORT", *a, flush=True)
objs = {o.name: o for o in bpy.data.objects}
root = objs[M.ROOT_NAME]
tris_of = lambda me: sum(len(p.vertices) - 2 for p in me.polygons)

# ---------------------------------------------------------------- triangle budget
master_tris = {o.name: tris_of(o.data) for o in bpy.data.objects if o.type == "MESH"}
KEEP = {n for n in master_tris if objs[n].get("skinned") or n == M.DELTOID_REGION_NAME}   # deforming / overlay meshes stay as built

def weight(n):
    if n.startswith(("ORG_Heart", "ORG_Lung")) or n in ("VESSEL_CoronaryArteries", "VESSEL_CardiacVeins", "ORG_Pancreas", "ORG_Kidney_L", "ORG_Kidney_R"):
        return 3.0                                    # featured organs keep more detail
    if n.startswith(("VESSEL_", "SYS_Nerve_", "LYMPH_Vessels", "LYMPH_Trunks", "LYMPH_ThoracicDuct", "SYS_SpinalCord")):
        return 2.0                                    # thin tubes collapse badly when decimated hard
    if n.startswith(("MUSCLE_Intercostals", "MUSCLE_Facial", "ORG_Brain_DeepStructures", "BONE_IntervertebralDiscs", "BONE_CostalCartilages")):
        return 0.6
    return 1.0

fixed = sum(master_tris[n] for n in KEEP)
def total(f):
    return fixed + sum(min(t, max(MIN_TRIS, t * f * weight(n))) for n, t in master_tris.items() if n not in KEEP)
lo, hi = 0.0, 1.0
for _ in range(40):
    f = (lo + hi) / 2
    lo, hi = (f, hi) if total(f) < TARGET_TRIS else (lo, f)
f = lo
log("master triangles %d, budget %d, base keep ratio %.4f" % (sum(master_tris.values()), TARGET_TRIS, f))

# ---------------------------------------------------------------- decimate
params = json.loads(root["morph_params"])
ref_profile, profile_b = json.loads(root["reference_profile"]), json.loads(root["profile_b"])
dg = bpy.context.evaluated_depsgraph_get()
web_tris = {}
for name, t in master_tris.items():
    ob = objs[name]
    me = ob.data
    for a in [a for a in me.attributes if a.name in ("src_part", "region_id", "uv_group", "deltoid_r", "is_fill")]:
        me.attributes.remove(a)
    if name in KEEP:
        web_tris[name] = tris_of(me)
        continue
    target = min(t, max(MIN_TRIS, t * f * weight(name)))
    if me.shape_keys:
        ob.shape_key_clear()                          # rebuilt below from the same displacement fields
    if target < t * 0.98:
        mod = ob.modifiers.new("WebDecimate", "DECIMATE")
        mod.decimate_type, mod.ratio, mod.use_collapse_triangulate = "COLLAPSE", target / t, True
        dg.update()
        new = bpy.data.meshes.new_from_object(ob.evaluated_get(dg), depsgraph=dg)
        ob.modifiers.remove(mod)
        mats = list(me.materials)
        new.materials.clear()
        for m in mats:
            new.materials.append(m)
        new.name = me.name
        ob.data = new
        bpy.data.meshes.remove(me)
    web_tris[name] = tris_of(ob.data)
keyed = MO.apply_all(objs, params)
log("decimated to %d triangles; shape keys rebuilt on %d meshes (%.0fs)" % (sum(web_tris.values()), len(keyed), time.time() - t0))

for o in bpy.data.objects:                            # build bookkeeping never goes into the GLB
    for k in ("src_parts", "za_name", "za_collection", "za_path", "za_type", "reference_profile", "profile_b", "morph_params"):
        if k in o.keys():
            del o[k]

# ---------------------------------------------------------------- export helpers
EXPORT_KW = dict(export_format="GLB", export_extras=True, export_attributes=True, export_skins=True, export_morph=True,
                 export_morph_normal=True, export_yup=True, export_apply=False, export_animations=False, export_cameras=False,
                 export_lights=False, export_def_bones=False, export_texcoords=True, export_normals=True,
                 export_materials="EXPORT", use_visible=False, use_renderable=False)
cam_light = {o.name for o in bpy.data.objects if o.type in ("CAMERA", "LIGHT")}

def unhide(lc):
    lc.exclude = False
    lc.hide_viewport = False
    for c in lc.children:
        unhide(c)
unhide(bpy.context.view_layer.layer_collection)
for o in bpy.data.objects:
    o.hide_viewport = False
    o.hide_set(False)

def export(path, names):
    bpy.ops.object.select_all(action="DESELECT")
    for o in bpy.data.objects:
        if o.name in names:
            o.select_set(True)
    bpy.ops.export_scene.gltf(filepath=path, use_selection=True, **EXPORT_KW)
    return os.path.getsize(path)

def ancestors(o):
    out = []
    while o.parent:
        o = o.parent
        out.append(o.name)
    return out

everything = {o.name for o in bpy.data.objects if o.name not in cam_light}
size = export(os.path.join(EXPORT, "astronaut_digital_twin.glb"), everything)
log("integrated GLB %.1f MB" % (size / 1e6))

system_files = {}
for key, (coll, ename) in M.SYSTEMS.items():
    names = set()
    for o in bpy.data.objects:
        if o.name not in cam_light and (o.name == ename or ename in ancestors(o)):
            names.add(o.name)
            names.update(ancestors(o))
    if key == "external":                              # the skin needs its rig
        names.add("RIG_Armature")
    fn = "astronaut_%s.glb" % key
    system_files[key] = {"file": "systems/" + fn, "bytes": export(os.path.join(EXPORT, "systems", fn), names),
                         "triangles": sum(web_tris.get(n, 0) for n in names)}
helpers = {o.name for o in bpy.data.objects if o.name.startswith(("ANCHOR_", "REGION_", "MEASURE_", "GROUP_")) or o.name == M.ROOT_NAME}
fn = "astronaut_anchors_regions_markers.glb"
system_files["anchors_regions_markers"] = {"file": "systems/" + fn, "bytes": export(os.path.join(EXPORT, "systems", fn), helpers),
                                           "triangles": web_tris.get(M.DELTOID_REGION_NAME, 0)}
log("system GLBs:", {k: "%.1f MB" % (v["bytes"] / 1e6) for k, v in system_files.items()})

# ---------------------------------------------------------------- manifests
def gl(v):           # Blender (Z up, -Y forward) -> glTF (Y up, +Z forward)
    return [round(float(v[0]), 5), round(float(v[2]), 5), round(float(-v[1]), 5)]

def props(o, keys):
    return {k: (o[k].to_list() if hasattr(o[k], "to_list") else o[k]) for k in keys if k in o.keys()}

META = ["anatomy_id", "anatomy_system", "anatomy_name", "side", "default_visible", "interactive", "visualization_type",
        "schematic", "derived", "skinned", "anatomy_name_source", "source_component_count", "note", "asset_version"]
coll_of = lambda o: next((c.name for c in o.users_collection), None)
structures = []
for o in sorted(bpy.data.objects, key=lambda o: (coll_of(o) or "", o.name)):
    if o.name in cam_light or (o.type != "MESH" and o.name.startswith(("ANCHOR_", "REGION_", "MEASURE_"))):
        continue
    rec = {"node_name": o.name, "type": o.type.lower(), "parent": o.parent.name if o.parent else None, "collection": coll_of(o)}
    rec.update(props(o, META + ["node_role"]))
    if o.type == "MESH":
        rec["material"] = o.data.materials[0].name if o.data.materials else None
        rec["triangles_master"] = master_tris.get(o.name)
        rec["triangles_web"] = web_tris.get(o.name)
        if o.data.shape_keys:
            rec["morph_targets"] = [k.name for k in o.data.shape_keys.key_blocks[1:]]
        bb = [gl(o.matrix_world @ Vector(c)) for c in o.bound_box]
        rec["bounds_gltf"] = {"min": [min(b[i] for b in bb) for i in range(3)], "max": [max(b[i] for b in bb) for i in range(3)]}
    structures.append(rec)

by_system = collections.defaultdict(list)
for r in structures:
    if r["type"] == "mesh" and r.get("anatomy_system"):
        by_system[r["anatomy_system"]].append(r["node_name"])
common = {"asset_version": M.ASSET_VERSION, "glb": "astronaut_digital_twin.glb", "root_node": M.ROOT_NAME,
          "units": "metres", "blender_version": bpy.app.version_string,
          "coordinates": {"blender": "+Z up, subject faces -Y, subject's left = +X",
                          "gltf_threejs": "+Y up, subject faces +Z (towards the default camera), subject's left = +X",
                          "conversion_blender_to_gltf": "(x, y, z) -> (x, z, -y)"},
          "disclaimer": "Educational / visualization asset. Not medically validated and not a representation of any specific person."}

anatomy = dict(common, systems={k: {"collection": c, "group_node": e, "objects": sorted(by_system[k])} for k, (c, e) in M.SYSTEMS.items()},
               metadata_fields={"anatomy_id": "Stable id (upper-case node name)", "anatomy_system": "System key",
                                "anatomy_name": "Display name", "anatomy_name_source": "Source atlas structures merged into this node",
                                "side": "left / right / midline: the subject's own side", "default_visible": "Shown in the default presentation",
                                "interactive": "Should be pickable", "visualization_type": "Suggested runtime treatment",
                                "schematic": "True when the geometry is a drawn pathway rather than atlas anatomy",
                                "derived": "True when cut from a larger atlas mesh", "skinned": "Deformed by RIG_Armature"},
               structures=structures,
               omitted_structures=[
                   "Reproductive organs (optional module, not built in v1)", "Fascia, bursae, tendon sheaths, retinacula and ligaments",
                   "Platysma, extra-ocular, laryngeal, pharyngeal and tongue muscles", "Spinal cord tracts and nuclei, meninges, ventricle linings",
                   "Inner eye and ear structures (only the eyeball shell is kept)", "Pleura, peritoneum, omentum, mesentery",
                   "Liver segment surfaces (the liver is one object)", "Capillaries, microvasculature, individual neurons, trabecular bone",
                   "Anal canal (the rectum ends at the pelvic floor)", "Hair, eyebrows, eyelashes"])
json.dump(anatomy, open(os.path.join(MANI, "astronaut_anatomy_manifest.json"), "w"), indent=1)

def frame(o):
    m = o.matrix_world
    r = m.to_3x3().normalized()
    return {"position_gltf": gl(m.translation), "normal_gltf": gl(r @ Vector((0, -1, 0))), "up_gltf": gl(r @ Vector((0, 0, 1))),
            "position_blender": [round(v, 5) for v in m.translation]}
anchors = dict(common, orientation="Node local +Z is the outward skin normal and local +Y points 'up' along the surface (in glTF axes).",
               note="Attachment references only. These are not validated sensor placements.",
               anchors=[dict(node_name=o.name, **props(o, ["anchor_type", "anchor_label", "body_region", "default_visible"]), **frame(o))
                        for o in sorted(bpy.data.objects, key=lambda o: o.name) if o.name.startswith("ANCHOR_")])
json.dump(anchors, open(os.path.join(MANI, "astronaut_sensor_anchors.json"), "w"), indent=1)

regions = dict(common, skin_node="BODY_Skin",
               vertex_attributes={"_REGION_ID": "float per vertex = region id below (Three.js: geometry.attributes._region_id)",
                                  "_SUBREGION_ID": "1 = right outer shoulder / deltoid, 2 = left outer shoulder, 0 = none (geometry.attributes._subregion_id)",
                                  "COLOR_0": "white vertex colours reserved for runtime heatmaps"},
               picking={"how": "Raycast BODY_Skin. intersection.face.a is a vertex index: read _region_id at that index.",
                        "soreness_pin": "Store {region_id, point:[x,y,z], normal:[x,y,z]} in BODY_Skin local space; any surface point is allowed."},
               regions=[dict(region_name=k, region_id=v, node_name="REGION_" + k, side=objs["REGION_" + k]["side"],
                             **{kk: vv for kk, vv in frame(objs["REGION_" + k]).items() if kk != "position_blender"})
                        for k, v in M.REGION_IDS.items()],
               subregions=[{"name": M.DELTOID_REGION_NAME, "subregion_id": 1, "parent_region": "SHOULDER_RIGHT",
                            "overlay_node": M.DELTOID_REGION_NAME, "faces": len(objs[M.DELTOID_REGION_NAME].data.polygons)}],
               measurement_markers=[dict(node_name=o.name, **props(o, ["measurement", "value_m", "description"]), position_gltf=gl(o.matrix_world.translation))
                                    for o in sorted(bpy.data.objects, key=lambda o: o.name) if o.name.startswith("MEASURE_")],
               reference_profile=ref_profile, profile_b=profile_b)
json.dump(regions, open(os.path.join(MANI, "astronaut_body_regions.json"), "w"), indent=1)

presets = {
    "1_full_body": {"show_systems": ["external"], "description": "Assembled human (default presentation)"},
    "2_external_only": {"show_systems": ["external"]},
    "3_internal_exposed": {"show_systems": [k for k in M.SYSTEMS if k not in ("external", "muscular")], "skin_material": "MAT_Skin_Inspection"},
    "4_skeleton_only": {"show_systems": ["skeletal"]},
    "5_muscles_only": {"show_systems": ["muscular"]},
    "6_cardiovascular_only": {"show_systems": ["cardiovascular"]},
    "7_respiratory_only": {"show_systems": ["respiratory"]},
    "8_nervous_only": {"show_systems": ["nervous"]},
    "9_single_organ": {"show_nodes": ["<any node_name>"], "description": "Hide all system group nodes, show one node and its parents"},
    "10_full_anatomy": {"show_systems": [k for k in M.SYSTEMS if k != "external"]},
}
contract = dict(common,
    system_group_nodes={k: e for k, (c, e) in M.SYSTEMS.items()},
    visibility_presets=presets,
    morph_targets={"heart": {"nodes": list(MO.HEART_OBJECTS), "targets": ["Heart_Contract"], "range": [0, 1],
                             "note": "Visual contraction control only. Drive all heart nodes with the same value."},
                   "lungs": {"nodes": list(MO.LUNG_OBJECTS) + [MO.DIAPHRAGM], "targets": ["Lungs_Inhale", "Lungs_Exhale"], "range": [0, 1],
                             "note": "Visual breathing controls only."},
                   "body_profile": {"nodes": ["BODY_Skin"], "targets": ["Profile_B"], "range": [0, 1],
                                    "note": "Second fictional proportion profile. Only the outer body changes."}},
    pivots={"ORG_Heart": "group node at the centre of the heart; scale or pulse it as a whole",
            "lungs": "ORG_Lung_L / ORG_Lung_R group nodes at the centre of each lung",
            "other_meshes": "each mesh origin is at its bounding-box centre"},
    materials={m: {"base_color": list(v[:3]), "alpha": v[3], "roughness": v[4]} for m, v in M.MATERIALS.items()},
    materials_note="glTF PBR only. Health colours, glow and warnings are not baked in; clone a material per node to tint it at runtime. "
                   "MAT_Skin_Inspection and MAT_Region_Highlight are optional materials the app can create from these values.",
    rig={"node": "RIG_Armature", "skinned_nodes": sorted(n for n in master_tris if objs[n].get("skinned")),
         "note": "Only the external body is skinned. Internal anatomy is rigid and does not follow pose changes."},
    visualization_types=sorted({r.get("visualization_type") for r in structures if r.get("visualization_type")}),
    out_of_scope="No physiology, flow, diagnosis or thresholds are encoded in this asset.",
    files={"integrated": {"file": "astronaut_digital_twin.glb", "bytes": size, "triangles": sum(web_tris.values())}, "systems": system_files})
json.dump(contract, open(os.path.join(MANI, "astronaut_visualization_contract.json"), "w"), indent=1)

stats = {"triangles_master_total": sum(master_tris.values()), "triangles_web_total": sum(web_tris.values()),
         "triangles_master_by_system": {k: sum(master_tris[n] for n in v) for k, v in by_system.items()},
         "triangles_web_by_system": {k: sum(web_tris[n] for n in v) for k, v in by_system.items()},
         "integrated_glb_bytes": size, "systems": system_files, "base_keep_ratio": round(f, 4)}
json.dump(stats, open(os.path.join(ROOT, "build", "export_stats.json"), "w"), indent=1)
log("stats", json.dumps(stats["triangles_web_by_system"]), "done in %.0fs" % (time.time() - t0))
