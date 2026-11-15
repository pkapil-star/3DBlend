"""Debug copy for renders: sensor empties become red spheres, the patch turns blue (never exported)."""
import bpy, sys
out = sys.argv[sys.argv.index("--") + 1]
def mat(name, rgba):
    m = bpy.data.materials.new(name); m.diffuse_color = rgba; return m
red, blue, grey = mat("r", (1, 0.1, 0.1, 1)), mat("b", (0.1, 0.3, 1, 1)), mat("g", (0.8, 0.8, 0.8, 1))
bpy.data.objects["body"].data.materials.append(grey)
bpy.data.objects["patch_shoulder_r_outer"].data.materials.append(blue)
for n in ("sensor_chest", "sensor_upper_back", "sensor_forearm_l"):
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.018, location=bpy.data.objects[n].location)
    bpy.context.object.data.materials.append(red)
bpy.ops.wm.save_as_mainfile(filepath=out)
