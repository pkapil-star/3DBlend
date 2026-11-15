# Model notes

Made by: TODO(name), working with Claude Code (the person who sends the files fills this in)
Blender version: 5.3.0 (built headless with `scripts/crew/build_crew.sh`)
Version name of this delivery: chirag-1
Date and time: 2026-11-15 11:55 IST

## Starting point
Base mesh (or "modeled from scratch"): Blender Studio "Human Base Meshes" asset bundle v1.4.1, object `GEO-body_male_realistic` (the realistic male full body), used for both bodies. Its sculpted detail was applied, then it was decimated to 40,000 triangles. The bundle's separate eyes were not used. The mesh is one closed surface with no hair, teeth, tongue, textures or materials.
Its license and URL: CC0 (public domain). The README inside the bundle file says: "All provided assets are public domain under the CC0 license." Download: https://download.blender.org/demo/asset-bundles/human-base-meshes/human-base-meshes-bundle-v1.4.1.zip (listed under Asset Bundles at https://www.blender.org/download/demo-files/). Not a scan or likeness of a real person.
Add-ons used: none (only Blender's built-in glTF 2.0 exporter)

## AI assistance
Did an AI tool generate or change the geometry, directly or through a script it wrote? yes
What the AI did: Claude Code (Anthropic) wrote the Blender Python scripts in `scripts/crew/`, which:
- scale the base mesh to 175 cm;
- build a temporary rig that reshapes each body to its profile (leg, torso, arm and foot lengths, shoulder breadth, plus a smooth trunk girth adjustment for the chest, waist and hips) and rotates the arms out to 40 degrees, then apply the rig and remove it;
- smooth the elbow creases and the nipple points;
- cut the shoulder patch, place the three sensor empties by casting rays onto the skin, and export with the settings in section 23.3.

Claude Code also wrote `scripts/crew/check_crew.py`, a copy of the section 23.9 checks. The app should show the "AI-assisted model" tag.

## Values used (cm)
Measured on the final meshes by `scripts/crew/crew_lib.py`.

| Measurement | Crew A | Crew B |
|---|---|---|
| Height | 175.2 | 174.9 |
| Inseam | 79.1 | 84.0 |
| Shoulder breadth | 41.8 | 37.0 |
| Upper-arm length | 34.0 | 31.0 |
| Forearm length | 27.0 | 25.0 |
| Chest circumference | 102.0 | 88.7 |
| Waist circumference | 86.2 | 72.5 |
| Hip circumference | 97.7 | 100.0 |
| Foot length | 27.0 | 25.0 |

How each value was taken:
- **Height:** lowest to highest vertex.
- **Inseam:** the floor to the lowest horizontal section that crosses the midline.
- **Shoulder breadth:** the straight line between the tops of the two shoulders (acromion level), not across the deltoid bulge.
- **Upper arm:** the top of the shoulder to the elbow joint centre. **Forearm:** the elbow to the wrist joint centre. Both come from the posing rig's joints.
- **Chest, waist and hip:** the convex hull of a horizontal section with the arms left out (a tape measure that bridges hollows). Chest is the widest section at 70–75 % of height, waist the narrowest at 58–66 %, and hip the widest just above the crotch.
- **Foot:** the heel-to-toe extent of the left foot.

Pose: relaxed A-pose with the arms 40 degrees from vertical (measured 40.2 on A and 40.0 on B), elbows almost straight, palms toward the thighs, and feet about hip-width apart. Both bodies use the same pose.

## Checks
Triangles: crew A 40,046 (body 40,000 + patch 46), crew B 40,078 (body 40,000 + patch 78)
File sizes: crew A 0.72 MB (722,976 bytes), crew B 0.72 MB (723,600 bytes)
Self-check list in section 7 done: the automated equivalent was run. `python3 scripts/crew/check_crew.py export/crew/crew-<x>.glb --height-cm 175` passes 17/17 on both files. Orientation, the patch side, the sensor sides and sensors sitting on the skin were checked on front, back and side renders. A person should still do the import check in Blender before sending.
Shoulder patch placement checked against the UW deltoid atlas by TODO(teammate name), at TODO(time). Not yet done. Patch size: 7.2 cm across on A, 8.2 cm on B, raised 2 mm above the skin.

## Known limits
- Both bodies come from one male base mesh. The face keeps the base mesh's sculpted shape (no texture). The groin is a smooth, neutral surface.
- Circumferences are approximations taken with the method above, and the guide values were met within 1 cm.
- Crew B's chest reduction is large (88 cm against the base's 109 cm), so its torso is visibly flatter from the side.
- The decimated mesh is triangulated, and the patch outline follows its triangles.
- The sensor positions were chosen by rule (sternum midpoint, between the shoulder blades, middle of the outer left forearm). They are not validated sensor placements.
