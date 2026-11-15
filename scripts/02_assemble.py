"""Stage 2: assemble the modular anatomy from the baked Z-Anatomy meshes.

Scales the atlas to the 1.75 m reference stature, joins source meshes into the
stable CHC objects (chc_mapping.py), builds the continuous skin with region ids
and UVs, creates collections, group empties, materials and metadata.

blender --background --python scripts/02_assemble.py
Output: build/stage2_assembled.blend, scripts/mapping/zanatomy_to_chc.csv
"""
import bpy, bmesh, sys, os, re, csv, json, collections, time
import numpy as np
from mathutils import kdtree
from mathutils import Vector, Matrix
from mathutils.bvhtree import BVHTree

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "scripts"))
import chc_mapping as M

EXTRACTED = os.path.join(ROOT, "build", "zanatomy_extracted.blend")
OUT = os.path.join(ROOT, "build", "stage2_assembled.blend")
CSV_OUT = os.path.join(ROOT, "scripts", "mapping", "zanatomy_to_chc.csv")
t0 = time.time()
log = lambda *a: print("ASSEMBLE", *a, flush=True)

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.name = "CrewHealthCheck"
scene.unit_settings.system = "METRIC"
scene.unit_settings.scale_length = 1.0
scene.unit_settings.length_unit = "METERS"

with bpy.data.libraries.load(EXTRACTED, link=False) as (src, dst):
    dst.objects = list(src.objects)
sources = [o for o in dst.objects if o is not None]
log("loaded", len(sources), "source objects")

# ---------------------------------------------------------------- uniform scale to the reference stature
skin_all = [o for o in sources if o["za_collection"].startswith("9:") and not M.SKIN_EXCLUDE.search(o.name)]
nail_src = [o for o in skin_all if M.SKIN_NAILS.search(o.name)]
skin_src = [o for o in skin_all if not M.SKIN_NAILS.search(o.name)]
zs = [v.co.z for o in skin_src for v in o.data.vertices]
zmin, zmax = min(zs), max(zs)
S = M.REFERENCE_HEIGHT_M / (zmax - zmin)
xf = Matrix.Translation((0, 0, -zmin * S)) @ Matrix.Scale(S, 4)
for o in sources:
    o.data.transform(xf)
log("source stature %.4f m, uniform scale %.5f" % (zmax - zmin, S))

def centroid(o):
    n = len(o.data.vertices)
    c = Vector()
    for v in o.data.vertices:
        c += v.co
    return c / max(n, 1)

# ---------------------------------------------------------------- collections, root, materials
master = bpy.data.collections.new("CREW_HEALTH_CHECK_MASTER")
scene.collection.children.link(master)
colls = {}
for name in M.COLLECTIONS:
    colls[name] = bpy.data.collections.new(name)
    master.children.link(colls[name])

def make_material(name, rgba_rough):
    r, g, b, a, rough = rgba_rough
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    out.location = (300, 0)
    nt.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])
    bsdf.inputs["Base Color"].default_value = (r, g, b, 1.0)
    bsdf.inputs["Roughness"].default_value = rough
    bsdf.inputs["Metallic"].default_value = 0.0
    bsdf.inputs["Alpha"].default_value = a
    mat.diffuse_color = (r, g, b, a)
    mat.roughness = rough
    if a < 1.0:
        mat.surface_render_method = "BLENDED"
    mat.use_backface_culling = False
    mat.use_fake_user = True                 # optional inspection materials stay in the file even when unassigned
    return mat

mats = {n: make_material(n, v) for n, v in M.MATERIALS.items()}

def new_empty(name, coll, loc=(0, 0, 0), size=0.05, parent=None):
    e = bpy.data.objects.new(name, None)
    e.empty_display_type = "PLAIN_AXES"
    e.empty_display_size = size
    e.location = loc
    colls[coll].objects.link(e)
    if parent:
        e.parent = parent
        e.matrix_parent_inverse = parent.matrix_world.inverted()
    return e

root = new_empty(M.ROOT_NAME, "15_VISUALIZATION_HELPERS", size=0.2)
root["asset_version"] = M.ASSET_VERSION
root["reference_height_m"] = M.REFERENCE_HEIGHT_M
root["forward_axis_blender"] = "-Y"
root["up_axis_blender"] = "+Z"
root["subject_left_axis"] = "+X"
sys_empty = {}
for key, (coll, ename) in M.SYSTEMS.items():
    e = new_empty(ename, coll, size=0.1, parent=root)
    e["anatomy_id"] = ename.upper()
    e["anatomy_system"] = key
    e["node_role"] = "system_group"
    e["asset_version"] = M.ASSET_VERSION
    sys_empty[key] = e

