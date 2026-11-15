"""Stage 7: the nine anatomy preview renders (EEVEE, saved cameras and lights of the master).

blender --background blender/crew_health_check_master.blend --python scripts/07_render_previews.py
Writes previews/anatomy_preview_*.png. The .blend is not saved.
"""
import bpy, os, sys, time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "scripts"))
import chc_mapping as M

OUT = os.path.join(ROOT, "previews")
os.makedirs(OUT, exist_ok=True)
scene = bpy.context.scene
objs = {o.name: o for o in bpy.data.objects}
t0 = time.time()
engine = os.environ.get("CHC_ENGINE", "BLENDER_EEVEE")
scene.render.engine = engine
if engine == "BLENDER_EEVEE":
    scene.eevee.taa_render_samples = 48
scene.render.film_transparent = False
scene.render.image_settings.file_format = "PNG"
scene.view_settings.view_transform = "Standard"

def system_of(o):
    p = o
    while p:
        if p.get("node_role") == "system_group":
            return p["anatomy_system"]
        p = p.parent
    return None

skin_inspect = bpy.data.materials["MAT_Skin_Inspection"]
body_base = bpy.data.materials["MAT_Body_Base"]
HEART = ("ORG_Heart", "VESSEL_Coronary", "VESSEL_Cardiac", "VESSEL_Aorta", "VESSEL_Pulmonary", "VESSEL_VenaCava")
# (file, camera, systems shown, see-through skin, ortho scale, resolution)
SHOTS = [
    ("front", "CAM_Front", {"external"}, False, None, (1000, 1600)),
    ("back", "CAM_Back", {"external"}, False, None, (1000, 1600)),
    ("side", "CAM_Side_Left", {"external"}, False, None, (1000, 1600)),
    ("complete", "CAM_ThreeQuarter", {"external", "skeletal", "cardiovascular", "respiratory", "nervous", "digestive", "urinary", "endocrine", "lymphatic"}, True, None, (1000, 1600)),
    ("skeleton", "CAM_Front", {"skeletal"}, False, None, (1000, 1600)),
    ("organs", "CAM_Torso_Front", {"respiratory", "digestive", "urinary", "endocrine", "lymphatic", "heart"}, False, 0.75, (1200, 1200)),
    ("cardiovascular", "CAM_Front", {"cardiovascular"}, False, None, (1000, 1600)),
    ("muscular", "CAM_ThreeQuarter", {"muscular"}, False, None, (1000, 1600)),
    ("respiratory", "CAM_Torso_Front", {"respiratory", "heart"}, False, 0.6, (1200, 1200)),
]
for name, cam, systems, xray, scale, res in SHOTS:
    for o in bpy.data.objects:
        if o.type != "MESH":
            continue
        show = system_of(o) in systems or ("heart" in systems and o.name.startswith(HEART))
        if o.name.startswith(("ANCHOR_", "REGION_", "MEASURE_")) or (xray and o.name in ("BODY_Eye_L", "BODY_Eye_R", "BODY_Nails")):
            show = False
        o.hide_render = not show
    objs["BODY_Skin"].data.materials[0] = skin_inspect if xray else body_base
    c = objs[cam]
    scene.camera = c
    old = c.data.ortho_scale
    if scale:
        c.data.ortho_scale = scale
    scene.render.resolution_x, scene.render.resolution_y = res
    scene.render.filepath = os.path.join(OUT, "anatomy_preview_%s.png" % name)
    bpy.ops.render.render(write_still=True)
    c.data.ortho_scale = old
    print("PREVIEW wrote", scene.render.filepath, "%.0fs" % (time.time() - t0), flush=True)
