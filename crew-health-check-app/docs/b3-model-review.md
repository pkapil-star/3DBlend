# B3 review: Chirag's complete anatomical model

Team VoidShifters, 15 November 2026. Assessed by Claude Code for Divyanshu, after Divyanshu asked for the complete anatomical model to be assessed for integration with its layers, and authorized integration changes on working copies. This replaces the first review of the same day, which judged the delivery against the lightweight mannequin contract only.

**Status: integration works locally; not published; B3 not complete.** The app code for anatomical models is on `main` (section 23.12). The model itself is not published: it stays out of git and off the public site until the decisions in section 6 are made. In production both crew members keep the labeled placeholder.

## 1. Source

- Repository https://github.com/pkapil-star/3DBlend, commit `c1531ec0454ff3aff039d354be1e652a7aaa286e` (15 November 2026, 10:43 IST), the only commit, unchanged after a fetch at 13:03 IST. Read-only clone next to this repository; nothing in it was changed or pushed.
- The commit's author account is `pkapil-star`; the commit message ends with "Co-Authored-By: Claude Opus 5.5", so an AI tool took part in the commit, including the scripts that re-pose, merge and reduce the geometry. This is the evidence for the "AI-assisted model" label.
- No Git LFS pointers; every file is a real binary.
- File used: `export/astronaut_digital_twin.glb`, 14,987,144 bytes, SHA-256 `f5307d6296d69c3720e5b8f70575cb5e21cef139547ca410056460acb38956c8`. It is used byte for byte: no working-copy edit was needed, because the app maps the node names (section 23.12). The Blender master and the other exports stay untouched in the clone.

## 2. Inventory of the complete model

