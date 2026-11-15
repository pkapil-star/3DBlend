# Handoff: connecting the 3D body model to the Crew Health Check web app

Read this first if you are a new Claude session picking up this work. Keep it current: update "Status" and
"Next steps" after every meaningful step.

## The ask (user, 15 Nov 2026)

- The friend's web app (`git@github.com:DivyanshuKirpal/nasa_hackathon.git`) lives in `webapp/` (its own git repo,
  ignored by this repo's `.gitignore`). It already has the datasets, the health engine and three trained ML models.
- Connect **this repo's 3D model** to that web app so that **data variation (health readings, statuses, ML insights)
  shows directly on the 3D model** in the web app.
- Bring the features of this repo's own viewer (`viewer/index.html`, the left bar: system toggles, x-ray skin, sensor
  anchors, deltoid overlay, heart/breathing/profile morph sliders, click-to-pick) and the **exact 3D model** into the app.
- Use the app's in-browser ML models for the analysis if they work; only if not, connect an API.
- **Do not push** anything (neither repo). The user reviews everything first.
- The user presents `blender/crew_health_check_master.blend`. A byte-identical backup was made:
  `blender/backup/crew_health_check_master_presentation_2026-11-15.blend` (sha256 starts `b1efc2569e943a41`).
  Never modify the master blend without keeping that backup.

## Where things are

| Path | What |
|---|---|
| `export/astronaut_digital_twin.glb` | The exact anatomical model (15 MB, 600k tris, CC BY-SA 4.0, Z-Anatomy/BodyParts3D) |
| `export/crew/crew-a.glb`, `crew-b.glb` | Contract mannequins (CC0 base, 40k tris), pass the app's section 23.9 checks |
| `manifests/*.json` | Node names, regions (`_region_id` vertex attribute, 22 ids), anchors |
| `docs/INTEGRATION_THREEJS.md` | Exact node names, morph target names and picking code for the anatomical GLB |
| `webapp/` | The app: React + TS + Vite, three.js only in `src/features/body/viewer/` |
| `webapp/CLAUDE.md`, `webapp/ARCHITECTURE.md` | The app's rules (sections 22 and 23 are the body view and model contract) |
| `webapp/docs/b3-crew-a-entry.json` | The friend's prepared manifest entry for the anatomical model (nodeMap, layers) |
| `webapp/docs/PROGRESS.md` | The app's milestone log; top entry "B3 continued" describes the anatomical-model support |

## Key facts found

- The app already supports the anatomical model (commit `35415a5`, "B3: Support complete anatomical body models"):
  manifest `nodeMap` + `layers`, layer checkboxes, see-through skin, pins on the skin. It was never connected because
  the GLB is not in `public/models/` and `src/data/body-models.json` still says `placeholder` for both crew members.
- The engine scores regions `head, eyes, heart, core, bones_muscle, skin, whole_body` with statuses good/watch/act/none
  (`src/data/regions.json`, `src/store/selectors.ts` `selectEvaluation`). Indicators: BP, heart rate (heart);
  body temp, glucose (core); sleep, mood, reaction time (head); exercise minutes (bones_muscle); near vision (eyes).
- App rules that matter here: three.js only in `src/features/body/viewer/`; no raw colours in viewer code (CSS
  variables / status tokens); status is always colour + icon + word; body observations never feed the engine (the
  overlay only *reads* engine output, which is allowed); `npm run check` must pass.

## Plan

1. Baseline: `npm ci`, `npm run check`, `npm run build` in `webapp/`.
2. Connect the model: copy `export/astronaut_digital_twin.glb` to `webapp/public/models/crew-a.glb` (byte for byte)
   and use the prepared entry for crew A; crew B gets `export/crew/crew-b.glb` (contract model, CC0).
3. Health overlay: colour organs / skin regions by the engine's region status (heart region → heart + great vessels,
   head → brain, eyes → eyes, core → abdominal organs, bones_muscle → limb bones/muscles, skin → skin, whole_body →
   lungs/airway), with a legend that shows icon + word, and ML insights marked on their regions.
4. Morph animation driven by data: heartbeat at the latest heart rate (`Heart_Contract`), breathing (`Lungs_Inhale`),
   plus manual sliders like the 3DBlend viewer.
5. Picking info: clicking an organ names it and shows its linked region status.
6. Tests for the new pure logic, `npm run check`, build, browser check.

## Status

