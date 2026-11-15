"""Dump every object of the Z-Anatomy source .blend to JSON (read-only).

Run: blender --background --disable-autoexec sources/z-anatomy/Z-Anatomy/Startup.blend \
         --python scripts/tools/inventory_zanatomy.py -- <out.json>
"""
import bpy, json, sys
from mathutils import Vector

out = sys.argv[sys.argv.index("--") + 1]

def coll_path(c, parents):
    p = [c.name]
    while c.name in parents:
        c = parents[c.name]
        p.append(c.name)
    return "/".join(reversed(p))

parents = {}
for c in bpy.data.collections:
    for ch in c.children:
        parents[ch.name] = c

objs = []
for o in bpy.data.objects:
    rec = {
        "name": o.name,
        "type": o.type,
        "parent": o.parent.name if o.parent else None,
        "collections": [coll_path(c, parents) for c in o.users_collection],
        "data": o.data.name if o.data else None,
    }
    if o.type == "MESH":
        me = o.data
        rec["verts"] = len(me.vertices)
        rec["polys"] = len(me.polygons)
        rec["users"] = me.users
        rec["mods"] = [m.type for m in o.modifiers]
        rec["mats"] = [m.name if m else None for m in me.materials]
        if me.vertices:
            bb = [o.matrix_world @ Vector(c) for c in o.bound_box]
            rec["min"] = [round(min(v[i] for v in bb), 4) for i in range(3)]
            rec["max"] = [round(max(v[i] for v in bb), 4) for i in range(3)]
    elif o.type == "CURVE":
        rec["splines"] = len(o.data.splines)
    objs.append(rec)

json.dump({
    "blender_file_version": list(bpy.data.version),
    "scenes": [s.name for s in bpy.data.scenes],
    "unit_scale": bpy.context.scene.unit_settings.scale_length,
    "collections": sorted(coll_path(c, parents) for c in bpy.data.collections),
    "objects": objs,
}, open(out, "w"), indent=0)
print("INVENTORY_DONE", len(objs))
