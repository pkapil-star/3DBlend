"""Stage 4: turn the A-posed model into the master asset.

Adds body-region ids, the right-deltoid reference region, sensor anchors, measurement
markers, the deformation rig with skin weights, pivots, heart / lung shape keys, the
second body-proportion profile, cameras and lights, then saves the master .blend.

blender --background build/stage3_apose.blend --python scripts/04_finalize.py
Output: blender/crew_health_check_master.blend
"""
import bpy, bmesh, os, sys, re, json, math, time, collections
import numpy as np
from mathutils import Vector, Matrix, kdtree, geometry
from mathutils.bvhtree import BVHTree

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "scripts"))
import chc_mapping as M
import chc_morphs as MO

OUT = os.path.join(ROOT, "blender", "crew_health_check_master.blend")
t0 = time.time()
log = lambda *a: print("FINAL", *a, flush=True)
scene = bpy.context.scene
colls = {c.name: c for c in bpy.data.collections}
objs = {o.name: o for o in bpy.data.objects}
root = objs[M.ROOT_NAME]
skin = objs["BODY_Skin"]
SKINNED = ("BODY_Skin", "BODY_Nails", "BODY_Eye_L", "BODY_Eye_R")
V3 = lambda a: Vector((float(a[0]), float(a[1]), float(a[2])))

def co(o):
    a = np.empty(len(o.data.vertices) * 3, np.float32)
    o.data.vertices.foreach_get("co", a)
    return a.reshape(-1, 3)

def part_pts(obname, pattern):
    o = objs[obname]
    names = json.loads(o["src_parts"])
    ids = [i for i, n in enumerate(names) if re.search(pattern, n)]
    assert ids, "no source part %r in %s" % (pattern, obname)
    part = np.empty(len(o.data.vertices), np.int32)
    o.data.attributes["src_part"].data.foreach_get("value", part)
    return co(o)[np.isin(part, ids)]