# ---------------------------------------------------------------- resolve source -> target
groups = collections.OrderedDict()
rows = []
for o in sources:
    coll = o["za_collection"]
    if coll.startswith("9:"):
        continue
    target = M.resolve(o.name, coll, o["za_path"], centroid(o).x)
    system = M.first(M.SYSTEM_BY_TARGET, target) if target else ""
    rows.append((o.name, coll, o["za_path"], target or "", system))
    if target:
        groups.setdefault(target, []).append(o)
def split_faces(me, pick):
    """Split a mesh in two along the faces chosen by pick(bm); both halves get their cut closed."""
    bm = bmesh.new()
    bm.from_mesh(me)
    chosen = pick(bm)
    bm.faces.index_update()
    idx = {f.index for f in chosen}
    other = bm.copy()
    other.faces.ensure_lookup_table()
    bmesh.ops.delete(bm, geom=list(chosen), context="FACES")
    bmesh.ops.delete(other, geom=[f for f in other.faces if f.index not in idx], context="FACES")
    out = []
    for b, cap in ((bm, True), (other, True)):
        edges = [e for e in b.edges if e.is_boundary]
        if cap and edges:
            bmesh.ops.holes_fill(b, edges=edges, sides=0)
            bmesh.ops.poke(b, faces=[f for f in b.faces if len(f.verts) > 4])
        bmesh.ops.recalc_face_normals(b, faces=b.faces)
        m = bpy.data.meshes.new("split")
        b.to_mesh(m)
        b.free()
        out.append(m)
    return out   # [rest, chosen]

# The atlas models sigmoid colon and rectum as one mesh. Cut it at the level of S3 (rectosigmoid junction).
sig = next((o for o in groups.get("ORG_LargeIntestine", []) if o.name == "Sigmoid colon"), None)
if sig:
    sac_z = [v.co.z for v in next(o for o in sources if o.name == "Sacrum").data.vertices]
    z_cut = (min(sac_z) + max(sac_z)) / 2
    def pick_rectum(bm):
        bmesh.ops.bisect_plane(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:], dist=1e-6,
                               plane_co=(0, 0, z_cut), plane_no=(0, 0, 1), clear_inner=False, clear_outer=False)
        start = min(bm.verts, key=lambda v: v.co.z).link_faces[0]
        part, stack = {start}, [start]
        while stack:
            f = stack.pop()
            for e in f.edges:
                for g in e.link_faces:
                    if g not in part and g.calc_center_median().z < z_cut:
                        part.add(g)
                        stack.append(g)
        return part
    upper, rect = split_faces(sig.data, pick_rectum)
    sig.data = upper
    rect_ob = bpy.data.objects.new("Rectum (lower part of the atlas mesh 'Sigmoid colon', cut at S3)", rect)
    rect_ob["za_collection"], rect_ob["za_path"] = sig["za_collection"], sig["za_path"]
    sources.append(rect_ob)
    groups["ORG_Rectum"] = [rect_ob]
    rows.append((rect_ob.name, sig["za_collection"], sig["za_path"], "ORG_Rectum", "digestive"))
    log("rectum split from sigmoid colon at z=%.3f: %d faces, lowest z %.3f" % (z_cut, len(rect.polygons), min(v.co.z for v in rect.vertices)))

os.makedirs(os.path.dirname(CSV_OUT), exist_ok=True)
with open(CSV_OUT, "w", newline="") as fh:
    w = csv.writer(fh)
    w.writerow(["source_name", "source_collection", "source_path", "target", "system"])
    w.writerows(sorted(rows, key=lambda r: (r[4], r[3], r[0])))
log("targets", len(groups), "kept sources", sum(len(v) for v in groups.values()), "dropped", sum(1 for r in rows if not r[3]))

def set_meta(ob, system, name=None, sources_=None, **extra):
    ob["anatomy_id"] = ob.name.upper()
    ob["anatomy_system"] = system
    ob["anatomy_name"] = name or M.display_name(ob.name)
    ob["side"] = M.side_of(ob.name)
    ob["default_visible"] = True
    ob["interactive"] = True
    ob["visualization_type"] = M.first(M.VISUALIZATION_TYPE, ob.name)
    ob["schematic"] = False
    ob["asset_version"] = M.ASSET_VERSION
    if sources_:
        uniq = sorted({re.sub(r"\.(l|r)$", "", s) for s in sources_})
        txt = "; ".join(uniq)
        ob["anatomy_name_source"] = txt if len(txt) <= 240 else txt[:237] + "..."
        ob["source_component_count"] = len(sources_)
    for k, v in extra.items():
        ob[k] = v

def finish_mesh(me, mat_name):
    me.materials.clear()
    me.materials.append(mats[mat_name])
    n = len(me.polygons)
    me.polygons.foreach_set("material_index", [0] * n)
    me.polygons.foreach_set("use_smooth", [True] * n)
    me.update()

