"""Stage 1: bake the Z-Anatomy atlas into plain meshes.

Opens the Z-Anatomy template .blend (scripts disabled), evaluates modifiers and
curve bevels, applies world transforms, and saves only the baked anatomy to
build/zanatomy_extracted.blend. Labels, text and the template's scripts are dropped.

blender --background --disable-autoexec sources/z-anatomy/Z-Anatomy/Startup.blend \
        --python scripts/01_extract_zanatomy.py
"""
import bpy, re, os, time, json

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "build", "zanatomy_extracted.blend")

KEEP_COLLECTIONS = (
    "1: Skeletal system", "3: Joints", "4: Muscular system", "5: Cardiovascular system",
    "6: Lymphoid organs", "7: Nervous system & Sense organs", "8: Visceral systems",
    "9: Regions of human body",
)
LABEL = re.compile(r"\.(j|t|g|i)$|-profile$|-path$")
t0 = time.time()

def unhide(lc):
    lc.exclude = False
    lc.hide_viewport = False
    for ch in lc.children:
        unhide(ch)

unhide(bpy.context.view_layer.layer_collection)
for c in bpy.data.collections:
    c.hide_viewport = False

src = []
for o in bpy.data.objects:
    if o.type not in {"MESH", "CURVE"} or LABEL.search(o.name):
        continue
    colls = [c.name for c in o.users_collection if c.name in KEEP_COLLECTIONS]
    if not colls:
        continue
    o.hide_viewport = False
    try:
        o.hide_set(False)
    except RuntimeError:
        continue  # not in the view layer
    if colls[0].startswith("9:"):
        for m in o.modifiers:  # skin patches: keep the single surface, no thickness shell
            if m.type == "SOLIDIFY":
                m.show_viewport = False
    if o.type == "CURVE":
        cu = o.data
        big = cu.bevel_depth * max((p.radius for s in cu.splines for p in (s.bezier_points if s.type == "BEZIER" else s.points)), default=1) > 0.003
        cu.resolution_u = 4
        if cu.bevel_object is None:
            cu.bevel_resolution = 2 if big else 1  # 12- or 8-sided tubes
        cu.use_fill_caps = True
    src.append((o, colls[0]))

# centre lines of every curve (world space control points + radius), used later for schematic lymph paths
curves = {}
for o, coll in src:
    if o.type == "CURVE":
        mw = o.matrix_world
        curves[o.name] = [[[*(mw @ p.co.to_3d()), p.radius * o.data.bevel_depth] for p in (s.bezier_points if s.type == "BEZIER" else s.points)]
                          for s in o.data.splines]
with open(os.path.join(ROOT, "build", "zanatomy_curves.json"), "w") as fh:
    json.dump(curves, fh)

bpy.context.view_layer.update()
dg = bpy.context.evaluated_depsgraph_get()

def chain(o):
    p, names = o.parent, []
    while p:
        names.append(p.name)
        p = p.parent
    return " > ".join(reversed(names))

baked = []
for o, coll in src:
    oe = o.evaluated_get(dg)
    try:
        me = bpy.data.meshes.new_from_object(oe, preserve_all_data_layers=True, depsgraph=dg)
    except RuntimeError:
        continue
    if me is None or len(me.polygons) == 0:
        if me:
            bpy.data.meshes.remove(me)
        continue
    mw = o.matrix_world.copy()
    me.transform(mw)
    if mw.determinant() < 0:
        me.flip_normals()
    me.update()
    baked.append((o.name, coll, chain(o), o.type, me))

print("EXTRACT baked", len(baked), "of", len(src), "in", round(time.time() - t0, 1), "s")

# drop every original object, keep only the baked meshes
bpy.data.batch_remove(list(bpy.data.objects))
bpy.data.batch_remove(list(bpy.data.collections))
bpy.data.batch_remove(list(bpy.data.texts))
scene = bpy.context.scene
colls = {}
for name, coll, path, typ, me in baked:
    me.name = name
    ob = bpy.data.objects.new(name, me)
    ob["za_name"], ob["za_collection"], ob["za_path"], ob["za_type"] = name, coll, path, typ
    if coll not in colls:
        colls[coll] = bpy.data.collections.new("ZA_" + coll)
        scene.collection.children.link(colls[coll])
    colls[coll].objects.link(ob)

for _ in range(4):
    bpy.ops.outliner.orphans_purge(do_local_ids=True, do_linked_ids=True, do_recursive=True)
os.makedirs(os.path.dirname(OUT), exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=OUT, compress=True)
tot = sum(len(o.data.polygons) for o in bpy.data.objects)
print("EXTRACT saved", OUT, "objects", len(bpy.data.objects), "polys", tot)
