# CLAUDE.md

Working rules for Claude Code in this repository. This file loads in every session, so it is kept short on purpose. All design detail lives in `ARCHITECTURE.md`; the milestone plan is its section 31.

## Project

**Crew Health Check** (working name) is team VoidShifters' entry for the 2026 NASA Space Apps Challenge, challenge "Create Health Monitoring Software for Astronauts on Space Missions". The hackathon runs November 14-15, 2026. Submission closes Sunday 23:59 India time; the team submits by 21:00.

Repository: https://github.com/DivyanshuKirpal/nasa_hackathon. All work goes directly to `main`.

It is a browser-only web app. A crew member enters daily health readings. The app compares them with that person's own in-flight baseline, shows status on a body map, explains each result with a source, gives a short action card, and decides whether to handle the problem on board or consult the ground, based on communication delay.

The centerpiece is **triage by communication delay**. Protect it above every other feature.

Three extensions:

- **ML radiation outlook (P0).** A logistic regression trained offline on NASA DONKI space weather data scores a solar flare by how often similar flares were linked to a recorded solar particle event. It runs on board in the browser and can raise a watch-level alert labeled "Model estimate", with an "Experimental model score" out of 100 that is never shown as a percent chance (section 26).
- **ML second opinion (P1).** A personal pattern model that learns each crew member's own normal across all daily readings, on board, shows insights, never alerts; the crew may send an insight to the ground. The Earth hospital model (PhysioNet ICU data) is built in A4, after M5 and M6 (decision of 15 November 2026, which replaced the deferral of 14 November; sections 26.17 to 26.19).
- **Personal body view (P1).** The crew member reports where it is sore (form and list, or a tap on an optional gray 3D body) and inspects three simulated suit skin-temperature sensors. Body observations never feed the health engine or the messages to Earth (section 22).

## Who builds what

- **Divyanshu, with you (Claude Code)**: everything in this repository: engine, data, simulator, the ML pipeline in `ml/`, UI, the 3D viewer and its placeholder body, tests, deployment, docs, submission.
- **Chirag, in Blender with his own Claude**: the two body models `crew-a.glb` and `crew-b.glb`, built to the contract in `ARCHITECTURE.md` section 23. Divyanshu adds them to `public/models/` when they are ready (milestone B3). Until then the 3D view uses the procedural placeholder (section 22.9), labeled "Placeholder model".
- You never create, edit, repair, convert or re-export a file in `public/models/`, and you never try to make a realistic human model. You may read model files to check them.

## Read first

Before starting a milestone, read its "Read first" list in `ARCHITECTURE.md` section 31 and `docs/PROGRESS.md`. For other work:

| Working on | Sections |
|---|---|
| Types and data files | 7, 8, 9 |
| Baseline and rules | 10, 11, 12 |
| Triage, environments, Earth link | 13, 14, 15 |
| Mission clock and demo panel | 16 |
| Sources and protocols | 17, 18 |
| Screens and UI | 19, 20 |
| Store and persistence | 21 |
| Body view: soreness, suit sensors, 3D viewer | 22 |
| Body model files and the Blender handoff | 23 |
| Seed data, suit replay, scenarios with real events | 24 |
| NASA and other data, the DONKI fetch | 25 |
| Machine learning: the three models, data, training, export, in-app use | 26 (second opinions: 26.17 to 26.19) |
| Tests | 27 |
| Workflow, milestones, cut list | 30, 31, 32 |

If the code and `ARCHITECTURE.md` disagree, stop and ask which is right. When a design decision changes, update `ARCHITECTURE.md` in the same commit.

## Stack

React with TypeScript (strict) on Vite, Tailwind CSS with `@tailwindcss/vite`, React Router with a hash router, Zustand with `persist`, Zod, Recharts, lucide-react, three (Three.js, with `@types/three`), Vitest with jsdom, React Testing Library with `@testing-library/dom`, `@testing-library/user-event` and `@testing-library/jest-dom`, ESLint and Prettier. No backend, no database, no network calls at runtime.

Python 3:

- `tools/`, `ml/fetch_donki.py` and `ml/fetch_physionet_sepsis.py`: standard library only.
- `ml/` training scripts: numpy, pandas, scikit-learn and matplotlib, in a virtual environment `.venv`, versions pinned in `ml/requirements.txt`. No other Python packages.

Rules:

- Install every npm package above in M0 and do not upgrade during the hackathon.
- Install Tailwind by following its current official Vite guide. Setup differs between major versions, so read the docs instead of writing config from memory.
- Ask before adding any dependency not listed here, in npm or in Python.

## Commands

```
npm install
npm run dev          # local dev server
npm run build        # production build to dist/
npm run preview      # serve the production build
npm run typecheck    # tsc -b (type check only: the tsconfig files set noEmit)
npm run lint
npm run test         # vitest run
npm run test:watch
npm run check        # typecheck + lint + test; must pass before every push to main

python tools/simulator/generate.py --all --seed 42          # regenerate public/seed/*.json and public/data/space-weather.json
python tools/check_body_model.py public/models/crew-a.glb --crew c1   # check a delivered body model
python -m unittest discover -s tools/tests

python ml/fetch_donki.py --start 2010-01-01                 # DONKI raw data into ml/data/raw/donki/ (once, in M2)
python -m venv .venv                                         # then activate: .venv\Scripts\Activate.ps1 (Windows) or source .venv/bin/activate
pip install -r ml/requirements.txt
python ml/build_dataset.py                                   # ml/data/processed/flares.csv
python ml/train_sep_risk.py --seed 42                        # model 1: model file, parity file, model card
python ml/eval_personal_pattern.py --seed 42                 # model 2: simulated evaluation, model file, model card (A3)
python ml/fetch_physionet_sepsis.py                          # model 3 data into ml/data/raw/physionet/ (never committed)
python ml/build_hospital_dataset.py                          # model 3: baselines, change features, splits
python ml/train_earth_hospital.py --seed 42                  # model 3: model file, parity file, model card (A4)
python -m unittest discover -s ml/tests
```

If a script above is missing from `package.json`, add it. On some machines Python is `python3` or `py`. Divyanshu uses Windows with PowerShell and VS Code; teammates may use macOS or Linux. Keep npm scripts cross-platform (no bash-only syntax).

## Layout

```
src/engine/          Pure TypeScript: baseline, conditions, rules, triage, status, insights,
                     models/ (sepRisk, personalPattern, earthHospital, logistic, linalg)
src/bodyview/        Pure TypeScript for the body view: pins, sensors, model contract
src/data/            JSON content: indicators, regions, rules, protocols, sources, environments,
                     body-models, body-areas, sensor-sites, models/*.json (generated by ml/)
src/store/           Zustand store, selectors, seed loader
src/clock/           Mission clock (simulated time)
src/link/            Earth link outbox simulator
src/features/        One folder per screen: home, checkin, region, alerts, earthlink, tests,
                     library, model, body (with body/viewer for three.js), demo
src/components/      Shared UI
tools/               Python, standard library: seed and suit generator, body model checker
ml/                  Offline ML for the three models: data fetch, datasets, training, evaluation,
                     export, model cards (PhysioNet files stay out of git)
public/seed/         Generated scenario files and the suit replay
public/models/       Body models from Chirag (never edited here)
docs/                PROGRESS.md, body-model-handoff.md, model-notes.md, demo-script.md
```

Import rules (ESLint enforces the first four):

- `src/engine` imports nothing outside `src/engine` except Zod (its tests may also import Vitest). No React, DOM, storage, `Date` or three.
- `src/bodyview` imports nothing outside `src/bodyview` except Zod (its tests may also import Vitest).
- `src/engine` and `src/bodyview` never import each other.
- `three` is imported only in `src/features/body/viewer/`.
- Features do not import from other features. Shared code moves to `src/components` or `src/lib`.
- Nothing in `src/` imports from `ml/` or `tools/`. The only bridge is the generated JSON in `src/data/models/`.

## Code rules

- TypeScript strict. No `any`; use `unknown` and narrow. No non-null `!` unless a comment says why it is safe.
- Function components and hooks only. Keep components under about 150 lines; split when they grow.
- Time always comes from the mission clock and is passed in as `nowMs`. Never call `Date.now()` or `new Date()` outside `src/clock/missionClock.ts`. (Pointer-event `timeStamp` for tap detection in the 3D viewer is interface timing and is allowed.)
- Thresholds, wording, sources and protocol steps live in `src/data/*.json`. Never hard-code a threshold or a health claim in a `.ts` or `.tsx` file.
- Every JSON data file has a Zod schema (`src/engine/schemas.ts` or `src/bodyview/schemas.ts`) and is validated at load and in tests.
- The engine never writes to the store. Components read through selectors and write through named store actions.
- Alerts, baselines, model estimates, insights, statuses, sensor readouts and the streak are derived. Do not persist them.
- three.js code stays in `src/features/body/viewer/`, is loaded lazily, and disposes geometries, materials, controls and the renderer on unmount. The app must build, test and run with WebGL off and with no files in `public/models/`.
- No raw color values in components or viewer code: use the status tokens and the 3D CSS variables (section 20).
- IDs come from `src/lib/ids.ts`, not `crypto.randomUUID` (missing on plain-HTTP origins).
- Name things after the domain terms in the glossary (section 35). IDs follow the patterns `R-NAME-01` for rules and `P-NAME` for protocols.
- Comments explain why, not what. No commented-out code.
- Prefer a small clear function over a clever one. This code is read by teammates with mixed experience and by judges.