def join_sources(name, objs):
    bm = bmesh.new()
    for o in objs:
        bm.from_mesh(o.data)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    for uv in list(me.uv_layers):
        me.uv_layers.remove(uv)
    for attr in [a for a in me.color_attributes]:
        me.color_attributes.remove(attr)
    for attr in [a for a in me.attributes if a.name in ("region_id", "uv_group", "deltoid_r", "is_fill", "src_part")]:
        me.attributes.remove(attr)
    # which source structure every vertex came from (used to find joints for the rig; not exported)
    part = np.repeat(np.arange(len(objs), dtype=np.int32), [len(o.data.vertices) for o in objs])
    me.attributes.new("src_part", "INT", "POINT").data.foreach_set("value", part)
    return me

group_empty = {}
def parent_for(target, system):
    for pat, pname, _disp in M.GROUP_PARENTS:
        if re.search(pat, target):
            if pname not in group_empty:
                e = new_empty(pname, M.SYSTEMS[system][0], size=0.06, parent=sys_empty[system])
                set_meta(e, system)
                e["node_role"] = "group"
                group_empty[pname] = e
            return group_empty[pname]
    return sys_empty[system]

built = {}
for target, objs in groups.items():
    system = M.first(M.SYSTEM_BY_TARGET, target)
    me = join_sources(target, objs)
    finish_mesh(me, M.first(M.MATERIAL_BY_TARGET, target))
    ob = bpy.data.objects.new(target, me)
    colls[M.SYSTEMS[system][0]].objects.link(ob)
    ob.parent = parent_for(target, system)
    set_meta(ob, system, sources_=[o.name for o in objs])
    ob["src_parts"] = json.dumps([o.name for o in objs])
    built[target] = ob
log("built", len(built), "objects in %.1fs" % (time.time() - t0))

# ---------------------------------------------------------------- skin
def region_of(patch_name):
    base = re.sub(r"\.(l|r)$", "", patch_name)
    side = "LEFT" if patch_name.endswith(".l") else "RIGHT"
    for pat, reg in M.REGION_RULES:
        if pat.search(base):
            return reg.replace("{SIDE}", side)

EAR = re.compile(r"auric|helix|tragus|concha|scapha|Triangular fossa|Eminentia|intertragic|Lobule", re.I)
SCALP = re.compile(r"^(Parietal|Occipital|Temporal|Mastoid) region$")

t12 = next(o for o in sources if o.name == "Vertebra T12")
z_t12 = centroid(t12).z - 0.02
bm = bmesh.new()
L_reg = bm.faces.layers.int.new("region_id")
L_uvg = bm.faces.layers.int.new("uv_group")
L_delt = bm.faces.layers.int.new("deltoid_r")
L_new = bm.faces.layers.int.new("is_fill")
uv_groups = {}
patch_count = collections.Counter()
for o in skin_src:
    base = re.sub(r"\.(l|r)$", "", o.name)
    side = "L" if o.name.endswith(".l") else "R"
    reg = region_of(o.name)
    me = o.data
    cen = centroid(o)
    nrm = Vector()
    for p in me.polygons:
        nrm += p.normal * p.area
    if "Anterior" in base or base in ("Palm", "Cubital fossa") or "Palmar" in base:
        ap = "A"
    elif "Posterior" in base or "Dorsum of hand" in base or "Dorsal surfaces of digits of hand" in base:
        ap = "P"
    elif reg.startswith("FOOT"):
        ap = "P" if nrm.z < -0.3 * nrm.length else "A"
    elif reg == "HEAD":
        ap = "EAR_" + side if EAR.search(base) else "P" if SCALP.search(base) else "A"
    else:
        ap = "A" if nrm.y < 0 else "P"
    vmap = [bm.verts.new(v.co) for v in me.vertices]
    for p in me.polygons:
        try:
            f = bm.faces.new([vmap[i] for i in p.vertices])
        except ValueError:
            continue
        r = reg
        if reg == "CHEST_SPLIT":
            r = "CHEST_ANTERIOR" if p.center.y < cen.y else "CHEST_POSTERIOR"
        elif reg == "BACK_SPLIT":
            r = "CHEST_POSTERIOR" if p.center.z > z_t12 else "ABDOMEN"
        f[L_reg] = M.REGION_IDS[r]
        key = r + "_" + (ap if not reg.endswith("SPLIT") else "X")
        f[L_uvg] = uv_groups.setdefault(key, len(uv_groups) + 1)
        f[L_delt] = 1 if o.name == "Deltoid region.r" else 0
        patch_count[r] += 1
bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-4)
bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context="VERTS")
log("skin welded: verts", len(bm.verts), "faces", len(bm.faces), "uv groups", len(uv_groups))

