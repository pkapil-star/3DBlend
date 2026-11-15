# Body model handoff: Crew Health Check

For: Chirag (Blender, with your own Claude)
From: Divyanshu (the app, with Claude Code)
Source of truth: `ARCHITECTURE.md` section 23 in https://github.com/DivyanshuKirpal/nasa_hackathon. If this file and section 23 ever differ, section 23 wins; tell Divyanshu so this file gets fixed.

## Update, 14 November 2026 (evening)

We started the app later than planned, so the team re-planned the schedule. **The 3D body is still a goal.** The 3D viewer and your two models stay in the plan, and the team postponed a different feature (a third machine-learning model) to make room.

There is a fallback. If time runs out before the 3D viewer is finished, the app ships the 2D body view (a soreness form and list, plus the sensor cards), and the README and slides credit your models as work in progress. Divyanshu decides this at a checkpoint on Sunday and will tell you.

What this means for you:

- **Send a rough export of one body as early as you can, tonight if possible.** It can be untidy. It lets us test the format and the pipeline early. When it arrives, Divyanshu checks it and replies with any failing lines within about an hour.
- **Deadlines are unchanged.** Final `crew-a.glb`, `crew-b.glb` and `model-notes.md` by Sunday 14:00. Files that arrive after Sunday 16:00 go in only if they pass the checker on the first try. Nothing changes after the 18:00 code freeze.
- **Nothing else in this document changed:** names, axes, units, pose, export settings and checks are the same.

## 1. What the models are for

Crew Health Check is VoidShifters' app for the NASA Space Apps Challenge 2026. Its Body screen shows a plain gray 3D body of a fictional crew member. The crew member rotates it, taps where it hurts to save a soreness report, and checks three simulated suit sensors (chest, upper back, left forearm). The app paints the body gray itself, and it reads a few named objects from your file to know where the shoulder area and the sensors are.

What the model is not: not a real person, not an exact replica, no internal anatomy, no animation, no textures.

Until your files arrive, the app uses a simple placeholder made of capsules, built to the same rules. Your files replace it with no code change, as long as they follow this document exactly. The names, axes, scale and export settings below are what the code depends on.

## 2. What to send, and when

| What | When |
|---|---|
| A rough first export of one body (it can be untidy) | As early as possible, to test the format and the pipeline |
| Final `crew-a.glb` and `crew-b.glb` | Sunday 14:00 at the latest |
| `model-notes.md` (template in section 9) | With the final files |

Send them through any channel. Divyanshu runs a checker on each file and puts them in the repository. If a check fails, he sends you the exact failing line with the measured and expected value. A new version of a file is fine at any time; say what changed.

## 3. The two bodies

Both bodies have the same height and visibly different proportions. All values are fictional, in centimeters, chosen only to make the two bodies look different. They are not statistics about any population or any real person.

| Measurement | How it is taken on the model | Crew A (`crew-a.glb`) | Crew B (`crew-b.glb`) |
|---|---|---|---|
| Height | Floor to top of head, standing | 175 | 175 |
| Inseam | Floor to crotch | 79 | 84 |
| Shoulder breadth | Straight line between the outer points of the two shoulders | 42 | 37 |
| Upper-arm length | Top of the shoulder to the tip of the elbow | 34 | 31 |
| Forearm length | Tip of the elbow to the wrist | 27 | 25 |
| Chest circumference | Around the chest at its fullest | 102 | 88 |
| Waist circumference | Around the narrowest part of the waist | 86 | 72 |
| Hip circumference | Around the widest part of the hips | 98 | 100 |
| Foot length | Back of the heel to the tip of the longest toe | 27 | 25 |

Height must be met within 1 cm. The other values are guides: match them as closely as practical (within about 2 cm is fine). Circumferences are hard to measure in Blender, so approximations are fine; write the values you actually used in `model-notes.md`.

## 4. Rules at a glance

| Topic | Rule |
|---|---|
| Format | glTF 2.0 binary, one `.glb` per body, from Blender's built-in exporter |
| Units | Metric, unit scale 1.0: one Blender unit is one meter |
| Height | Equals the profile height within 1 cm (1.75 m for both) |
| Ground | Lowest point of the feet at Z = 0 |
| Center | Body midline on X = 0; feet centered around Y = 0 |
| Facing | The body faces Blender's front view, the −Y direction (numpad 1 looks at the face) |
| Left and right | The body's own **right** side is at **negative X**; its left side at positive X. In front view, the body's right hand appears on the viewer's left |
| Pose | The same relaxed A-pose for both: arms about 40 degrees from the torso, elbows almost straight, palms toward the thighs, feet about hip-width apart. Arms do not touch the torso; legs do not touch each other |
| Objects in each file | Exactly five, named exactly: `body`, `patch_shoulder_r_outer`, `sensor_chest`, `sensor_upper_back`, `sensor_forearm_l` |
| Surface | One closed, smooth mannequin surface: no hair, eyebrows, eyelashes, separate eyes, teeth, tongue or clothing; no face texture; no genital or nipple detail |
| Triangles | 20,000 to 60,000 per body after modifiers; about 40,000 is a good target |
| File size | At most 4 MB per file |
| Materials and textures | None needed (the app paints the body gray) |
| Not in the file | No armature, skin, shape keys, animation, cameras or lights; no Draco compression |
| Transforms | Applied on mesh objects (location, rotation and scale reset); empties keep their location with rotation 0 and scale 1; nothing parented |

