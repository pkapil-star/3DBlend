"""Builds one contract body model (crew-a.glb or crew-b.glb) from the CC0 Blender Studio base mesh.

blender --background --factory-startup --python scripts/crew/build_crew.py -- crew=a|b

Contract: ARCHITECTURE.md section 23 (copy: body-model-handoff.md). Output: export/crew/crew-<x>.glb,
blender/crew/crew-<x>.blend and build/crew/crew-<x>_measurements.json.
"""
import bpy, bmesh, sys, json, math, os
import numpy as np
from mathutils import Matrix, Vector

P = "/home/pranshukapil/VoidShifters"
sys.path.insert(0, P + "/scripts/crew")
import crew_lib as L

BUNDLE = P + "/sources/human-base-meshes/bundle/human-base-meshes-bundle-v1.4.1/human_base_meshes_bundle.blend"
BASE_OBJ = "GEO-body_male_realistic"
args = dict(a.split("=", 1) for a in sys.argv[sys.argv.index("--") + 1:])
CREW = args["crew"].lower()
# section 23.8, centimetres
PROFILES = {
    "a": dict(height=175, inseam=79, shoulder_breadth=42, upper_arm=34, forearm=27, chest=102, waist=86, hip=98, foot=27),
    "b": dict(height=175, inseam=84, shoulder_breadth=37, upper_arm=31, forearm=25, chest=88, waist=72, hip=100, foot=25),
}
TARGET = {k: v / 100 for k, v in PROFILES[CREW].items()}
ARM_ANGLE = 40.0
TRIS = 40000

# ---------------------------------------------------------------- scene and base mesh
bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
sc.unit_settings.system, sc.unit_settings.scale_length, sc.unit_settings.length_unit = "METRIC", 1.0, "METERS"
with bpy.data.libraries.load(BUNDLE, link=False) as (src, dst):
    dst.objects = [BASE_OBJ]
body = dst.objects[0]
sc.collection.objects.link(body)
body.name = body.data.name = "body"
body.location = (0, 0, 0)
mr = body.modifiers[0]
mr.levels = mr.render_levels = mr.sculpt_levels = mr.total_levels  # full sculpt detail, then decimate
bpy.context.view_layer.objects.active = body
body.select_set(True)
bpy.ops.object.modifier_apply(modifier=mr.name)
dec = body.modifiers.new("dec", "DECIMATE")
dec.ratio = TRIS / sum(len(p.vertices) - 2 for p in body.data.polygons)
bpy.ops.object.modifier_apply(modifier=dec.name)
co = L.coords(body)
co[:, 2] -= co[:, 2].min()
co *= TARGET["height"] / co[:, 2].max()
L.set_coords(body, co)

# ---------------------------------------------------------------- landmarks and a temporary rig
m0, lm = L.measure(body)
H = TARGET["height"]
zc = lm["crotch"][2]


def slice_centre(z, side):
    p = co[(np.abs(co[:, 2] - z) < 0.01) & (co[:, 0] * side > 0.02) & (co[:, 0] * side < 0.25)]
    return p.mean(0)


arm = bpy.data.armatures.new("tmp_rig")
rig = bpy.data.objects.new("tmp_rig", arm)
sc.collection.objects.link(rig)
bpy.context.view_layer.objects.active = rig
bpy.ops.object.mode_set(mode="EDIT")
eb = arm.edit_bones


def bone(name, head, tail, parent=None):
    b = eb.new(name)
    b.head, b.tail = Vector(head), Vector(tail)
    b.roll = 0
    b.inherit_scale = "NONE"  # scaling a segment moves its children but never resizes them
    if parent:
        b.parent = eb[parent]
    return b


top_off = {}
yc = float(np.median(co[np.abs(co[:, 2] - 0.6 * H) < 0.02, 1]))
z_waist, z_chest, z_neck = 0.62 * H, 0.72 * H, 0.82 * H
bone("pelvis", (0, yc, zc - 0.02), (0, yc, z_waist))
bone("spine_low", (0, yc, z_waist), (0, yc, z_chest), "pelvis")
bone("spine_high", (0, yc, z_chest), (0, yc, z_neck), "spine_low")
bone("head", (0, yc, z_neck), (0, yc, H), "spine_high")
for side, S in ((1, "L"), (-1, "R")):
    t = lm["shoulder_top_" + S.lower()]
    sj = (t[0] - side * 0.01, yc, t[2] - 0.045)
    top_off[S] = Vector(t) - Vector(sj)
    e, w = lm["elbow_" + S.lower()], lm["wrist_" + S.lower()]
    bone("shoulder." + S, (side * 0.03, yc, z_neck - 0.02), sj, "spine_high")
    bone("upper_arm." + S, sj, e, "shoulder." + S)
    bone("forearm." + S, e, w, "upper_arm." + S)
    bone("hand." + S, w, w + (w - e) / np.linalg.norm(w - e) * 0.09, "forearm." + S)
    hip = slice_centre(zc - 0.03, side)
    knee, ankle = slice_centre(0.285 * H, side), slice_centre(0.05 * H, side)
    foot = co[(co[:, 0] * side > 0) & (co[:, 2] < 0.05 * H)]
    toe = (ankle[0], foot[:, 1].min() + 0.02, 0.02)
    bone("thigh." + S, (hip[0], hip[1], zc + 0.04), knee, "pelvis")
    bone("shin." + S, knee, ankle, "thigh." + S)
    bone("foot." + S, ankle, toe, "shin." + S)