def inconsistent_edges(bm):
    return [e for e in bm.edges if len(e.link_loops) == 2 and e.link_loops[0].vert == e.link_loops[1].vert]

def drop_fins(bm):
    """Edges shared by 3+ faces come from overlapping patch borders: drop the smallest extra faces."""
    removed = 0
    for _ in range(20):
        multi = [e for e in bm.edges if len(e.link_faces) > 2]
        if not multi:
            break
        kill = set()
        for e in multi:
            fs = sorted(e.link_faces, key=lambda f: f.calc_area())
            kill.update(fs[:len(fs) - 2])
        removed += len(kill)
        bmesh.ops.delete(bm, geom=list(kill), context="FACES")
    return removed

def boundary_loops(bm):
    edges = {e for e in bm.edges if e.is_boundary}
    loops = []
    while edges:
        e = edges.pop()
        loop, stack = [e], [e]
        while stack:
            cur = stack.pop()
            for v in cur.verts:
                for e2 in v.link_edges:
                    if e2 in edges:
                        edges.discard(e2)
                        loop.append(e2)
                        stack.append(e2)
        loops.append(loop)
    return loops

def loop_info(loop):
    vs = {v for e in loop for v in e.verts}
    c = sum((v.co for v in vs), Vector()) / len(vs)
    regs = collections.Counter(f[L_reg] for e in loop for f in e.link_faces if f[L_reg])
    rid = regs.most_common(1)[0][0] if regs else M.REGION_IDS["HEAD"]
    rname = next(k for k, v in M.REGION_IDS.items() if v == rid)
    simple = all(sum(1 for e in v.link_edges if e.is_boundary) == 2 for v in vs)
    return c, rname, sum(e.calc_length() for e in loop), simple

def is_eye(loop):
    c, rname, length, simple = loop_info(loop)
    return rname == "HEAD" and simple and 0.015 < abs(c.x) < 0.06 and c.y < -0.05 and 0.05 < length < 0.12

def ordered_verts(loop):
    """Loop vertices in the order that makes new faces wind like the neighbouring skin."""
    e0 = loop[0]
    l0 = e0.link_loops[0]                 # existing face runs l0.vert -> l0.link_loop_next.vert
    start, second = l0.link_loop_next.vert, l0.vert   # so the cap must run the other way
    nxt = collections.defaultdict(list)
    for e in loop:
        a, b = e.verts
        nxt[a].append(b)
        nxt[b].append(a)
    out, prev, cur = [start], start, second
    while cur is not start and len(out) <= len(loop):
        out.append(cur)
        cand = [v for v in nxt[cur] if v is not prev]
        if not cand:
            break
        prev, cur = cur, cand[0]
    return out

def fill_dome(bm, loop, rings=5, bulge=0.012):
    """Close a non-planar opening with concentric quad rings and a slightly convex cap."""
    vs = ordered_verts(loop)
    n = len(vs)
    c = sum((v.co for v in vs), Vector()) / n
    nrm = Vector()
    for e in loop:
        for f in e.link_faces:
            nrm += f.normal * f.calc_area()
    nrm.normalize()                        # surrounding skin looks outwards: bulge the same way
    prev_ring, new_faces = vs, []
    for k in range(1, rings):
        t = k / rings
        ring = [bm.verts.new(v.co.lerp(c, t) + nrm * bulge * (2 * t - t * t)) for v in vs]
        for i in range(n):
            new_faces.append(bm.faces.new((prev_ring[i], prev_ring[(i + 1) % n], ring[(i + 1) % n], ring[i])))
        prev_ring = ring
    centre = bm.verts.new(c + nrm * bulge)
    for i in range(n):
        new_faces.append(bm.faces.new((prev_ring[i], prev_ring[(i + 1) % n], centre)))
    inner = list({v for f in new_faces for v in f.verts} - set(vs))
    for _ in range(4):
        bmesh.ops.smooth_vert(bm, verts=inner, factor=0.5, use_axis_x=True, use_axis_y=True, use_axis_z=True)
    return new_faces

def faces_ok(faces):
    return bool(faces) and not any(
        len(e.link_faces) > 2 or (len(e.link_loops) == 2 and e.link_loops[0].vert == e.link_loops[1].vert)
        for f in faces for e in f.edges)

log("skin overlapping border faces removed:", drop_fins(bm))
bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
low = min(bm.faces, key=lambda f: f.calc_center_median().z)
if low.normal.z > 0:                       # the sole of the foot must look down
    bmesh.ops.reverse_faces(bm, faces=bm.faces)
bm.normal_update()
assert not inconsistent_edges(bm), "skin patches do not orient consistently"