Names use only lowercase letters, digits and underscores, exactly as written. The app finds objects by name, so `Body`, `body.001` or `patch_shoulder_R` will not be found.

## 5. Step by step in Blender

Blender 4.2 LTS or newer is fine, including 5.x. Menu names can differ slightly between versions.

1. **Scene.** New General file. Delete the default cube, camera and light. Scene Properties > Units: Metric, Unit Scale 1.0, Length in meters.
2. **Starting mesh.** Choose one and record it in `model-notes.md` with its license:
   - Blender Studio's Human Base Meshes asset bundle, which is CC0, from the Asset Bundles section of https://www.blender.org/download/demo-files/. Pick one realistic full-body base mesh and use the same one for both bodies; that keeps pose and scale consistent.
   - Or model your own.
   - Do not use scans or likenesses of real people, or any asset whose license you cannot name.
3. **Body A.** Scale and reshape the base to the crew A profile. Check the height in the N panel (Item > Dimensions, Z) with the object selected. Use the Measure tool for lengths. Remove anything that is not part of one smooth surface (separate eyes, teeth, hair), and smooth over the details listed in section 4.
4. **Pose.** Put the body into the A-pose in section 4. If you used a rig to pose it, apply the pose and remove the armature modifier afterwards; the exported file must not contain an armature.
5. **Clean up.** In Edit Mode: Merge by Distance; Mesh > Normals > Recalculate Outside. In Object Mode: Shade Smooth (or Shade Auto Smooth). Check the triangle count with the Statistics overlay. If it is too high, add a Decimate modifier; it is applied on export.
6. **Facing, ground and center.** The face looks toward the front view (numpad 1). The feet's lowest point sits at Z = 0. The midline is on X = 0. Rename the mesh object to `body`.
7. **Body B.** Make the second body to the crew B profile in the same pose. Starting from a copy of body A is the easiest way to keep pose and scale the same. Work on each body in its own `.blend` file, or in separate collections, so each exports alone.
8. **Shoulder patch.** On each body, on the body's **right** shoulder (negative X):
   - In Edit Mode, select the faces over the rounded outer part of the shoulder, the deltoid area. Use the University of Washington deltoid atlas page as the reference: https://rad.uw.edu/muscle-atlas/deltoid
   - Duplicate them (Shift+D, then right-click to cancel the move) and separate the copy into its own object (P > Selection).
   - Push the copy 2 mm outward along its normals (Alt+S, type 0.002).
   - Rename the new object `patch_shoulder_r_outer` and apply its transforms.
   - Make it at least about 6 cm across so it is easy to tap. The `body` mesh stays complete underneath.
   - Have a teammate compare the placement with the atlas page and write their name and the time in `model-notes.md`.
9. **Sensor anchors.** On each body, add three empties (Add > Empty > Plain Axes, display size 0.05) and place each on the skin surface. The easy way: Shift + right-click on the surface to place the 3D cursor there, then add the empty at the cursor.

   | Name | Where |
   |---|---|
   | `sensor_chest` | Front of the chest, on the midline, about halfway down the breastbone |
   | `sensor_upper_back` | Upper back, on the midline, between the shoulder blades |
   | `sensor_forearm_l` | Outer side of the **left** forearm (positive X), about halfway between elbow and wrist |

   Keep the empties unparented, with rotation 0 and scale 1.
10. **Transforms.** Select `body` and `patch_shoulder_r_outer` and apply all transforms (Ctrl+A > All Transforms). Do not apply location on the empties.
11. **Export** each body as in section 6.
12. **Self-check** each file as in section 7, then send.

## 6. Export

File > Export > glTF 2.0 (.glb/.gltf), with only the five objects of one body selected:

- Format: glTF Binary (.glb)
- Include: limit to selected objects; custom properties off; cameras and punctual lights off
- Transform: +Y Up **on**
- Data, mesh: apply modifiers on; normals on; UVs, tangents and vertex colors off
- Data, material: no export (or a single placeholder material)
- Data, shape keys, skinning and armature: off
- Compression (Draco): **off**
- Animation: off

File names: `crew-a.glb` and `crew-b.glb`.