## Domain rules

These matter more than any code style rule.

1. **No source, no claim.** Any sentence in the app that states a fact about spaceflight or health needs a `sourceId` from `src/data/sources.json`. If you do not have a source, do not write the claim; ask.
2. **Never invent numbers.** Do not make up thresholds, statistics, citations, URLs or paper titles. Use what is in `ARCHITECTURE.md` section 17, or leave a clearly marked `TODO(evidence)` and tell Divyanshu.
3. **Label the basis.** Every rule carries `basis`: `nasa-standard`, `peer-reviewed`, `clinical-general` or `illustrative`. The alert screen shows it. When unsure, it is `illustrative`.
4. **Personal baseline first.** Compare with the crew member's own in-flight normal. Use absolute cut-offs only for safety-net rules.
5. **Not a diagnosis.** Copy says "possible", "check" and "consult". Never "you have", never medication names or doses.
6. **Simulated means labeled.** Seed data, habitat feeds, suit sensors and ground replies always show a "Simulated" tag. Crew names are fictional; never use real astronauts.
7. **Protocols are drafts** until `reviewed` is true, and the UI shows a draft tag.
8. **An `act` alert always shows its first steps immediately.** Triage decides who leads, never whether help is shown. The reply estimate is never permission to postpone those steps.
9. **Body observations are not health inputs.** Soreness reports, suit samples, body profiles and the body model in use never reach `evaluate()` or the outbox. The invariance test must stay green.
10. **Say only what the observation is.** "Crew-reported soreness", "Simulated skin temperature", "local surface reading". Never "strain", "injury" or "inflammation"; a sensor value never replaces the daily temperature check.
11. **Stale means no value.** A sensor past its freshness window or without contact shows "No current reading", and the last valid value only with its time.
12. **Pins belong to one model version.** Store pins in model coordinates with model ID and version. Never draw a pin on another version and never delete its text.

## Machine learning rules

Three models (section 26): `sep-risk` (P0, A1 and A2), `personal-pattern` (P1, A3) and `earth-hospital` (A4, brought back on 15 November 2026).

1. **Each model does only what its evidence allows** (evidence ladder, decision D19). The rules alone set Good, Watch and Act. `sep-risk` enters the engine only as the `sep_risk` context feed and may raise only the watch-level rule `R-RAD-03`. `personal-pattern` and `earth-hospital` only produce insights: never a status, an alert, a route or a message by themselves. The second-opinion invariance test must stay green.
2. **Real data, honest split.** `sep-risk` trains only on NASA DONKI records, split by year: train, then validation, then test. `earth-hospital` trains on PhysioNet hospital A and is tested once on hospital B, split by patient. Test data is used once, after every choice is fixed. Never shuffle across years or patients, never tune on a test set. `personal-pattern` is evaluated on simulated data only, and every place that shows its results says so.
3. **No hand-typed model numbers.** Coefficients, thresholds, counts and metrics are written by the scripts in `ml/`. Never type or edit them in `src/data/models/`, the model cards, the README or the slides; copy them from the generated files. `R-RAD-03` reads its threshold from the model file through the `modelThreshold` comparison; `rules.json` holds no number for it (section 11.1).
4. **Always labeled.** A `sep-risk` output carries the "Model estimate" tag, the model version and a link to the model card. It is shown as an "Experimental model score", a whole number from 1 to 99 out of 100, never as a percent or a chance, with the note that it concerns recorded DONKI associations, has frequent false alarms and is not a validated probability or a measure of radiation exposure (decided on 15 November 2026; section 26.10). Words: "experimental model score", "model estimate", "possible", "outlook"; never "chance", "will" or "predicts that". An insight carries the word "Insight", the "Model estimate" tag, the model version, its caveat and a model card link, and no percentage; words: "unusual for you", "resembles", "second opinion", never a diagnosis or a disease name.
5. **Earth data sees only change.** A model trained on Earth data uses only changes from each person's own baseline, computed with the app's baseline formula (section 10), never absolute values (decision D20).
6. **Parity.** Each TypeScript model mirrors its Python twin exactly (`sepRisk.ts` and `ml/features.py`, and so on). The parity tests against `ml/artifacts/*-parity.json` must pass.
7. **Report results as they are.** If a model does not beat its simple baseline, or a scenario does not give the expected insight, say so in the model card and the README. Never change a scenario, a threshold or a model to force a result. If training fails, the app runs without that model; never invent a model file.
8. **Reproducible, and no patient data in git.** Seed 42 everywhere; one command rebuilds each artifact. Raw and processed DONKI data are committed. PhysioNet files and row-level hospital data are never committed (decision D21); only the scripts, `meta.json`, summaries, the model file, the parity file and the model card are.