def component_ids(bm):
    comp, cid = {}, 0
    for v in bm.verts:
        if v in comp:
            continue
        comp[v] = cid
        stack = [v]
        while stack:
            x = stack.pop()
            for e in x.link_edges:
                y = e.other_vert(x)
                if y not in comp:
                    comp[y] = cid
                    stack.append(y)
        cid += 1
    return comp

def loop_ring(loop):
    nxt = collections.defaultdict(list)
    for e in loop:
        a_, b_ = e.verts
        nxt[a_].append(b_)
        nxt[b_].append(a_)
    start = loop[0].verts[0]
    out, prev, cur = [start], None, start
    while True:
        cand = [v for v in nxt[cur] if v is not prev]
        if not cand or cand[0] is start or len(out) > len(loop):
            break
        prev, cur = cur, cand[0]
        out.append(cur)
    return out

def newell(ring):
    n = Vector()
    for i, v in enumerate(ring):
        a_, b_ = v.co, ring[(i + 1) % len(ring)].co
        n += Vector(((a_.y - b_.y) * (a_.z + b_.z), (a_.z - b_.z) * (a_.x + b_.x), (a_.x - b_.x) * (a_.y + b_.y)))
    return n

def zipper(bm, la, lb):
    """Join two boundary loops of different lengths with a strip of triangles (shortest diagonal first)."""
    A, B = loop_ring(la), loop_ring(lb)
    if newell(A).dot(newell(B)) < 0:
        B.reverse()
    k = min(range(len(B)), key=lambda j: (B[j].co - A[0].co).length)
    B = B[k:] + B[:k]
    nA, nB, i, j, faces = len(A), len(B), 0, 0, []
    while i < nA or j < nB:
        a0, a1, b0, b1 = A[i % nA], A[(i + 1) % nA], B[j % nB], B[(j + 1) % nB]
        if j >= nB or (i < nA and (a1.co - b0.co).length <= (a0.co - b1.co).length):
            faces.append(bm.faces.new((a0, a1, b0)))
            i += 1
        else:
            faces.append(bm.faces.new((a0, b1, b0)))
            j += 1
    return faces

# the ears are separate shells in the atlas: stitch each ear's base ring to the matching opening in the head
comp = component_ids(bm)
loops_now = [l for l in boundary_loops(bm) if not is_eye(l)]
info_ = [(l, loop_info(l), comp[l[0].verts[0]]) for l in loops_now]
used = set()
for i, (la, (ca, ra, lena, sa), cpa) in enumerate(info_):
    for j, (lb, (cb, rb, lenb, sb), cpb) in enumerate(info_):
        if j <= i or i in used or j in used or cpa == cpb or not (sa and sb):
            continue
        if ra == rb == "HEAD" and min(lena, lenb) > 0.1 and (ca - cb).length < 0.02:
            new = zipper(bm, la, lb)
            for f in new:
                f[L_new] = 1
            used.update((i, j))
            log("skin: ear stitched to the head (%d + %d edges, %d faces, gap %.1f mm)" % (len(la), len(lb), len(new), 1000 * (ca - cb).length))
bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
low = min(bm.faces, key=lambda f: f.calc_center_median().z)
if low.normal.z > 0:
    bmesh.ops.reverse_faces(bm, faces=bm.faces)

# close every opening except the two eyelid openings; each fill is verified and undone if it breaks the surface
stats = collections.Counter()
for loop in sorted(boundary_loops(bm), key=len):
    if is_eye(loop):
        continue
    c, rname, length, simple = loop_info(loop)
    genital = simple and length > 0.3 and abs(c.x) < 0.02 and 0.7 < c.z < 0.9
    if genital:
        new = fill_dome(bm, loop, rings=5, bulge=0.012)
        log("skin: genital geometry removed, opening closed with a neutral cap (%d edges, %.3f m)" % (len(loop), length))
    else:
        new = bmesh.ops.holes_fill(bm, edges=loop, sides=0)["faces"]
        if not faces_ok(new):
            if new:
                bmesh.ops.delete(bm, geom=new, context="FACES")
            new = fill_dome(bm, loop, rings=2, bulge=0.0) if simple else []
    if faces_ok(new):
        stats["closed"] += 1
        for f in new:
            f[L_new] = 2 if genital else 1
    else:
        if new:
            bmesh.ops.delete(bm, geom=new, context="FACES")
        stats["failed"] += 1
        log("skin: COULD NOT CLOSE %s opening len=%.3f at (%.3f %.3f %.3f)" % (rname, length, c.x, c.y, c.z))
# n-gon fills become fans around a new centre vertex (never re-uses an existing edge, so the mesh stays manifold)
poke = bmesh.ops.poke(bm, faces=[f for f in bm.faces if len(f.verts) > 4])
for f in poke["faces"]:
    f[L_new] = 1
bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context="VERTS")
# seam fills sit a fraction of a millimetre off the surface: relax their vertices so the seams disappear
seam_verts = list({v for f in bm.faces if f[L_new] == 1 for v in f.verts})
for _ in range(3):
    bmesh.ops.smooth_vert(bm, verts=seam_verts, factor=0.5, use_axis_x=True, use_axis_y=True, use_axis_z=True)
# new faces inherit the region / uv group of their neighbours
for _ in range(60):
    blank = [f for f in bm.faces if f[L_reg] == 0]
    if not blank:
        break
    for f in blank:
        nb = [g for e in f.edges for g in e.link_faces if g is not f and g[L_reg]]
        if nb:
            f[L_reg], f[L_uvg] = nb[0][L_reg], nb[0][L_uvg]
left = boundary_loops(bm)
log("skin openings closed: %d, failed: %d, left open (eyes): %d" % (stats["closed"], stats["failed"], len(left)),
    "| inconsistent edges:", len(inconsistent_edges(bm)), "| multi-face edges:", sum(1 for e in bm.edges if len(e.link_faces) > 2))
for f in bm.faces:
    f.smooth = True
# seams along uv-group borders
for e in bm.edges:
    fs = e.link_faces
    e.seam = len(fs) != 2 or fs[0][L_uvg] != fs[1][L_uvg]
skin_me = bpy.data.meshes.new("BODY_Skin")
bm.to_mesh(skin_me)
n_bound = sum(1 for e in bm.edges if e.is_boundary)
n_multi = sum(1 for e in bm.edges if len(e.link_faces) > 2)
bm.free()
finish_mesh(skin_me, "MAT_Body_Base")
skin = bpy.data.objects.new("BODY_Skin", skin_me)
colls["01_EXTERNAL_BODY"].objects.link(skin)
skin.parent = sys_empty["external"]
set_meta(skin, "external", sources_=[o.name for o in skin_src])
skin["region_attribute"] = "region_id"
log("skin: verts %d faces %d boundary edges %d non-manifold edges %d" % (len(skin_me.vertices), len(skin_me.polygons), n_bound, n_multi))
log("skin faces per region:", dict(patch_count))

# UV unwrap (islands = region x front/back halves)
skin_me.uv_layers.new(name="UV_Skin")
bpy.context.view_layer.objects.active = skin
skin.select_set(True)
bpy.ops.object.mode_set(mode="EDIT")
bpy.ops.mesh.select_all(action="SELECT")
bpy.ops.uv.unwrap(method="ANGLE_BASED", margin=0.002)
try:
    bpy.ops.uv.pack_islands(rotate=True, margin=0.003)
except Exception as ex:  # packing needs a UV editor context on some builds
    log("pack_islands failed:", ex)
bpy.ops.object.mode_set(mode="OBJECT")
skin.select_set(False)

nails_me = join_sources("BODY_Nails", nail_src)
finish_mesh(nails_me, "MAT_Body_Base")
nails = bpy.data.objects.new("BODY_Nails", nails_me)
colls["01_EXTERNAL_BODY"].objects.link(nails)
nails.parent = sys_empty["external"]
set_meta(nails, "external", sources_=[o.name for o in nail_src])
nails["interactive"] = False
built["BODY_Nails"] = nails

# ---------------------------------------------------------------- derived and schematic structures
def add_object(name, me, system, parent=None, **meta):
    finish_mesh(me, M.first(M.MATERIAL_BY_TARGET, name))
    ob = bpy.data.objects.new(name, me)
    colls[M.SYSTEMS[system][0]].objects.link(ob)
    ob.parent = parent or parent_for(name, system)
    set_meta(ob, system, **meta)
    built[name] = ob
    return ob

built["ORG_Rectum"]["derived"] = True
built["ORG_Rectum"]["note"] = "Split from the atlas mesh 'Sigmoid colon' at the level of S3. The anal canal is not modelled."

# interventricular septum: the part of the left-ventricular wall that faces the right ventricle
lv, rv = built["ORG_Heart_LeftVentricle"], built["ORG_Heart_RightVentricle"]
kd = kdtree.KDTree(len(rv.data.vertices))
for i, v in enumerate(rv.data.vertices):
    kd.insert(v.co, i)
kd.balance()
def pick_septum(bm, state={}):
    dist = {v: kd.find(v.co)[2] for v in bm.verts}
    best = set()
    for thr in (0.006, 0.008, 0.010, 0.012, 0.014):
        cand = {f for f in bm.faces if all(dist[v] < thr for v in f.verts)}
        seen, best = set(), set()
        for f in cand:                               # largest connected patch
            if f in seen:
                continue
            comp, stack = {f}, [f]
            while stack:
                g = stack.pop()
                for e in g.edges:
                    for h in e.link_faces:
                        if h in cand and h not in comp:
                            comp.add(h)
                            stack.append(h)
            seen |= comp
            if sum(x.calc_area() for x in comp) > sum(x.calc_area() for x in best):
                best = comp
        area = sum(x.calc_area() for x in best)
        state["thr"], state["area"] = thr, area
        if area > 0.0025:
            break
    log("septum patch: threshold %.0f mm, area %.1f cm2, %d faces" % (state["thr"] * 1000, state["area"] * 1e4, len(best)))
    return best