Measured by loading the file with three.js. Total: 599,615 triangles (the delivery's manifest says 599,688), 396 meshes in ten system groups plus the shoulder overlay, 23 materials, one rig (`RIG_Armature`), no animations, no cameras, no compression.

| Layer (group node) | Meshes | Triangles | Notes |
|---|---|---|---|
| Skin (`SYSTEM_ExternalBody`) | 4 | 64,690 (skin alone 44,870) | skin, eyes and nails, bound to the rig; the skin carries the `Profile_B` shape key |
| Skeleton (`SYSTEM_Skeletal`) | 91 | 66,914 | |
| Muscles (`SYSTEM_Muscular`) | 112 | 165,432 | |
| Heart and blood vessels (`SYSTEM_Cardiovascular`) | 93 | 155,503 | 8 meshes with a heart shape key |
| Lungs and airway (`SYSTEM_Respiratory`) | 12 | 22,432 | 6 meshes with breathing shape keys |
| Brain and nerves (`SYSTEM_Nervous`) | 42 | 91,616 | |
| Digestive organs (`SYSTEM_Digestive`) | 12 | 12,675 | |
| Kidneys and bladder (`SYSTEM_Urinary`) | 6 | 2,615 | |
| Hormone glands (`SYSTEM_Endocrine`) | 6 | 1,620 | |
| Lymphatic system (`SYSTEM_Lymphatic`) | 17 | 15,840 | |

- Shoulder overlay `REGION_SHOULDER_RIGHT_DELTOID` (278 triangles, marked hidden by default): center x = −20.9 cm, y = 140.2 cm, about 14 cm across, 0.8 to 1.1 mm outside the skin. A tap at its middle hits it before the skin.
- Sensor anchors `ANCHOR_SENSOR_CHEST`, `_UPPER_BACK` and `_LEFT_FOREARM`: exactly on the skin, with local +Z along the surface normal; chest z = 9.3 cm, back z = −11.2 cm, forearm x = 40.7 cm.
- Scale: skin 174.9 cm tall, lowest point 0.07 cm, centered; every layer lies inside the skin's bounds.

## 3. Contract: what protects behaviour, what was an assumption

Kept for every model (section 23.12): the format without compression; units and orientation; height, ground and midline; the patch on the right, high and hit first; the anchors on the correct sides and on the skin; a surface that never moves under a pin; and appropriate, non-identifying surfaces (no genital or nipple detail, no face texture).

Replaced for anatomical models: exact node names (now a node map), no rig or shape keys (now bind pose and zero shape keys, enforced), identity transforms, the single closed mesh, and the 60,000-triangle and 4 MB limits (now 150,000 in the default view, 1,000,000 in all, 20 MB, set from the measurements below).

With these rules the checker passes the complete model, with three warnings left for M7: 64,690 triangles in the default view, 599,615 in all, and the file size.

## 4. What works with the complete model (local assessment)

In a detached local worktree outside the repository, crew A used the complete model with the prepared entry (`docs/b3-crew-a-entry.json`). Results:

- **Tests:** 768 of 768 there, including the real-asset test: scale, ten layers with one skin layer, the patch hit first, the anchors on the skin, the shape keys at zero, and no pins with the skin hidden. `npm run check` on `main` passes too (766 tests).
- **Browser checks:** headless Chrome, 19 of 19 checks:
  - the "Anatomical atlas model" and "AI-assisted model" tags and the attribution line;
  - ten layer checkboxes with only the skin shown at first, working by keyboard;
  - a tap on the right deltoid area gives "Right outer shoulder" with the "Placement not yet checked" tag, saved with its pin on version `chirag-1`;
  - a calf tap gives a free pin on the left lower leg;
  - with every layer shown, a chest tap lands on the skin surface, not on an organ;
  - with the skin hidden, a tap places no pin and the hint shows;
  - the pin stays drawn after two 45° turns, and "Turn to this sensor" shows the back;
  - a pin saved on `placeholder-1` keeps its text and is not drawn;
  - the compare view labels crew A "Measured on the delivered model", with the attribution, and crew B "Fictional measurements" (placeholder);
  - 390 px with no sideways scrolling, 44 px targets and 16 px text; a focus ring on every keyboard stop; no console errors.
- **The placeholder path is unchanged:** the B2 checks pass on a `main` build (23 of 23 with WebGL, 6 of 6 without).

## 5. Performance

Environment: Windows 11 laptop, Chrome 157 in headless mode, `vite preview` on localhost (no network delay, no CDN, no compression). "New view" is the time from a view button press to the frame after it was drawn.

| Environment | Load to ready | New view, skin only | New view, all 10 layers | JS heap |
|---|---|---|---|---|
| Software WebGL (SwiftShader), two runs | 552 to 727 ms | 16 to 32 ms (median) | 126 to 250 ms (median) | 61 to 68 MB, 69 MB with all layers |
| GPU (NVIDIA GeForce RTX 4060 Laptop, Direct3D 11) | 722 ms | 18 ms (one frame) | 18 ms (one frame) | 61 MB, 64 MB with all layers |
| Software WebGL, download held to 500 kB/s with 150 ms latency | 32.1 s, progress 0 to 100% | n/a | n/a | 63 MB |

Findings:

- Usable without reduction: the default view is light everywhere tested, and the full model renders in one frame on the GPU.
- With every layer on, software rendering drops to roughly 4 to 8 frames per second.
- Fixed now, because it blocked integration: the old 15-second total load limit would have stopped this file on any link slower than about 8 Mbit/s. Loading now shows progress and stops only after 15 seconds without data.
- Not measured: real phones (pending), GPU memory, and Vercel's handling and compression of a 15 MB `.glb`, which can be measured only once the model may be published.

## 6. Provenance and licences (checked against primary sources)

- **Z-Anatomy** (https://github.com/Z-Anatomy/Models-of-human-anatomy, README and `License.txt`): its code and content are CC BY-SA 4.0, and it "includes models derived from 'BodyParts3D'".
  - It lists material "used as reference/included and adapted", among them "Kidney - by Lissie Cowley - CC-BY-NC 4.0".
  - It also lists an inner-ear model under CC BY-NC-SA 4.0 and brain models from the University of Washington, with no licence stated.
- **BodyParts3D** (DBCLS, https://dbarchive.biosciencedbc.jp/en/bodyparts3d/lic.html): the current licence page says CC BY 4.0 and asks for the credit "BodyParts3D, © The Database Center for Life Science". Z-Anatomy and the delivery cite the older CC BY-SA 2.1 Japan.
- **Origin of the geometry** (Mitsuhashi et al., Nucleic Acids Research 2009, PMC2686534): BodyParts3D was built on the voxel model "TARO", created from "MRI images of a male volunteer", then edited by hand.
- **What the delivered model keeps** (from its own mapping file):
  - the inner ear is dropped;
  - the kidneys are kept, from Z-Anatomy's "Kidney" object, so whether they carry the non-commercial licence is still open;
  - the brain is kept (214 source objects), from sources whose licence Z-Anatomy does not state;
  - the cranial nerves are kept; Z-Anatomy lists their source as CC BY 4.0.

Remaining blockers and decisions for Divyanshu (with Chirag):

1. **Real-person origin.** The geometry descends from MRI of one real volunteer. The project rules say not to use real people's scans or likenesses. Decide whether this public, de-identified, heavily edited atlas is acceptable.
2. **Surface detail, and the face.**
   - The default skin shows nipples and a visible male genital form at the groin. The delivery's README says the genitalia were removed and the groin made neutral; the render does not show that.
   - The face is detailed: eyes, nose, lips and ears, plain gray with no texture.
   - Section 23.5 rules out genital and nipple detail on the body the crew sees. Options: Chirag neutralizes these areas in Blender and re-exports, or the team accepts them. A detailed face from a volunteer's MRI also bears on decision 1.
3. **Licence.**
   - The model is CC BY-SA 4.0, so serving it shares it under that licence, with the attribution shown (already built in).
   - Open questions: the kidney mesh (possibly non-commercial, which CC BY-SA cannot carry) and the brain sources without a stated licence.
   - The options are: confirm with Z-Anatomy, replace those meshes with BodyParts3D's own, or leave those layers out of the published file. Leaving layers out is a licence choice, not a format one.
4. **Crew B.** There is no second body. `Profile_B` is a shape key for a heavier build, not crew B's slimmer, longer-legged profile, so crew B keeps the placeholder. One atlas body is not described as two fitted crew models.
5. **Credit.** The commit's author is the account `pkapil-star`. The README credits Chirag, as Divyanshu asked. Please confirm the credit line, and whether that account is Chirag's.

## 7. Updated message to Chirag (for Divyanshu to send)

> Hi Chirag, the app can now use your complete anatomical model as it is, with all ten layers and the deltoid overlay and sensor anchors mapped by name. It works in our local tests and performs fine. Before we publish it, three things: 1. the skin shows nipples and a visible genital form at the groin, while your notes say the groin was made neutral. Our contract needs both neutral; can you fix them in Blender and re-export? 2. Can you confirm the kidney and brain sources and their licences (Z-Anatomy lists a CC BY-NC kidney model and brain models without a licence)? 3. For crew B we keep the placeholder unless you can deliver a body to the crew B profile. Please also send `model-notes.md` with the AI question answered and who checked the shoulder placement against the UW atlas.

## 8. To publish later

When the decisions above are made:
1. Copy the approved file to `public/models/crew-a.glb` and replace crew A's entry in `src/data/body-models.json` with `docs/b3-crew-a-entry.json`. Update its version and attribution if the file or the licence wording changes.
2. Run `python tools/check_body_model.py public/models/crew-a.glb --crew c1`, `npm run check` (the real-asset tests then run), `npm run build`, and the B2 and B3 browser checks. Then commit, push and check production.
3. Add the model's sources to REFERENCES.md as used, and Chirag's AI use to AI_USAGE.md.

The local worktree with the model in place is at `../nasa-b3-local`: `npm run build` and `npx vite preview --port 4175`, then open http://localhost:4175/#/body. To remove it safely, first remove its `node_modules` link (`cmd /c rmdir ..\nasa-b3-local\node_modules`, which removes only the link), then run `git worktree remove ../nasa-b3-local`.
