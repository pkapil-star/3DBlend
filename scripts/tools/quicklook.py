"""Quick orthographic Workbench renders of the loaded .blend, for visual checks.

blender --background file.blend --python scripts/tools/quicklook.py -- out=/abs/prefix \
    [views=front,back,left,right,q34] [coll=regex] [name=regex] [exclude=regex] \
    [res=700] [color=material|random|object] [zmin=..] [zmax=..] [xray=0.5]

Renders only mesh/curve objects that match; everything else is hidden for the render.
"""
import bpy, sys, re, math
from mathutils import Vector

args = dict(a.split("=", 1) for a in sys.argv[sys.argv.index("--") + 1:])
out = args["out"]
views = args.get("views", "front").split(",")
coll_re = re.compile(args["coll"]) if "coll" in args else None
name_re = re.compile(args["name"]) if "name" in args else None
excl_re = re.compile(args.get("exclude", r"\.(j|t|g|i)$"))
res = int(args.get("res", 700))
scene = bpy.context.scene

def all_colls(c, acc):
    acc.append(c)
    for ch in c.children:
        all_colls(ch, acc)
    return acc

def unhide_layer(lc):
    lc.exclude = False
    lc.hide_viewport = False
    for ch in lc.children:
        unhide_layer(ch)

unhide_layer(bpy.context.view_layer.layer_collection)
for c in bpy.data.collections:
    c.hide_render = False
    c.hide_viewport = False

keep = []
for o in scene.objects:
    ok = o.type in {"MESH", "CURVE"} and not excl_re.search(o.name)
    if ok and name_re and not name_re.search(o.name):
        ok = False
    if ok and coll_re and not any(coll_re.search(c.name) for c in o.users_collection):
        ok = False
    o.hide_render = not ok
    o.hide_viewport = not ok
    try:
        o.hide_set(not ok)
    except RuntimeError:
        pass
    if ok:
        keep.append(o)
print("QUICKLOOK objects:", len(keep))

bpy.context.view_layer.update()
mn = Vector((1e9,) * 3)
mx = Vector((-1e9,) * 3)
for o in keep:
    for c in o.bound_box:
        w = o.matrix_world @ Vector(c)
        for i in range(3):
            mn[i] = min(mn[i], w[i])
            mx[i] = max(mx[i], w[i])
if "zmin" in args: mn.z = float(args["zmin"])
if "zmax" in args: mx.z = float(args["zmax"])
if "xmin" in args: mn.x = float(args["xmin"])
if "xmax" in args: mx.x = float(args["xmax"])
ctr = (mn + mx) / 2
size = mx - mn
print("QUICKLOOK bbox", [round(v, 3) for v in mn], [round(v, 3) for v in mx])

cam_data = bpy.data.cameras.new("QL_Cam")
cam_data.type = "ORTHO"
cam = bpy.data.objects.new("QL_Cam", cam_data)
scene.collection.objects.link(cam)
scene.camera = cam

scene.render.engine = "BLENDER_WORKBENCH"
sh = scene.display.shading
sh.light = "STUDIO"
sh.color_type = {"material": "MATERIAL", "random": "RANDOM", "object": "OBJECT"}[args.get("color", "material")]
sh.show_cavity = True
sh.show_shadows = False
if "xray" in args:
    sh.show_xray = True
    sh.xray_alpha = float(args["xray"])
scene.render.film_transparent = False
scene.render.use_freestyle = False      # source scenes may carry line-art / compositor setups
scene.render.use_compositing = False
scene.render.use_sequencer = False
scene.view_settings.view_transform = "Standard"
scene.world = scene.world or bpy.data.worlds.new("W")
scene.render.image_settings.file_format = "PNG"

DIRS = {  # camera position direction (from centre), horizontal extent axis
    "front": Vector((0, -1, 0)), "back": Vector((0, 1, 0)),
    "left": Vector((1, 0, 0)), "right": Vector((-1, 0, 0)),
    "q34": Vector((0.7, -0.7, 0.25)).normalized(), "q34b": Vector((-0.7, 0.7, 0.25)).normalized(),
    "top": Vector((0, 0, 1)),
}
for v in views:
    d = DIRS[v]
    cam.location = ctr + d * 10
    cam.rotation_euler = (-d).to_track_quat("-Z", "Y").to_euler()
    if v == "top":
        w, h = size.x, size.y
    elif v in ("front", "back"):
        w, h = size.x, size.z
    elif v in ("left", "right"):
        w, h = size.y, size.z
    else:
        w, h = max(size.x, size.y) * 1.2, size.z
    w, h = max(w, 1e-3) * 1.06, max(h, 1e-3) * 1.06
    cam_data.clip_start, cam_data.clip_end = 0.01, 100
    if w >= h:
        scene.render.resolution_x, scene.render.resolution_y = res, max(64, int(res * h / w))
        cam_data.ortho_scale = w
    else:
        scene.render.resolution_y, scene.render.resolution_x = res, max(64, int(res * w / h))
        cam_data.ortho_scale = h
    scene.render.filepath = f"{out}_{v}.png"
    bpy.ops.render.render(write_still=True)
    print("QUICKLOOK wrote", scene.render.filepath)