The same export as Blender Python, for your Claude to run in Blender's Scripting tab. Save the `.blend` file first: `//` means "the folder of the saved .blend file". Option names can differ slightly between Blender versions; if one is rejected, remove it from the call and set that option by hand in the export dialog.

```python
import bpy

bpy.ops.export_scene.gltf(
    filepath=bpy.path.abspath("//crew-a.glb"),
    export_format="GLB",
    use_selection=True,
    export_yup=True,
    export_apply=True,
    export_texcoords=False,
    export_normals=True,
    export_tangents=False,
    export_materials="NONE",
    export_draco_mesh_compression_enable=False,
    export_animations=False,
    export_morph=False,
    export_skins=False,
    export_cameras=False,
    export_lights=False,
    export_extras=False,
)
```

## 7. Self-check before sending

Open a new empty Blender file (delete the default objects), File > Import > glTF 2.0, and import the `.glb`. Then check:

- [ ] The Outliner shows exactly `body`, `patch_shoulder_r_outer`, `sensor_chest`, `sensor_upper_back`, `sensor_forearm_l`.
- [ ] The height (Dimensions, Z, with `body` selected) is the profile height within 1 cm.
- [ ] The feet stand on the ground (Z = 0) and the body stands on the midline.
- [ ] In front view (numpad 1) you look at the face.
- [ ] In front view, the shoulder patch is on the viewer's **left** side (the body's right shoulder).
- [ ] In front view, `sensor_forearm_l` is on the viewer's **right** side (the body's left forearm).
- [ ] In side view (numpad 3), `sensor_chest` is in front of the body and `sensor_upper_back` is behind it.
- [ ] The three empties sit on the skin, not floating and not buried.
- [ ] The Statistics overlay shows 20,000 to 60,000 triangles.
- [ ] The file is 4 MB or less.
- [ ] Both bodies are in the same pose.

## 8. What Divyanshu's checker tests

`tools/check_body_model.py` reads each file and fails it if any of these is not true:

1. A valid GLB file, glTF version 2.0.
2. All five object names are present, spelled exactly.
3. No skins, animations or cameras; no Draco, meshopt or quantization extensions.
4. Mesh objects have applied transforms.
5. The `body` height is within 1 cm of the profile; the lowest point within 1 cm of the ground; the midline within 3 cm of X = 0.
6. At most 60,000 triangles (fewer than 20,000 is only a warning); file size at most 4 MB.
7. Orientation: the chest sensor is in front of the upper back sensor; the shoulder patch is on the right side (negative X) and in the upper part of the body; the forearm sensor is on the left side (positive X).

## 9. `model-notes.md` template

Copy this, fill it in, and send it with the final files.

```
# Model notes

Made by: Chirag
Blender version:
Version name of this delivery: chirag-1 (then chirag-2, ... for later deliveries)
Date and time:

## Starting point
Base mesh (or "modeled from scratch"):
Its license and URL:
Add-ons used:

## AI assistance
Did an AI tool generate or change the geometry, directly or through a script it wrote? yes / no
What the AI did (for example "wrote the export script", "wrote a script that reshaped the torso", "step-by-step guidance only"):

## Values used (cm)
| Measurement | Crew A | Crew B |
|---|---|---|
| Height | | |
| Inseam | | |
| Shoulder breadth | | |
| Upper-arm length | | |
| Forearm length | | |
| Chest circumference | | |
| Waist circumference | | |
| Hip circumference | | |
| Foot length | | |

## Checks
Triangles: crew A ..., crew B ...
File sizes: crew A ..., crew B ...
Self-check list in section 7 done: yes / no
Shoulder patch placement checked against the UW deltoid atlas by ..., at ...

## Known limits
-
```

Why the AI question matters: the Space Apps rules ask teams to acknowledge AI-generated material, and visuals made with AI need a visible mark. If the answer is yes, the app shows an "AI-assisted model" tag on the 3D view and lists your use in `AI_USAGE.md`. Guidance-only use is still listed there, but it does not need the tag.

## 10. Working with your Claude

Give your Claude this whole file first, then a message like this one:

```
I am building two 3D body models in Blender for a hackathon app. The attached
handoff document is a contract the app depends on. Follow it exactly: object
names, axes, units, pose, mesh rules and export settings. Guide me one step at
a time, starting with step 1 in section 5, and wait for me to confirm each step
before the next. When a step can be done with a Blender Python script, you may
write one, but tell me what it does before I run it. Do not change any name,
unit, axis or export setting in the contract. If something cannot be done as
written, say so and I will ask Divyanshu.
```

## 11. Questions

Ask Divyanshu before you export if anything here is unclear or cannot be done in your Blender version. Changing the export later is cheap; changing names, axes or scale after the app is built around them is not.