bpy.ops.object.mode_set(mode="OBJECT")
bone_len = {b.name: b.length for b in arm.bones}
bpy.ops.object.select_all(action="DESELECT")
body.select_set(True)
rig.select_set(True)
bpy.context.view_layer.objects.active = rig
bpy.ops.object.parent_set(type="ARMATURE_AUTO")
mw = body.matrix_world.copy()
body.parent = None  # keep the armature modifier, drop the parent link
body.matrix_world = mw
mod = next(m for m in body.modifiers if m.type == "ARMATURE")

# trunk girth: scale each horizontal section of the trunk about its own centre, by a smooth profile through
# the hip, waist and chest levels; arms are excluded through their skin weights
rest0 = L.coords(body)
arm_groups = {vg.index for vg in body.vertex_groups if vg.name.split(".")[0] in ("upper_arm", "forearm", "hand")}
w_arm = np.zeros(len(rest0))
for v in body.data.vertices:
    for g in v.groups:
        if g.group in arm_groups:
            w_arm[v.index] += g.weight
w_trunk = 1 - np.clip(w_arm, 0, 1)
trunk = (w_trunk > 0.5) & (rest0[:, 2] > zc - 0.15) & (rest0[:, 2] < 0.86 * H)
zb = np.round(rest0[:, 2] / 0.01).astype(int)
yc_of = {b: (rest0[trunk & (zb == b), 1].min() + rest0[trunk & (zb == b), 1].max()) / 2
         for b in np.unique(zb[trunk])}
y_centre = np.array([yc_of.get(b, yc) for b in zb])
knots_z = [zc - 0.12, lm["z_hip"], lm["z_waist"], lm["z_chest"], 0.80 * H, 0.86 * H]


def girth(p):
    s = np.interp(rest0[:, 2], knots_z, [1.0, p["hip"], p["waist"], p["chest"], (p["chest"] + 1) / 2, 1.0])
    f = 1 + (s - 1) * w_trunk
    c = rest0.copy()
    c[:, 0] *= f
    c[:, 1] = y_centre + (c[:, 1] - y_centre) * f
    L.set_coords(body, c)

# ---------------------------------------------------------------- fit the profile by iterating pose parameters
p = dict(torso=1.0, leg=1.0, shoulder=1.0, upper_arm=1.0, forearm=1.0, chest=1.0, waist=1.0, hip=1.0, foot=1.0, abduct=0.0)


def pose(p):
    pbs = rig.pose.bones
    for pb in pbs:
        pb.rotation_mode = "XYZ"
        pb.scale = (1, 1, 1)
        pb.rotation_euler = (0, 0, 0)
        pb.location = (0, 0, 0)
    for n in ("spine_low", "spine_high"):
        pbs[n].scale.y = p["torso"]
    girth(p)
    for S, side in (("L", 1), ("R", -1)):
        pbs["shoulder." + S].scale.y = p["shoulder"]
        pbs["upper_arm." + S].scale.y = p["upper_arm"]
        pbs["forearm." + S].scale.y = p["forearm"]
        pbs["thigh." + S].scale.y = pbs["shin." + S].scale.y = p["leg"]
        pbs["foot." + S].scale.y = p["foot"]
    bpy.context.view_layer.update()
    for S, side in (("L", 1), ("R", -1)):
        # abduction about the front-back axis through the shoulder joint, in world space
        ua = pbs["upper_arm." + S]
        rot = Matrix.Rotation(-math.radians(p["abduct"]) * side, 4, "Y")
        h = ua.matrix.translation.copy()
        ua.matrix = Matrix.Translation(h) @ rot @ Matrix.Translation(-h) @ ua.matrix
        bpy.context.view_layer.update()


def evaluated_copy():
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(body.evaluated_get(dg))
    tmp = bpy.data.objects.new("_measure", me)
    sc.collection.objects.link(tmp)
    return tmp