## UI rules

- Status is always color plus icon plus word: Good, Watch, Act, No data. Never color alone.
- Tap targets at least 44 px. Body text at least 16 px. Numbers the crew acts on at least 20 px.
- Design for 1024 by 768 first; it must also work at 390 px wide.
- Light theme only unless told otherwise.
- Every control works by keyboard with a visible focus ring. Body-map regions are real buttons with names like "Head: Watch".
- Use status tokens (`status-good`, `status-watch`, `status-act`, `status-none`), never raw color values.
- Plain words, short sentences, sentence case. Explain any technical term the first time it appears.
- Every chart has a one-line text summary under it.
- The alert screen keeps its fixed section order: route banner, what changed, why it matters, what to do, evidence.
- 2D first: the 3D body is off by default and every 3D action has a button or form equivalent. No drag-only interaction, no auto-rotation.
- Show "Placeholder model" while the placeholder is used and "AI-assisted model" when the manifest says so. Sensor cards use neutral styling, never status tokens.

## Tests and definition of done

A change is done when all of these hold:

- `npm run check` passes, and the Python tests pass if `ml/` or `tools/` changed.
- New engine or body view logic has unit tests. New or changed rules keep the golden scenario tests green (each scenario file in `public/seed` must trigger exactly its `expectedAlerts`, and from A3 on exactly its `expectedInsights`).
- Triage changes keep every row of the table in section 13.5 passing.
- Any new rule has a protocol, at least one source or an `illustrative` basis, and plain-language `explain` text.
- Body view changes keep the invariance test green and the Body screen usable by keyboard with WebGL off.
- ML changes keep the parity tests, the threshold test and the second-opinion invariance test green, and regenerate the affected model card.
- The screen works by keyboard and shows status with color, icon and word.
- The app was run and the change looked at. You cannot see the browser, so give Divyanshu exact manual checks and wait for his answer.
- `ARCHITECTURE.md`, `REFERENCES.md`, `AI_USAGE.md` and `docs/PROGRESS.md` are updated if the change touches them.

A milestone is done when its exit test in section 31 passes, Divyanshu has confirmed the manual checks, and it is pushed to GitHub.

If you cannot run something, say so plainly. Do not report a change as working when it was not run.

## Milestone workflow