def pca_ends(pts):
    c = pts.mean(0)
    axis = np.linalg.svd(pts - c, full_matrices=False)[2][0]
    order = np.argsort((pts - c) @ axis)
    k = max(3, len(pts) // 33)
    return pts[order[:k]].mean(0), pts[order[-k:]].mean(0)

def ends_from(pts, ref):
    """(proximal, distal) ends of an elongated bone; proximal is the end nearer to ref."""
    a, b = pca_ends(pts)
    return (a, b) if np.linalg.norm(a - ref) < np.linalg.norm(b - ref) else (b, a)

def sphere_fit(pts):
    A = np.c_[2 * pts, np.ones(len(pts))]
    sol = np.linalg.lstsq(A, (pts ** 2).sum(1), rcond=None)[0]
    return sol[:3], math.sqrt(sol[3] + (sol[:3] ** 2).sum())

def new_empty(name, coll, parent, matrix=None, size=0.03, display="PLAIN_AXES", **props):
    e = bpy.data.objects.new(name, None)
    e.empty_display_type, e.empty_display_size = display, size
    colls[coll].objects.link(e)
    e.parent = parent
    if matrix is not None:
        e.matrix_local = matrix
    for k, v in props.items():
        e[k] = v
    e["asset_version"] = M.ASSET_VERSION
    objs[name] = e
    return e

# ================================================================ joints from the anatomical bones
skin_co = co(skin)
jt = {}
def disc(n):
    return part_pts("BONE_IntervertebralDiscs", r"disc %s$" % n).mean(0)

for S, sx in (("L", 1.0), ("R", -1.0)):
    sh = np.array(root["shoulder_joint_centre_" + S], np.float32)
    _, elbow = ends_from(co(objs["BONE_Humerus_" + S]), sh)
    _, ulna_d = ends_from(co(objs["BONE_Ulna_" + S]), elbow)
    _, rad_d = ends_from(co(objs["BONE_Radius_" + S]), elbow)
    wrist = (ulna_d + rad_d) / 2
    fem = co(objs["BONE_Femur_" + S])
    head = fem[fem[:, 2] > fem[:, 2].max() - 0.05]
    head = head[head[:, 0] * sx < np.median(head[:, 0] * sx)]
    hip, hip_r = sphere_fit(head)
    assert 0.018 < hip_r < 0.032, "femoral head fit looks wrong: %.4f" % hip_r
    _, knee_f = ends_from(fem, hip)
    tib_p, tib_d = ends_from(co(objs["BONE_Tibia_" + S]), knee_f)
    knee = (knee_f + tib_p) / 2
    ankle = (tib_d + part_pts("BONE_Tarsals_" + S, r"^Talus").mean(0)) / 2
    ball = np.mean([ends_from(part_pts("BONE_Metatarsals_" + S, r"^%s metatarsal" % n), ankle)[1]
                    for n in ("First", "Second", "Third", "Fourth", "Fifth")], 0)
    toes = part_pts("BONE_Phalanges_Foot_" + S, r"^Distal phalanx")
    toe_tip = toes[np.argsort(toes[:, 1])[:max(10, len(toes) // 10)]].mean(0)
    clav = co(objs["BONE_Clavicle_" + S])
    sc, _ = ends_from(clav, np.array([0, clav[:, 1].mean(), clav[:, 2].mean()], np.float32))
    scap = co(objs["BONE_Scapula_" + S])
    acromion = scap[np.argsort(scap[:, 0] * sx)[-40:]].mean(0)
    jt.update({"shoulder_" + S: sh, "elbow_" + S: elbow, "wrist_" + S: wrist, "hip_" + S: hip, "knee_" + S: knee,
               "ankle_" + S: ankle, "ball_" + S: ball, "toe_tip_" + S: toe_tip, "sc_" + S: sc, "acromion_" + S: acromion})
    for F, nth in (("Thumb", "first"), ("Index", "second"), ("Middle", "third"), ("Ring", "fourth"), ("Pinky", "fifth")):
        segs = [part_pts("BONE_Metacarpals_" + S, r"^First metacarpal")] if F == "Thumb" else []
        segs.append(part_pts("BONE_Phalanges_Hand_" + S, r"^Proximal phalanx of %s finger" % nth))
        if F != "Thumb":
            segs.append(part_pts("BONE_Phalanges_Hand_" + S, r"^Middle phalanx of %s finger" % nth))
        segs.append(part_pts("BONE_Phalanges_Hand_" + S, r"^Distal phalanx of %s finger" % nth))
        chain = [ends_from(sg, wrist) for sg in segs]
        pts = [c[0] for c in chain] + [chain[-1][1]]
        for i in range(3):
            jt["%s_%02d_%s" % (F, i + 1, S)] = (pts[i], pts[i + 1])
c1 = co(objs["BONE_Vertebra_C1"]).mean(0)
spine = {"l5s1": disc("L5-S1"), "t12l1": disc("T12-L1"), "t6t7": disc("T6-T7"), "c7t1": disc("C7-T1"), "c1": c1,
         "head_top": np.array([0.0, c1[1], skin_co[:, 2].max()], np.float32),
         "hips": (jt["hip_L"] + jt["hip_R"]) / 2}
log("joints: hip L %s knee L %s ankle L %s | shoulder L %s elbow L %s wrist L %s" % tuple(
    np.round(jt[k], 3).tolist() for k in ("hip_L", "knee_L", "ankle_L", "shoulder_L", "elbow_L", "wrist_L")))

# ================================================================ body regions on the skin
me = skin.data
npoly = len(me.polygons)
reg = np.empty(npoly, np.int32)
me.attributes["region_id"].data.foreach_get("value", reg)
delt = np.empty(npoly, np.int32)
me.attributes["deltoid_r"].data.foreach_get("value", delt)
sub = np.where(delt == 1, 1, np.where(reg == M.REGION_IDS["SHOULDER_LEFT"], 2, 0))
loop_total = np.empty(npoly, np.int32)
me.polygons.foreach_get("loop_total", loop_total)
loop_start = np.empty(npoly, np.int32)
me.polygons.foreach_get("loop_start", loop_start)
assert (loop_start == np.concatenate([[0], np.cumsum(loop_total)[:-1]])).all()
for name, values in (("_REGION_ID", reg), ("_SUBREGION_ID", sub)):   # exported to glTF as custom vertex attributes
    a = me.attributes.new(name, "FLOAT", "CORNER")
    a.data.foreach_set("value", np.repeat(values, loop_total).astype(np.float32))
assert (reg > 0).all(), "skin faces without a region"

skin_polys = [tuple(p.vertices) for p in me.polygons]
skin_bvh = BVHTree.FromPolygons([tuple(v) for v in skin_co.tolist()], skin_polys)
centres = np.empty(npoly * 3, np.float32)
me.polygons.foreach_get("center", centres)
centres = centres.reshape(-1, 3)
normals = np.empty(npoly * 3, np.float32)
me.polygons.foreach_get("normal", normals)
normals = normals.reshape(-1, 3)
areas = np.empty(npoly, np.float32)
me.polygons.foreach_get("area", areas)

def surface_frame(pos, n, up_hint=(0, 0, 1)):
    """Local frame for surface markers. After glTF export: local +Z = outward normal, local +Y = 'up' along the surface."""
    n = V3(n).normalized()
    up = V3(up_hint)
    u = up - up.dot(n) * n
    if u.length < 0.25:
        up = Vector((0, -1, 0))
        u = up - up.dot(n) * n
    u.normalize()
    y_axis, z_axis = -n, u
    x_axis = y_axis.cross(z_axis)
    m = Matrix((x_axis, y_axis, z_axis)).transposed().to_4x4()
    m.translation = V3(pos)
    return m

grp_regions = new_empty("GROUP_BodyRegions", "13_BODY_REGIONS", root, node_role="group", default_visible=False)
PREFERRED = {"CHEST_POSTERIOR": (0, 1, 0), "CALF": (0, 1, 0), "FOOT": (0, -0.5, 1), "SHOULDER_LEFT": (1, 0, 0.6),
             "SHOULDER_RIGHT": (-1, 0, 0.6), "UPPER_ARM_LEFT": (0.9, 0, 0.5), "UPPER_ARM_RIGHT": (-0.9, 0, 0.5)}
region_info = {}
for rname, rid in M.REGION_IDS.items():
    m_ = reg == rid
    c = (centres[m_] * areas[m_, None]).sum(0) / areas[m_].sum()
    d = np.array(next((v for k, v in PREFERRED.items() if rname.startswith(k)), (0, -1, 0)), np.float32)
    d /= np.linalg.norm(d)
    rel = centres[m_] - c
    along = rel @ d
    score = along - 1.5 * np.linalg.norm(rel - np.outer(along, d), axis=1)
    i = np.flatnonzero(m_)[score.argmax()]
    side = "left" if rname.endswith("LEFT") else "right" if rname.endswith("RIGHT") else "midline"
    new_empty("REGION_" + rname, "13_BODY_REGIONS", grp_regions, surface_frame(centres[i], normals[i]), size=0.02,
              node_role="body_region", region_id=int(rid), region_name=rname, side=side, default_visible=False, interactive=False)
    region_info[rname] = {"id": int(rid), "faces": int(m_.sum()), "area_m2": round(float(areas[m_].sum()), 4), "side": side}

# the right deltoid / outer shoulder patch as its own overlay mesh (the skin itself is untouched)
bm = bmesh.new()
bm.from_mesh(me)
lay = bm.faces.layers.int.get("deltoid_r")
bmesh.ops.delete(bm, geom=[f for f in bm.faces if f[lay] != 1], context="FACES")
bm.normal_update()
for v in bm.verts:
    v.co += v.normal * 0.0008
dm = bpy.data.meshes.new(M.DELTOID_REGION_NAME)
bm.to_mesh(dm)
bm.free()
for a in [a for a in dm.attributes if a.name in ("region_id", "uv_group", "deltoid_r", "is_fill", "_REGION_ID", "_SUBREGION_ID")]:
    dm.attributes.remove(a)
dm.materials.append(bpy.data.materials["MAT_Region_Highlight"])
dm.polygons.foreach_set("use_smooth", [True] * len(dm.polygons))
dreg = bpy.data.objects.new(M.DELTOID_REGION_NAME, dm)
colls["13_BODY_REGIONS"].objects.link(dreg)
dreg.parent = grp_regions
for k, v in dict(anatomy_id=M.DELTOID_REGION_NAME, node_role="body_region_overlay", region_name="SHOULDER_RIGHT",
                 region_id=M.REGION_IDS["SHOULDER_RIGHT"], subregion_id=1, side="right", default_visible=False,
                 interactive=True, visualization_type="region_overlay", asset_version=M.ASSET_VERSION).items():
    dreg[k] = v
dreg.hide_render = True
objs[dreg.name] = dreg
log("regions: %d ids, right deltoid overlay %d faces" % (len(region_info), len(dm.polygons)))

# ================================================================ sensor anchors
grp_anchor = new_empty("GROUP_SensorAnchors", "12_SENSOR_ANCHORS", root, node_role="group", default_visible=False)
def region_at(face):
    return next(k for k, v in M.REGION_IDS.items() if v == int(reg[face]))

def add_anchor(name, origin, direction, kind, label, up_hint=(0, 0, 1)):
    hit, n, face, _ = skin_bvh.ray_cast(V3(origin), V3(direction).normalized())
    assert hit is not None, "anchor ray missed the skin: " + name
    return new_empty(name, "12_SENSOR_ANCHORS", grp_anchor, surface_frame(hit, n, up_hint), size=0.025, display="SINGLE_ARROW",
                     node_role="sensor_anchor", anchor_type=kind, anchor_label=label, body_region=region_at(face),
                     default_visible=False, interactive=False,
                     note="Attachment reference only. Not a validated sensor placement.")

zc = lambda name: float(co(objs[name])[:, 2].mean())
st = co(objs["BONE_Sternum"])
sz0, sz1 = float(st[:, 2].min()), float(st[:, 2].max())
unit = lambda v: v / np.linalg.norm(v)
fa_mid = (jt["elbow_L"] + jt["wrist_L"]) / 2
ua_mid = (jt["shoulder_L"] + jt["elbow_L"]) / 2
arm_axis = unit(jt["elbow_L"] - jt["shoulder_L"])
lat = np.array([-arm_axis[2], 0, arm_axis[0]])
fa_axis = unit(jt["wrist_L"] - jt["elbow_L"])
wr_pt = jt["wrist_L"] - fa_axis * 0.03
th_mid = (jt["hip_L"] + jt["knee_L"]) / 2
leg_mid = (jt["knee_L"] + jt["ankle_L"]) / 2
anchors = [
    ("ANCHOR_SENSOR_CHEST", (0, -1, sz0 + 0.70 * (sz1 - sz0)), (0, 1, 0), "sensor", "Suit sensor: anterior chest, upper sternum", (0, 0, 1)),
    ("ANCHOR_SENSOR_UPPER_BACK", (0, 1, zc("BONE_Vertebra_T3")), (0, -1, 0), "sensor", "Suit sensor: posterior upper thorax, T3 level", (0, 0, 1)),
    ("ANCHOR_SENSOR_LEFT_FOREARM", fa_mid + np.array([0, 0.4, 0]), (0, -1, 0), "sensor", "Suit sensor: left forearm, dorsal mid-forearm", -fa_axis),
    ("ANCHOR_OPT_FOREHEAD", (0, -1, float(skin_co[:, 2].max()) - 0.075), (0, 1, 0), "optional", "Forehead", (0, 0, 1)),
    ("ANCHOR_OPT_NECK", (0.25, -0.25 + float(c1[1]), zc("BONE_Vertebra_C4")), (-1, 1, 0), "optional", "Left anterolateral neck", (0, 0, 1)),
    ("ANCHOR_OPT_UPPER_CHEST", (0.07, -1, sz1 - 0.05), (0, 1, 0), "optional", "Left upper chest below the clavicle", (0, 0, 1)),
    ("ANCHOR_OPT_ABDOMEN", (0, -1, zc("BONE_Vertebra_L3") + 0.03), (0, 1, 0), "optional", "Abdomen, above the umbilicus", (0, 0, 1)),
    ("ANCHOR_OPT_UPPER_ARM_LEFT", ua_mid + lat * 0.4, -lat, "optional", "Left lateral upper arm", -arm_axis),
    ("ANCHOR_OPT_WRIST_LEFT", wr_pt + np.array([0, 0.4, 0]), (0, -1, 0), "optional", "Left dorsal wrist", -fa_axis),
    ("ANCHOR_OPT_THIGH_LEFT", th_mid + np.array([0, -0.5, 0]), (0, 1, 0), "optional", "Left anterior mid-thigh", (0, 0, 1)),
    ("ANCHOR_OPT_LOWER_LEG_LEFT", leg_mid + np.array([0.5, 0, 0]), (-1, 0, 0), "optional", "Left lateral lower leg", (0, 0, 1)),
]
for a in anchors:
    e = add_anchor(*a)
    log("anchor %-28s at %s region %s" % (e.name, [round(v, 3) for v in e.location], e["body_region"]))

# ================================================================ measurement markers and the reference profile
grp_measure = new_empty("GROUP_MeasurementMarkers", "16_REFERENCE_OBJECTS", root, node_role="group", default_visible=False)
def section(z):
    """Outline of the trunk at height z: (perimeter along the skin, tape-measure perimeter, points)."""
    b = bmesh.new()
    b.from_mesh(me)
    bmesh.ops.bisect_plane(b, geom=b.verts[:] + b.edges[:] + b.faces[:], dist=1e-7,
                           plane_co=(0, 0, z), plane_no=(0, 0, 1), clear_inner=True, clear_outer=True)
    seen, best = set(), None
    for v in b.verts:
        if v in seen:
            continue
        comp, stack = {v}, [v]
        while stack:
            x = stack.pop()
            for e in x.link_edges:
                y = e.other_vert(x)
                if y not in comp:
                    comp.add(y)
                    stack.append(y)
        seen |= comp
        xs = [w.co.x for w in comp]
        if min(xs) < 0 < max(xs):                       # the outline that crosses the midline is the trunk
            per = sum(e.calc_length() for e in {e for w in comp for e in w.link_edges})
            if best is None or per > best[0]:
                pts = [(w.co.x, w.co.y) for w in comp]
                hull = geometry.convex_hull_2d(pts)
                tape = sum((Vector(pts[hull[i]]) - Vector(pts[hull[(i + 1) % len(hull)]])).length for i in range(len(hull)))
                best = (per, tape, pts)
    b.free()
    return best

ARM_IDS = [v for k, v in M.REGION_IDS.items() if k.startswith(("SHOULDER", "UPPER_ARM", "FOREARM", "HAND"))]
def tape(z):
    """Tape-measure circumference of the trunk at height z (arms excluded, as if the tape ran under the armpits)."""
    b = bmesh.new()
    b.from_mesh(me)
    lay_r = b.faces.layers.int.get("region_id")
    bmesh.ops.delete(b, geom=[f for f in b.faces if f[lay_r] in ARM_IDS], context="FACES")
    bmesh.ops.bisect_plane(b, geom=b.verts[:] + b.edges[:] + b.faces[:], dist=1e-7,
                           plane_co=(0, 0, z), plane_no=(0, 0, 1), clear_inner=True, clear_outer=True)
    pts = [(v.co.x, v.co.y) for v in b.verts]
    b.free()
    hull = geometry.convex_hull_2d(pts)
    return sum((Vector(pts[hull[i]]) - Vector(pts[hull[(i + 1) % len(hull)]])).length for i in range(len(hull))), pts

def marker(name, pos, measurement, value, desc):
    new_empty(name, "16_REFERENCE_OBJECTS", grp_measure, Matrix.Translation(V3(pos)), size=0.03, display="SPHERE",
              node_role="measurement_marker", measurement=measurement, value_m=round(float(value), 4), description=desc,
              default_visible=False, interactive=False)

height = float(skin_co[:, 2].max())
top_v = skin_co[skin_co[:, 2].argmax()]
verts_of = lambda mask: np.unique(np.concatenate([skin_polys[i] for i in np.flatnonzero(mask)]))
# crotch height: the lowest level at which one outline spans both sides of the body
z_c = float(jt["knee_L"][2]) + 0.15
while section(z_c) is None:
    z_c += 0.002
near_mid = [p for p in section(z_c + 0.004)[2] if abs(p[0]) < 0.012]
crotch = np.array([0.0, float(np.mean([p[1] for p in near_mid])) if near_mid else 0.0, z_c], np.float32)
acr = {S: np.array(skin_bvh.find_nearest(V3(jt["acromion_" + S]))[0]) for S in "LR"}
chest_faces = np.flatnonzero((reg == M.REGION_IDS["CHEST_ANTERIOR"]) & (np.abs(centres[:, 0]) > 0.05) & (np.abs(centres[:, 0]) < 0.14))
z_chest = float(centres[chest_faces[centres[chest_faces, 1].argmin()], 2])
crest = float(co(objs["BONE_Hip_L"])[:, 2].max())
rib_low = float(co(objs["BONE_Rib_10_L"])[:, 2].min())
lo_, hi_ = sorted((crest, rib_low))
waist = min(((tape(float(z)), float(z)) for z in np.arange(lo_ - 0.02, hi_ + 0.03, 0.005)), key=lambda t: t[0][0])
hipm = max(((tape(float(z)), float(z)) for z in np.arange(float(crotch[2]) + 0.03, crest - 0.02, 0.005)), key=lambda t: t[0][0])
chest = tape(z_chest)
foot = skin_co[verts_of(reg == M.REGION_IDS["FOOT_LEFT"])]
heel, toe = foot[foot[:, 1].argmax()], foot[foot[:, 1].argmin()]
profile = {
    "profile_id": "REFERENCE_A", "fictional": True, "pose": "A-pose",
    "height_m": round(height, 4),
    "inseam_m": round(float(crotch[2]), 4),
    "shoulder_breadth_biacromial_m": round(float(np.linalg.norm(acr["L"] - acr["R"])), 4),
    "upper_arm_length_m": round(float(np.linalg.norm(acr["L"] - jt["elbow_L"])), 4),
    "forearm_length_m": round(float(np.linalg.norm(jt["elbow_L"] - jt["wrist_L"])), 4),
    "chest_circumference_m": round(chest[0], 4), "waist_circumference_m": round(waist[0][0], 4),
    "hip_circumference_m": round(hipm[0][0], 4), "foot_length_m": round(float(heel[1] - toe[1]), 4),
    "levels_m": {"chest": round(z_chest, 4), "waist": round(waist[1], 4), "hip": round(hipm[1], 4)},
    "method": "Measured on the skin mesh in the A-pose. Circumferences are tape-measure (convex) perimeters of horizontal trunk sections with the arms excluded.",
}
front = lambda sec, z: (0.0, min(p[1] for p in sec[1] if abs(p[0]) < 0.03), z)
marker("MEASURE_Height_TopHead", top_v, "height", profile["height_m"], "Vertex of the head. Height is measured from the floor (Z = 0).")
marker("MEASURE_Height_Floor", (0, 0, 0), "height", 0.0, "Floor reference, between the feet.")
marker("MEASURE_Inseam", crotch, "inseam", profile["inseam_m"], "Crotch point. Inseam is its height above the floor.")
marker("MEASURE_Shoulder_L", acr["L"], "shoulder_breadth", profile["shoulder_breadth_biacromial_m"], "Skin point over the left acromion.")
marker("MEASURE_Shoulder_R", acr["R"], "shoulder_breadth", profile["shoulder_breadth_biacromial_m"], "Skin point over the right acromion.")
marker("MEASURE_UpperArm_L_Elbow", jt["elbow_L"], "upper_arm_length", profile["upper_arm_length_m"], "Left elbow joint centre. Length runs from MEASURE_Shoulder_L.")
marker("MEASURE_Forearm_L_Wrist", jt["wrist_L"], "forearm_length", profile["forearm_length_m"], "Left wrist joint centre. Length runs from MEASURE_UpperArm_L_Elbow.")
marker("MEASURE_Chest", front(chest, z_chest), "chest_circumference", profile["chest_circumference_m"], "Chest circumference level (front, midline).")
marker("MEASURE_Waist", front(waist[0], waist[1]), "waist_circumference", profile["waist_circumference_m"], "Natural waist level (front, midline).")
marker("MEASURE_Hip", front(hipm[0], hipm[1]), "hip_circumference", profile["hip_circumference_m"], "Maximum hip circumference level (front, midline).")
marker("MEASURE_FootLength", toe, "foot_length", profile["foot_length_m"], "Tip of the longest toe of the left foot.")
marker("MEASURE_FootLength_Heel", heel, "foot_length", profile["foot_length_m"], "Back of the left heel.")
root["reference_profile"] = json.dumps(profile)
log("reference profile", json.dumps({k: v for k, v in profile.items() if k.endswith("_m")}))

# ================================================================ deformation rig
arm_data = bpy.data.armatures.new("RIG_Armature")
rig = bpy.data.objects.new("RIG_Armature", arm_data)
colls["14_RIG_AND_ARMATURE"].objects.link(rig)
rig.parent = root
arm_data.display_type = "STICK"
rig.show_in_front = True
for k, v in dict(anatomy_id="RIG_ARMATURE", node_role="rig", default_visible=False, interactive=False, asset_version=M.ASSET_VERSION,
                 note="Deformation rig for the external body. It is not the anatomical skeleton (see SYSTEM_Skeletal).").items():
    rig[k] = v
bones = [("RIG_Pelvis", spine["hips"], spine["l5s1"], None), ("RIG_Spine_01", spine["l5s1"], spine["t12l1"], "RIG_Pelvis"),
         ("RIG_Spine_02", spine["t12l1"], spine["t6t7"], "RIG_Spine_01"), ("RIG_Spine_03", spine["t6t7"], spine["c7t1"], "RIG_Spine_02"),
         ("RIG_Neck", spine["c7t1"], spine["c1"], "RIG_Spine_03"), ("RIG_Head", spine["c1"], spine["head_top"], "RIG_Neck")]
for S in "LR":
    bones += [("RIG_Clavicle_" + S, jt["sc_" + S], jt["shoulder_" + S], "RIG_Spine_03"),
              ("RIG_UpperArm_" + S, jt["shoulder_" + S], jt["elbow_" + S], "RIG_Clavicle_" + S),
              ("RIG_Forearm_" + S, jt["elbow_" + S], jt["wrist_" + S], "RIG_UpperArm_" + S),
              ("RIG_Hand_" + S, jt["wrist_" + S], jt["Middle_01_" + S][0], "RIG_Forearm_" + S),
              ("RIG_Thigh_" + S, jt["hip_" + S], jt["knee_" + S], "RIG_Pelvis"),
              ("RIG_Shin_" + S, jt["knee_" + S], jt["ankle_" + S], "RIG_Thigh_" + S),
              ("RIG_Foot_" + S, jt["ankle_" + S], jt["ball_" + S], "RIG_Shin_" + S),
              ("RIG_Toes_" + S, jt["ball_" + S], jt["toe_tip_" + S], "RIG_Foot_" + S)]
    for F in ("Thumb", "Index", "Middle", "Ring", "Pinky"):
        for i in range(3):
            h, t = jt["%s_%02d_%s" % (F, i + 1, S)]
            bones.append(("RIG_%s_%02d_%s" % (F, i + 1, S), h, t, "RIG_Hand_" + S if i == 0 else "RIG_%s_%02d_%s" % (F, i, S)))
bpy.context.view_layer.objects.active = rig
bpy.ops.object.mode_set(mode="EDIT")
for name, h, t, parent in bones:
    b = arm_data.edit_bones.new(name)
    b.head, b.tail = V3(h), V3(t)
    assert b.length > 0.004, "degenerate rig bone " + name
    if parent:
        b.parent = arm_data.edit_bones[parent]
        b.use_connect = (b.head - b.parent.tail).length < 1e-5
for b in arm_data.edit_bones:
    b.select = True
bpy.ops.armature.calculate_roll(type="GLOBAL_POS_Y")
bpy.ops.object.mode_set(mode="OBJECT")
log("rig: %d deform bones" % len(arm_data.bones))

bpy.ops.object.select_all(action="DESELECT")
skin.select_set(True)
rig.select_set(True)
bpy.context.view_layer.objects.active = rig
bpy.ops.object.parent_set(type="ARMATURE_AUTO")
skin.parent = objs["SYSTEM_ExternalBody"]
skin.matrix_parent_inverse = Matrix.Identity(4)
bpy.context.view_layer.objects.active = skin
bpy.ops.object.vertex_group_limit_total(group_select_mode="ALL", limit=4)
bpy.ops.object.vertex_group_normalize_all(group_select_mode="ALL", lock_active=False)
wsum = np.array([sum(g.weight for g in v.groups) for v in me.vertices])
unweighted = np.flatnonzero(wsum < 0.5)
log("skin weights: %d vertex groups, unweighted vertices %d of %d" % (len(skin.vertex_groups), len(unweighted), len(wsum)))
assert len(unweighted) < 0.02 * len(wsum), "automatic skin weights failed"
if len(unweighted):
    kd = kdtree.KDTree(len(me.vertices) - len(unweighted))
    for i in np.flatnonzero(wsum >= 0.5):
        kd.insert(me.vertices[i].co, int(i))
    kd.balance()
    for i in unweighted:
        j = kd.find(me.vertices[i].co)[1]
        for g in me.vertices[j].groups:
            skin.vertex_groups[g.group].add([int(i)], g.weight, "REPLACE")

def bind_like_skin(ob):
    kd = kdtree.KDTree(len(me.vertices))
    for v in me.vertices:
        kd.insert(v.co, v.index)
    kd.balance()
    for g in skin.vertex_groups:
        ob.vertex_groups.new(name=g.name)
    for v in ob.data.vertices:
        j = kd.find(v.co)[1]
        for g in me.vertices[j].groups:
            ob.vertex_groups[g.group].add([v.index], g.weight, "REPLACE")
    ob.modifiers.new("Armature", "ARMATURE").object = rig

bind_like_skin(objs["BODY_Nails"])
for n in ("BODY_Eye_L", "BODY_Eye_R"):
    ob = objs[n]
    ob.vertex_groups.new(name="RIG_Head").add(list(range(len(ob.data.vertices))), 1.0, "REPLACE")
    ob.modifiers.new("Armature", "ARMATURE").object = rig
for n in SKINNED:
    objs[n]["skinned"] = True

# quick deformation test: bend the left elbow, the trunk must not move and the hand must
pb = rig.pose.bones["RIG_Forearm_L"]
pb.rotation_mode = "XYZ"
pb.rotation_euler = (math.radians(50), 0, 0)
dg = bpy.context.evaluated_depsgraph_get()
dg.update()
ev_ob = skin.evaluated_get(dg)
ev = ev_ob.to_mesh()
pos = np.empty(len(ev.vertices) * 3, np.float32)
ev.vertices.foreach_get("co", pos)
ev_ob.to_mesh_clear()
disp = np.linalg.norm(pos.reshape(-1, 3) - skin_co, axis=1)
hand_v = verts_of(reg == M.REGION_IDS["HAND_LEFT"])
trunk_v = verts_of(np.isin(reg, [M.REGION_IDS[k] for k in ("ABDOMEN", "PELVIS", "HEAD", "THIGH_RIGHT")]))
log("rig test (left elbow 50 deg): hand moves %.3f m (mean), trunk max %.5f m" % (disp[hand_v].mean(), disp[trunk_v].max()))
assert disp[hand_v].mean() > 0.05 and disp[trunk_v].max() < 0.002, "skin weights do not behave"
pb.rotation_euler = (0, 0, 0)
bpy.context.view_layer.update()

# ================================================================ second fictional body profile (same height, heavier build)
GROW = {"ABDOMEN": 0.028, "PELVIS": 0.020, "CHEST_ANTERIOR": 0.012, "CHEST_POSTERIOR": 0.010, "THIGH": 0.012, "UPPER_ARM": 0.007,
        "SHOULDER": 0.005, "KNEE": 0.004, "CALF": 0.005, "FOREARM": 0.003, "NECK": 0.004}
amount_f = np.zeros(npoly, np.float32)
for rname, rid in M.REGION_IDS.items():
    amount_f[reg == rid] = next((v for k, v in GROW.items() if rname.startswith(k)), 0.0)
nv = len(me.vertices)
amount = np.zeros(nv, np.float32)
count = np.zeros(nv, np.float32)
for i, p in enumerate(skin_polys):
    for v in p:
        amount[v] += amount_f[i]
        count[v] += 1
amount /= np.maximum(count, 1)
edges = np.empty(len(me.edges) * 2, np.int32)
me.edges.foreach_get("vertices", edges)
edges = edges.reshape(-1, 2)
deg = np.bincount(edges.ravel(), minlength=nv).astype(np.float32)
for _ in range(40):                                    # blur the amount so regions blend into each other
    acc = np.zeros(nv, np.float32)
    np.add.at(acc, edges[:, 0], amount[edges[:, 1]])
    np.add.at(acc, edges[:, 1], amount[edges[:, 0]])
    amount = 0.5 * amount + 0.5 * acc / np.maximum(deg, 1)
vn = np.empty(nv * 3, np.float32)
me.vertices.foreach_get("normal", vn)
skin.shape_key_add(name="Body_Basis", from_mix=False)
kb = skin.shape_key_add(name="Profile_B", from_mix=False)
kb.data.foreach_set("co", (skin_co + vn.reshape(-1, 3) * amount[:, None]).ravel())
kb.value = 0.0
me.shape_keys.name = "KEYS_BODY_Skin"
skin.active_shape_key_index = 0
root["profile_b"] = json.dumps({"profile_id": "REFERENCE_B", "fictional": True, "shape_key": "Profile_B", "height_m": profile["height_m"],
                                "note": "Heavier build, same stature. Only the outer body changes; internal anatomy, anchors and markers stay with profile A.",
                                "max_surface_offset_m": round(float(amount.max()), 4)})

# heatmap-ready vertex colours (white = no tint); the app can write values into COLOR_0 at runtime
col = me.color_attributes.new("Heatmap", "BYTE_COLOR", "POINT")
col.data.foreach_set("color", np.ones(nv * 4, np.float32))
me.color_attributes.active_color = col
me.color_attributes.render_color_index = me.color_attributes.find("Heatmap")

# ================================================================ pivots and shape keys
meshes = [o for o in bpy.data.objects if o.type == "MESH"]
def bbox_centre(names):
    pts = np.concatenate([co(objs[n]) for n in names])
    return (pts.min(0) + pts.max(0)) / 2
groups_ = collections.defaultdict(list)
for o in meshes:
    if o.parent and o.parent.get("node_role") == "group" and o.parent.name != "GROUP_BodyRegions":
        groups_[o.parent.name].append(o.name)
centre = {g: bbox_centre(ch) for g, ch in groups_.items()}
for o in meshes:
    if o.name in SKINNED or o.name == M.DELTOID_REGION_NAME:
        continue                                        # skinned meshes and the skin overlay stay in root space
    c = bbox_centre([o.name])
    o.data.transform(Matrix.Translation(-V3(c)))
    o.location = V3(c - centre[o.parent.name]) if o.parent.name in centre else V3(c)
    o.data.update()
for g, c in centre.items():
    objs[g].location = V3(c)
bpy.context.view_layer.update()
params = MO.compute_params(objs)
root["morph_params"] = json.dumps(params)
keyed = MO.apply_all(objs, params)
log("shape keys on:", keyed)
for n in keyed:                                         # neutral state must equal the basis, and the keys must stay small
    kbs = objs[n].data.shape_keys.key_blocks
    base = np.empty(len(objs[n].data.vertices) * 3, np.float32)
    kbs[0].data.foreach_get("co", base)
    for kblock in kbs[1:]:
        cur = np.empty_like(base)
        kblock.data.foreach_get("co", cur)
        dmax = float(np.abs(cur - base).reshape(-1, 3).max())
        assert kblock.value == 0.0 and dmax < 0.03, "shape key %s on %s out of range" % (kblock.name, n)
log("heart axis length %.1f mm; lungs z %.3f .. %.3f" % (
    1000 * np.linalg.norm(np.array(params["heart"]["apex"]) - np.array(params["heart"]["base"])),
    params["lungs"]["z_bottom"], params["lungs"]["z_top"]))

# ================================================================ cameras, lights, world
cam_coll = "17_PREVIEW_LIGHTS_AND_CAMERAS"
mid_z = height / 2
def add_camera(name, direction, scale=1.95, target=(0, 0, None)):
    cd = bpy.data.cameras.new(name)
    cd.type, cd.ortho_scale, cd.clip_start, cd.clip_end = "ORTHO", scale, 0.05, 50
    ob = bpy.data.objects.new(name, cd)
    colls[cam_coll].objects.link(ob)
    d = Vector(direction).normalized()
    tgt = Vector((target[0], target[1], mid_z if target[2] is None else target[2]))
    ob.location = tgt + d * 6
    ob.rotation_euler = (-d).to_track_quat("-Z", "Y").to_euler()
    ob.parent = root
    ob["node_role"] = "preview_camera"
    return ob
cams = [add_camera("CAM_Front", (0, -1, 0)), add_camera("CAM_Back", (0, 1, 0)), add_camera("CAM_Side_Left", (1, 0, 0)),
        add_camera("CAM_Side_Right", (-1, 0, 0)), add_camera("CAM_ThreeQuarter", (0.75, -1, 0.25)),
        add_camera("CAM_Torso_Front", (0, -1, 0), scale=0.95, target=(0, 0, 1.22))]
scene.camera = cams[0]
def add_light(name, direction, energy, color=(1, 1, 1)):
    ld = bpy.data.lights.new(name, "SUN")
    ld.energy, ld.color, ld.angle = energy, color, math.radians(20)
    ob = bpy.data.objects.new(name, ld)
    colls[cam_coll].objects.link(ob)
    ob.location = Vector(direction).normalized() * 4 + Vector((0, 0, mid_z))
    ob.rotation_euler = (-Vector(direction)).to_track_quat("-Z", "Y").to_euler()
    ob.parent = root
    ob["node_role"] = "preview_light"
add_light("LIGHT_Key", (-0.6, -1, 0.9), 3.0)
add_light("LIGHT_Fill", (1, -0.6, 0.3), 1.2, (0.85, 0.9, 1.0))
add_light("LIGHT_Rim", (0.3, 1, 0.8), 1.8)
world = bpy.data.worlds.new("WORLD_Preview")
world.use_nodes = True
world.node_tree.nodes["Background"].inputs[0].default_value = (0.045, 0.05, 0.06, 1)
world.node_tree.nodes["Background"].inputs[1].default_value = 1.0
scene.world = world
scene.render.resolution_x, scene.render.resolution_y = 1200, 1800
scene.render.film_transparent = False
scene.view_settings.view_transform = "Standard"

# ================================================================ housekeeping and save
for name in ("12_SENSOR_ANCHORS", "13_BODY_REGIONS", "16_REFERENCE_OBJECTS"):
    colls[name].hide_render = True
root["blender_version"] = bpy.app.version_string
root["coordinate_convention"] = "Blender: +Z up, subject faces -Y, subject's left is +X. glTF / Three.js: +Y up, subject faces +Z, subject's left is +X."
generic = [o.name for o in bpy.data.objects if re.match(r"^(Cube|Sphere|Object|Empty|Mesh|Plane|Cylinder|Curve)(\.\d+)?$", o.name) or re.search(r"\.\d{3}$", o.name)]
assert not generic, "generic object names: %s" % generic
for _ in range(3):
    bpy.ops.outliner.orphans_purge(do_local_ids=True, do_linked_ids=True, do_recursive=True)
os.makedirs(os.path.dirname(OUT), exist_ok=True)
bpy.context.preferences.filepaths.save_version = 0      # no .blend1 backups next to the deliverable
bpy.ops.wm.save_as_mainfile(filepath=OUT, compress=True)
kinds = collections.Counter(o.type for o in bpy.data.objects)
log("saved", OUT, dict(kinds), "in %.1fs" % (time.time() - t0))