def drop(o):
    me = o.data
    bpy.data.objects.remove(o)
    bpy.data.meshes.remove(me)


def rig_arm_lengths():
    """Upper arm (shoulder top to elbow) and forearm (elbow to wrist) from the posed joints: exact, unlike
    finding the elbow on the mesh."""
    pbs = rig.pose.bones
    ua = [((pbs["upper_arm." + S].head + top_off[S]) - pbs["upper_arm." + S].tail).length for S in "LR"]
    fa = [(pbs["forearm." + S].head - pbs["forearm." + S].tail).length for S in "LR"]
    return sum(ua) / 2, sum(fa) / 2


for it in range(16):
    pose(p)
    tmp = evaluated_copy()
    c = L.coords(tmp)
    c[:, 2] -= c[:, 2].min()
    L.set_coords(tmp, c)
    m, _ = L.measure(tmp)
    drop(tmp)
    m["upper_arm"], m["forearm"] = rig_arm_lengths()
    err = {k: m[k] - TARGET[k] for k in TARGET}
    print("CREW it", it, {k: round(v * 100, 1) for k, v in err.items()}, "angle", round(m["arm_angle_deg"], 1), flush=True)
    if max(abs(v) for v in err.values()) < 0.006 and abs(m["arm_angle_deg"] - ARM_ANGLE) < 1.5:
        break
    # each length changes by (bone length x scale step); circumferences scale directly
    p["torso"] -= err["height"] / (bone_len["spine_low"] + bone_len["spine_high"])
    p["leg"] -= err["inseam"] / (bone_len["thigh.L"] + bone_len["shin.L"])
    p["shoulder"] -= err["shoulder_breadth"] / (2 * bone_len["shoulder.L"])
    p["upper_arm"] -= err["upper_arm"] / bone_len["upper_arm.L"]
    p["forearm"] -= err["forearm"] / bone_len["forearm.L"]
    p["foot"] -= err["foot"] / bone_len["foot.L"]
    for k in ("chest", "waist", "hip"):
        p[k] *= (TARGET[k] / m[k]) ** 1.6  # the tape responds less than 1:1 to the section scale
    p["abduct"] += ARM_ANGLE - m["arm_angle_deg"]
print("CREW params", {k: round(v, 3) for k, v in p.items()})

# ---------------------------------------------------------------- bake the pose, drop the rig
pose(p)
bpy.ops.object.select_all(action="DESELECT")
bpy.context.view_layer.objects.active = body
body.select_set(True)
rest_n = np.array([f.normal[:] for f in body.data.polygons])
bpy.ops.object.modifier_apply(modifier=mod.name)
body.vertex_groups.clear()

# clean-up the contract asks for: smooth folds the pose made (elbow creases) and the nipple points
co = L.coords(body)
now_n = np.array([f.normal[:] for f in body.data.polygons])
folded = np.flatnonzero((rest_n * now_n).sum(1) < 0.5)
fold_c = [body.data.polygons[i].center[:] for i in folded]
nip = []
for side in (1, -1):
    sel = (co[:, 0] * side > 0.06) & (co[:, 0] * side < 0.15) & (co[:, 2] > 0.69 * H) & (co[:, 2] < 0.74 * H)
    nip.append(co[sel][co[sel, 1].argmin()])
print("CREW folded faces", len(folded), "nipples", [np.round(n, 3).tolist() for n in nip])
arm_lengths = rig_arm_lengths()
elbows = [rig.pose.bones["forearm." + S].head[:] for S in "LR"]  # stretched forearms crease behind the elbow
L.smooth_region(body, np.maximum.reduce([L.falloff(co, fold_c, 0.025), L.falloff(co, nip, 0.055),
                                         0.6 * L.falloff(co, elbows, 0.06)]), 25)
bpy.data.objects.remove(rig)
bpy.data.armatures.remove(arm)

co = L.coords(body)
co[:, 2] -= co[:, 2].min()                          # feet on Z = 0
co[:, 0] -= (co[:, 0].min() + co[:, 0].max()) / 2   # midline on X = 0
feet = co[co[:, 2] < 0.04]
co[:, 1] -= (feet[:, 1].min() + feet[:, 1].max()) / 2  # feet centred on Y = 0
L.set_coords(body, co)

bpy.ops.object.mode_set(mode="EDIT")
bpy.ops.mesh.select_all(action="SELECT")
bpy.ops.mesh.remove_doubles(threshold=1e-5)
bpy.ops.mesh.delete_loose()
bpy.ops.mesh.normals_make_consistent(inside=False)
bpy.ops.object.mode_set(mode="OBJECT")
bpy.ops.object.shade_smooth()
final, lm = L.measure(body)
final["upper_arm"], final["forearm"] = arm_lengths