Order (section 31): M0, M1, M2, M3, M4, A1, A2 (P0 complete), A3, M5, M6, A4, B1, B2, B3 (when Chirag's files arrive), M7, M8. A4 was deferred on 14 November and brought back on 15 November 2026; it runs after M6. The time checkpoints in section 32.3 stay: Claude Code proposes, Divyanshu decides every further cut.

For each milestone:

1. Read its "Read first" sections and `docs/PROGRESS.md`. Check `git status` is clean, then `git pull`.
2. Post a short numbered plan (files, tests), then build.
3. Build in small steps; run the related tests after each step.
4. Close: run `npm run check` and `npm run build` (and the Python tests if `ml/` or `tools/` changed). Start the dev server and give Divyanshu the manual checks: URL, clicks, and what he should see. Update the docs and `docs/PROGRESS.md`.
5. Wait for Divyanshu to confirm. Fix what he reports.
6. Commit on `main` with the milestone message and push: `git push origin main`. Then check that the Vercel deployment updated.
7. Stop and wait before the next milestone, unless told to continue.

M0 is the one exception: push the scaffold as soon as `npm run check` passes, because the deployment needs it.

## Scope

Build in the order of section 31. Priorities:

- **P0**: check-in, 2D body map and accessible status list, baseline, at least six rules, alert detail with protocol, triage with environment and delay, sources on alerts, three scenarios, the trained ML model with its model card running in the app as `R-RAD-03`, public deploy.
- **P1**: the personal pattern model (A3), the Earth hospital model (A4), trend charts and check-in streak, Earth link outbox, demo panel, reaction test, remaining rules, the body view (B1), the 3D viewer with pins, named shoulder patch and compare view (B2), Chirag's models (B3).
- **Cut (14 November 2026)**: simulated ground replies, sensor trend charts, the standalone Library screen. (The Earth hospital model, deferred that day, is back since 15 November 2026.)
- **P2**: near-vision test, dark theme, link blackouts, offline install, more named areas, NASA RadLab dose data if the team agrees (open question in section 34), the future ML work in section 26.16.

When asked for something outside P0 while P0 is unfinished, say so and ask before starting. Do the simplest version that satisfies the milestone's exit test. No speculative abstractions, no extra configuration options, no features nobody asked for. If behind schedule, use the cut order and decision points in section 32 and ask before cutting.

Never cut: triage, sources on alerts, simulated-data labels, the "Not a medical device" notice, the 2D path, the ML honesty rules and the evidence ladder.

## Git

- Work directly on `main`. Do not create branches.
- `main` on GitHub must always build and demo, because Vercel deploys every push. Push only at the end of a milestone, after the checks pass and Divyanshu confirms. That push is standing permission; any other push needs him to ask. Local commits during a milestone are fine.
- Commit messages are imperative and start with the milestone: "M1: Add baseline engine with median and MAD", "A1: Train and export SEP risk model v1". Fixes start with "Fix:".
- Never force-push, never rewrite pushed history, never commit secrets, `.env` files or `.venv/`.
- Never commit `ml/data/raw/physionet/` or any row-level hospital data. Before every commit that touches `ml/`, run `git status` and check that no PhysioNet file is staged.
- Do not edit generated files by hand: `public/seed/`, `public/data/space-weather.json`, `src/data/models/`, `ml/artifacts/`, `ml/reports/`. Regenerate them with their scripts.
- Before a refactor, or a change to more than about five existing files that is not part of the current milestone, describe the plan and wait for a yes.

## Logs to keep current

The submission form asks for these, so update them as part of the work:

- `AI_USAGE.md`: add a line when AI is used for a new kind of task (tool, what for, which files). Claude Code's work here counts, the three ML models count (they are AI inside the product), and Chirag's use of Claude for the models counts.
- `REFERENCES.md`: every data source, paper, library, tool and asset, with URL. NASA items in their own section; DONKI credited to NASA's CCMC; the PhysioNet dataset cited as PhysioNet asks, with its license.
- `src/data/sources.json`: `verified` stays `false` until a team member has opened the source and confirmed the figure. Never set it to `true` yourself.
- `docs/PROGRESS.md`: one entry per milestone (section 30.4).
- `docs/body-model-handoff.md`: when section 23 changes, update it in the same commit and tell Divyanshu so he can send it to Chirag.

Do not generate images that include NASA logos or branding. AI-generated images or video need a visible "AI-generated" mark. A body model that AI helped make shows "AI-assisted model" in the 3D view.

## Working with the team

- Reply in plain, simple English. Keep explanations short. Say what you changed, where, and how to see it.
- When something is ambiguous and a wrong guess would cost more than a few minutes, ask one clear question first.
- When you find a bug or a design problem outside the task, report it; do not fix unrelated things silently.
- If a request conflicts with a rule in this file or with `ARCHITECTURE.md`, point out the conflict before acting.
- Time is short. Prefer the working simple version now over the better version later.

## Never

- Add a backend, a login, analytics, or any runtime network call.
- Add an ML library to the app; let a model output raise an act-level alert, set a status or change a route by itself, or appear without its "Model estimate" tag; let an insight become an alert.
- Commit PhysioNet files or any patient-level hospital data.
- Type, round differently or invent a model metric, coefficient or threshold.
- State a health fact without a source, or present an illustrative threshold as established.
- Use real people's names, photos, scans or health data.
- Create, edit, repair, convert or re-export files in `public/models/`.
- Let a body observation change an alert, a route or a message to Earth.
- Remove or hide the "Simulated" labels, the "Model estimate" tag, the "Placeholder model" tag or the "Not a medical device" notice.
- Skip tests to make a deadline without telling the team.