bm_ = bmesh.new()
bm_.from_mesh(lv.data)
chosen = pick_septum(bm_)
bm_.faces.index_update()
idx = {f.index for f in chosen}
other = bm_.copy()
bmesh.ops.delete(bm_, geom=list(chosen), context="FACES")
bmesh.ops.delete(other, geom=[f for f in other.faces if f.index not in idx], context="FACES")
sept_me = bpy.data.meshes.new("ORG_Heart_Septum")
other.to_mesh(sept_me)
bm_.to_mesh(lv.data)
bm_.free()
other.free()
sept = add_object("ORG_Heart_Septum", sept_me, "cardiovascular", derived=True,
                  note="Surface patch split from the atlas mesh 'Left ventricle': the wall that faces the right ventricle. Not a separate solid in the source.")
sept["anatomy_name_source"] = "Left ventricle (septal wall)"

# urethra: keep the pelvic part only (the penile part belongs to the optional reproductive module)
skin_bvh = BVHTree.FromPolygons([v.co[:] for v in skin_me.vertices], [tuple(p.vertices) for p in skin_me.polygons])
def inside_skin(p):
    n, o = 0, Vector(p)
    for _ in range(64):
        hit = skin_bvh.ray_cast(o, Vector((1, 0.0137, 0.0071)))
        if hit[0] is None:
            break
        n += 1
        o = hit[0] + Vector((1e-5, 0, 0))
    return n % 2 == 1
ure = built.get("SYS_Urethra")
if ure:
    bm_ = bmesh.new()
    bm_.from_mesh(ure.data)
    gone = [v for v in bm_.verts if not inside_skin(v.co) or skin_bvh.find_nearest(v.co)[3] < 0.008]
    bmesh.ops.delete(bm_, geom=gone, context="VERTS")
    edges = [e for e in bm_.edges if e.is_boundary]
    if edges:
        bmesh.ops.holes_fill(bm_, edges=edges, sides=0)
    log("urethra trimmed to the pelvic part: removed %d of %d vertices" % (len(gone), len(ure.data.vertices)))
    for a_ in [a_ for a_ in ure.data.attributes if a_.name == "src_part"]:
        ure.data.attributes.remove(a_)
    bm_.to_mesh(ure.data)
    bm_.free()
    ure["note"] = "Pelvic part only. The penile part is omitted together with the optional reproductive module."

# schematic lymphatic pathways: thin tubes that run alongside the named veins / the vertebral column
curves = json.load(open(os.path.join(ROOT, "build", "zanatomy_curves.json")))
def cpts(name):
    best = max(curves[name], key=lambda sp: sum((Vector(a[:3]) - Vector(b[:3])).length for a, b in zip(sp, sp[1:])))
    pts = [xf @ Vector(p[:3]) for p in best]
    return pts if pts[0].z <= pts[-1].z else pts[::-1]          # distal / lower end first

def tube_mesh(name, paths):
    cu = bpy.data.curves.new(name + "_tmp", "CURVE")
    cu.dimensions, cu.bevel_depth, cu.bevel_resolution, cu.use_fill_caps, cu.resolution_u = "3D", 1.0, 2, True, 4
    for pts in paths:
        pts = [(Vector(p), r) for p, r in pts]
        sp = cu.splines.new("BEZIER")
        sp.bezier_points.add(len(pts) - 1)
        for i, (bp, (p, r)) in enumerate(zip(sp.bezier_points, pts)):
            a, b = pts[max(i - 1, 0)][0], pts[min(i + 1, len(pts) - 1)][0]
            t = (b - a) / 6.0
            bp.co, bp.handle_left, bp.handle_right, bp.radius = p, p - t, p + t, r
            bp.handle_left_type = bp.handle_right_type = "FREE"
    tmp = bpy.data.objects.new(name + "_tmp", cu)
    scene.collection.objects.link(tmp)
    dg = bpy.context.evaluated_depsgraph_get()
    dg.update()
    me = bpy.data.meshes.new_from_object(tmp.evaluated_get(dg), depsgraph=dg)
    me.name = name
    bpy.data.objects.remove(tmp)
    bpy.data.curves.remove(cu)
    return me

def along(name, off, r=0.0012, keep=None):
    pts = cpts(name)
    if keep:
        pts = pts[int(len(pts) * keep[0]):max(int(len(pts) * keep[1]), 2)]
    return [(p + Vector(off), r) for p in pts]