# ---------------------------------------------------------------- sensor anchors and the shoulder patch


def ray_hit(origin, direction):
    ok, loc, nor, idx = body.ray_cast(Vector(origin), Vector(direction).normalized())
    assert ok, ("ray missed", origin, direction)
    return loc, nor


def empty(name, loc):
    e = bpy.data.objects.new(name, None)
    e.empty_display_type, e.empty_display_size = "PLAIN_AXES", 0.05
    e.location = loc
    sc.collection.objects.link(e)
    return e


chest, _ = ray_hit((0, -1.0, 0.725 * H), (0, 1, 0))  # about halfway down the breastbone
back, _ = ray_hit((0, 1.0, 0.745 * H), (0, -1, 0))   # between the shoulder blades
e_l, w_l = lm["elbow_l"], lm["wrist_l"]
mid = (e_l + w_l) / 2
ax = (w_l - e_l) / np.linalg.norm(w_l - e_l)
out = np.array([1.0, 0, 0]) - ax * ax[0]  # lateral direction, perpendicular to the forearm
out /= np.linalg.norm(out)
fore, _ = ray_hit(mid + out * 0.3, -out)
empty("sensor_chest", chest)
empty("sensor_upper_back", back)
empty("sensor_forearm_l", fore)

# deltoid area: the rounded outer shoulder on the body's RIGHT (-X), a little below the shoulder top
t_r = lm["shoulder_top_r"]
aim = Vector((t_r[0], t_r[1], t_r[2] - 0.07))
centre, nrm = ray_hit(aim + Vector((-0.3, 0, 0.05)), Vector((0.3, 0, -0.05)))
me = body.data
keep = {f.index for f in me.polygons  # whole faces inside a 4.5 cm radius: a clean round edge
        if all((me.vertices[i].co - centre).length < 0.045 for i in f.vertices) and f.normal.dot(nrm) > 0.3}
bm = bmesh.new()
bm.from_mesh(me)
bmesh.ops.delete(bm, geom=[f for f in bm.faces if f.index not in keep], context="FACES")
bm.normal_update()
for v in bm.verts:
    v.co += v.normal * 0.002  # 2 mm out along the normals
pme = bpy.data.meshes.new("patch_shoulder_r_outer")
bm.to_mesh(pme)
bm.free()
for poly in pme.polygons:
    poly.use_smooth = True
patch = bpy.data.objects.new("patch_shoulder_r_outer", pme)
sc.collection.objects.link(patch)
pc = L.coords(patch)
patch_span = float(max(pc[:, 1].max() - pc[:, 1].min(), pc[:, 2].max() - pc[:, 2].min()))

# ---------------------------------------------------------------- save, export, record
names = ["body", "patch_shoulder_r_outer", "sensor_chest", "sensor_upper_back", "sensor_forearm_l"]
assert sorted(o.name for o in sc.objects) == sorted(names), [o.name for o in sc.objects]
assert len(bpy.data.materials) == 0 and not bpy.data.armatures and not body.data.shape_keys
os.makedirs(P + "/blender/crew", exist_ok=True)
os.makedirs(P + "/export/crew", exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=f"{P}/blender/crew/crew-{CREW}.blend")
bpy.ops.object.select_all(action="DESELECT")
for n in names:
    bpy.data.objects[n].select_set(True)
glb = f"{P}/export/crew/crew-{CREW}.glb"
bpy.ops.export_scene.gltf(  # the exact call from section 23.3
    filepath=glb, export_format="GLB", use_selection=True, export_yup=True, export_apply=True,
    export_texcoords=False, export_normals=True, export_tangents=False, export_materials="NONE",
    export_draco_mesh_compression_enable=False, export_animations=False, export_morph=False,
    export_skins=False, export_cameras=False, export_lights=False, export_extras=False,
)
rec = {
    "crew": CREW, "target_cm": PROFILES[CREW],
    "measured_cm": {k: round(final[k] * 100, 1) for k in TARGET},
    "arm_angle_deg": round(final["arm_angle_deg"], 1),
    "triangles": {n: sum(len(f.vertices) - 2 for f in bpy.data.objects[n].data.polygons) for n in names[:2]},
    "patch_span_cm": round(patch_span * 100, 1),
    "anchors_m": {n: [round(x, 4) for x in bpy.data.objects[n].location] for n in names[2:]},
    "file_bytes": os.path.getsize(glb), "fit_params": {k: round(v, 4) for k, v in p.items()},
    "blender": bpy.app.version_string,
}
os.makedirs(P + "/build/crew", exist_ok=True)
json.dump(rec, open(f"{P}/build/crew/crew-{CREW}_measurements.json", "w"), indent=2)
print("CREW done", json.dumps(rec))