- [x] Cloned into `webapp/` (HEAD `35415a5`), deps installed, master blend backed up.
- [x] Baseline checks: `npm run check` green, 766 tests (before any change).
- [x] Model connected: `public/models/crew-a.glb` = `export/astronaut_digital_twin.glb` (sha256 `f5307d62…`),
      `public/models/crew-b.glb` = `export/crew/crew-b.glb` (`075d06db…`), both byte-identical copies.
      `src/data/body-models.json`: crew A = the friend's prepared anatomical entry, crew B = contract entry.
      `python3 tools/check_body_model.py public/models/crew-X.glb --crew cN` → PASS for both.
- [x] Health overlay: `src/bodyview/healthOverlay.ts` (pure mapping), `src/features/body/viewer/healthOverlay3d.ts`
      (skin vertex colours + organ status materials), `HealthLegend.tsx` (legend with StatusBadge = colour+icon+word,
      "Show the organs behind each Watch or Act", "Tap to name a part"), `src/features/body/useBodyHealth.ts`
      (engine → overlay input), tokens `--body-status-*` in `src/styles/tokens.css`.
- [x] Morphs: `bodyMotion.ts` + `BodyMotionControls.tsx` (animate heartbeat at the latest heart rate, breathing at a
      fixed labelled pace; sliders for heart, breath, Profile B; pins disabled while Profile B ≠ 0).
- [x] Picking info: "Tap to name a part" in `Viewer3D.tsx` (`namePart`).
- [x] Tests: `src/bodyview/__tests__/healthOverlay.test.ts`, `viewer/__tests__/healthOverlay3d.test.ts`; two older
      tests made independent of which crew still uses the placeholder.
- [x] Full `npm run check` (778 tests, 58 files, green), `npm run build` OK, Prettier clean.
- [x] Browser check (headless Chrome on `npx vite preview --port 4180`, scenario "Temperature climbing over two days"):
      abdomen Act shown red on the skin; "Show the organs…" reveals red digestive organs under see-through skin;
      "Tap to name a part" → "Liver · Abdomen: Act", "Ascending aorta · Chest: Good"; heartbeat animates at the latest
      heart rate (80 bpm); crew B mannequin loads tinted; no console errors. Screenshots:
      `previews/webapp_health_overlay.png` (this repo).
- [x] Docs in webapp: ARCHITECTURE.md section 22.12, docs/PROGRESS.md top entry, AI_USAGE.md, REFERENCES.md.

## How to run it

```bash
cd webapp
npm ci                 # once
npm run dev            # or: npm run build && npx vite preview --port 4180
# open http://localhost:5173/#/body (dev) or http://localhost:4180/#/body (preview)
# tick "Show 3D body"; open "Presenter tools" (footer) → load a scenario (e.g. "Temperature climbing over two days")
# to see a region turn Watch/Act; switch crew member there to see crew B
```

## Nothing is committed or pushed

`webapp/` changes are uncommitted on `main` (`git -C webapp status`). The user reviews, then decides. If committing,
the app's convention is a message like "B3: Connect body models and add the health status overlay" and
`npm run check` must pass first. `public/models/crew-a.glb` is 15 MB and CC BY-SA (see conflicts below).

## Conflicts with webapp/CLAUDE.md (for the user / Divyanshu to decide)

- CLAUDE.md says Claude never creates files in `public/models/`; the user explicitly asked to connect the model, so
  the GLBs were *copied* there byte for byte (no edit, no conversion). Nothing is committed or pushed.
- The anatomical model comes from BodyParts3D (MRI of a volunteer) and is CC BY-SA 4.0; the friend's review
  (`webapp/docs/b3-model-review.md`) lists this as an open team decision. Crew B uses the CC0 mannequin instead.
- `tokens.css` said 3D colours never carry health meaning; the overlay changes that by request, always with a legend
  (colour + icon + word). Recorded as section 22.12.

## Next steps (optional polish, not started)

- `Viewer3D.tsx` is 408 lines (the app asks for components under ~150): move `namePart`/`isShown` and the motion
  effect into their own files.
- The compare view (`Compare3D.tsx`) does not show the overlay; it could reuse `createHealthOverlay`.
- Profile B on the anatomical model and crew B's measured profile differ; the slider is labelled "Second body shape".
- The anatomical GLB could be compressed (meshopt 15 → 4 MB) only if the app's checker rules are relaxed for it
  (section 23.9 bans compression extensions).