def vertebra_front(v, x, dy=-0.004):
    o = next(o for o in sources if o.name == v)
    ys = [w.co.y for w in o.data.vertices]
    zc = sum(w.co.z for w in o.data.vertices) / len(o.data.vertices)
    return Vector((x, min(ys) + dy, zc))

def venous_angle(side):
    ij = cpts("Internal jugular vein." + side)
    sc = cpts("Left subclavian vein" if side == "l" else "Right subclavian vein")
    return min(ij, key=lambda p: min((p - q).length for q in sc))

schem = dict(schematic=True, note="Schematic pathway drawn alongside the named vessels. Not atlas geometry; for orientation only.")
va_l, va_r = venous_angle("l"), venous_angle("r")
cisterna = vertebra_front("Vertebra L2", -0.006)
duct = [(cisterna, 0.004), (vertebra_front("Vertebra L1", -0.007), 0.004), (vertebra_front("Vertebra T12", -0.008), 0.0022)]
duct += [(vertebra_front("Vertebra T%d" % n, -0.008), 0.002) for n in (10, 8, 6)]
duct += [(vertebra_front("Vertebra T5", -0.002), 0.002), (vertebra_front("Vertebra T4", 0.006), 0.002),
         (vertebra_front("Vertebra T2", 0.012), 0.002), (vertebra_front("Vertebra C7", 0.020, -0.006), 0.002)]
top = duct[-1][0]
duct += [((top + va_l) / 2 + Vector((0, 0, 0.012)), 0.002), (va_l, 0.002)]
add_object("LYMPH_ThoracicDuct", tube_mesh("LYMPH_ThoracicDuct", [duct]), "lymphatic", **schem)

trunks = []
for side, sx, va in (("l", 1, va_l), ("r", -1, va_r)):
    off = (0.003 * sx, 0.004, 0)
    iliac = along("External iliac vein." + side, off, 0.0015) + along("Common iliac vein." + side, off, 0.0015)
    trunks.append(iliac + [(Vector((cisterna.x + 0.012 * sx, cisterna.y, (iliac[-1][0].z + cisterna.z) / 2)), 0.0018), (cisterna, 0.002)])
    trunks.append(along("Internal jugular vein." + side, (0.004 * sx, 0.003, 0), 0.0013, keep=(0.0, 0.6)) [::-1] [::-1] )
    ax = along("Axillary vein." + side, (0, 0.004, 0.003), 0.0013)
    ax = ax if (ax[0][0] - va).length > (ax[-1][0] - va).length else ax[::-1]       # run towards the venous angle
    trunks.append(ax + [(va, 0.0013)])
trunks.append([(va_r + Vector((-0.004, 0.004, 0.016)), 0.0018), (va_r + Vector((-0.002, 0.002, 0.007)), 0.0018), (va_r, 0.0018)])
add_object("LYMPH_Trunks", tube_mesh("LYMPH_Trunks", trunks), "lymphatic", **schem)

for side, sx in (("l", 1), ("r", -1)):
    S_ = "_L" if side == "l" else "_R"
    leg = [along("Great saphenous vein." + side, (0.003 * sx, 0.004, 0)), along("Femoral vein." + side, (-0.003 * sx, -0.004, 0))]
    add_object("LYMPH_Vessels_LowerLimb" + S_, tube_mesh("LYMPH_Vessels_LowerLimb" + S_, leg), "lymphatic", **schem)
    arm = [along("Basilic vein." + side, (0, 0.004, 0.002)), along("Cephalic vein." + side, (0, 0.004, 0.002))]
    add_object("LYMPH_Vessels_UpperLimb" + S_, tube_mesh("LYMPH_Vessels_UpperLimb" + S_, arm), "lymphatic", **schem)
log("schematic lymph pathways built:", [n for n in built if n.startswith("LYMPH_") and "Nodes" not in n and "Tonsil" not in n])

for o in ("BODY_Eye_L", "BODY_Eye_R"):
    if o in built:
        built[o]["interactive"] = False

# ---------------------------------------------------------------- cleanup + save
for o in sources:
    me = o.data
    bpy.data.objects.remove(o)
    if me.users == 0:
        bpy.data.meshes.remove(me)
for _ in range(3):
    bpy.ops.outliner.orphans_purge(do_local_ids=True, do_linked_ids=True, do_recursive=True)
tris = collections.Counter()
for o in scene.objects:
    if o.type == "MESH":
        tris[o["anatomy_system"]] += sum(len(p.vertices) - 2 for p in o.data.polygons)
log("triangles per system:", dict(tris), "total", sum(tris.values()))
bpy.ops.wm.save_as_mainfile(filepath=OUT, compress=True)
log("saved", OUT, "in %.1fs" % (time.time() - t0))
