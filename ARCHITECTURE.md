# Architecture: Crew Health Check

Working name: **Crew Health Check** (rename freely; nothing in the code should depend on the name).
Team: VoidShifters. Event: 2026 NASA Space Apps Challenge, Mohali local event, November 14-15, 2026.
Challenge: *Create Health Monitoring Software for Astronauts on Space Missions*.
Repository: https://github.com/DivyanshuKirpal/nasa_hackathon (all work is committed directly to `main`).

This document is the source of truth for how the project is designed. `CLAUDE.md` holds the short working rules; this file holds the detail. If the code and this document disagree, fix one of them in the same change.

Status of the numbers in this document:

- Figures tagged with a source ID come from the evidence registry in section 17. Each one must be re-checked against its source before submission.
- Alert thresholds, time-to-act values and protocol steps are **draft design values** unless marked `nasa-standard`. They are a starting point for the team's health adviser to review. The app must show them as illustrative.
- Body profile measurements (section 23.8), simulated suit values (section 24.5) and display settings such as sensor freshness are fictional design values. They are not population statistics or reference ranges, and the app never presents them as such.
- Every number that describes a machine-learning model (counts, coefficients, thresholds, metrics) is written by its training or evaluation script (section 26). Nobody types them by hand, in this document or in the app.

Changes on 14 November 2026:

1. Body models move from standalone MakeHuman (OBJ) to Blender (glTF binary, `.glb`). Chirag builds them with his own Claude; Divyanshu adds them to the repository later (sections 22 and 23).
2. The personal body view from the finalized concept brief is added: soreness reports and pins, three simulated suit sensors, an optional 3D body (section 22).
3. Three machine-learning models are added (section 26): a solar particle event risk model trained on NASA DONKI data (P0), and two second-opinion models on the health readings (P1): a personal pattern model learned on board from each crew member's own readings, and an Earth hospital model trained on PhysioNet ICU data using only changes from each patient's own baseline. Decision D9 is revised and decisions D19 to D21 are added.
4. The build plan is rewritten as detailed milestones with tests, a manual check and a push to GitHub after each one; all work goes directly to `main` (sections 30 to 32).
5. The challenge's Resources tab is recorded in `docs/challenge-resources.md`. It lists informational pages and no datasets; its five items are in the evidence registry (section 17).

Decisions on 14 November 2026, evening (milestone M0 started at 17:13, about six hours after the planned 11:00 start):

6. Scope, option B: the Earth hospital model (A4) is deferred until after the hackathon. A1, A2, A3 and the body view milestones B1, B2 and B3 stay in the target scope. The time checkpoints stay; Claude Code proposes and Divyanshu decides every further cut (section 32). Changed on 15 November 2026 by Divyanshu: A4 is included in the hackathon submission and runs after M5 and M6 (order M5, M6, A4). The B milestones and M7 wait for his approval.
7. Smaller cuts: simulated ground replies (the outbox stays), sensor trend charts (sensor value, contact and freshness stay) and the standalone Library screen (source links on alerts and the model card screens stay).
8. `R-RAD-03` takes its threshold by reference from the generated model file through a new comparison kind, `modelThreshold`; `rules.json` holds no number for it (sections 11.1 and 12). The schema change is built in M1.
9. All evidence registry entries are added in M1. Questionable references are checked against primary sources before the rules that use them are built, and `verified` stays false until Divyanshu confirms the review (section 17).
10. Environment setup: `solar-storm` starts at the space station with a fixed one-way delay of 0 s (reply estimate 5 min); 180 s is Mars near (11 min) and 1320 s is Mars far (49 min). Tests and the demo keep these apart (sections 13.5, 14 and 31.6).
11. The schedule is recalculated from the actual start (section 31.1). `public/models/` is created only by Divyanshu when the body model files arrive, and generated-output folders are created by their scripts. Two packages were added with approval: `@tailwindcss/vite` and `@testing-library/dom` (section 5).

Contents:

| Part | Sections |
|---|---|
| Product | 1 Purpose and scope, 2 Challenge fit, 3 Key decisions, 4 System overview |
| Build setup | 5 Tech stack, 6 Repository layout |
| Health engine | 7 Domain model, 8 Indicator catalog, 9 Body regions and status, 10 Baseline engine, 11 Rules engine, 12 Rule catalog v1, 13 Triage |
| Mission context | 14 Environments, 15 Earth link simulator, 16 Mission clock and demo mode |
| Content | 17 Evidence registry, 18 Protocols |
| Interface | 19 Screens and routes, 20 UI system and accessibility, 21 State and persistence |
| Personal body view | 22 Personal body view, 23 Body model contract (Blender handoff) |
| Data and AI | 24 Seed data and simulator, 25 NASA data and resources, 26 Machine learning: three models |
| Quality and release | 27 Testing strategy, 28 Safety, privacy, offline, performance, 29 Deployment |
| Delivery | 30 Team and workflow, 31 Milestones, 32 Priorities and cut list, 33 Submission mapping, 34 Open questions, 35 Glossary |

---

## 1. Purpose and scope

### 1.1 One-sentence promise

An astronaut opens the app once a day, enters a few readings, and in under two minutes knows how they are doing, why, what to do about it, and whether to handle it on board or ask doctors on Earth.

### 1.2 The user

The primary user is a crew member assessing their **own** health. They are highly trained but not a doctor. They may be tired, busy, and far from help. The app is not a mission-control dashboard and not a telemetry wall.

### 1.3 What the app does

1. **Collects** health indicators the crew member enters or measures in the app.
2. **Compares** each reading with that person's own in-flight normal (their baseline), not an Earth population range.
3. **Shows** status on a body map with color, icon and text.
4. **Explains** each result in plain words: what it means, why space changes it, and the source.
5. **Guides** with a short action card (protocol).
6. **Routes** each alert: handle on board, or consult the ground, based on how long a reply from Earth would take.
7. **Estimates** with machine learning (section 26): a model trained on real NASA DONKI space weather data estimates the chance that a recent solar flare is followed by a solar particle event, so the crew can prepare early. Two second-opinion models look at the health readings together and show an insight when today's pattern is unusual for the person or resembles an Earth early-warning pattern. All three run on board and are always labeled as estimates.
8. **Locates** (P1): the crew member records where it is sore, on a form or by tapping an optional gray 3D body, and inspects three simulated suit skin-temperature sensors. These body observations are shown with location, time and source, and are kept apart from the health logic (section 22).

### 1.4 What makes it different

- **Triage by communication delay.** Every alert has a time-to-act. The app compares it with the expected reply time from Earth for the current location (section 13). This directly answers the brief's question: when does a result warrant attention from the crew or from flight surgeons on the ground?
- **In-flight personal baseline.** Normal values shift in space. For example, resting core temperature runs about 1 °C higher on long missions (`temp-stahn-2017`) and blood pressure about 10 mmHg lower (`bp-norsk-2015`). Earth cut-offs would mislead, so the app learns each person's in-flight normal (section 10).
- **Evidence on every alert.** Each rule links to a source and states whether its threshold is a NASA standard, from peer-reviewed research, a common clinical cut-off, or illustrative (section 17).
- **Compound signals.** NASA notes the five hazards interact (`hrp-hazards`). Composite rules combine sleep, reaction time, CO2 and mood into one alert instead of several (section 11).
- **Three models, each limited by its evidence.** The radiation outlook comes from a logistic regression trained on NASA DONKI flare, CME and particle event records and tested on held-out years; it can raise a watch-level alert. A personal pattern model learns each crew member's own normal across all readings, and an Earth hospital model learned from ICU patients using only changes from each patient's own baseline; these two can only show insights, which the crew may send to the ground. Each has a model card in the app with its data, results and limits (section 26).
- **A personal body view that cannot change a decision.** A gray 3D body shaped to the crew member's fictional measurements gives them a place to point to. Soreness pins and suit sensor readings never feed the engine or the messages to Earth (decision D11), so triage stays testable.

### 1.5 Non-goals

- Not a medical device, and it does not diagnose. Copy says "possible", "check", "consult".
- No real personal health data. All readings are simulated or typed in during a demo.
- No accounts, login, or server.
- No hardware or sensor integration. Habitat feeds (CO2, radiation) are simulated.
- No machine-learning model makes an act-level decision, sets a status, or replaces a personal baseline or a safety-net rule (decisions D9 and D19). One model may raise a watch alert; two may only show insights.
- No photo upload, body scanning or automatic body reconstruction. The 3D bodies are two prepared models of fictional crew members (section 23).
- No internal anatomy and no physiological simulation. The 3D body shows approximate outer proportions only.
- Soreness pins and suit sensors are not diagnostic. A pin records what the person reports; a sensor shows a simulated local surface reading.

---

## 2. Challenge fit

How each point of the official brief maps to the design. Use this table when writing the submission.

| Brief says | Our answer | Section |
|---|---|---|
| "a visual tool that helps astronauts assess their own health" | Daily check-in and body-map home screen | 19 |
| "provides guidance on treatments and health improvements" | Protocol action cards on every alert | 18 |
| Input through keyboard, clicks or camera | Typed readings, tap scales, in-app reaction and vision tests, and soreness reports by form or by tapping the 3D body | 8, 22 |
| "Any kind of data can be used, as long as it represents a health indicator" | Daily indicators and symptoms, crew-reported soreness, simulated suit skin temperature, and habitat context (cabin CO2, radiation dose, solar activity) | 8, 22 |
| Indicators named: blood pressure, heart rate, blood sugar, body temperature, sleep hours, mood | All six are core indicators | 8 |
| "Which measurements can be performed in space? Why is an exam needed?" | "How to measure" and "Why it matters in space" text on each indicator | 8, 19 |
| "How do spaceflight hazards affect these health indicators?" | In-flight baseline and per-indicator explanation with sources; for the radiation hazard, a model trained on NASA DONKI space weather data | 10, 17, 26 |
| "When might a result warrant attention from the crew or from flight surgeons on the ground?" | Triage route on every alert; second-opinion insights the crew can send to the ground | 13, 26 |
| "What actions can be taken to prevent a critical health condition?" | Protocols and routine prompts; the radiation outlook gives time to prepare before a possible solar particle event | 18, 26 |
| "You can use NASA's Human Research Program resources, along with the publicly available resources from other space agencies" | HRP and NASA standards as the evidence base; the CSA radiation-monitoring article from the Resources tab as context for the radiation features; NASA DONKI as the training data of the radiation model; the CSA Bio-Monitor page as context for the suit sensors | 17, 25, 26, 22.6 |
| UI design matters; clickable human figure suggested | Body map as home screen; optional 3D body with "tap where it hurts" on the Body screen | 19, 20, 22 |

Judging criteria to keep in mind: impact, creativity, validity, relevance, presentation.

### 2.1 Potential considerations on the challenge page

The challenge page lists optional considerations. Each one is covered, and the milestone that delivers it is named so it is not lost.

| Consideration on the challenge page | Our feature | Section | Milestone |
|---|---|---|---|
| Health insights in different environments: spacecraft, space station, rover, base on another planet or moon | Environment selector: space station, Moon base, Mars transit vehicle, Mars base, Mars rover. It changes the Earth delay, and so the triage route, and the context shown in explanations | 14 | M4 |
| Prompt measurements or actions from time to time as part of the mission routine | Cadence per indicator, overdue prompts in the Today card, re-check reminders from action cards | 8, 9, 18, 19 | M3, M4 |
| A gamification system | Check-in streak on Home: consecutive mission days with a completed check-in, with short milestone messages | 19.1 | M5 |
| Dynamic charts of indicators over time | Trend charts with the personal baseline band (trend lines on suit sensor cards were cut on 14 November 2026) | 19.3 | M5 |
| Color coding to read status at a glance | Good, Watch, Act, No data: always color plus icon plus word | 9, 20 | M3 |
| Simple instructions and explanations for measurements, indicators and risks | "How to measure", "Why it matters in space", action cards, and a plain-language model card for each ML model that is built | 8, 18, 19, 26 | M3, M4, A2, A3 |

---

## 3. Key decisions

| ID | Decision | Why |
|---|---|---|
| D1 | Browser-only single-page app. No backend. | The product story is "works with no link to Earth". A static site is also the easiest thing to host on a public link for judging, and has the fewest ways to fail in a demo. |
| D2 | TypeScript in strict mode everywhere in `src/`. | Catches data-shape mistakes early when several people edit the same model. |
| D3 | The engine is pure TypeScript with no React, no DOM, no storage and no real clock. | It can be unit-tested in Node and reasoned about on its own. This is where validity is proven. |
| D4 | Rules, protocols, sources and indicators are **data** (JSON validated by Zod), not code. | The health adviser can change a threshold without touching logic, and every rule is forced to carry its sources. |
| D5 | Time comes from a mission clock passed into functions. Never `Date.now()` in engine or features. | The demo must fast-forward through days and communication delays. |
| D6 | Seed data is generated offline by a Python script and committed as JSON. | Deterministic demos, no runtime dependency on Python, and the simulation model is inspectable. |
| D7 | Hash-based routing. | Works on any static host with no rewrite rules. |
| D8 | No network calls at runtime. NASA data is fetched by a tool script and cached in the repo. | On-board software cannot depend on Earth, and venue Wi-Fi cannot break the demo. |
| D9 | Health-indicator alerts use statistics, not ML: median and MAD against a rolling personal baseline, plus sourced rules. Machine learning adds three models (section 26), each limited by its evidence (D19): the solar particle event risk model trained on NASA DONKI may raise one watch-level alert (`R-RAD-03`), never an act-level one; the personal pattern and Earth hospital models only show insights. Revised on 14 November 2026. | No open NASA dataset of daily astronaut vitals exists to train on, so alerts on vitals stay explainable statistics. DONKI has years of real flares, CMEs and particle events with analyst-curated links, which gives a real supervised label. The two second-opinion models add pattern-level views without letting an unvalidated model change a health decision. |
| D10 | One alert per rule per crew member, with composite rules able to supersede their parts. | Avoids alarm fatigue. |
| D11 | The health engine and the personal body view take separate inputs. Soreness reports, suit sensor samples, body profiles and the choice of body model never reach `evaluate()` or the outbox. | A visual annotation must not silently change a health decision. Module boundaries enforce it and an invariance test proves it (section 27). |
| D12 | The 2D path is the default and is complete on its own; the 3D body is an optional, lazily loaded layer. | WebGL may be missing, a model may be missing or broken, and the demo must survive both. Everything the 3D view does has a keyboard and list equivalent. |
| D13 | Body models are made in Blender by Chirag and delivered as glTF binary files (`.glb`) that follow the contract in section 23. This replaces the earlier plan of OBJ files from standalone MakeHuman. | Blender's built-in glTF exporter keeps object names, real-world scale and empties (used as sensor anchors) in one file; OBJ cannot carry named anchor points. three.js loads `.glb` with `GLTFLoader`, which ships inside the `three` package. |
| D14 | Until the delivered files arrive, the app uses a procedural placeholder body built in code to the same contract and labeled "Placeholder model". | Loading, picking, pins, sensors, the compare view and their tests can be built and demonstrated without waiting for the modeling work. Swapping in a delivered file is a data change. |
| D15 | Named surface areas, starting with the right outer shoulder, are separate named objects inside each model file, not vertex-index maps. | Two Blender bodies need not share mesh topology, so an index map made for one body cannot be trusted on the other. A per-model patch object is placed and checked once per model. |
| D16 | A soreness pin is stored in the model's own coordinates with the model ID and version. It is drawn only on the same model version; its text is always kept. | Models will change (placeholder, first delivery, fixes). An old pin must never be drawn at a wrong place. |
| D17 | Suit sensor samples are pre-generated by the Python simulator and replayed by the mission clock. | Deterministic demos with no runtime simulation code, consistent with D5 and D6. |
| D18 | The ML model is trained offline in Python (scikit-learn) and shipped as a small JSON file of standardization values and coefficients that plain TypeScript evaluates. A parity test checks TypeScript against Python on held-out rows. | No ML library and no network at runtime, the model is fully inspectable, and its behavior in the app is proven equal to what was evaluated. |
| D19 | Evidence ladder: what a signal may do depends on its evidence. Rules with sourced thresholds raise watch and act alerts and drive triage; the `sep-risk` model, tested on real outcomes, may raise one watch alert; the `personal-pattern` and `earth-hospital` models, never tested on astronauts, may only show insights that the crew can choose to send to the ground. | The app can use three kinds of machine learning without an unvalidated model changing a health decision. Each claim is as strong as its evidence, which is what judges check under validity. |
| D20 | Models trained on Earth data see only changes from each person's own baseline, computed with the app's baseline formula (median and 1.4826 × MAD with the same minimum spreads, section 10), never absolute values. | Earth absolute ranges mislead in space (section 1.4); patterns of change are the part that can plausibly carry over. |
| D21 | No patient-level hospital data in the repository: PhysioNet files are downloaded by a script and kept out of git; only scripts, metadata, summaries and the trained model are committed. | Respects the dataset's terms and keeps the public repository free of clinical records. |
| D22 | `sep-risk` labels count only SEP records observed by an instrument (section 26.4). Raw DONKI files are never changed. Each SEP instrument name gets a class (`observed`, `model` or `unknown`) from official instrument documentation and the DONKI record context, with the supporting sources recorded. A name without that support stays `unknown`, and a name is never `observed` just because it lacks the `MODEL:` prefix. A forecast is `model` even when a real instrument is its input. Each SEP record is then observed-only, mixed, model-only or unknown. A mixed record holds established instrument-observed evidence, so it can support a positive label; its model and unknown parts are kept and reported. A flare is positive when a permitted association (direct, or through one linked CME) reaches an observed-only or mixed record, whatever model records it also reaches; a flare whose associations reach only model-only or unknown records is excluded as ambiguous, never made negative; a negative means "no qualifying recorded SEP association", never "no SEP occurred". Decided by Divyanshu on 15 November 2026. | 140 of the 494 downloaded SEP records are model output, not measurements. Counting them would let model output become the answer the model learns; turning them into negatives would hide real uncertainty. The model card reports the record classes, labels and exclusions by year and split, so the selection is visible. |

Changing any of these needs agreement from the whole team, and an edit to this table.

---

## 4. System overview

```
                 +------------------------------------------------------------------------------+
                 |                                 Browser app                                  |
                 |                                                                              |
  crew input --> |  UI (React)  -->  Store (Zustand, persisted)                                 |
  taps, typing   |     ^                  |                              |                      |
  in-app tests   |     |            health inputs                 body observations             |
                 |     |                  v                              v                      |
                 |     |   Health engine (src/engine)        Body view logic (src/bodyview)     |
                 |     |   1. baseline   per person          1. soreness reports and pins       |
                 |     |   2. sep risk   ML model estimate   2. suit sensor readouts            |
                 |     |   3. rules      data-driven         3. model contract checks           |
                 |     |   4. triage     time vs reply                                          |
                 |     |   5. status     per region                                             |
                 |     |   6. insights   second opinions                                        |
                 |     |                  |                              |                      |
                 |     +---- selectors ---+------------------------------+                      |
                 |                                                                              |
                 |  Earth link simulator: outbox, timers, replies (alerts, crew-sent insights)  |
                 |  Mission clock: simulated time, speed control                                |
                 |  3D viewer (three.js, lazy, optional): draws the model, pins and sensors     |
                 |                                                                              |
                 +------------------------------------------------------------------------------+
                          ^                             ^                            ^
            bundled JSON  |      fetched, same origin   |      fetched, same origin  |
                          |                             |                            |
        src/data/*.json                       public/seed/*.json            public/models/*.glb
        indicators, rules, protocols,         scenarios, suit replay;       body models made in
        sources, environments, body           public/data/                  Blender by Chirag
        models, areas, sensor sites;          space-weather.json            (section 23)
        models/*.json (written by ml/)
                          ^                             ^                            ^
                          |                             |                            |
                  written by people;            written by tools/            delivered files,
                  the model file by ml/         (Python, offline)            never edited here
                  (Python, offline, sec. 26)
```

Data flows one way, in two lanes. Input goes into the store. The health engine derives baselines, model estimates, alerts and statuses from health inputs and habitat context only. The body view logic derives sensor readouts and pin visibility from body observations only. The UI renders both. Neither lane writes to the store, and the two lanes never import each other (decision D11). The Earth link simulator reads alerts, never body observations.

The three machine-learning models (section 26) run on board as plain arithmetic inside the engine, with no network. Two are trained offline in `ml/` (on NASA DONKI data and on PhysioNet ICU data) and shipped as small JSON files; the third learns from each crew member's own readings in the browser. Only the rules and `R-RAD-03` produce alerts; the second-opinion models produce insights (decision D19).

---

## 5. Tech stack

| Layer | Choice | Notes |
|---|---|---|
| Language | TypeScript, strict | `noUncheckedIndexedAccess` on if it does not slow the team down. |
| Build | Vite, React template with TypeScript | Scaffold with `npm create vite@latest`. |
| UI | React with function components and hooks | No class components. |
| Styling | Tailwind CSS with its Vite plugin `@tailwindcss/vite` | Installed in M0 by following the official Tailwind guide for Vite (Tailwind v4: `npm install tailwindcss @tailwindcss/vite`, the plugin in `vite.config.ts`, `@import "tailwindcss";` in the CSS). Setup differs between major versions, so do not write the config from memory. |
| Routing | React Router with a hash router | D7. |
| State | Zustand with the `persist` middleware | localStorage. Section 21. |
| Validation | Zod | Validates every JSON data file at load and in tests. |
| Charts | Recharts | Line chart with a reference band for the baseline. |
| Icons | lucide-react | Never emoji as status icons. |
| 3D | three (Three.js), with `GLTFLoader` and `OrbitControls` from `three/addons/` | Body view only (section 22.8). Imported only in `src/features/body/viewer/` and loaded lazily. Types from `@types/three`. |
| Tests | Vitest; jsdom, React Testing Library with its required peer `@testing-library/dom`, `@testing-library/user-event` and `@testing-library/jest-dom` for smoke tests | Section 27. |
| Lint and format | ESLint and Prettier | Defaults from the Vite template plus Prettier. |
| Tools | Python 3, standard library only, in `tools/` and `ml/fetch_donki.py` | Seed and suit replay generator, DONKI fetcher, body model checker. No pip installs. |
| Machine learning (offline) | Python 3 with numpy, pandas, scikit-learn and matplotlib in a virtual environment (`.venv`), versions pinned in `ml/requirements.txt` | Section 26. Never shipped: the app ships only the exported JSON model file. |
| Hosting | Vercel, connected to the GitHub repository (any static host works) | Section 29. |

Versions: use the latest stable release of each at scaffold time, let `package-lock.json` pin them, and do not upgrade during the hackathon.

Do not add: a backend framework, a database, a CSS-in-JS library, a component kit, a date library (mission time is plain numbers), Redux, any analytics, `@react-three/fiber`, `@react-three/drei` or any other 3D wrapper, Draco, meshopt or KTX2 decoders (models are delivered uncompressed, section 23), or any machine-learning library in the app (inference is plain TypeScript, decision D18).

Install every npm package above in M0, so versions are pinned at scaffold time even for packages used later (Recharts, three).

---

## 6. Repository layout

```
.
├── CLAUDE.md                     Working rules for Claude Code
├── ARCHITECTURE.md               This file
├── README.md                     What it is, how to run, disclaimer, AI use, credits
├── AI_USAGE.md                   Log of AI tools used and for what (submission field)
├── REFERENCES.md                 Every data source, paper, library and asset (submission field)
├── index.html
├── package.json
├── vite.config.ts
├── tsconfig.json                 References tsconfig.app.json (app code, no Node types),
│                                 tsconfig.test.json (tests, may read files) and tsconfig.node.json
├── eslint.config.js              Includes the import boundaries listed below
├── .gitignore                    node_modules, dist, coverage, .env*, .venv, ml/data/raw/physionet/
├── .gitattributes                LF line endings for text files on every operating system
├── public/
│   ├── seed/                     Generated by tools/simulator. Never edited by hand (section 24)
│   │   ├── index.json            List of scenarios for the demo panel
│   │   ├── baseline-healthy.json
│   │   ├── sleep-debt.json
│   │   ├── solar-storm.json
│   │   ├── solar-flare-watch.json
│   │   ├── ...
│   │   └── suit-replay.json      Simulated suit sensor samples (section 24.5)
│   ├── models/                   Body models from Chirag (section 23). Never edited in this repository;
│   │                             the folder is created by Divyanshu when the files arrive (B3)
│   │   ├── crew-a.glb            Added in milestone B3
│   │   └── crew-b.glb
│   └── data/
│       └── space-weather.json    Real DONKI events used in scenarios (section 25)
├── src/
│   ├── main.tsx
│   ├── App.tsx                   Router and layout shell
│   ├── engine/                   PURE TypeScript. No React, DOM, storage or Date.
│   │   ├── types.ts              Domain types (section 7)
│   │   ├── schemas.ts            Zod schemas for all health data files and the model file
│   │   ├── baseline.ts           Section 10
│   │   ├── conditions.ts         Condition evaluators (section 11)
│   │   ├── rules.ts              Rule evaluation, de-duplication, superseding
│   │   ├── triage.ts             Section 13
│   │   ├── status.ts             Region and overall status roll-up
│   │   ├── stats.ts              median, mad, mean, helpers
│   │   ├── models/
│   │   │   ├── logistic.ts       Shared standardize, logit, probability and contributions
│   │   │   ├── sepRisk.ts        Model 1: features, probability, top factors (section 26.10)
│   │   │   ├── personalPattern.ts  Model 2: shrinkage covariance, distance, personal threshold (26.18)
│   │   │   ├── earthHospital.ts  Model 3: baseline-change features and probability (section 26.19)
│   │   │   └── linalg.ts         Small matrix helpers (Cholesky, solve)
│   │   ├── index.ts              Public API: evaluate(input) -> Evaluation
│   │   └── __tests__/
│   ├── bodyview/                 PURE TypeScript for the body view. No React, DOM, storage, Date or three.
│   │   ├── types.ts              Section 22.2
│   │   ├── schemas.ts            Zod schemas for body-models, body-areas, sensor-sites, suit replay
│   │   ├── pins.ts               Report building, entry labels, pin visibility by model version
│   │   ├── sensors.ts            Sensor readouts: current value, freshness, contact, trend
│   │   ├── modelContract.ts      Node-name checks and GLB JSON reading (section 23.9)
│   │   └── __tests__/
│   ├── data/                     Hand-edited JSON content, validated by the schemas
│   │   ├── indicators.json
│   │   ├── regions.json
│   │   ├── rules.json
│   │   ├── protocols.json
│   │   ├── sources.json
│   │   ├── environments.json
│   │   ├── ground-replies.json   Not built: simulated replies were cut on 14 November 2026
│   │   ├── body-models.json      Model manifest and fictional body profiles (sections 22.3, 23.8)
│   │   ├── body-areas.json       Named and general body areas (section 22.4)
│   │   ├── sensor-sites.json     Suit sensor sites and display settings (section 22.6)
│   │   └── models/               Written by scripts in ml/. Never edited by hand
│   │       ├── sep-risk-v1.json
│   │       ├── personal-pattern-v1.json
│   │       └── earth-hospital-v1.json
│   ├── store/
│   │   ├── index.ts              Zustand store, persist config, migrations
│   │   ├── selectors.ts          Memoized calls into the engine and the body view logic
│   │   ├── alertSync.ts          Records active alerts and queues their messages (added in M4, section 15)
│   │   └── seed.ts               Load a scenario file and the suit replay into the store
│   ├── clock/
│   │   └── missionClock.ts       Simulated time and ticker (section 16)
│   ├── link/
│   │   └── earthLink.ts          Outbox state machine (section 15)
│   ├── features/
│   │   ├── home/                 Body map, today summary, streak
│   │   ├── checkin/              Guided daily check
│   │   ├── region/               Region detail and trend charts
│   │   ├── alerts/               Alert detail, protocol steps, route banner
│   │   ├── earthlink/            Outbox screen
│   │   ├── tests/                Reaction test, near-vision check
│   │   ├── model/                Model card screens, #/model/:modelId (section 26.17)
│   │   ├── body/                 Body screen: soreness form and list, sensor cards, compare view
│   │   │   └── viewer/           three.js only: scene, controls, placeholder, loading, picking, markers
│   │   └── demo/                 Demo panel (scenario, clock, environment)
│   ├── components/               Shared UI: StatusBadge, Card, Tag, Stepper, TrendChart, SourceLink, BodyMap2D
│   ├── lib/                      Small helpers (formatting, ids, chart summaries)
│   └── styles/                   Tokens: status colors and 3D colors as CSS variables
├── tools/                        Python 3, standard library only
│   ├── simulator/
│   │   ├── generate.py           Writes public/seed/*.json and public/data/space-weather.json
│   │   ├── model.py              Physiology drift and noise model
│   │   ├── scenarios.py          Scenario definitions
│   │   └── suit.py               Suit sensor replay (section 24.5)
│   ├── check_body_model.py       Checks a delivered .glb against section 23
│   └── tests/                    unittest for the tools
├── ml/                           Offline machine learning (section 26). Not shipped with the app
│   ├── README.md                 How to reproduce the three models, step by step
│   ├── requirements.txt          Pinned Python packages for training (installed in .venv)
│   ├── fetch_donki.py            Downloads DONKI FLR, CME and SEP records (standard library only)
│   ├── features.py               Feature definitions, mirrored exactly in src/engine/models/sepRisk.ts
│   ├── sep_instrument_classes.json  SEP instrument names: observed, model or unknown, with sources (decision D22)
│   ├── build_dataset.py          Links events, filters and labels flares, computes features
│   ├── train_sep_risk.py         Model 1: splits, trains, evaluates, exports, writes the model card
│   ├── personal_pattern.py       Model 2 in Python, mirroring personalPattern.ts
│   ├── eval_personal_pattern.py  Model 2: simulated evaluation, export, model card
│   ├── fetch_physionet_sepsis.py Model 3 data download (standard library; data kept out of git)
│   ├── build_hospital_dataset.py Model 3: baselines, exclusions, change features, splits
│   ├── train_earth_hospital.py   Model 3: trains on hospital A, tests on hospital B, exports
│   ├── data/
│   │   ├── raw/donki/            Cached API responses, gzip JSON, plus meta.json (committed)
│   │   ├── raw/physionet/        PhysioNet files (NOT committed, decision D21); only meta.json is
│   │   └── processed/            flares.csv, dataset summaries (committed); hospital rows (not committed)
│   ├── artifacts/                Model files and parity files for all three models (committed)
│   ├── reports/                  The model cards and their plots (committed)
│   └── tests/                    unittest for parsing, labels, splits and determinism
└── docs/
    ├── PROGRESS.md               Milestone log, updated at every milestone close (section 30.4)
    ├── body-model-handoff.md     Instructions for Chirag; must match section 23
    ├── model-notes.md            Chirag's notes on how the models were made (added in B3)
    ├── challenge-resources.md    The challenge page's Resources tab, pasted by the team
    ├── demo-script.md            The exact demo path and talking points
    └── screenshots/
```

Import rules:

- `src/engine/**` imports nothing outside `src/engine/**` except Zod (its tests may also import Vitest).
- `src/bodyview/**` imports nothing outside `src/bodyview/**` except Zod (its tests may also import Vitest).
- `src/engine/**` and `src/bodyview/**` never import each other (decision D11).
- `three` is imported only in `src/features/body/viewer/**`.
- `src/store/**` may import `engine`, `bodyview`, `clock`, `link`, `lib` and `data`.
- `src/features/**` may import from `engine`, `bodyview`, `store`, `clock`, `link`, `components`, `lib`, `data`.
- Features do not import from other features. Shared pieces move to `components` or `lib`.
- ESLint enforces the first four rules with `no-restricted-imports`, so a violation fails `npm run check`.
- Nothing in `src/` imports from `ml/` or `tools/`. The only bridge is the exported JSON file in `src/data/models/`.

---

## 7. Domain model

These types live in `src/engine/types.ts`. Zod schemas in `schemas.ts` mirror them; derive types from the schemas where practical so they cannot drift. The space weather and model types are in section 26.11. Body view types live separately in `src/bodyview/types.ts` (section 22.2).

```ts
export type IndicatorId =
  | "systolic_bp" | "diastolic_bp" | "heart_rate" | "body_temp"
  | "blood_glucose" | "sleep_hours" | "mood"
  | "reaction_time" | "exercise_minutes" | "near_vision";

export type SymptomId =
  | "headache" | "blurred_vision" | "nausea" | "congestion"
  | "rash" | "dizziness" | "back_pain";

export type ContextFeedId = "cabin_co2" | "radiation_cumulative" | "solar_event" | "sep_risk";

export type RegionId =
  | "head" | "eyes" | "heart" | "core" | "bones_muscle" | "skin" | "whole_body";

export type Severity = "watch" | "act";
export type Status = "good" | "watch" | "act" | "no_data";
export type Route = "self_care" | "consult_ground" | "act_on_board";
export type ThresholdBasis =
  | "nasa-standard" | "peer-reviewed" | "clinical-general" | "illustrative";

/** Mission time is counted in milliseconds since mission start. */
export type MissionMs = number;
/** Mission day 1 is the first day. Derived: floor(ms / 86_400_000) + 1. */
export type MissionDay = number;

export interface CrewMember {
  id: string;            // "c1"
  name: string;          // fictional only, e.g. "Crew member A"
  role: string;          // "Commander", "Flight engineer"
}

export interface Reading {
  crewId: string;
  indicator: IndicatorId;
  value: number;
  day: MissionDay;
  atMs: MissionMs;
  origin: "seed" | "manual" | "in_app_test";
  purpose?: "routine" | "recheck";   // absent means routine; a re-check never enters a baseline (section 10)
}

export interface SymptomReport {
  crewId: string;
  symptom: SymptomId;
  day: MissionDay;
  atMs: MissionMs;
}

export interface ContextSample {
  day: MissionDay;
  cabin_co2: number;             // mmHg, 1-hour average worst of the day
  radiation_dose: number;        // mSv received that day
  solar_event: boolean;          // solar particle event in progress
}

export interface IndicatorDef {
  id: IndicatorId;
  label: string;
  recheckLabel?: string;         // name of an urgent re-check where "<label> re-check" would mislead (section 10)
  unit: string;
  region: RegionId;
  input: "number" | "scale" | "in_app_test";
  cadenceDays: number;           // 1 = daily, 7 = weekly
  inputMin: number;              // validation only, not clinical limits
  inputMax: number;
  step: number;
  minSpread: number;             // floor for baseline spread (section 10)
  howToMeasure: string;          // plain words, 1-3 sentences
  whyInSpace: string;            // plain words, 1-3 sentences
  sourceIds: string[];
}

export interface Baseline {
  ready: boolean;                // false until enough readings
  n: number;                     // readings used
  center: number;                // median
  spread: number;                // scaled MAD, floored at minSpread
  fromDay: MissionDay;
  toDay: MissionDay;
}

export interface Environment {
  id: "leo_station" | "lunar_surface" | "mars_transit" | "mars_surface" | "mars_rover";
  label: string;
  gravity: "micro" | "lunar" | "mars";
  oneWayDelaySecMin: number;
  oneWayDelaySecMax: number;
  notes: string;
  sourceIds: string[];
}

export interface LinkState {
  oneWayDelaySec: number;        // current value within the environment's range
  linkUp: boolean;               // false during a blackout
  groundHandlingMin: number;     // time ground needs to answer; default 5
}

export interface Rule {
  id: string;                    // "R-SLEEP-01"
  title: string;                 // shown as the alert headline
  region: RegionId;
  severity: Severity;
  when: Condition;               // section 11
  timeToActMin: number;          // minutes the crew can safely wait before starting
  needsGround: boolean;          // clinician input is wanted even when not urgent
  privateToCrew: boolean;        // e.g. mood; affects message wording only
  explain: { what: string; whySpace: string };
  protocolId: string;
  supersedes: string[];          // rule ids hidden while this rule is active
  sourceIds: string[];           // must be non-empty unless basis is "illustrative"
  basis: ThresholdBasis;
}

export interface Alert {
  key: string;                   // `${ruleId}:${crewId}`
  ruleId: string;
  crewId: string;
  severity: Severity;
  region: RegionId;
  firstSeenDay: MissionDay;
  evidence: EvidenceItem[];      // the readings that triggered it, for "what changed"
  route: Route;
  replyEtaMin: number | null;    // expected minutes until a ground reply, null if link down
  supersededBy: string | null;
}

export interface EvidenceItem {
  label: string;                 // "Sleep, last 5 nights"
  value: string;                 // "5.1 h average"
  reference: string;             // "Your normal: 6.8 h"
}

export interface Protocol {
  id: string;                    // "P-SLEEP-HYGIENE"
  title: string;
  note: string;                  // why it is a draft, which timings are illustrative; shown with the draft tag
  steps: { text: string; detail?: string }[];
  recheckAfterHours: number | null;
  escalateIf: string;            // plain words
  reviewed: boolean;             // false = draft content, UI shows a "draft" tag
  sourceIds: string[];
}

export interface Source {
  id: string;
  title: string;
  publisher: string;             // "NASA", "Scientific Reports", ...
  year: number | null;
  url: string;
  kind: "nasa" | "peer-reviewed" | "space-agency" | "event-rules" | "reference";
  keyFinding: string;            // our own words, one sentence
  verified: boolean;             // a team member opened the source and confirmed the figure
}

export interface GroundMessage {
  id: string;
  crewId: string;
  alertKey: string | null;
  insightKey: string | null;     // set when the crew sends an insight (section 26.17)
  kind: "report" | "consult";
  body: string;
  sentAtMs: MissionMs;
  arrivesAtMs: MissionMs;        // sentAt + one-way delay
  replyDueAtMs: MissionMs | null;// arrives + handling + one-way delay; null for reports
  status: "queued" | "in_transit" | "delivered" | "reply_in_transit" | "replied";
  reply: string | null;          // always labeled as simulated in the UI
}

export interface EvaluationInput {
  nowMs: MissionMs;
  crewId: string;
  readings: Reading[];
  symptoms: SymptomReport[];
  context: ContextSample[];
  link: LinkState;
  indicators: IndicatorDef[];
  rules: Rule[];
  spaceWeather: FlareObservation[];         // real DONKI flares placed in the scenario (section 26.11)
  models: {
    sepRisk: SepRiskModel | null;                 // section 26.9; null turns the sep_risk feed off
    personalPattern: PersonalPatternModel | null; // section 26.18; null turns its insight off
    earthHospital: EarthHospitalModel | null;     // section 26.19; null turns its insight off
  };
}

export interface Evaluation {
  baselines: Record<IndicatorId, Baseline>;
  alerts: Alert[];                         // active, superseded ones included but flagged
  regionStatus: Record<RegionId, Status>;
  overall: Status;
  overdue: IndicatorId[];
  insights: Insight[];                     // second opinions; never change alerts or statuses (section 26.17)
  patternReadiness: PatternReadiness | null; // null while no personal pattern model is loaded (A3)
}
```

`evaluate(input: EvaluationInput): Evaluation` in `src/engine/index.ts` is the only function the rest of the app needs from the engine.

As built in M1 (14 November 2026):

- `Baseline` is a union: `{ ready: false; n; needed }` while learning (so the UI can say "Learning your normal (n of 7)"), or `{ ready: true; n; center; spread; fromDay; toDay }`, where `fromDay` and `toDay` are the window bounds.
- `Evaluation.baselines` is keyed by the indicators passed in. `EvaluationInput.models` holds only `sepRisk` until A3 adds the second-opinion models, and `Evaluation` gains `insights` and `patternReadiness` in A3.
- `Evaluation` also reports missing data, separately from the status: `missingFeeds` (the daily habitat feeds with no sample for today) and `regionGaps` (per region, its overdue indicators and missing feeds). An active alert never hides missing data (section 9).
- Every data file has one shape, `{ "schemaVersion": 1, "<list>": [...] }`. `src/data/index.ts` parses each file with its schema and runs the cross-reference checks of section 11.6 at load, so a bad file stops the app with a clear message.
- The engine gets the mission day from `missionDayOf(nowMs)` in `src/engine/time.ts`, the same formula as section 16, so it never imports the clock.

---

## 8. Indicator catalog

Stored in `src/data/indicators.json`. `inputMin` and `inputMax` only block typos; they are not clinical limits.

### 8.1 Entered by the crew member

| ID | Label | Unit | Input | Cadence | Region | Input range | Min spread |
|---|---|---|---|---|---|---|---|
| `systolic_bp` | Blood pressure, upper | mmHg | number | daily | heart | 60-250 | 5 |
| `diastolic_bp` | Blood pressure, lower | mmHg | number | daily | heart | 30-150 | 4 |
| `heart_rate` | Resting heart rate | bpm | number | daily | heart | 30-220 | 3 |
| `body_temp` | Body temperature | °C | number, step 0.1 | daily | core | 33.0-42.0 | 0.2 |
| `blood_glucose` | Fasting blood sugar | mg/dL | number | daily | core | 30-500 | 5 |
| `sleep_hours` | Sleep last night | h | number, step 0.25 | daily | head | 0-14 | 0.5 |
| `mood` | Mood | 1-5 | tap scale | daily | head | 1-5 | 0.5 |
| `exercise_minutes` | Exercise done today | min | number | daily | bones_muscle | 0-300 | 10 |
| `reaction_time` | Reaction time | ms | in-app test | daily | head | 100-2000 | 15 |
| `near_vision` | Near-vision check | lines read, 0-10 | in-app test | weekly | eyes | 0-10 | 0.5 |

Symptoms are a daily multi-select checklist (`SymptomId`), with "None today" as an explicit choice so that no answer and no symptoms are different things.

Display units in `indicators.json` (M1): mood is "out of 5" and near-vision is "lines", so evidence reads "2 out of 5" and "8 lines". The input ranges are as in the table.

### 8.2 Habitat context (simulated feed, not typed in)

| Feed | Meaning | Unit | Anchor |
|---|---|---|---|
| `cabin_co2` | Worst 1-hour average CO2 partial pressure of the day | mmHg | NASA standard limits the 1-hour average to 3 mmHg (`co2-nasa-ochmo`) |
| `radiation_cumulative` | Running total of daily dose | mSv | Career limit 600 mSv (`radiation-nasa-ochmo`) |
| `solar_event` | Solar particle event in progress | boolean | Short-term limit 250 mSv per event (`radiation-nasa-ochmo`); event timing from cached DONKI data |
| `sep_risk` | Highest model estimate in the last 24 hours that a recent solar flare is followed by a solar particle event | probability, 0 to 1 | Computed on board by the model in section 26 from real DONKI flares placed in the scenario; an estimate, not a measurement |

### 8.3 Why each core indicator matters in space

Text for `whyInSpace`. Keep each to three sentences or fewer in the app. Revised in M1 after the source check (`docs/source-review.md`, pending Divyanshu's confirmation): wording now says only what the cited source supports.

| Indicator | Spaceflight effect | Source ID |
|---|---|---|
| Body temperature | In one study, resting core temperature rose about 1 °C over roughly 2.5 months in orbit, so the app compares readings with your own in-flight normal as well as with a fixed upper limit. | `temp-stahn-2017` |
| Blood pressure | In one study of eight astronauts on long flights, average 24-hour blood pressure was about 8 to 10 mmHg lower than before flight; the authors linked this to fluid shifting toward the head and blood vessels relaxing. | `bp-norsk-2015` |
| Heart rate | In one study of eight astronauts on long flights, average 24-hour heart rate stayed about the same as before flight, so a lasting change from your own normal is worth checking. | `bp-norsk-2015` |
| Blood sugar | Some studies report signs of insulin resistance in flight, but the data conflict. | `insulin-commsbio-2024` |
| Sleep | Crews are scheduled 8.5 hours but average about 6. | `sleep-barger-2014`, `sleep-nasa-ntrs-2024` |
| Mood | Isolation and confinement raise behavioral health risk on long missions. | `hrp-risks` |
| Exercise | Bone density falls roughly 1 to 1.5% a month without countermeasures; crews are scheduled 2.5 hours of exercise six days a week. | `bone-meta-2020`, `exercise-nasa`, `exercise-nasa-ntrs-2009` |
| Near vision | About two-thirds of long-duration crew show early signs of spaceflight associated neuro-ocular syndrome (SANS). | `sans-nasa-2023` |
| Reaction time | Long-term sleep loss lowers performance. Our test is a simplified check, not a validated instrument. | `sleep-barger-2014` |

### 8.4 In-app tests

- **Reaction test.** Five trials. Each waits a random 2 to 6 seconds, then shows a target; the crew member taps as fast as possible. Record the median of valid trials in milliseconds. A tap before the target is a false start and the trial repeats. The UI states this is a simplified check.
- **Near-vision check.** Ten lines of text in decreasing size at arm's length. The crew member taps the smallest line they can read. Record the count of lines read. The UI states this is a self-check, not an eye exam.

---

## 9. Body regions and status

Stored in `src/data/regions.json`.

| Region | Shown as | Indicators and symptoms |
|---|---|---|
| `head` | Head | sleep_hours, mood, reaction_time, headache, dizziness |
| `eyes` | Eyes | near_vision, blurred_vision |
| `heart` | Chest | systolic_bp, diastolic_bp, heart_rate |
| `core` | Abdomen | body_temp, blood_glucose, nausea |
| `bones_muscle` | Legs and arms | exercise_minutes, back_pain |
| `skin` | Chip beside the figure | rash |
| `whole_body` | "Environment" chip beside the figure | cabin_co2, radiation_cumulative, solar_event, sep_risk, congestion |

Status language, used everywhere:

| Status | Word | Color token | Icon | Meaning |
|---|---|---|---|---|
| `good` | Good | green | check | No active alert |
| `watch` | Watch | amber | eye | A watch-level alert is active |
| `act` | Act | red | alert triangle | An act-level alert is active |
| `no_data` | No data | gray | dash | Nothing recorded within the indicator's cadence |

Roll-up: a region's status is the worst severity among its active, non-superseded alerts. If it has no alerts and every indicator in it is overdue, it is `no_data`. Overall status is the worst region status.

As built in M1 (confirmed by Divyanshu on 14 November 2026):

- "Worst" ranks act, then watch, then no data, then good, because missing data also needs the crew member's attention.
- An indicator that was never recorded counts as overdue.
- **Environment** needs today's habitat sample: the CO2, cumulative dose and solar event feeds come from it, and the rules read today's values. With no sample for today, those feeds are reported in `missingFeeds` and Environment shows No data (unless an alert is active), so missing feeds never look like normal readings. `sep_risk` is not required: it has a value only after a flare.
- **Skin** has no required data, so it shows Good whenever no alert is active. Good there means only "no active alert". The absence of a rash report does not establish normal skin health, and the UI must not word it that way.
- Missing data is kept next to an active alert: `regionGaps` lists each region's overdue indicators and missing feeds even when the region shows Watch or Act.

Overdue prompts: an indicator is overdue when its newest reading is older than `cadenceDays + 1` days. Overdue items are not rules and never raise alerts. `evaluate()` returns them in `overdue`, and Home lists them in the "Today" card as routine prompts.

---

## 10. Baseline engine

File: `src/engine/baseline.ts`. Pure function per crew member and indicator.

Parameters (constants in one place, easy to tune):

| Name | Daily indicators | Weekly indicators | Meaning |
|---|---|---|---|
| `WINDOW_DAYS` | 28 | 84 | Rolling window of readings used |
| `EXCLUDE_RECENT_DAYS` | 3 | 14 | The most recent days are left out so a developing problem does not become its own normal |
| `MIN_READINGS` | 7 | 3 | Below this the baseline is not ready |

The column is chosen by the indicator's `cadenceDays` (1 is daily, 7 is weekly).

Algorithm:

1. Take readings for the indicator where `today - WINDOW_DAYS - EXCLUDE_RECENT_DAYS < day <= today - EXCLUDE_RECENT_DAYS`.
2. If fewer than `MIN_READINGS`, return `{ ready: false, n }`.
3. `center` = median of the values.
4. `spread` = 1.4826 × median absolute deviation, floored at the indicator's `minSpread`.
5. Return `{ ready: true, n, center, spread, fromDay, toDay }`.

Derived values used by conditions:

- `delta = value - center`
- `z = delta / spread`
- `percent = 100 × delta / center`

Why median and MAD: one bad typed value does not distort them, and they are easy to explain on a chart ("the shaded band is your usual range").

Why rolling: in-flight normals drift slowly as the body adapts. A rolling window follows the drift while still catching changes over days.

Edge cases:

- Baseline not ready: baseline-relative conditions evaluate to false, absolute conditions still run, and the UI shows "Learning your normal (n of 7)" (or "n of 3" for weekly indicators).
- More than one reading per day: use the last routine reading of the day for baseline and streak logic.
- Urgent re-checks (`purpose: "recheck"`, for example a blood sugar re-check 15 minutes after an alert, which is not a fasting value) never enter a baseline, a streak, an average or the overdue list, and never replace the day's routine reading. They do count for `latest` conditions, so a re-check can confirm or clear an alert.
- A re-check is named `recheckLabel` from `indicators.json`, or `<label> re-check`. Blood sugar uses "Blood sugar re-check (not fasting)", so evidence never calls an urgent re-check a fasting value (added in M4, before re-check entry was switched on). `R-GLU-02` explains that its latest reading is either the routine fasting measurement or an urgent re-check; the 70 mg/dL cut-off and its source are unchanged.
- The chart band is `center ± 2 × spread`.

---

## 11. Rules engine

Files: `src/engine/conditions.ts`, `src/engine/rules.ts`. Rules are data in `src/data/rules.json`.

### 11.1 Comparisons

```ts
type Op = "gt" | "gte" | "lt" | "lte";

type Comparison =
  | { kind: "absolute"; op: Op; value: number }
  | { kind: "baselineOffset"; op: Op; offset: number }    // value vs center + offset
  | { kind: "baselinePercent"; op: Op; percent: number }  // value vs center × (1 + percent/100)
  | { kind: "zScore"; op: Op; z: number }
  | { kind: "modelThreshold"; op: Op; model: "sep-risk" }; // value vs the loaded model file's threshold
```

`modelThreshold` (decided on 14 November 2026) compares a value with the `threshold` field of the loaded model file, so no model number is ever typed into `rules.json`. It is valid only in a `context` condition on the `sep_risk` feed. With no model loaded the condition is false, as for a missing `sep_risk` value. M1 adds it to the types and schemas; A2 uses it in `R-RAD-03`.

Every comparison reduces to `value op target`; a z-score test `z op k` uses the target `center + k × spread`, which is the same because the spread is always positive. Comparisons allow a tolerance of 1e-9, so a reading exactly at a threshold (such as 37.9 against a normal of 36.9 plus 1.0) is not lost to floating-point rounding.

### 11.2 Conditions

```ts
type Condition =
  | { type: "latest"; indicator: IndicatorId; test: Comparison; maxAgeDays?: number }
  | { type: "streak"; indicator: IndicatorId; test: Comparison; minCount: number; windowDays: number }
  | { type: "average"; indicator: IndicatorId; windowDays: number; minReadings: number; test: Comparison }
  | { type: "symptom"; symptom: SymptomId; withinDays: number }
  | { type: "context"; feed: ContextFeedId; windowDays: number; test: Comparison }
  | { type: "all"; of: Condition[] }
  | { type: "any"; of: Condition[] };
```

Semantics:

- `latest`: the newest reading passes the test. If `maxAgeDays` is set and the reading is older, false.
- `streak`: at least `minCount` of the daily values in the last `windowDays` pass the test.
- `average`: the mean over `windowDays` passes the test, provided at least `minReadings` exist.
- `symptom`: reported within `withinDays`.
- `context`: for `cabin_co2`, the mean of the daily values over `windowDays` (use 1 for "today"); for `radiation_cumulative`, the running total; for `solar_event`, true is 1 and the test is `{ kind: "absolute", op: "gte", value: 1 }`. Baseline comparisons are not valid for context feeds. For `sep_risk`, the value is the highest model output (0 to 1) among flares whose peak lies in the last `windowDays × 24` hours up to `nowMs` (a time window, not mission days; a flare exactly 24 hours old no longer counts, and a flare after `nowMs` has not happened yet); with no flare or no model there is no value and the condition is false (section 26.10).
- `all` / `any`: logical and / or.

Each evaluator returns `{ met: boolean; evidence: EvidenceItem[] }` so the alert can show what changed.

### 11.3 Example rule

```json
{
  "id": "R-SLEEP-01",
  "title": "Sleep has been low for several nights",
  "region": "head",
  "severity": "watch",
  "when": {
    "type": "streak",
    "indicator": "sleep_hours",
    "test": { "kind": "baselineOffset", "op": "lt", "offset": -1.0 },
    "minCount": 4,
    "windowDays": 5
  },
  "timeToActMin": 2880,
  "needsGround": false,
  "privateToCrew": false,
  "explain": {
    "what": "You slept at least an hour less than your normal on four of the last five nights.",
    "whySpace": "Crews in orbit average about six hours of sleep a night against eight and a half scheduled. Long-term sleep loss lowers performance."
  },
  "protocolId": "P-SLEEP-HYGIENE",
  "supersedes": [],
  "sourceIds": ["sleep-barger-2014", "sleep-nasa-ntrs-2024"],
  "basis": "illustrative"
}
```

### 11.4 Evaluation steps

For one crew member at `nowMs`:

1. Compute baselines for every indicator.
2. Evaluate every rule's `when`. Collect rules that are met.
3. Apply superseding: if rule A is met and lists B in `supersedes`, mark B's alert `supersededBy = A`.
4. Run triage (section 13) on each alert.
5. Roll up region and overall status (section 9).
6. Return the `Evaluation`.

Rules are evaluated on every state change through a memoized selector. With a few hundred readings this is instant.

### 11.5 Alert lifecycle

Alerts are **derived**, never stored. What is stored is the crew member's interaction with them (section 21): when it was first seen, whether it was acknowledged, and which protocol steps are ticked. An alert disappears when its condition stops being met; its stored interaction is kept for the history list.

### 11.6 Schema checks enforced in tests

- Every `protocolId` exists in `protocols.json`.
- Every `sourceIds` entry exists in `sources.json`.
- `sourceIds` is non-empty unless `basis` is `illustrative`.
- Every `supersedes` entry is a real rule ID, with no cycles.
- `timeToActMin` is a positive number.
- Rule IDs are unique and match `R-[A-Z0-9]+-[0-9]{2}`.
- A `modelThreshold` comparison appears only in a `context` condition on the `sep_risk` feed.
- A condition on the `sep_risk` feed uses only a `modelThreshold` comparison, and its rule is watch-level with `needsGround: false` (added in A2). The evidence ladder (decision D19) is therefore checked when the app loads: a model output cannot raise an act alert or change a route, even through a typo in `rules.json`.

---

## 12. Rule catalog v1

All triggers below are draft design values for review. "Basis" says where the threshold comes from, which the app shows on the alert.

| ID | Region | Trigger | Severity | Time to act | Ground | Sources | Basis |
|---|---|---|---|---|---|---|---|
| `R-SLEEP-01` | head | Sleep under baseline minus 1.0 h on 4 of the last 5 nights | watch | 2 days | no | `sleep-barger-2014`, `sleep-nasa-ntrs-2024` | illustrative |
| `R-COG-01` | head | All of: `R-SLEEP-01` condition; latest reaction time at least 15% over baseline; any of 3-day CO2 average over 3.0 mmHg or latest mood 2 or lower | act | 12 hours | yes | `sleep-barger-2014`, `co2-nasa-ochmo`, `hrp-hazards` | illustrative |
| `R-MOOD-01` | head | Mood 2 or lower on 5 of the last 7 days | watch | 3 days | yes, private | `hrp-risks` | illustrative |
| `R-VIS-01` | eyes | Near-vision at or below baseline minus 2 lines, or blurred vision reported in the last 3 days | watch | 7 days | yes | `sans-nasa-2023`, `fluid-shift-nasa` | illustrative |
| `R-BP-01` | heart | Systolic at or above baseline plus 20 on 2 of the last 3 days | watch | 2 days | yes | `bp-norsk-2015` | illustrative |
| `R-BP-02` | heart | Latest systolic 180 or higher, or 85 or lower | act | 30 min | yes | `bp-norsk-2015` | clinical-general |
| `R-HR-01` | heart | Resting heart rate at or above baseline plus 20 on 3 of the last 4 days | watch | 2 days | no | `bp-norsk-2015` | illustrative |
| `R-TEMP-01` | core | Latest temperature at or above baseline plus 1.0 °C | watch | 12 hours | no | `temp-stahn-2017` | illustrative |
| `R-TEMP-02` | core | Latest temperature 39.0 °C or higher, or at or above baseline plus 2.0 °C | act | 60 min | yes | `temp-stahn-2017` | illustrative (changed in M1: the 2.0 °C branch is a draft value and the registry has no clinical source for 39.0 °C yet) |
| `R-GLU-01` | core | 7-day average fasting glucose 100 mg/dL or higher | watch | 7 days | yes | `insulin-commsbio-2024` | clinical-general |
| `R-GLU-02` | core | Latest glucose under 70 mg/dL | act | 15 min | no | `hypoglycemia-ada-2025` (the cut-off), `insulin-commsbio-2024` (background only) | clinical-general |
| `R-EXE-01` | bones_muscle | 7-day average exercise under 60 minutes a day | watch | 7 days | no | `bone-meta-2020`, `exercise-nasa`, `exercise-nasa-ntrs-2009` | illustrative |
| `R-IMM-01` | skin | Rash reported in the last 2 days, and either the `R-SLEEP-01` condition or 7-day mood average under 2.5 | watch | 2 days | yes | `immune-herpes-iss`, `immune-mehta-2017` | illustrative |
| `R-CO2-01` | whole_body | Today's cabin CO2 over 3.0 mmHg | watch | 6 hours | no | `co2-nasa-ochmo` | nasa-standard |
| `R-CO2-02` | head | 3-day CO2 average 2.8 mmHg or higher and headache reported in the last day | watch | 6 hours | no | `co2-nasa-ochmo` | peer-reviewed |
| `R-RAD-01` | whole_body | Solar particle event in progress | act | 30 min | no | `radiation-nasa-ochmo`, `donki` | illustrative |
| `R-RAD-02` | whole_body | Cumulative dose at or above 480 mSv (80% of the 600 mSv career limit) | watch | 30 days | yes | `radiation-nasa-ochmo` | illustrative |
| `R-RAD-03` | whole_body | Model output `sep_risk` at or above the model's threshold within the last 24 hours (comparison `modelThreshold`, no number in `rules.json`; sections 11.1, 26.7 and 26.10). Shown to the crew as an experimental model score, never as a percent chance | watch | 2 hours | no | `donki`, `radiation-nasa-ochmo`, `sep-ml-inceoglu-2018` | illustrative |

Missed measurements are handled as overdue prompts (section 9), not as a rule.

Superseding:

- `R-COG-01` supersedes `R-SLEEP-01` and `R-CO2-02`.
- `R-TEMP-02` supersedes `R-TEMP-01`.
- `R-BP-02` supersedes `R-BP-01`.
- `R-GLU-02` does not supersede `R-GLU-01` (different problems).
- `R-RAD-01` supersedes `R-RAD-03` (an event in progress replaces the outlook). In `rules.json` since A2; the superseded outlook is listed under "Also contributing" on the `R-RAD-01` alert, with its tag.

Notes for the health adviser:

- `clinical-general` means a common terrestrial clinical cut-off used as a safety net. It is not specific to spaceflight and needs review. A rule gets this label only when the registry holds a clinical source for its cut-off; otherwise it is `illustrative`.
- Time-to-act values are draft design values for the prototype. They are not clinically validated, and the app must not present them as validated.
- The 2.8 mmHg figure in `R-CO2-02` is the low end of the range where headaches have been reported on the station (`co2-nasa-ochmo`).
- `R-RAD-01` time-to-act is a placeholder; real shelter timing depends on the event.
- `R-RAD-03` reads its threshold from the trained model file through the `modelThreshold` comparison (section 11.1). `rules.json` holds no number for it, and a test checks that evaluation uses the model file's value at full precision. Its time to act is a placeholder. Built in milestone A2 with the title "Solar flare outlook: possible particle event".

---

## 13. Triage: can this wait for Earth?

File: `src/engine/triage.ts`. This is the centerpiece feature. Keep it small, pure and heavily tested.

### 13.1 Inputs

- From the rule: `severity`, `timeToActMin`, `needsGround`.
- From the link state: `oneWayDelaySec`, `linkUp`, `groundHandlingMin`.

### 13.2 Expected reply time

```
roundTripMin = 2 × oneWayDelaySec / 60
replyEtaMin  = linkUp ? roundTripMin + groundHandlingMin : null
```

`null` means no reply can be expected until the link returns.

Prototype assumptions, not measured guarantees: `groundHandlingMin = 5` (the time the ground needs to answer) and the station's one-way delay of 0 s. The reply estimate is shown as an estimate, never as a promise.

### 13.3 Route

```ts
export function triage(rule: Rule, link: LinkState): { route: Route; replyEtaMin: number | null } {
  const replyEtaMin = link.linkUp
    ? (2 * link.oneWayDelaySec) / 60 + link.groundHandlingMin
    : null;

  if (rule.severity === "act") {
    const cannotWait = replyEtaMin === null || rule.timeToActMin < replyEtaMin;
    return { route: cannotWait ? "act_on_board" : "consult_ground", replyEtaMin };
  }
  if (rule.needsGround) return { route: "consult_ground", replyEtaMin };
  return { route: "self_care", replyEtaMin };
}
```

### 13.4 What each route does in the UI

| Route | Banner text pattern | Behavior |
|---|---|---|
| `act_on_board` | "Act now on board. A reply from Earth would take about N min." | Protocol opens at step 1. A report is queued to the ground automatically. |
| `consult_ground` | "Consult the ground. Reply expected in about N min." | A consult message is queued. Interim steps from the protocol are shown. A countdown runs to the expected reply. |
| `self_care` | "You can handle this yourself." | Protocol shown. A re-check reminder is set. Nothing is sent unless the crew member chooses to. |

Rules that hold in every route:

- An `act` alert always shows its first steps immediately. The route decides who leads, never whether help is shown.
- An `act` alert routed to `consult_ground` still starts on board: the banner says "Start the first steps now. The reply estimate is not a reason to wait." The reply estimate is never permission to postpone action.
- When the link is down, `act` alerts are always `act_on_board`, and `consult_ground` messages wait in the outbox with the text "Will send when the link returns."

As built in M4 (14 November 2026): the banner is the first section of the alert screen, headed "Who leads". For every `act` alert it lists the protocol's first two steps, whatever the route, so they are visible without scrolling at 1024 by 768 and at 390 by 844; the full checklist follows under "What to do". The reply estimate is shown in whole minutes, followed by a note that it is an estimate and how it is made, the environment's note and the ground-handling assumption. Messages already queued for the alert are listed in the banner with a "Simulated" tag. Home lists each `act` alert with "Start now:" and its first step. The countdown to the expected reply, and a self-care re-check reminder that fires later, need the running clock (M6); until then the alert shows the protocol's re-check time.

### 13.5 Worked examples (with `groundHandlingMin = 5`)

| Alert | Time to act | Station (0 s) | Moon (1.3 s) | Mars near (180 s) | Mars far (1320 s) |
|---|---|---|---|---|---|
| Reply ETA | | 5 min | 5 min | 11 min | 49 min |
| `R-GLU-02` low blood sugar | 15 min | consult_ground | consult_ground | consult_ground | **act_on_board** |
| `R-RAD-01` solar particle event | 30 min | consult_ground | consult_ground | consult_ground | **act_on_board** |
| `R-TEMP-02` high temperature | 60 min | consult_ground | consult_ground | consult_ground | consult_ground |
| `R-VIS-01` vision change | 7 days | consult_ground | consult_ground | consult_ground | consult_ground |
| `R-SLEEP-01` sleep debt | 2 days | self_care | self_care | self_care | self_care |
| `R-RAD-03` solar flare outlook (experimental model score) | 2 hours | self_care | self_care | self_care | self_care |

The demo should show `R-RAD-01` or `R-GLU-02` flipping from `consult_ground` to `act_on_board` as the delay slider moves toward Mars at its farthest. These rows are golden tests (section 27). The `R-RAD-03` row shows that a model output never changes the route on its own: it is a watch alert without a ground need, and it stays `self_care` with the link down too.

The four columns stay distinct in tests and in the demo (decided on 14 November 2026): the station is a fixed one-way delay of 0 s (reply estimate 5 min), the Moon a fixed 1.3 s (5 min), Mars near is 180 s on the slider (11 min) and Mars far is 1320 s (49 min).

---

## 14. Environments

Stored in `src/data/environments.json`. The selector sits in the app header.

| ID | Label | Gravity | One-way delay | Notes |
|---|---|---|---|---|
| `leo_station` | Space station, low Earth orbit | micro | 0 s (fixed) | Prototype assumption: no communication delay (0 s). This is not a measured value. |
| `lunar_surface` | Moon base | lunar (one-sixth g) | 1.3 s (fixed) | About 1.3 seconds each way: the approximate light-travel time, not the total communication latency. |
| `mars_transit` | Mars transit vehicle | micro | 180 to 1320 s (slider) | Delay grows with distance. |
| `mars_surface` | Mars base | Mars (three-eighths g) | 180 to 1320 s (slider) | Same delay range as transit. |
| `mars_rover` | Mars rover, away from the base | Mars (three-eighths g) | 180 to 1320 s (slider) | Pressurized rover on a trip away from the base. Same delay range as the base. |

Sources: Mars one-way delay up to about 22 minutes (`delay-nasa-m2m-2023`); light-time figures of about 182 s at closest and about 1338 s at farthest (`delay-nasa-timedelay-2017`); Mars gravity three-eighths of Earth's (`hrp-hazards`).

Delay settings (decided on 14 November 2026): loading a scenario sets its environment from `environmentId`. The station uses its fixed 0 s and the Moon its fixed 1.3 s. A Mars environment starts the slider at 180 s (Mars near, reply estimate 11 min) until it is moved; 1320 s is Mars far (49 min). `solar-storm` starts at the station, so its first banner reads "Reply expected in about 5 min".

The station's 0 s is a prototype assumption, not a measured value. The Moon's 1.3 s comes from `gateway-medical-conops` (NASA HRP-48012, page 17, section 4.2 "Communication": "an average one-way light-time delay of approximately 1.3 seconds"). It is the approximate light-travel time, not the total operational latency. Divyanshu supplied the excerpt during the M1 review because direct retrieval failed on the team's network; `verified` stays false pending the human check (`docs/source-review.md`).

As built in M4: the header holds the environment selector (all five environments) and, for the three Mars environments, a slider from 180 s to 1320 s in steps of 60 s. Its ends are labeled "Mars near" and "Mars far", and screen readers hear the value in words ("22 min each way (Mars far)"). The station and the Moon show their fixed delay. Choosing an environment sets a Mars slider back to 180 s. In a Moon or Mars environment the alert screen says that the check uses the same limits in every environment and that the app has no separate values for partial gravity (a statement about the app, not a health claim).

What an environment changes in v1:

1. The link delay used by triage.
2. The label and notes shown in explanations.
3. The default scenario offered in the demo panel.

What it does not change in v1: thresholds. Partial-gravity effects on the body are not well known, and we should not invent numbers. Say so in the app ("Effects of Mars gravity on this indicator are not yet known").

The rover environment (named in the challenge's considerations) is built in milestone M4 and kept deliberately small: its own label, notes and delay range, with the same thresholds and protocols as the base. A relayed link and a smaller protocol set for the rover are P2.

---

## 15. Earth link simulator

File: `src/link/earthLink.ts`. It models the outbox only; nothing is really sent.

**Cut on 14 November 2026: simulated ground replies.** Messages go `queued` → `in_transit` → `delivered` and stop there. A consult shows its expected reply time (`replyDueAtMs`, the same estimate triage uses) but no reply text arrives. `ground-replies.json`, the `reply` field and the `reply_in_transit` and `replied` states are not built. The rest of this section is the full design, kept for later.

As built in M4: `src/link/earthLink.ts` writes a message from an alert (sender, mission day, evidence, route, steps ticked so far; a `privateToCrew` rule is marked "Private medical" and titled "Private message"). The store action `syncAlerts` runs after every action that can change an alert or a route (`loadScenario`, `addReading`, `reportSymptoms`, `setEnvironment`, `setDelay`) and once at start with stored state. It queues one `report` for an `act_on_board` alert and one `consult` for a `consult_ground` alert, at most one message per alert key and kind: the message id is `<kind>:<alert key>`, so moving the slider back and forth never duplicates a message, and a route that flips adds the other kind once. "Send to ground" on a self-care alert queues a `consult`. Messages stay `queued` until M6 adds `advance` and the Earth link screen. Only the active crew member's alerts are evaluated, so another crew member's messages are queued when that member becomes active (crew switch, M6).

Message lifecycle, driven by the mission clock:

```
queued --(link up)--> in_transit --(sentAt + delay)--> delivered
delivered --(+ groundHandlingMin, consult only)--> reply_in_transit --(+ delay)--> replied
```

- `report` messages stop at `delivered`.
- `consult` messages get a reply from `src/data/ground-replies.json`, keyed by rule ID, with a generic fallback. Consults the crew sends from an insight (section 26.17) are labeled "Second opinion sent by crew" and get the generic reply.
- Every reply is displayed with a visible "Simulated reply" tag.
- While `linkUp` is false, messages stay `queued`.

Message body is generated from the alert: who, mission day, the evidence items, the route, and the steps already ticked. For `privateToCrew` rules the body is marked "Private medical" and the outbox list shows only "Private message" as its title.

The Earth link screen shows: current delay, link state, each message with a progress bar between its states, and the expected reply time.

As built in A3: a consult sent from an insight has the id `consult:<insight key>`, the title "Second opinion sent by crew", `insightKey` set and `alertKey` null, and a body marked "Private medical." (section 26.17). It is queued only when the crew member presses "Send to ground"; `syncAlerts` never queues one.

As built in M6 (15 November 2026):

- `advance(messages, nowMs, link)` in `src/link/earthLink.ts` is the pure state machine. A queued message leaves while the link is up, at the later of the moment it was queued and the moment the link last came up (`link.upSinceMs`, new and optional); it records `departedAtMs` (new and optional) and arrives at `departedAtMs + one-way delay`. A consult's `replyDueAtMs` is `departedAtMs + delay + groundHandlingMin + delay`, the same estimate triage uses; a report has none. A message on its way keeps going when the link goes down, and keeps the arrival time it left with when the delay changes. Messages stop at `delivered` (replies were cut).
- `advance` never creates a message. The store runs it at the end of `syncAlerts`, which every action that can change a route, the time or the outbox calls. At the station (0 s) a message is delivered the moment it leaves.
- The "sent" lines on an alert and on an insight say when it was sent and where it is now ("On its way to Earth: a consult request").
- The Earth link screen shows the link (up or down), the one-way delay, the ground handling time with its note, and every message, newest first: title, sender, status words, the three steps (in the outbox, on its way, delivered) with the current one marked, a progress bar while it travels, the arrival time, a consult's expected reply time with "Replies are not simulated in this prototype", and the message text under "Message text". A private message shows "Private medical message: its text is not shown in this list." instead of its text.

---

## 16. Mission clock and demo mode

File: `src/clock/missionClock.ts`.

- Mission time is `nowMs`, milliseconds since mission start, held in the store.
- A ticker advances it: `nowMs += realElapsedMs × speed`. Speeds: 1, 60, 600, and paused (0). It writes `nowMs` to the store at most four times a second.
- `missionDay = floor(nowMs / 86_400_000) + 1`.
- Engine and link functions receive `nowMs` as an argument. Nothing outside `missionClock.ts` reads the real clock.

Demo panel (`src/features/demo/`), opened with the keyboard shortcut `Shift+D` or a small "Presenter tools" link in the footer:

- Load scenario (section 24), with the scenario's `basedOn` note when it uses a real DONKI event.
- Switch crew member.
- Environment and delay slider.
- Link up or down.
- Clock: pause, speed, "+10 min", "+1 day".
- "Reset to seed".
- Body view (from B1 and B2): "Restart suit replay" (re-anchors the replay at the current `nowMs`), "Force 2D" (behaves as if WebGL were missing, to show the fallback), and one read-only line per crew member with the body model in use, its version and its contract result.

The panel is a presenter tool. It must never be needed for the normal crew flow. Milestone M4 adds a first version with only the scenario picker, because the M4 exit test needs it; M6 completes it.

As built in M6 (15 November 2026): `src/clock/missionClock.ts` holds the ticker (`startMissionClock`): every 250 ms of real time it adds the elapsed real time times the speed (0, 1, 60 or 600) to `nowMs`, so the store gets at most four writes a second; `useMissionClock` starts it once in the layout. A scenario loads paused (speed 0), so time moves only when the presenter chooses a speed. The header shows the mission time next to the mission day. The presenter tools now hold the mission clock (the time, Paused, 1×, 60× and 600× as pressed buttons, "+10 min", "+1 day"), the crew member, the environment and delay (the same controls as the header, with their own ids), the link ("Take the link down" or "Bring the link back up"), "Reset to seed" (reloads the current scenario after a second, explicit press), and the scenario picker. The body view items arrive with B1 and B2.

As built in M4: `src/features/demo/` holds the drawer, a modal dialog: focus moves to its heading, Escape or the close button closes it, focus returns to whatever opened it, and the page behind is `inert` while it is open. The scenario picker reads `public/seed/index.json`. Shift+D is ignored while focus is in a text field, a number field or a menu. Loading a scenario closes the drawer and shows Home.

---

## 17. Evidence registry

Stored in `src/data/sources.json` and linked from every alert, indicator explanation and model card. (The standalone Library screen was cut on 14 November 2026.)

Rules for the registry:

- `keyFinding` is written in our own words, one sentence, with the number.
- `verified` starts `false`. Set it to `true` only after a team member has opened the source and confirmed the figure. Source links show an "unverified" tag otherwise.
- Prefer NASA primary pages and technical reports. Where we only have news coverage of a study, find the primary paper before submission.
- No source, no claim. If a sentence in the app states a fact about spaceflight, it needs a source ID.

Initial entries (all `verified: false` until checked):

| ID | Title | Publisher | URL | Key finding |
|---|---|---|---|---|
| `hrp-hazards` | 5 Hazards of Human Spaceflight | NASA Human Research Program | https://www.nasa.gov/hrp/hazards | Five hazards: radiation, isolation and confinement, distance from Earth, gravity fields, hostile closed environments; they compound one another. |
| `hrp-risks` | Risks of Human Spaceflight | NASA Human Research Program | https://www.nasa.gov/hrp/risks | Lists specific risks including behavioral changes, inadequate sleep, SANS, immune changes and radiation-induced cancer. |
| `radiation-nasa-ochmo` | Radiation Protection technical brief (NASA-STD-3001) | NASA OCHMO | https://www.nasa.gov/wp-content/uploads/2023/03/radiation-protection-technical-brief-ochmo.pdf | Career limit 600 mSv for all astronauts; 250 mSv short-term limit per solar particle event. |
| `co2-nasa-ochmo` | Carbon Dioxide technical brief OCHMO-TB-004 | NASA OCHMO | https://www.nasa.gov/ochmo-tb-004-carbon-dioxide-2/ | 1-hour average CO2 limited to 3 mmHg; headaches reported between 2.8 and 4.5 mmHg. |
| `sleep-barger-2014` | Prevalence of sleep deficiency and use of hypnotic drugs in astronauts before, during, and after spaceflight: an observational study | The Lancet Neurology | https://pmc.ncbi.nlm.nih.gov/articles/PMC4188436/ | Wrist actigraphy showed about 6 hours of sleep a night in flight (ISS 6.09 h, shuttle 5.96 h), although NASA rules set aside 8.5 hours for sleep. |
| `sleep-nasa-ntrs-2024` | Impact of Sleep Shifting Strategies on the ISS | NASA NTRS | https://ntrs.nasa.gov/citations/20240002094 | Crews have historically averaged around six hours of sleep per night. |
| `bone-meta-2020` | Systematic review and meta-analysis of bone loss in space travelers | npj Microgravity | https://pmc.ncbi.nlm.nih.gov/articles/PMC7200725 | Cites a long-known loss rate of 1 to 1.5% a month; measured about 0.8% a month in the lower limbs. |
| `exercise-nasa` | Astronaut exercise research on the station | NASA | https://www.nasa.gov/missions/station/iss-research/astronaut-exercise | Exercise is the main countermeasure against bone and muscle loss; crew members average about two hours of exercise a day. |
| `exercise-nasa-ntrs-2009` | An Evidence-Based Approach To Exercise Prescriptions on ISS | NASA NTRS | https://ntrs.nasa.gov/api/citations/20090013286/downloads/20090013286.pdf | Station exercise is scheduled at 2.5 hours a day, six days a week; early crews still lost 2 to 7% bone mineral density depending on site. |
| `sans-nasa-2023` | SANS: 2023 Clinical Update | NASA NTRS | https://ntrs.nasa.gov/citations/20220014606 | About 66% of long-duration astronauts show the earliest signs of SANS. |
| `fluid-shift-nasa` | Ensuring Astronaut Health (Cardiovascular and Vision Laboratory) | NASA | https://www.nasa.gov/?p=207552 | About two liters of fluid shift toward the head in weightlessness, affecting heart, eyes and brain. |
| `temp-stahn-2017` | Increased core body temperature in astronauts during long-duration space missions | Scientific Reports | https://www.ncbi.nlm.nih.gov/pmc/articles/PMC5701078/ | Resting core temperature about 1 °C higher in flight, developing over about 2.5 months. |
| `bp-norsk-2015` | Fluid shifts, vasodilatation and ambulatory blood pressure reduction during long duration spaceflight | The Journal of Physiology | https://pmc.ncbi.nlm.nih.gov/articles/PMC4324706/ | In eight astronauts on the station, 24-hour average blood pressure was 8 to 10 mmHg lower in flight than before flight (systolic 8, diastolic 9, mean arterial 10 mmHg); the 24-hour average heart rate was unchanged. |
| `insulin-commsbio-2024` | Spaceflight induces changes in gene expression profiles linked to insulin and estrogen | Communications Biology | https://doi.org/10.1038/s42003-023-05213-2 | Insulin resistance has been reported in spaceflight, but studies conflict. |
| `hypoglycemia-ada-2025` | 6. Glycemic Goals and Hypoglycemia: Standards of Care in Diabetes—2025 | Diabetes Care (American Diabetes Association) | https://pmc.ncbi.nlm.nih.gov/articles/PMC11635034/ | A glucose level below 70 mg/dL is level 1 hypoglycemia, and 70 mg/dL is recognized as the level where people without diabetes start responding to falling glucose; for a conscious person, glucose is the preferred treatment, repeated after 15 minutes if still low. |
| `immune-herpes-iss` | Immune System Dysregulation and Herpesvirus Reactivation Persist During Long-Duration Spaceflight | (find journal) | https://core.ac.uk/works/15261213 | Varicella-zoster virus reactivated in about half of astronauts on six-month missions. |
| `immune-mehta-2017` | Latent virus reactivation in astronauts on the International Space Station | npj Microgravity | https://doaj.org/article/f32947e92776479e9e3b840364e87d36 | Reactivation of latent herpes viruses increases on long missions alongside stress hormones. |
| `delay-nasa-m2m-2023` | Human Health and Performance (Moon to Mars Architecture) | NASA NTRS | https://ntrs.nasa.gov/api/citations/20230015521/downloads/Human%20Health%20and%20Performance.pdf | One-way communication delay to Mars up to 22 minutes; crews need Earth independence. |
| `delay-nasa-timedelay-2017` | NASA technical report 20170011337 on operations under communication time delay (confirm exact title) | NASA NTRS | https://ntrs.nasa.gov/api/citations/20170011337/downloads/20170011337.pdf | One-way light time to Mars about 182 s at closest and about 1338 s at farthest. |
| `gateway-medical-conops` | Recommendation for a Medical System Concept of Operations for Gateway Missions (NASA HRP-48012) | NASA Human Research Program (NTRS 20200001341) | https://ntrs.nasa.gov/api/citations/20200001341/downloads/20200001341.pdf#page=17 | Gateway missions face an average one-way light-time delay of approximately 1.3 seconds between the Moon and Earth (page 17, section 4.2 Communication). |
| `autonomy-nasa-exmc-2021` | Development of Medical Capabilities and Technologies (decadal topical paper) | NASA NTRS | https://ntrs.nasa.gov/api/citations/20210023828/downloads/Decadal%20Topical%20-%20Development%20of%20Medical%20Capabilities%20and%20Technologies_New%20Graphic.docx.pdf | Mars delays demand crew medical autonomy and decision support usable by non-medical crew. |
| `donki` | Space Weather Database Of Notifications, Knowledge, Information (DONKI) | NASA CCMC | https://ccmc.gsfc.nasa.gov/tools/DONKI | Catalog of solar flares, solar energetic particle events and related space weather. |
| `spaceapps-challenge` | Challenge page | NASA Space Apps | https://www.spaceappschallenge.org/2026/challenges/health-monitoring-software/ | Official brief. Its Resources tab must be added to this registry. |
| `anthropometry-nasa-ntrs-2024` | Anthropometric Measurement Procedures at the Anthropometry and Biomechanics Facility | NASA NTRS | https://ntrs.nasa.gov/citations/20240002694 | NASA documents standardized body measurements and uses 3D scanning for human-system design. |
| `biomonitor-csa` | Bio-Monitor: Keeping an eye on astronauts' vital signs | Canadian Space Agency | https://www.asc-csa.gc.ca/eng/sciences/bio-monitor.asp | A wearable system that monitors astronauts' vital signs on the station, including skin temperature. |
| `deltoid-uw-atlas` | Deltoid, Musculoskeletal Atlas | University of Washington, Department of Radiology | https://rad.uw.edu/muscle-atlas/deltoid | Reference used to place and label the deltoid area on the outer shoulder. |
| `sep-ml-inceoglu-2018` | Using Machine Learning Methods to Forecast If Solar Flares Will Be Associated with CMEs and SEPs | The Astrophysical Journal (arXiv version linked; confirm the journal reference) | https://arxiv.org/abs/1806.07117 | Trained support vector machine and neural network classifiers on DONKI flare, CME and SEP associations. |
| `sep-gsep-2023` | Analysis of SEP events and their possible precursors based on the GSEP Catalog | The Astrophysical Journal Supplement Series (arXiv version linked; confirm) | https://arxiv.org/abs/2306.11318 | Studies flare magnitude, location and rise time and CME speed and width as SEP predictors, comparing random forest, gradient boosting, logistic regression and support vector machine classifiers. |
| `hrp-artemis2-data-challenge` | Winners of NASA HRP's Artemis II Data Methodology Challenge | NASA Human Research Program | https://www.nasa.gov/hrp/winners-of-nasa-hrps-artemis-ii-data-methodology-challenge/ | With only four people on board a mission like Artemis II, astronaut health data is limited, and NASA sought methods for such small, high-dimensional datasets. |
| `osdr-i4-nasa` | Inspiration4 mission datasets on NASA OSDR (confirm the exact title) | NASA Open Science Data Repository | https://www.nasa.gov/osdr-latest-news-i4-mission-datasets/ | Inspiration4 data covers four civilian astronauts on a three-day mission; the NASA Twins Study covered one astronaut and one ground control. |
| `osdr-i4-access` | Inspiration4 Mission: Commercial Astronaut Data Now Available on OSDR | NASA | https://www.nasa.gov/?p=729457 | Processed Inspiration4 data are public; raw data, including genetic sequence data, need an application with board approval. |
| `lsda-privacy-ntrs-2024` | Why We Do What We Do: Data Reuse, Open Access, and Privacy in Data Management at the Life Sciences Data Archive | NASA NTRS | https://ntrs.nasa.gov/citations/20240012051 | The Life Sciences Data Archive protects participants' privacy and consent decisions when it provides human research data for new studies. |
| `hrp-ongoing-research` | Ongoing HRP Research in Space | NASA Human Research Program | https://www.nasa.gov/hrp/ongoing-hrp-research/ | The Human Research Program's overview of its studies now running in space (challenge Resources tab). |
| `csa-radiation-monitoring-2026` | Monitoring Radiation for Astronaut Health | Canadian Space Agency | https://www.asc-csa.gc.ca/eng/news/articles/2026/2026-02-26-monitoring-radiation-astronaut-health.asp | Radiation is one of the key challenges beyond Earth's protective shield; the CSA is funding a compact, autonomous instrument (CANS) to measure neutron radiation exposure in space, building on earlier radiation detectors used on the station (challenge Resources tab). |
| `csa-why-science` | Why Do We Conduct Science Experiments in Space? | Canadian Space Agency | https://www.asc-csa.gc.ca/eng/iss/science/why-do-we-conduct-science-experiments-in-space.asp | Research on the station aims to understand the health risks of spaceflight and find countermeasures that make space travel safer; Canadian studies cover bones, heart, blood vessels and brain (challenge Resources tab). |
| `physionet-sepsis-2019` | Early Prediction of Sepsis from Clinical Data: The PhysioNet/Computing in Cardiology Challenge 2019 (dataset, version 1.0.0) | PhysioNet | https://physionet.org/content/challenge-2019/1.0.0/ | Hourly ICU data for 40,336 patients from two hospital systems with a sepsis label; training and test data of the Earth hospital model. |
| `sepsis-ccm-2020` | Early Prediction of Sepsis From Clinical Data: The PhysioNet/Computing in Cardiology Challenge 2019 | Critical Care Medicine | https://pubmed.ncbi.nlm.nih.gov/31939789/ | Describes the challenge data and labels, and concludes that generalizing to other hospital systems remains a challenge. |

Done on 14 November 2026: every item from the challenge's Resources tab is in the table above (see `docs/challenge-resources.md`). Prefer those where they cover the same fact.

Kinds for the new entries: `biomonitor-csa` is `space-agency`; `deltoid-uw-atlas` is `reference`; `sep-ml-inceoglu-2018` and `sep-gsep-2023` are `peer-reviewed` once the journal versions are confirmed; the NASA and NTRS entries are `nasa`. All entries, including the body view and ML ones, are added in M1 (decided on 14 November 2026).

**Source review (decided on 14 November 2026).** Before a rule that relies on a questionable entry is built, Claude Code reads the primary source and shows Divyanshu the supporting passage and any proposed correction (title, year, URL or key finding). Nothing changes until he confirms, and `verified` becomes `true` only after his review. Open questions (`bp-norsk-2015`, `insulin-commsbio-2024` and `sleep-barger-2014` were resolved in M1): `immune-herpes-iss` (journal unknown), `delay-nasa-timedelay-2017` and `osdr-i4-nasa` (confirm titles), `sep-ml-inceoglu-2018` and `sep-gsep-2023` (confirm journal references). This review checks that a source says what we cite. It is not clinical validation, and thresholds marked `illustrative` stay labeled illustrative.

Status after M1: see `docs/source-review.md`. `bp-norsk-2015`, `insulin-commsbio-2024` and `sleep-barger-2014` were checked against their primary papers and support the claims. Their URL, title and key-finding corrections were applied on 14 November after Divyanshu confirmed them; the table above shows the corrected entries. `hypoglycemia-ada-2025` was added as the clinical source for the low-glucose cut-off and its protocol. The NTRS-hosted sources could not be reached; for `gateway-medical-conops` (the Moon delay) Divyanshu supplied the excerpt. `verified` stays false for every entry until a team member has checked the relevant claim. `hrp-ongoing-research` is `nasa`; the two CSA articles are `space-agency`; `physionet-sepsis-2019` is `reference`; `sepsis-ccm-2020` is `peer-reviewed`.

Technical references. These support how we build, not what the app tells the crew, so they go in `REFERENCES.md` only:

| ID | What | URL |
|---|---|---|
| `gltf-spec` | glTF 2.0 specification, coordinate system and units: +Y up, +Z forward, the front of an asset faces +Z, meters | https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html#coordinate-system-and-units |
| `blender-gltf` | Blender manual, glTF 2.0 import and export | https://docs.blender.org/manual/en/4.2/addons/import_export/scene_gltf2.html |
| `blender-faq` | Blender FAQ, including who owns what is made with Blender | https://www.blender.org/support/faq/ |
| `blender-base-meshes` | Blender Studio Human Base Meshes asset bundle (CC0), on the demo files page | https://www.blender.org/download/demo-files/ |
| `threejs-gltfloader` | three.js GLTFLoader documentation | https://threejs.org/docs/pages/GLTFLoader.html |
| `donki-api` | DONKI system page with the web service documentation (CCMC) | https://ccmc.gsfc.nasa.gov/tools/DONKI |
| `ccmc-major-updates` | NASA CCMC official announcement of the replacement DONKI API endpoint and the 30 September 2026 migration (supplied through external review; not retrieved by Claude Code) | https://ccmc.gsfc.nasa.gov/news/major-updates/ |
| `donki-address-note` | Third-party note on the DONKI API address change of 30 September 2026; its claim that the older addresses redirect is not confirmed | https://packagist.org/packages/omnilab/donki |
| `scikit-learn` | scikit-learn | https://scikit-learn.org |
| `sklearn-ledoitwolf` | scikit-learn `LedoitWolf` (shrinkage covariance used by model 2) | https://scikit-learn.org/stable/modules/generated/sklearn.covariance.LedoitWolf.html |
| `sklearn-isolationforest` | scikit-learn `IsolationForest` (benchmark for model 2) | https://scikit-learn.org/stable/modules/generated/sklearn.ensemble.IsolationForest.html |

---

## 18. Protocols (action cards)

Stored in `src/data/protocols.json`. A protocol is the "what to do" for a rule.

Content rules:

- Three to six steps. Each starts with a verb. One action per step.
- Plain words. No dosing, no drug names, no instruction that needs a clinician.
- Always includes when to re-check and when to escalate.
- `reviewed: false` until the health adviser signs off. The UI shows a small "Draft guidance" tag when false.
- Steps are illustrative for a prototype. The README and footer say so.
- Every protocol has a `note` saying why it is a draft and which timings are illustrative. Timings without direct support from a source are illustrative. When the protocol screen is built (M4), the "Draft guidance" tag and the note must be visible with the steps. Approval of a draft by Divyanshu is not clinical validation, and no health adviser has reviewed any protocol yet.
- `P-GLU-LOW` is a draft adaptation of Earth clinical guidance (`hypoglycemia-ada-2025`): 15 g of fast-acting carbohydrate (preferably glucose) only if awake and able to swallow safely; nothing by mouth otherwise and the crew medical officer at once; immediate help for confusion, a seizure, reduced consciousness or worsening symptoms; a re-check after 15 minutes, repeating and calling the crew medical officer if still low. The urgent re-check is not a fasting measurement and must not wait for fasting. It names no medication.

Protocol IDs needed for the v1 rules:

`P-SLEEP-HYGIENE`, `P-COG-REST`, `P-MOOD-SUPPORT`, `P-VISION-CHECK`, `P-BP-RECHECK`, `P-BP-ACT`, `P-HR-RECHECK`, `P-TEMP-WATCH`, `P-TEMP-ACT`, `P-GLU-TREND`, `P-GLU-LOW`, `P-EXERCISE-PLAN`, `P-SKIN-CHECK`, `P-CO2-AIR`, `P-CO2-HEADACHE`, `P-RAD-SHELTER`, `P-RAD-DOSE-REVIEW`, `P-RAD-PREPARE`.

Rule to protocol mapping: `R-SLEEP-01` → `P-SLEEP-HYGIENE`; `R-COG-01` → `P-COG-REST`; `R-MOOD-01` → `P-MOOD-SUPPORT`; `R-VIS-01` → `P-VISION-CHECK`; `R-BP-01` → `P-BP-RECHECK`; `R-BP-02` → `P-BP-ACT`; `R-HR-01` → `P-HR-RECHECK`; `R-TEMP-01` → `P-TEMP-WATCH`; `R-TEMP-02` → `P-TEMP-ACT`; `R-GLU-01` → `P-GLU-TREND`; `R-GLU-02` → `P-GLU-LOW`; `R-EXE-01` → `P-EXERCISE-PLAN`; `R-IMM-01` → `P-SKIN-CHECK`; `R-CO2-01` → `P-CO2-AIR`; `R-CO2-02` → `P-CO2-HEADACHE`; `R-RAD-01` → `P-RAD-SHELTER`; `R-RAD-02` → `P-RAD-DOSE-REVIEW`; `R-RAD-03` → `P-RAD-PREPARE`.

Three draft examples to set the tone:

```json
{
  "id": "P-SLEEP-HYGIENE",
  "title": "Get your sleep back on track",
  "steps": [
    { "text": "Dim the lights one hour before your sleep period." },
    { "text": "Avoid caffeine in the second half of your day." },
    { "text": "Finish exercise at least two hours before sleep." },
    { "text": "Log tonight's sleep in tomorrow's check-in." }
  ],
  "recheckAfterHours": 24,
  "escalateIf": "Sleep stays low for three more nights, or your reaction test slows.",
  "reviewed": false,
  "sourceIds": ["sleep-barger-2014"]
}
```

```json
{
  "id": "P-RAD-SHELTER",
  "title": "Solar particle event: take shelter",
  "steps": [
    { "text": "Stop your current task and make it safe." },
    { "text": "Move to the designated shelter area." },
    { "text": "Confirm every crew member is in the shelter." },
    { "text": "Stay until the event is declared over." }
  ],
  "recheckAfterHours": 1,
  "escalateIf": "Anyone reports nausea or feels unwell during or after the event.",
  "reviewed": false,
  "sourceIds": ["radiation-nasa-ochmo"]
}
```

`P-RAD-PREPARE` belongs to the model-based outlook (`R-RAD-03`). It prepares without alarm, because the event may not happen:

```json
{
  "id": "P-RAD-PREPARE",
  "title": "Solar flare: get ready for a possible particle event",
  "steps": [
    { "text": "Tell the rest of the crew about the outlook." },
    { "text": "Check where your shelter area is and how you get there." },
    { "text": "Plan to pause outside work and trips away from shelter until the outlook clears." },
    { "text": "Keep the radiation alerts in view." }
  ],
  "recheckAfterHours": 6,
  "escalateIf": "A solar particle event begins, or a new large flare follows.",
  "reviewed": false,
  "sourceIds": ["radiation-nasa-ochmo"]
}
```

---

## 19. Screens and routes

All routes are hash routes. The layout shell has a header (crew member, mission day, environment, link status) and a bottom navigation: Home, Check-in, Body, Earth link. The Body item appears from milestone B1. (Library was cut on 14 November 2026.)

### 19.1 Home `#/`

Purpose: answer "how am I doing today?" in five seconds.

- Body map: a simple figure with tappable regions, each colored by status with an icon. Chips for Skin and Environment beside it.
- Status list beside the figure: one row per region with word, icon and the headline of its top alert.
- "Today" card: check-in progress ("4 of 9 done") with a button to continue.
- Check-in streak in the Today card: consecutive mission days with a completed check-in, with a short message at 3, 7 and 14 days ("7-day check-in streak"). It is derived from readings, never stored, and never scolds a missed day (milestone M5).
- Active alerts list, `act` first. Superseded alerts are not listed here.
- "Second opinions" card under the alerts: notable insights from the personal pattern and Earth hospital models, or a readiness line (section 26.17).
- Empty state for a new mission: "Start your first check-in" with a button.

As built in M3: the region detail route arrives in M5, so until then choosing an area on the body map or in the status list opens its readings in place (latest value, "Your normal: …" or "Learning your normal (n of 7)"). Environment shows today's simulated habitat feed values with a "Simulated habitat feed" tag; Skin says that Good means only "no active alert" and does not show that the skin is healthy. Each status row carries missing data next to its status ("Missing: …"). The Today card counts 8 steps (the reaction test step counts from M7), names the steps still to do today, lists overdue measurements (an in-app test that is not available yet says so) and says when today's habitat sample is missing.

As built in M5 (15 November 2026): choosing an area on the body map, or a row of the status list, opens its region screen `#/region/:regionId` (section 19.3); the in-place summary of M3 is gone. The status rows are links with the same spoken names. The Today card shows "Check-in streak: N days", followed by "(3-day check-in streak)", "(7-day …)" or "(14-day …)" for the highest milestone reached. A day counts when every reading step of the check-in (sleep, mood, blood pressure, heart rate, temperature, blood sugar, exercise) has a routine reading that day; urgent re-checks never count, and symptoms are not readings. The streak counts back from today once today's check-in is complete, otherwise from yesterday, so an unfinished today never breaks it. It lives in `src/lib/checkin.ts` and is never stored.

### 19.2 Check-in `#/check-in`

Purpose: collect today's readings quickly.

- One indicator per step, in a fixed order: sleep, mood, symptoms, blood pressure (both values on one step), heart rate, temperature, blood sugar, exercise, reaction test. Near-vision appears only when due.
- Each step shows the label, the input, and two collapsible lines: "How to measure" and "Why it matters in space" with a source link.
- Validation: block values outside the input range with an inline message. Never auto-correct.
- "Skip for now" on every step. Skipped items stay due.
- Final step: summary of today's values with their status, then "Done" returns Home.
- Yesterday's value is shown as a hint, never pre-filled.

### 19.3 Region detail `#/region/:regionId`

Purpose: understand one body area.

- Status header.
- For each indicator: latest value, baseline ("Your normal: 6.8 h"), and a trend chart of the last 30 days with the baseline band shaded.
- Active alerts for the region.
- Insights whose factors involve this region's indicators (section 26.17).
- "Why this matters in space" with sources.

As built in M5 (15 November 2026): the screen loads on its first visit, because it carries the chart library (a separate file, so Home does not wait for it). Each reading shows its latest value at 20 px, "Your normal: …" or "Learning your normal (n of 7)", and a 30-day chart: the readings as a line, the band `center ± 2 × spread` shaded as "your usual range", the normal as a dashed line. Under each chart is one line from `src/lib/trendSummary.ts`: the mean of the last five readings against the normal, and how many of them are outside the band ("Down 1.4 h from your normal over the last 5 readings; 5 of 5 outside your usual range."). The chart itself is hidden from screen readers; the line under it says the same in words. Urgent re-checks are not drawn, as in every baseline. Environment shows today's simulated habitat feed and Skin its note; areas without readings take "Why this matters in space" from their rules' `whySpace`, with sources. Insights about the area are listed under "Second opinions about this area". An unknown area says "No such body area".

### 19.4 Alert detail `#/alert/:alertKey`

Purpose: act on one alert. Fixed order of sections:

1. **Route banner** (section 13.4) with the reply estimate.
2. **What changed**: the evidence items.
3. **Why it matters**: `explain.what` and `explain.whySpace`.
4. **What to do**: protocol steps as a checklist. Ticks persist.
5. **Evidence**: source links and a basis tag (NASA standard, Peer-reviewed research, Common clinical cut-off, or Illustrative threshold).
6. If superseding other rules: "Also contributing" with those headlines.

For an alert whose evidence uses a model feed (`sep_risk`), "What changed" shows the experimental model score with the "Model estimate" tag, its top three factors, the real flare it is for (tagged "Historical flare") and the box "About this score" (section 26.10). "Evidence" adds the tag "Model estimate" and the link "How this model was made" to the model card screen. As built in A2: Home lists such an alert with the "Model estimate" tag, and Home says "Historical solar event" when the loaded scenario replays real DONKI flares.

Actions: "Acknowledge", and "Send to ground" when the route is `self_care`.

As built in M4: each section has a visible heading ("Who leads", "What changed", "Why it matters", "What to do", "Evidence", "Also contributing"). "What changed" also lists missing data for the alert's region ("Missing: …", with "Missing readings are not counted as normal."). "What to do" shows the protocol title, the "Draft guidance" tag and the protocol `note` above the steps; ticks persist in `alertState`, followed by "Steps done: n of m", the re-check time and "Get help sooner if". When a rule tests the newest value of a typed indicator (today `R-TEMP-01`, `R-TEMP-02` and `R-GLU-02`), an "Urgent re-check" form stores a reading with `purpose: "recheck"`, which counts for the alert but never enters or replaces the routine readings (section 10). "Evidence" shows the basis tag with one sentence on what it means, the rule's sources, the protocol's own sources and what "Unverified source" means. After "Acknowledge" or "Send to ground", focus moves to the result. A key that is not active now (for example after a normal re-check) says "This alert is not active now" with the latest value; a superseded alert links to the stronger one.

### 19.5 Earth link `#/earth-link`

Section 15. Shows delay, link state, and the outbox. No simulated replies (cut on 14 November 2026).

### 19.6 Library `#/library`

**Cut on 14 November 2026.** Its parts live elsewhere: measurement how-tos in the check-in steps ("How to measure"), source links on alerts and indicator explanations, model cards linked from alerts and insights, the disclaimer in the footer, and the list of what is simulated in the README and the "Simulated" tags. The original design, kept for later:

- Measurement how-tos for every indicator.
- Full source list with links, publisher, key finding, and verified tag.
- Links to the model cards of the three ML models (section 19.11).
- The disclaimer and the list of what is simulated: seed data, habitat feeds, ground replies, suit sensors, body profiles and the placeholder model.

### 19.7 Tests `#/test/reaction`, `#/test/vision`

Section 8.4. Reached from check-in. Results are written as readings with `origin: "in_app_test"`.

### 19.8 Demo panel

Section 16. A drawer over any screen, not a route.

### 19.9 Body `#/body` (P1)

Purpose: say where it hurts and check the suit sensors (section 22.7).

- Soreness form and the crew member's report list. Works by keyboard with no 3D.
- Three suit sensor cards (section 22.6).
- "Show 3D body" toggle, off by default (section 22.8). A tap on the body pre-fills the form.

### 19.10 Compare bodies `#/body/compare` (P1)

Both bodies side by side at a shared camera position and scale, each with its fictional profile table (section 22.7).

### 19.11 Model cards `#/model/:modelId` (P0 for `sep-risk`, P1 for the others)

One screen per model, read only from its model file: what it estimates or notices, its data, how it works, how well it did and on what (held-out years, simulated data, or a second hospital system), its limits and its sources (sections 26.10 and 26.17). A2 built `#/model/sep-risk` (the route is `model/:modelId`; any other ID says there is no card); A3 generalizes it. Linked from alerts and insights.

As built in A3: `#/model/personal-pattern` is the second card, linked from each insight as "How this model works" and from the "Second opinions" card. It says first that the evaluation used simulated data only. It shows the settings with their "Design value" tags, the simulated results as short tables of percentages with a one-line summary each and the counts and 95% intervals under "Counts and 95% intervals", the limitations and the sources, all read from the model file. Under "Today" it shows the active crew member's raw score with its meaning (above 1 means more unusual than every baseline day), never as a percent. Any other ID still says there is no card.

---

## 20. UI system and accessibility

- **Never color alone.** Status is always color plus icon plus word.
- **Large targets.** Minimum 44 by 44 px. Assume a tablet used with one hand, possibly gloved.
- **One theme done well.** Light theme by default because it projects clearly in a demo room. A dark theme is a stretch item.
- **Layout.** Design for 1024 by 768 first (tablet landscape), and make sure it works at 390 px wide.
- **Type.** Body text at least 16 px. Numbers the crew acts on at least 20 px.
- **Motion.** Subtle transitions only. No flashing. Respect `prefers-reduced-motion`.
- **Keyboard.** Every control reachable and operable by keyboard with a visible focus ring. Body-map regions are real buttons with accessible names ("Head: Watch").
- **Contrast.** Meet WCAG AA for text. Check the amber status on white.
- **Charts.** Each chart has a one-line text summary under it ("Down 1.7 h from your normal over five nights"). As built in M5, chart colours are their own tokens in `src/styles/tokens.css` (`--color-chart-line`, `-band`, `-band-edge`, `-center`, `-axis`), never status colours.
- **Copy.** Plain words, short sentences, sentence case, no jargon without explanation. Use "possible", "check", "consult". Never "diagnosis", "you have", or "normal" without "for you".
- **Simulated data.** A persistent small tag "Simulated data" in the header, and "Simulated reply" on ground replies.
- **Footer.** "Prototype for the NASA Space Apps Challenge. Not a medical device."
- **Model estimates.** Always tagged "Model estimate". The `sep-risk` output is shown as an "Experimental model score", a whole number from 1 to 99 "out of 100", with the model version, the alert level and the box "About this score" next to it. It is never shown as a percent or a chance, because the model's output is not calibrated (changed on 15 November 2026, section 26.10). Never a bare number and never color alone.
- **Insights.** A neutral card with an icon and the word "Insight", the "Model estimate" tag and the model version. Never status tokens, never on the body map, no percentage for the second-opinion models (section 26.17).
- **Body view.** 2D first: the 3D body is off by default, and every 3D action has a button or form equivalent. No drag-only interaction. Tags: "Placeholder model" while the placeholder is used, "AI-assisted model" when the manifest says so, "Simulated skin temperature" on sensor cards, "Crew-reported soreness" on soreness entries. Sensor cards use neutral styling, never status tokens, because they are not health statuses. No auto-rotation; camera moves are instant under `prefers-reduced-motion`.

Status tokens are defined once (Tailwind theme or CSS variables) as `status-good`, `status-watch`, `status-act`, `status-none`, each with a background, a foreground and a border value. Components use the tokens, never raw color values.

3D colors are defined the same way, as CSS variables next to the status tokens: `--viewer-bg`, `--body-surface`, `--body-patch`, `--pin`, `--pin-selected`, `--sensor`, `--sensor-lost`. The viewer reads them once at mount; viewer code never contains raw color values.

---

## 21. State and persistence

Zustand store in `src/store/index.ts`, persisted to localStorage under the key `chc-state`, with `version: 1` and a `migrate` function. Milestone B1 raises the version to 2; `migrate` adds the body view slices with empty defaults. Persist with `partialize`, so nothing derived and no suit replay samples are written.

Stored slices:

| Slice | Contents |
|---|---|
| `mission` | `nowMs`, `speed`, `environmentId`, `link`, `activeCrewId`, `scenarioId` |
| `crew` | `CrewMember[]` |
| `readings` | `Reading[]` |
| `symptoms` | `SymptomReport[]`, plus `noSymptomDays` per crew member |
| `context` | `ContextSample[]` |
| `spaceWeather` | `FlareObservation[]` from the scenario (section 26.11); empty until A2 adds real flares to scenarios |
| `alertState` | By alert key: `firstSeenDay`, `acknowledgedAtMs`, `stepsDone: number[]`, `lastSeenDay` |
| `outbox` | `GroundMessage[]` |
| `soreness` | `SorenessReport[]` (section 22.2). Added in B1 |
| `suit` | `anchorMs`: when the suit replay was anchored, or null before the first scenario load. The replay file itself is fetched and held in memory, not persisted. Added in B1 |
| `prefs` | Small UI preferences, including `show3d` (default false) and `force2d` (demo panel) |

Not stored (always derived through `src/store/selectors.ts`): baselines, model estimates, insights, alerts, statuses, overdue lists, the check-in streak, sensor readouts, pin visibility and model contract results.

Rules:

- Components read through selectors and write through named actions (`addReading`, `reportSymptoms`, `acknowledgeAlert`, `toggleStep`, `setEnvironment`, `setDelay`, `advanceClock`, `loadScenario`, `resetToSeed`, and from B1 `addSorenessReport`, `removeSorenessReport`, `restartSuitReplay`, `setShow3d`, `setForce2d`, and from A3 `sendInsightToGround`).
- Actions validate input. A reading outside the indicator's input range is rejected.
- `loadScenario` replaces `crew`, `readings`, `symptoms`, `context` and `spaceWeather`, sets the environment from the file's `environmentId` (with its fixed delay, or 180 s on a Mars environment; section 14), sets `nowMs` to 09:00 on the scenario's mission day (`(missionDay - 1) × 86_400_000 + 32_400_000`), clears `alertState`, `outbox` and `soreness`, and anchors the suit replay at that `nowMs`.
- If persisted state fails schema validation on load, discard it and load the default scenario. Never crash on bad storage.

As built in M3 (14 November 2026):

- `src/store/persistence.ts` holds `persistedStateSchema`; the persist `merge` step keeps stored state only if it passes, otherwise the empty state stays and `useBootstrapScenario` fetches the default scenario (`sleep-debt`). The screen shows "Loading the simulated scenario…" meanwhile, with a retry if the fetch fails.
- `noSymptomDays` is a record by crew id. `prefs` is empty until B1.
- `addReading(indicator, value, purpose)` refuses out-of-range values with a message and never corrects them. `purpose: "recheck"` marks an urgent re-check (section 10). Re-checks are entered only from an alert (M4), never through the daily check-in, where a new value for a step replaces today's routine value.
- The ground handling time comes from `environments.json` (`groundHandlingMin: 5`, with a note that it is a prototype assumption), so it is data, not code.
- Tests have their own `tsconfig.test.json` (Node types, to read generated files); app code is type-checked without Node types.

As built in M6: new actions `advanceTime(missionMs)` (the ticker, "+10 min", "+1 day"), `setSpeed`, `setLinkUp` (records `link.upSinceMs` when the link comes back) and `switchCrew`. Each ends with `syncAlerts`, which records alerts, queues their automatic messages and then lets the outbox travel. The new fields `link.upSinceMs` and `message.departedAtMs` are optional, so a state stored before M6 still loads.

As built in M4: new actions `acknowledgeAlert`, `toggleStep`, `sendToGround` and `syncAlerts` (section 15). An alert interaction is created when the alert is first seen (`firstSeenDay`, `lastSeenDay`). `setDelay` clamps to the environment's range and ignores a value that does not change the delay. `loadScenario` clears `alertState` and `outbox`, then records the new scenario's alerts and queues their messages.

---

## 22. Personal body view

Priority: P1, built in milestones B1 to B3 (section 31). The 2D health body map on Home (section 19.1) is P0 and is not part of this section.

### 22.1 Purpose and boundary

The body view answers "where?": where it is sore, and what the suit sensor at a given site shows. It has two inputs, and both are kept apart from the health engine.

| Input | What it is | Where it comes from |
|---|---|---|
| Soreness report | Crew-reported location, score 0 to 10, optional activity note | Typed in the form, or a tap on the 3D body that pre-fills the form |
| Suit sensor sample | Simulated skin temperature at one of three sites, with contact state | Pre-generated replay file (section 24.5) played by the mission clock |

Boundary rules (decision D11):

1. `evaluate()` never receives soreness reports, suit samples, body profiles or the choice of body model. `EvaluationInput` has no field for them, and the selector that builds it reads only health slices.
2. Nothing in the body view creates, changes or hides an alert, and nothing in it queues a message to Earth.
3. `src/engine` and `src/bodyview` never import each other. ESLint enforces it.
4. A soreness report is what the person reports. A sensor reading is a local surface reading. Neither is treated as evidence of strain or injury, and a sensor reading never stands in for the daily body-temperature check.
5. The invariance test (section 27) proves rules 1 and 2: with fixed health inputs, mission time and link settings, adding soreness reports, anchoring or restarting the suit replay, switching between placeholder and delivered models, or switching 2D and 3D leaves the `Evaluation` and the outbox exactly unchanged.

### 22.2 Types

In `src/bodyview/types.ts`, with Zod schemas in `src/bodyview/schemas.ts`. Mission time values are plain numbers in milliseconds, as in section 7; the body view does not import engine types.

```ts
export type SensorSiteId = "chest" | "upper_back" | "forearm_l";
export type NamedAreaId = "shoulder_r_outer";
export type GeneralAreaId =
  | "head" | "neck" | "chest" | "upper_back" | "lower_back" | "abdomen"
  | "shoulder_l" | "shoulder_r" | "upper_arm_l" | "upper_arm_r"
  | "forearm_l" | "forearm_r" | "hand_l" | "hand_r"
  | "hip_l" | "hip_r" | "thigh_l" | "thigh_r"
  | "knee_l" | "knee_r" | "calf_l" | "calf_r" | "foot_l" | "foot_r";
export type BodyAreaId = NamedAreaId | GeneralAreaId;

/** Fictional measurements a body model is built to (section 23.8). */
export interface BodyProfile {
  heightCm: number;
  inseamCm: number;
  shoulderBreadthCm: number;
  upperArmCm: number;
  forearmCm: number;
  chestCm: number;
  waistCm: number;
  hipCm: number;
  footCm: number;
}

export interface BodyModelEntry {
  id: string;                    // "crew-a"
  crewId: string;                // "c1"
  label: string;                 // "Crew member A"
  status: "placeholder" | "delivered";
  file: string | null;           // "models/crew-a.glb", relative to BASE_URL; null for the placeholder
  version: string;               // "placeholder-1", then "chirag-1", "chirag-2", ...
  madeWith: string;              // "Procedural placeholder (code)" or "Blender 4.2 by Chirag"
  aiAssisted: boolean;           // true if an AI tool generated or changed the geometry, directly or through a script it wrote
  profile: BodyProfile;
  patchChecks: Record<NamedAreaId, { checked: boolean; checkedBy: string | null }>;
  notes: string;
}

/** Where a pin sits, in the model root's own coordinates (meters, +Y up, front faces +Z). */
export interface PinAnchor {
  modelId: string;
  modelVersion: string;
  target: "body" | "patch_shoulder_r_outer";
  point: [number, number, number];
  normal: [number, number, number];
}

export interface SorenessReport {
  id: string;                    // from src/lib/ids.ts
  crewId: string;
  day: number;                   // mission day
  atMs: number;                  // mission time
  score: number;                 // integer 0..10
  areaId: BodyAreaId | null;     // null for a free pin described only in words
  locationText: string;          // required, e.g. "Right outer shoulder" or "Left calf"
  activityNote: string;          // "" when empty
  anchor: PinAnchor | null;      // null when entered without the 3D body
}

export interface SuitSample {
  crewId: string;
  site: SensorSiteId;
  atMs: number;
  contact: boolean;
  tempC: number | null;          // null when contact is false
}

/** Derived for display; never stored. */
export interface SensorReadout {
  site: SensorSiteId;
  current: { tempC: number; atMs: number } | null;   // null means "No current reading"
  lastValid: { tempC: number; atMs: number } | null;
  contact: "ok" | "lost" | "no_data";
  trend: { atMs: number; tempC: number }[];          // valid samples in the trend window
  trendDeltaC: number | null;                        // last minus first in the window
}
```

IDs come from a small helper in `src/lib/ids.ts`, not from `crypto.randomUUID`, which is missing on plain-HTTP origins such as a tablet on the local network.

### 22.3 Body models manifest

`src/data/body-models.json` has one entry per crew member who has a body: `crew-a` for `c1` and `crew-b` for `c2`. Crew member `c3` has no body; the Body screen shows the form, list and sensors for them without a 3D view.

```json
{
  "schemaVersion": 1,
  "models": [
    {
      "id": "crew-a",
      "crewId": "c1",
      "label": "Crew member A",
      "status": "placeholder",
      "file": null,
      "version": "placeholder-1",
      "madeWith": "Procedural placeholder (code)",
      "aiAssisted": true,
      "profile": { "heightCm": 175, "inseamCm": 79, "shoulderBreadthCm": 42, "upperArmCm": 34, "forearmCm": 27, "chestCm": 102, "waistCm": 86, "hipCm": 98, "footCm": 27 },
      "patchChecks": { "shoulder_r_outer": { "checked": false, "checkedBy": null } },
      "notes": "Simple shapes built in code to the model contract. Replaced by Chirag's Blender model in B3."
    }
  ]
}
```

The placeholder counts as AI-assisted because Claude Code wrote the code that builds its shape. Profile values must match section 23.8. When Chirag reports different values in `docs/model-notes.md`, update the manifest and section 23.8 together in B3.

### 22.4 Body areas

`src/data/body-areas.json` has two lists.

Named areas have a patch object in each model, a label checked against a reference, and a source:

| ID | Label | Detail | Patch object | Source |
|---|---|---|---|---|
| `shoulder_r_outer` | Right outer shoulder | deltoid area | `patch_shoulder_r_outer` | `deltoid-uw-atlas` |

General areas are plain location words for the form, with no 3D patch and no anatomical claim: head, neck, chest, upper back, lower back, abdomen, and left and right shoulder, upper arm, forearm, hand, hip, thigh, knee, calf and foot. Labels read "Left calf", "Right knee", and so on. "Left" and "right" always mean the crew member's own left and right.

The detail "deltoid area" is always shown with its source link. While `patchChecks.shoulder_r_outer.checked` is false for the model in use, a small "Placement not yet checked" tag appears when the patch is selected.

### 22.5 Soreness reports and pins

Entering a report:

- **Form, always available and keyboard first.** Fields in order: area (a select with named areas first, then general areas, then "Other, describe it"), location description (text, required, pre-filled from the area label and editable), soreness score (integer 0 to 10 with a slider and a number field; "0 means no soreness, 10 means the worst you can imagine"), activity note (optional, for example "after overhead work"), and Save. The report is saved for the active crew member at the current mission time.
- **3D tap, when the 3D body is shown.** A tap on the body opens the same form, pre-filled:
  - a hit on `patch_shoulder_r_outer` selects "Right outer shoulder" with the detail "deltoid area";
  - a hit anywhere else on `body` selects "Other, describe it", leaves the description empty and puts the cursor in it (a free pin). The crew member can still pick a general area from the list; the pin keeps its anchor.
  - The form shows "Pin placed on the 3D body" and a "Remove pin" button that keeps the form open without an anchor.

Saved entry format, in the list and as the pin label: `Right outer shoulder · 4/10 · after overhead work · Crew-reported soreness`. Without a note: `Left calf · 2/10 · Crew-reported soreness`.

Pins:

- A pin is drawn as a small marker on the surface at `anchor.point`, as a child of the model root, so it stays attached when the view or the model rotates.
- A pin is drawn only when `anchor.modelId` and `anchor.modelVersion` match the model in use. Otherwise the list shows "Made on an earlier version of this body. Text kept." and the report keeps every field. A pin is never moved to a guessed position.
- Each crew member sees only their own reports and pins. Switching crew member switches the body, the list and the pins.
- Selecting a report in the list highlights its pin; selecting a pin selects its report.
- Reports live in the `soreness` slice and persist. "Reset to seed" and loading a scenario clear them.
- Copy: "Crew-reported soreness". Never "strain", "injury" or "inflammation".

### 22.6 Suit sensors

**Cut on 14 November 2026: sensor trend charts.** Cards keep the current value, contact state, freshness and the last valid reading with its time. The trend chart, its one-line summary, `trendWindowMin` and the `trend` and `trendDeltaC` readout fields are not built. The replay file keeps its scripted shapes. The rest of this section is the full design, kept for later.

Sites are in `src/data/sensor-sites.json`:

| Site | Label | Anchor node | What the demo shows |
|---|---|---|---|
| `chest` | Chest | `sensor_chest` | A steady reading with a source label and mission timestamp |
| `upper_back` | Upper back | `sensor_upper_back` | A scripted warming trend, seen on the 3D body after rotating it |
| `forearm_l` | Left forearm | `sensor_forearm_l` | Loss of contact: "No current reading", with the last valid time shown separately |

Display settings in the same file are design values, not health thresholds: `staleAfterMin: 15` and `trendWindowMin: 60`. Each site carries `sourceIds: ["biomonitor-csa"]` for context.

Readout rules (`src/bodyview/sensors.ts`), for the active crew member at `nowMs`, using only samples with `atMs <= nowMs`:

1. `lastValid` is the newest sample with `contact: true`.
2. `current` is `lastValid` if `nowMs - lastValid.atMs` is at most `staleAfterMin` minutes; otherwise null.
3. `contact` is "ok" if the newest sample has contact, "lost" if it has none, "no_data" if there are no samples.
4. `trend` holds the valid samples from the last `trendWindowMin` minutes; `trendDeltaC` is last minus first, or null with fewer than two.
5. An expired or contact-lost sensor never shows a value as current. The last valid value appears only in the "Last valid reading" line, with its time.

Sensor card: site label; the current value in °C at 20 px or larger, or "No current reading"; "Last valid reading: 34.1 °C at day 142, 08:25 (35 min ago)"; contact state with icon and word; a small trend chart with a one-line summary ("Up 0.5 °C in the last hour"); the tag "Simulated skin temperature"; a source link; and the sentence "A simulated reading from the suit's skin sensor at this site. It is not used in health alerts or in place of your daily temperature check." Cards use neutral styling, never status tokens.

Selecting a card highlights its marker on the 3D body and offers "Turn to this sensor", which rotates the view to the sensor's side. Selecting a marker selects the card. Crew members without suit data (`c3`) see "No suit data for this crew member."

### 22.7 Body screen and compare view

Route `#/body`, nav item "Body" (added in B1). At 1024 by 768 the left column holds the 3D view when it is on, and the right column holds the form, the report list and the sensor cards. At 390 px everything stacks: 3D view, form, list, sensors.

- Heading "Your body" with the active crew member's name. Near the 3D view, the tags that apply: "Placeholder model", "AI-assisted model".
- Toggle "Show 3D body", off by default and remembered in `prefs.show3d`. It is hidden when WebGL is unavailable or `prefs.force2d` is on, and one line says why.
- Link "Compare bodies" to `#/body/compare`.

Compare view `#/body/compare`: both bodies side by side in one scene with one camera, so camera position and scale are shared. Under each: the crew member's name and the profile table (section 23.8) marked "Fictional measurements", with a link to `anthropometry-nasa-ntrs-2024` for how real body measurements are taken. No pins in the compare view. Without WebGL it shows the two profile tables side by side.

### 22.8 3D viewer

Code lives in `src/features/body/viewer/` and is the only place that imports `three`. The React wrapper `Viewer3D.tsx` is loaded with `React.lazy`, so three.js is a separate chunk that downloads only when the 3D view is turned on.

- **Renderer.** `WebGLRenderer` with antialiasing, background from `--viewer-bg`, device pixel ratio capped at 2. Render on demand (after control changes, selection changes and resize), not in a continuous loop.
- **Camera.** `PerspectiveCamera` with a field of view of about 30 degrees to limit distortion, framed from the model's bounding box so the whole body fits with a margin.
- **Controls.** `OrbitControls` from `three/addons/controls/OrbitControls.js`: rotate and zoom, no pan, limited zoom, polar angle limited so the view never goes under the floor. Buttons: Rotate left and Rotate right (45 degrees), Front, Back, Reset view. No auto-rotation.
- **Lights.** One hemisphere light and one directional light. No shadows.
- **Materials.** Every mesh under `body` gets one plain gray `MeshStandardMaterial`; the file's own materials are ignored. Patch objects get a transparent material that is invisible by default and tinted when hovered or selected. Pins and sensor markers are small spheres.
- **Colors.** Read once at mount from the CSS variables in section 20. No raw color values in viewer code.
- **Loading.** Placeholder: built in code (section 22.9). Delivered: `GLTFLoader` from `three/addons/loaders/GLTFLoader.js`, URL relative to `import.meta.env.BASE_URL`, 15-second timeout. After loading, check the node names with `checkNodeNames` (section 23.9) and keep the result for the UI and the demo panel.
- **Picking.** A pointer down and up within 6 px and 500 ms is a tap; anything else is a drag. Use the pointer events' `timeStamp` for this; it is interface timing, not mission time. Raycast against the current model only; the nearest hit wins. Patch objects sit 2 mm above the skin, so a tap on the shoulder area hits the patch first. Convert the hit to the model root's space with `root.worldToLocal` and store point and normal in the anchor.
- **Markers.** Pins and sensor markers are children of the model root at their local positions, pushed 3 mm out along the normal so the surface does not hide them. Selected markers are larger and use `--pin-selected`.
- **Disposal.** On unmount, dispose geometries, materials, controls and the renderer, and cancel pending loads.
- **Accessibility.** The canvas has `role="img"` and an `aria-label` such as "3D body of Crew member A, 2 soreness pins, 3 sensors". Everything the canvas shows is also in the list and the cards. Every 3D action has a button or form equivalent.

### 22.9 Placeholder model

`src/features/body/viewer/placeholderModel.ts` builds a simple mannequin from a `BodyProfile` to the same contract as a delivered file (section 23), so the rest of the code cannot tell the difference except through `status`:

- A root group named after the model ID; inside it a group named `body` with capsules and spheres for head, neck, torso, pelvis, upper arms, forearms, hands, thighs, calves and feet.
- Proportions from the profile: total height; inseam for leg length; shoulder breadth for the shoulder joints; arm segment lengths; chest, waist and hip circumferences for torso widths (circumference divided by pi gives a rough width; depth is a fixed fraction of the width).
- A relaxed A-pose with the arms about 40 degrees from the torso, standing on y = 0, centered on x = 0, facing +Z, with the crew member's right side at negative X.
- `patch_shoulder_r_outer`: a partial sphere shell 2 mm outside the right shoulder joint, on its outer side.
- `sensor_chest`, `sensor_upper_back`, `sensor_forearm_l`: empty `Object3D` nodes on the surface at the front of the chest, the upper back between the shoulders, and the outer side of the left forearm.
- The UI shows "Placeholder model" whenever it is used.

### 22.10 Fallbacks

| Situation | What the crew member sees |
|---|---|
| WebGL unavailable, or "Force 2D" on in the demo panel | No 3D toggle; one line: "3D view is not available here. The list and sensor cards show the same information." |
| Manifest says `placeholder` | Placeholder body with the "Placeholder model" tag |
| Delivered file fails to load or times out | The 2D path with "The 3D body could not be loaded." The placeholder is not swapped in silently |
| Delivered file has no `body` node | Model rejected, as for a failed load; the demo panel shows the contract result |
| Patch object missing | Taps on the shoulder create free pins; the named area is still available in the form |
| A sensor anchor missing | That marker is not drawn; its card still shows |
| Crew member has no model | Form, list and sensors without a 3D view, and "No 3D body for this crew member." |
| A pin made on another model version | Not drawn; its text stays in the list with "Made on an earlier version of this body. Text kept." |

### 22.11 What must be proven

Tests in section 27 cover: pins stay attached when the model rotates; crew records stay separate; an expired or contact-lost sensor shows no current value; body observations leave the health evaluation and the outbox unchanged; the Body screen works with no WebGL and by keyboard; delivered models pass the contract checks.

---

## 23. Body model contract (Blender handoff)

This section is the agreement between the app and the body models. Chirag builds the models in Blender with his own Claude. Divyanshu integrates them. `docs/body-model-handoff.md` is the copy Chirag works from and must match this section; when this section changes, update the handoff file in the same commit and send it to Chirag.

### 23.1 Who does what

- **Chirag** builds two fictional bodies in Blender, adds the named patch and the sensor anchors, exports two `.glb` files, writes `docs/model-notes.md`, and runs the self-check in section 23.9.
- **Divyanshu** puts the files into the repository, runs the checker, integrates them (milestone B3), and sends precise feedback if a check fails.
- **Claude Code** never creates, edits, repairs, converts or re-exports a model file. It reads model files only to check them. It builds and maintains the placeholder (section 22.9).

### 23.2 Files to deliver

| File | Content |
|---|---|
| `crew-a.glb` | Body of Crew member A (`c1`), built to the crew A profile in section 23.8 |
| `crew-b.glb` | Body of Crew member B (`c2`), built to the crew B profile in section 23.8 |
| `model-notes.md` | Blender version; how each body was made (base mesh used and its license, add-ons, any AI help and what for); the profile values actually used; triangle counts; who checked the shoulder patch against the atlas and when; known limits |

The `.glb` files go to `public/models/`, the notes to `docs/model-notes.md`.

### 23.3 Format and export

- glTF 2.0 binary: one `.glb` file per body, exported with Blender's built-in glTF 2.0 exporter (File > Export > glTF 2.0).
- Export the objects of one body at a time: select them and limit the export to selected objects.
- Settings: format glTF Binary (.glb); +Y Up on; apply modifiers on; normals on; UVs, tangents and vertex colors off; materials off (or one plain material); compression (Draco) off; animation, shape keys, skinning, cameras and lights off; custom properties off.
- At most 4 MB per file.

The same export in Blender Python. Option names can differ slightly between Blender versions; if one is rejected, remove it and set that option by hand in the export dialog.

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

### 23.4 Scene rules

| Rule | Value |
|---|---|
| Units | Metric, unit scale 1.0: one Blender unit is one meter |
| Height | Top of head to sole of foot equals the profile height, within 1 cm |
| Ground | Lowest point of the feet at Blender Z = 0, which becomes Y = 0 in the file |
| Center | Body midline on X = 0; feet centered around Y = 0 in Blender |
| Facing | The body faces Blender's front view, the −Y direction (numpad 1 looks at the face). Exported with +Y up, it faces +Z, the front direction of a glTF asset (`gltf-spec`) |
| Left and right | The crew member's own right side is at negative X and the left side at positive X. In Blender's front view the body's right hand appears on the viewer's left |
| Pose | The same relaxed A-pose for both bodies: arms about 40 degrees from the torso, elbows almost straight, palms toward the thighs, feet about hip-width apart. Arms do not touch the torso and the legs do not touch each other |
| Transforms | Apply all transforms (location, rotation, scale) on mesh objects so they export with identity transforms. Sensor empties keep their location, with rotation 0 and scale 1. No parenting |

### 23.5 Mesh rules

- One mesh object named `body`: the whole figure as one closed, smooth surface.
- A neutral mannequin surface: no hair, eyebrows, eyelashes, separate eyes, teeth, tongue or clothing; no face texture; no genital or nipple detail.
- Normals point outward; smooth shading; no loose vertices, inner faces or duplicate vertices (merge by distance).
- 20,000 to 60,000 triangles after modifiers, about 40,000 as a target. Check with the Statistics overlay.
- No armature, skin, shape keys or animation in the exported file. If a rig was used for posing, apply the pose and remove the armature modifier before export.
- No textures. The app paints the body plain gray.

### 23.6 Named patch: right outer shoulder

- One extra mesh object named exactly `patch_shoulder_r_outer`, on the crew member's **right** side (negative X).
- It marks the deltoid area, the rounded outer part of the shoulder. Place it using the University of Washington deltoid atlas page (`deltoid-uw-atlas`), and record in `model-notes.md` who checked the placement and when.
- How: in Edit Mode select the body faces over that area; duplicate them (Shift+D, then right-click to cancel the move); separate the copy into its own object (P > Selection); push it 2 mm out along the normals (Alt+S, 0.002); rename it `patch_shoulder_r_outer`; apply its transforms. The `body` mesh stays complete underneath.
- At least about 6 cm across, so it is easy to tap.

### 23.7 Sensor anchors

Three empties (Add > Empty > Plain Axes, display size 0.05), each placed on the skin surface:

| Name | Where |
|---|---|
| `sensor_chest` | Front of the chest, on the midline, about halfway down the breastbone |
| `sensor_upper_back` | Upper back, on the midline, between the shoulder blades |
| `sensor_forearm_l` | Outer side of the **left** forearm (positive X), about halfway between elbow and wrist |

Tip: put the 3D cursor on the surface (Shift + right-click on the body), then add the empty at the cursor. Keep the empties unparented, with rotation 0 and scale 1.

### 23.8 Fictional body profiles

Both bodies have the same height and visibly different proportions. All values are fictional, in centimeters, chosen only to make the two bodies look different. They are not statistics about any population or any real person.

| Measurement | How it is taken on the model | Crew A (`c1`) | Crew B (`c2`) |
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

Height must be met within 1 cm. The other values are guides: match them as closely as practical (within about 2 cm is fine) and record the values actually used. Circumferences are hard to measure in Blender, so approximations are acceptable if they are recorded. NASA's anthropometry work documents how standardized body measurements are taken (`anthropometry-nasa-ntrs-2024`); our values are not taken from it.

### 23.9 Acceptance checks

Automated, run by Divyanshu (Chirag may run it too): `python tools/check_body_model.py public/models/crew-a.glb --crew c1`. It reads expected values from `src/data/` (accepting `--height-cm` when run outside the repository) and prints PASS or FAIL for each check, with the measured and expected values. Exit code 1 if anything fails.

1. Valid GLB container with glTF `asset.version` "2.0".
2. Node names: `body`, `patch_shoulder_r_outer`, `sensor_chest`, `sensor_upper_back`, `sensor_forearm_l` all present. A missing one is a FAIL here, even though the app can degrade without it (section 22.10).
3. No `skins`, `animations` or `cameras`; `extensionsUsed` lists none of `KHR_draco_mesh_compression`, `EXT_meshopt_compression`, `KHR_mesh_quantization`.
4. Mesh nodes have identity transforms (transforms applied).
5. From the `body` POSITION accessor bounds: height within 1 cm of the profile; lowest point within 1 cm of 0; midline (center of the X bounds) within 3 cm of 0.
6. Triangle count at most 60,000 (below 20,000 is a warning, not a failure). File size at most 4 MB.
7. Orientation: `sensor_chest` has a larger Z than `sensor_upper_back` (the body faces +Z); the center of `patch_shoulder_r_outer` has X below 0 (right side) and Y above 65% of the height; `sensor_forearm_l` has X above 0 (left side).

The app-side check `checkNodeNames(names)` (in `src/bodyview/modelContract.ts`) runs at load: missing `body` rejects the model; a missing patch or anchor degrades the features as in section 22.10.

Visual check in the app (B3): both bodies load; a tap on the shoulder patch gives "Right outer shoulder · deltoid area"; a tap on the left calf gives a free pin; markers sit on the skin; the back sensor shows after rotating; the compare view shows the two bodies side by side at the same height.

Chirag's self-check before sending, with no code: re-import each `.glb` into an empty Blender scene and confirm the object names, the height in the Dimensions panel, the feet on the ground, the body facing the front view, the shoulder patch on the body's right, the three empties on the skin, the triangle count in the Statistics overlay, and the file size.

### 23.10 Integration and versions

1. Copy the files into `public/models/` and `docs/model-notes.md`. Copying is the only thing done to the files.
2. Run the checker for each file. If a check fails, do not edit the file and do not commit it: send Chirag the failing lines, and keep the placeholder for that crew member.
3. For each passing file, update `src/data/body-models.json`: `status: "delivered"`, `file`, `version` (`chirag-1`, then `chirag-2` for a re-delivery), `madeWith`, `aiAssisted`, `patchChecks`, and the profile values from `model-notes.md` (also update section 23.8 if they changed).
4. Run `npm run check`, open the Body screen and the compare view, and do the visual checks.
5. Update `REFERENCES.md` (Blender, any base mesh and its license, Chirag's credit) and `AI_USAGE.md` (Chirag's use of Claude, if any).
6. Every new delivery of a file gets a new `version`. Pins made on older versions stop being drawn and keep their text (decision D16).

### 23.11 Timing and fallback

- Chirag sends a rough first export of one body as early as possible, even an untidy one, so the format and the pipeline can be tested before the final models.
- Final files by Sunday 14:00 at the latest.
- If the files arrive after 16:00 on Sunday, integrate them only if the checker passes on the first run (section 32.3). Otherwise ship the labeled placeholder and say so in the README. After the 18:00 code freeze there are no model changes.
- The 3D body stays a target, with a fallback (decided on 14 November 2026): if the after-B1 checkpoint (section 32.3) shows too little time and Divyanshu decides to skip B2 and B3, the app ships the 2D body view, and the README and slides credit the Blender models as work in progress.
- The standalone checker (`tools/check_body_model.py`) is brought forward when the first rough export arrives, with Divyanshu's OK (section 30.5).
- If only one file arrives, integrate it; the other crew member keeps the placeholder, and the compare view labels each body.

---

## 24. Seed data and simulator

Python 3, standard library only, in `tools/simulator/`. Output is committed to `public/seed/` and `public/data/space-weather.json`. Never edit those files by hand; change the simulator and regenerate.

### 24.1 File format

```json
{
  "schemaVersion": 1,
  "scenarioId": "sleep-debt",
  "title": "Sleep debt building over five nights",
  "simulated": true,
  "generator": "tools/simulator seed=42",
  "missionDay": 142,
  "environmentId": "mars_transit",
  "crew": [{ "id": "c1", "name": "Crew member A", "role": "Commander" }],
  "readings": [
    { "crewId": "c1", "indicator": "sleep_hours", "value": 6.75, "day": 1, "atMs": 28800000, "origin": "seed" }
  ],
  "symptoms": [],
  "context": [{ "day": 1, "cabin_co2": 2.1, "radiation_dose": 0.6, "solar_event": false }],
  "spaceWeather": [],
  "basedOn": null,
  "expectedAlerts": [{ "crewId": "c1", "ruleId": "R-SLEEP-01" }],
  "expectedInsights": []
}
```

`expectedAlerts` lists the non-superseded alerts that must be active at `missionDay`. Tests assert an exact match (section 27). Golden tests evaluate at 09:00 on `missionDay`, the same moment `loadScenario` sets (section 21). `expectedInsights` lists the insights (`{ crewId, modelId }`) that must be present at that moment; the golden test checks them for every second-opinion model that is loaded. A3 and A4 fill in `expectedInsights` for every scenario from what the models give, after Divyanshu has looked at each insight. `pattern-shift` is built to show the personal pattern model; no other scenario, threshold or model is changed to make an insight appear or disappear.

As built in A3: the generator writes `expectedInsights` from `expected_insights` in `scenarios.py`. A new field `checkin_today` lists the crew members whose morning check-in of the mission day is already logged (simulated, with the scenario's effects for that day; exercise, logged in the evening, is not). The personal pattern model needs at least four of today's readings, and the other scenarios stop their histories the day before the mission day, so only `pattern-shift` has an insight: `personal-pattern` for `c1`. Every other scenario expects none, and the golden test checks both ways. Divyanshu has not yet looked at the insight (pending), so these expectations are not marked as reviewed.

`spaceWeather` holds `FlareObservation` records (section 26.11), copied from real DONKI flares; it is empty in most scenarios. `basedOn` is null or a short note naming the real event a scenario uses, for example "Timing and flare from NASA DONKI event 2024-05-09T08:45:00-FLR-001". The demo panel and the alert evidence show it.

The generator also writes `public/seed/index.json`, a list of `{ scenarioId, title, environmentId, missionDay }` that the demo panel reads. Scenario files never contain body view data.

As built in M2 (14 November 2026):

- `index.json` wraps the list: `{ schemaVersion, simulated, defaultScenarioId, scenarios: [...] }`.
- Seed histories run to the day before `missionDay`, so the crew member still has today's check-in to do. A scenario adds readings for today only where its story needs them (`low-glucose`). The habitat context always includes today.
- Each scenario has its own named random stream (`seed:scenarioId`), so adding a scenario never changes the others. Files are written with one reading per line and LF line endings, byte-identical on every run.
- A reading may carry `purpose: "recheck"` (an urgent repeat measurement asked for by an action card). Absent means routine. Seed files contain routine readings only.
- `public/data/space-weather.json` lists only real DONKI events and says so when there are none. The generator refuses to name a DONKI event that is not in `ml/data/raw/donki/`.

### 24.2 Model

For each crew member and indicator, a daily value is `personal mean + adaptation drift(day) + noise + scenario effect`.

- Personal means differ per crew member (three crew members, fictional names only: `c1` Crew member A, Commander; `c2` Crew member B, Flight engineer; `c3` Crew member C, Mission specialist).
- Adaptation drift is seeded from the sources: temperature rises toward about plus 1 °C over 75 days (`temp-stahn-2017`); blood pressure settles about 10 mmHg below a ground value (`bp-norsk-2015`); sleep centers near 6 to 7 hours (`sleep-barger-2014`).
- Daily radiation dose is a placeholder constant per environment. The NASA brief uses about 0.5 mSv a day for a surface mission and 1.5 mSv a day in a transit example (`radiation-nasa-ochmo`); treat both as illustrative.
- Noise is Gaussian with a per-indicator standard deviation, clipped to the input range, rounded to the indicator's step.
- A fixed random seed makes output identical on every run.

### 24.3 Scenarios

| ID | What happens | Expected alerts | Built in |
|---|---|---|---|
| `baseline-healthy` | Nothing unusual | none | M2 |
| `sleep-debt` | Five short nights | `R-SLEEP-01` | M2 |
| `solar-storm` | A real large flare yesterday at 15:00 (`2023-08-07T20:30:00-FLR-001`, X1.5), then a solar particle event starts today. Starts at the space station (0 s delay, reply estimate 5 min) | `R-RAD-01` (it supersedes `R-RAD-03`) | M2; flare added in A2 |
| `solar-flare-watch` | A real large flare from the model's test years peaked this morning at 07:30 (`2023-08-05T21:45:00-FLR-001`, X1.6); no particle event yet. Mission day 150 in the Mars transit vehicle, so the delay slider is there to show that the route does not move | `R-RAD-03` for every crew member | A2 |
| `fever` | Temperature climbs over the last two days, with resting heart rate rising alongside | `R-TEMP-02`; the `earth-hospital` insight is checked in A4 (section 26.19) | M2 if time, else M7 |
| `low-glucose` | One low fasting reading today | `R-GLU-02` | M2 if time, else M7 |
| `early-mission` | Mission day 4, baselines not ready | none (UI shows "Learning your normal") | M2 if time, else A3 |
| `cognitive-compound` | Sleep debt, slower reaction time, CO2 creeping over 3 mmHg | `R-COG-01`, `R-CO2-01` | M7 |
| `vision-drift` | Near-vision score falls over three weeks | `R-VIS-01` | M7 |
| `missed-exercise` | A week of short sessions | `R-EXE-01` | M7 |
| `pattern-shift` | Over the last three days several readings drift a little at once (sleep and mood down, resting heart rate up, reaction time slower), none enough for a rule. As built: mission day 130 at the Mars base; crew member A's morning check-in today is logged; each change is 2.5 times the simulator's day-to-day noise of that reading (the "combined" pattern of the simulated evaluation at one of its sizes), with the noise reduced on the shifted days. Built to show the insight, so the insight is there by construction; how often the model notices such a shift is in its model card, not in this scenario | none; the insight `personal-pattern` for `c1` | A3 |

The default scenario on first load is `sleep-debt`. The three P0 scenarios are `baseline-healthy`, `sleep-debt` and `solar-storm`.

### 24.4 Commands

```
python tools/simulator/generate.py --all --seed 42
python tools/simulator/generate.py --scenario solar-storm --seed 42
python tools/simulator/generate.py --suit --seed 42
python -m unittest discover -s tools/tests
```

On some systems the command is `python3` or `py`. After regenerating, run the tests; golden tests catch any scenario that no longer triggers its alerts.

### 24.5 Suit replay

`tools/simulator/suit.py`, called by `generate.py --suit` and by `--all`, writes `public/seed/suit-replay.json`:

```json
{
  "schemaVersion": 1,
  "simulated": true,
  "label": "Simulated skin temperature",
  "generator": "tools/simulator/suit.py seed=42",
  "intervalMin": 5,
  "fromOffsetMin": -120,
  "toOffsetMin": 1440,
  "samples": [
    { "crewId": "c1", "site": "chest", "offsetMin": -120, "contact": true, "tempC": 34.1 }
  ]
}
```

- Offsets are minutes relative to the moment the replay is anchored. `loadScenario` anchors it at the scenario's `nowMs`; the demo panel's "Restart suit replay" re-anchors it at the current `nowMs`. A selector turns each sample into `atMs = anchorMs + offsetMin × 60_000`. The file is not persisted: on app start it is fetched again and placed at the stored `anchorMs`.
- Crew `c1` and `c2` only, every 5 minutes from 2 hours before the anchor to 24 hours after.
- Scripted shape per site, with illustrative simulation parameters (not reference values; the app never compares them with anything): `chest` steady at about 34.0 °C with small noise; `upper_back` starting at about 33.0 °C at offset −120 and warming steadily by 1.5 °C until offset +60, then steady; `forearm_l` steady at about 32.5 °C with contact through offset −35 and no contact from offset −30 to the end. At load time the forearm therefore already shows "No current reading", with its last valid reading 35 minutes earlier.
- Values have one decimal. Fixed seed; identical output on every run.

### 24.6 Real space weather in scenarios

From A2 on, the generator reads `ml/data/processed/flares.csv` (section 26.4) with the standard `csv` module and copies real flares into scenarios as `FlareObservation` records:

- Only flares from the model's test years are used, so the demo never shows the model a flare it was trained or tuned on. The generator refuses any other flare, and a flare that is not in `flares.csv`.
- Each scenario names its flare by DONKI ID in `scenarios.py`. For `solar-flare-watch`, Claude Code picks a test-year flare that is a positive under decision D22 (DONKI links it to an instrument-observed particle event) and that the model scores at or above its threshold; the golden test proves the choice. As built in A2 the rule is: the earliest X-class flare that meets these conditions and is not the `solar-storm` flare, which gives `2023-08-05T21:45:00-FLR-001`; a simulator test re-derives it. The demo therefore shows a hit by construction. It says nothing about how often the model is right; the model card does, and the screen shows the false-alarm count next to the score.
- The flare's peak is placed on the scenario's mission timeline: `solar-flare-watch` at 07:30 on the mission day, `solar-storm` at 15:00 the day before. Both fall inside the 24-hour window of `R-RAD-03` at 09:00 (section 26.10). Real dates stay in `basedOn` and in `public/data/space-weather.json`, which lists every real event used, with its DONKI ID, link and the retrieval date.

---

## 25. NASA data and resources

Space Apps asks teams to use NASA data or resources, and to list them. Keep `REFERENCES.md` current as you go.

What we use:

1. **NASA research and standards** as the evidence base for indicators, rules and explanations (section 17).
2. **NASA DONKI space weather records** (solar flares, coronal mass ejections, solar energetic particle events and the links between them), in two ways: as the training and test data of the machine-learning model (section 26), and as the real events placed in the `solar-storm` and `solar-flare-watch` scenarios (section 24.6).
3. **Challenge Resources tab**, recorded in `docs/challenge-resources.md` on 14 November 2026. It lists informational pages and no datasets: NASA's 5 Hazards of Human Spaceflight, Risks of Human Spaceflight and Ongoing HRP Research in Space, and two CSA articles, Monitoring Radiation for Astronaut Health and Why Do We Conduct Science Experiments in Space?. All five are in the evidence registry (section 17) and in `REFERENCES.md`.
4. **Space agency partner resources**: the two CSA articles above, and the CSA Bio-Monitor page as context for the suit sensors (section 22.6).
5. **Non-NASA data**: the PhysioNet 2019 sepsis challenge data, used only to train and test the Earth hospital model (section 26.19), credited separately and kept out of the repository (decision D21).

How DONKI data is fetched:

- `ml/fetch_donki.py` (Python standard library only) downloads FLR, CME and SEP records year by year into `ml/data/raw/donki/<TYPE>/<YEAR>.json.gz`, plus `ml/data/raw/donki/meta.json` with the base address used, every query, the retrieval time and the record counts. If a year is refused, it retries month by month. It waits briefly between requests. Run it once in M2, commit the files, and never fetch at app runtime (decision D8).
- The address: `https://ccmc.gsfc.nasa.gov/DONKI-API/get/`, without a key. NASA CCMC's official announcement documents this replacement endpoint and the announced migration of 30 September 2026: https://ccmc.gsfc.nasa.gov/news/major-updates/ (`ccmc-major-updates`). The announcement was supplied through external review on 15 November 2026. Claude Code could not retrieve the page itself: its connections to the CCMC host were refused or timed out. A third-party note (`donki-address-note`) also said that the older `https://kauai.ccmc.gsfc.nasa.gov/DONKI/WS/get/` and `https://api.nasa.gov/DONKI/` addresses answer with redirects; that claim is not confirmed. The script tries, in order, the `DONKI-API` address, the `kauai` web service, then `api.nasa.gov` with the personal key from `NASA_API_KEY` or else `DEMO_KEY` (heavily rate limited), and records which address worked (redirects: see the change below). On 14 November 2026 the `DONKI-API` address answered without a key and served the whole download.
- DONKI describes its content as experimental research information, and points to NOAA's Space Weather Prediction Center for official U.S. forecasts. The model card says so.
- Credit DONKI and NASA's Community Coordinated Modeling Center (CCMC) as the source in `REFERENCES.md`, the model card and the README.
- If no address works within 20 minutes in M2, hand-enter two or three real events from the DONKI website into `public/data/space-weather.json` so the scenarios still work, say so in `REFERENCES.md`, and tell the team at once: milestone A1 needs this data (decision point in section 32.3).

Changed on 14 November 2026, after a run with a personal key failed with only "HTTPError" in its log:

- Redirects are reported, no longer followed: a redirect would carry the key to another address, and `meta.json` must name the address that really answered. An address counts as working only when its answer to the probe (SEP, May 2024) is a JSON list of SEP records; an HTML page, other JSON or a redirect does not count.
- Every failure is reported with its HTTP status and, when the API sends one, its own error code and message, filtered so that the key, request addresses with their query and raw bodies never appear. Safe response headers (rate limit, Retry-After, cache) are shown in the diagnosis.
- A request is retried at most twice, after 5 and 20 seconds, for no answer, HTTP 408 or 5xx, and for HTTP 429 only when Retry-After is 120 seconds or less; otherwise a rate limit stops the run. HTTP 401 and 403 stop the run at once. A year that fails for a reason a smaller window may fix (no answer, an unusable answer, HTTP 400, 408, 413, 414 or 5xx) is fetched month by month; a month that still fails fails the year, and the remaining months are not requested.
- A year is written only when all of its requests returned a valid answer: a JSON list of records of that type, or an empty body. `meta.json` records each file's queries with status, answer kind and attempts, lists missing files, keeps `complete: false` until every file of the requested range is on disk, and gives a type without any file a count of `null`, never zero. Files already written are kept and skipped on the next run.
- `py ml/fetch_donki.py --diagnose` sends a few small requests (from the probe to the full year that failed) and prints what came back, writing nothing. `py ml/fetch_donki.py --verify` checks the files against `meta.json` without the network: counts, first and last dates, missing downloads, months without records, and anything that looks like a key.

---

## 26. Machine learning: three models

Three models, each with one job and limited by its evidence (decision D19). Training and evaluation code lives in `ml/` and runs offline; inference runs on board in the browser as plain TypeScript in `src/engine/models/` (decision D18).

| Model | Learns from | Job in the app | May do | Priority | Built in | Sections |
|---|---|---|---|---|---|---|
| Solar particle event risk (`sep-risk`) | Real NASA DONKI flares, CMEs and particle events; tested on held-out years | Radiation outlook after a flare | Raise the watch alert `R-RAD-03` | P0 | A1, A2 | 26.1 to 26.16 |
| Personal pattern (`personal-pattern`) | Each crew member's own in-flight readings, learned on board; evaluated on simulated data only | Notices when today's combination of readings is unusual for that person | Show an insight; the crew may send it to the ground | P1 | A3 | 26.17, 26.18 |
| Earth hospital (`earth-hospital`) | Real Earth ICU patients (PhysioNet 2019 challenge, two hospital systems), using only changes from each patient's own baseline; never tested on astronauts | Second opinion on whether recent changes resemble an Earth early-warning pattern | Show an insight; the crew may send it to the ground | Deferred until after the hackathon (14 November 2026) | A4, deferred | 26.17, 26.19 |

The rules of section 12 stay in charge: they alone set Good, Watch and Act, and only they and `R-RAD-03` feed triage. Sections 26.1 to 26.16 describe model 1 in full. Sections 26.13 (reproduce) and 26.15 (honesty) cover all three models; limitations are per model: section 26.14 for model 1, and sections 26.18 and 26.19 for the others.

**Model 1: solar particle event risk (`sep-risk`).** Priority P0, built in milestones A1 (data, training, evaluation, export) and A2 (in the app). Inference lives in `src/engine/models/sepRisk.ts`.

### 26.1 What the model does, and why this one

- **Task.** For a solar flare, together with its linked coronal mass ejection (CME) if there is one, estimate the probability that DONKI analysts linked it to a solar energetic particle (SEP) event observed by an instrument (decision D22). The crew does not see a chance: the app shows the output as an experimental model score from 0 to 100, with its limits (section 26.10; changed on 15 November 2026 after the A1 results).
- **Why it matters.** A solar particle event is a radiation storm, and space radiation is one of NASA's five hazards of human spaceflight (`hrp-hazards`). The app already alerts when an event is in progress (`R-RAD-01`, act) and on cumulative dose (`R-RAD-02`). An estimate before the event gives the crew time to prepare, which answers the brief's question "What actions can be taken to prevent a critical health condition?". Far from Earth a warning from the ground arrives late: the one-way delay to Mars reaches about 22 minutes (`delay-nasa-m2m-2023`), and Mars missions need crew medical autonomy (`autonomy-nasa-exmc-2021`). An estimate computed on board supports that autonomy, which is the same idea as triage by communication delay.
- **Why this data.** DONKI holds real flares, CMEs and SEP events with analyst-curated links between them, which gives a real supervised label. Published work has trained machine-learning classifiers on DONKI's flare, CME and SEP associations (`sep-ml-inceoglu-2018`), and SEP studies use flare magnitude, location and rise time and CME speed and width as predictors, comparing logistic regression with tree models (`sep-gsep-2023`). Our model follows that line at hackathon scale.

### 26.2 Data considered and not used for training

| Data | Why it is not a training set here | What we do instead |
|---|---|---|
| Astronaut clinical and research archives (LSAH, LSDA) | Protected human data: the archive's role includes protecting participants' privacy and consent decisions (`lsda-privacy-ntrs-2024`), and access goes through formal data requests | None. HRP evidence enters through the sources in section 17 |
| Inspiration4 data on NASA's Open Science Data Repository (OSDR) | Four civilian astronauts on a three-day flight, mostly omics (`osdr-i4-nasa`); raw data needs an application and board approval (`osdr-i4-access`) | Optional exploration after the hackathon (section 26.16) |
| NASA Twins Study | One astronaut and one ground control (`osdr-i4-nasa`) | None |
| Our own simulated vitals | A model trained on our simulator only learns the simulator | Scenarios and tests only (section 24) |

NASA's Human Research Program describes the same constraint: with only four people on board a mission like Artemis II, astronaut health data is limited (`hrp-artemis2-data-challenge`). For vitals the app therefore uses a per-person statistical baseline (section 10), and machine learning goes where real outcome data exists.

### 26.3 What is fetched

`ml/fetch_donki.py` (section 25) downloads three record types for every year from 2010 to the last full month before the fetch, and the dataset report states the first and last dates actually returned.

| Type | Fields used |
|---|---|
| FLR (solar flare) | `flrID`, `beginTime`, `peakTime`, `endTime`, `classType`, `sourceLocation`, `activeRegionNum`, `catalog`, `link`, `linkedEvents` |
| CME | `activityID`, `startTime`, `cmeAnalyses[].isMostAccurate`, `cmeAnalyses[].speed`, `cmeAnalyses[].halfAngle`, `catalog`, `linkedEvents` |
| SEP (solar energetic particle event) | `sepID`, `eventTime`, `instruments`, `catalog`, `linkedEvents` |

Keep every catalog the API returns by default and record the `catalog` field. DONKI notes that entries in its primary catalog from June 2020 onward were analyzed by the Moon to Mars Space Weather Analysis Office (`donki`); the dataset report gives counts per catalog and per year so the change is visible.

As downloaded on 14 November 2026 (found in A1): SEP records carry no `catalog` field, so the report can give catalogs only for flares and CMEs; and every SEP record lists exactly one instrument name, so no record is mixed in the sense of section 26.4.

### 26.4 Building the dataset (`ml/build_dataset.py`)

The raw files in `ml/data/raw/donki/` are only read: nothing in them is changed, filtered or rewritten. Every choice below happens in the processed files (decision D22).

1. Load the raw files. Keep one record per ID (the API returns the latest version). Drop exact duplicates.
2. Inventory the SEP instrument names: every distinct `instruments[].displayName`, with its record count by year. Each name takes its class from the table `ml/sep_instrument_classes.json`, which records the supporting sources of every entry:
   - `model`: the name is a forecast or other model output. A `MODEL:` prefix is enough. A real instrument used as the input of a forecasting model does not make the forecast an observed SEP, so such a name stays `model`.
   - `observed`: official instrument documentation shows that the name is an instrument that measures particles, and the DONKI record context fits a measurement. The table records both.
   - `unknown`: every other name, including a name without that support and a name missing from the table.

   A name is never `observed` just because it lacks the `MODEL:` prefix. Claude Code classifies the names during A1 from these sources and continues with the supported classes. It asks Divyanshu only about a material unresolved decision, such as an unsupported name that many labels depend on.
3. Classify every SEP record by its instrument names:
   - **Observed-only:** every name is `observed`.
   - **Mixed:** at least one `observed` name, together with `model` or `unknown` names.
   - **Model-only:** every name is `model`.
   - **Unknown:** no instrument is listed, or no name is `observed` and at least one is `unknown`.

   Observed-only and mixed records count as instrument-observed, because each holds established instrument-observed evidence. The `model` and `unknown` names of a mixed record are kept with the record and reported, never dropped.
4. Build one undirected link graph from the `linkedEvents` lists of all three types, because a link may be listed on either side.
5. Filter flares, counting every drop by reason: class must parse as a letter (A, B, C, M or X) and a number, and only class M1.0 and above is kept; `peakTime` and `beginTime` must be present, and the peak must not be before the begin; `sourceLocation` must parse (for example `S14W59`). The flares that remain are eligible. An end time before the peak cannot be right, so it counts as a missing end time (added in A1: the download holds a few such records).
6. Linked CME: among the CMEs linked to the flare, take each CME's analyses marked `isMostAccurate` (the first analysis if none is marked), and keep the analysis with the highest speed. An analysis without a speed or a half-angle cannot be used; of equal speeds the first in CME ID order is kept. A flare with no usable linked CME analysis gets `has_cme = 0`.
7. Label each eligible flare through the permitted associations only: a direct link to an SEP record, or a link through one CME (flare to CME to SEP). Paths through other flares or through interplanetary shocks do not count.
   - **Positive (`1`):** an association reaches at least one instrument-observed SEP record. Associations with model-only or unknown records as well do not change this.
   - **Excluded as ambiguous:** associations reach SEP records, but none of them is instrument-observed (only model-only or unknown records). The flare is neither positive nor negative. It is left out of training, validation and test, and it is counted.
   - **Negative (`0`):** no permitted association reaches any SEP record. A negative means "no qualifying recorded SEP association", never "no SEP occurred".
8. Write two files:
   - `ml/data/processed/flares.csv`: one row per eligible flare, with DONKI IDs, link, raw fields, `riseMin`, `durationMin`, features, label status (`positive`, `negative` or `ambiguous`), label, the associated SEP IDs with their record classes and the `model` and `unknown` names of mixed records, and split.
   - `ml/data/processed/dataset_summary.json`: counts by year, split and catalog; the instrument inventory with each name's class and supporting sources; SEP record classes by year of `eventTime` and by split; the `model` and `unknown` names found in mixed records, with their counts; positives, negatives and ambiguous exclusions by year and split; drop reasons; first and last dates.

### 26.5 Features

Defined once in `ml/features.py` and mirrored exactly in `src/engine/models/sepRisk.ts`; the parity test (section 26.12) proves they match.

| Feature | Computation | Raw input | Display group |
|---|---|---|---|
| `log10_peak_flux` | log10(base × number), with base A = 1e-8, B = 1e-7, C = 1e-6, M = 1e-5, X = 1e-4 (W/m², GOES X-ray class) | `classType`, for example `X2.2` | Flare class |
| `lon_sin` | sin(longitude in radians), west positive | `sourceLocation`, for example `S17W33` | Source location |
| `lon_cos` | cos(longitude in radians) | `sourceLocation` | Source location |
| `log1p_rise_min` | ln(1 + minutes from begin to peak) | `beginTime`, `peakTime` | Rise time |
| `log1p_duration_min` | ln(1 + minutes from begin to end); a missing end time uses the training median of this feature, stored in the model file as `impute` | `beginTime`, `endTime` | Duration |
| `has_cme` | 1 if the flare has a linked CME analysis, else 0 | links | CME |
| `log1p_cme_speed` | ln(1 + speed in km/s) of the chosen analysis; 0 without one | `cmeAnalyses` | CME |
| `cme_half_angle_deg` | half-angle in degrees of the chosen analysis; 0 without one | `cmeAnalyses` | CME |

Why sine and cosine of the longitude: together they let the model learn which longitude goes with more particle events, without anyone choosing a cut-off by hand. Nothing known only after the particle event (such as its own links or intensity) is used as a feature.

### 26.6 Splits

Chronological, by flare peak year (UTC): train from the first year to 2020; validation 2021 and 2022; test from 2023 to the last fetched month. No shuffling across years. If a split ends up with fewer than 10 positives, move the boundary by one year, keep the order train, validation, test, and record the change and the reason in the model card. The moves, as built in A1: a short training split moves the train/validation boundary one year later; a short validation split moves the validation/test boundary one year later; a short test split moves it one year earlier; every split keeps at least one year, and the rule stops and says so when no move helps. The rule looks only at the counts of positives, never at a score. The test set is used once, after every choice is fixed. Flares excluded as ambiguous (section 26.4) are not used for training or scoring in any split, but their counts are still reported per year and split.

### 26.7 Models and training (`ml/train_sep_risk.py`)

| Model | Role | Details |
|---|---|---|
| Climatology | Reference for the Brier skill score | The training base rate as a constant forecast |
| Class only | Baseline | Logistic regression on `log10_peak_flux` alone, same procedure as the shipped model |
| Logistic regression, all features | **Shipped as v1** | `StandardScaler` then `LogisticRegression` (L2, `lbfgs`, `max_iter` 1000, no class weights so the probabilities stay interpretable). `C` chosen from 0.01, 0.1, 1 and 10 by validation ROC AUC, ties to the smaller `C`. Trained on the training split only |
| Gradient boosting | Benchmark only, not shipped | `HistGradientBoostingClassifier` with default settings and `random_state` 42 |

Decision threshold: the probability that gives the highest TSS on the validation set, with ties going to the higher threshold. Rule `R-RAD-03` uses exactly this value, and a test checks that the two match. Each baseline and the benchmark get their own threshold by the same rule, so the comparison is fair.

Every random element uses seed 42, so two runs give identical files.

### 26.8 Evaluation

On validation and test (definitions in section 35). Only positive and negative flares are scored; ambiguous flares are reported, never scored.

- ROC AUC and average precision (PR AUC).
- Brier score, and Brier skill score against climatology.
- At the threshold: confusion matrix, TSS, HSS, precision, recall (probability of detection), false alarm ratio.
- 95% bootstrap intervals for test ROC AUC and test TSS: 1,000 resamples of the test set with seed 42, percentile method, skipping resamples that hold only one class.
- Reliability: five equal-width probability bins with count, mean predicted probability and observed frequency.
- Plots in `ml/reports/`: test ROC curve, reliability diagram, coefficient chart.
- Comparison of the shipped model with the class-only baseline and the gradient boosting benchmark on the same test set.

Added in A1, so that the uncertainty of the comparison is visible and a shift in the base rate cannot flatter the model:

- The same bootstrap resamples also give 95% intervals for each comparison model, and for the difference "shipped model minus comparison model" in ROC AUC and in TSS. The model card says in words whether each difference interval lies above zero, below zero or includes zero.
- A second Brier skill score against a constant forecast of the split's own share of positives. Nobody could know that share in advance, so it is the harder reference; it is reported next to the planned one.
- How many test flares the shipped model flags at its threshold.

Report the results whichever way they go. If the shipped model does not beat the class-only baseline on the test set, the model card and the pitch say so plainly; the app can still show the model, because its value is in being transparent and on board, not in a claimed score.

### 26.9 Export and model card

`ml/train_sep_risk.py` writes three things and copies the model file into the app. Nobody edits them by hand.

1. `ml/artifacts/sep-risk-v1.json`, copied to `src/data/models/sep-risk-v1.json`. Every number is written by the script; the shape:

```json
{
  "schemaVersion": 1,
  "modelId": "sep-risk",
  "version": "v1",
  "kind": "logistic-regression",
  "createdAt": "<written by the script>",
  "label": "1: flare linked in DONKI, directly or through one linked CME, to a solar energetic particle record observed by an instrument. 0: no qualifying recorded SEP association. Flares whose only SEP evidence is model output or of unknown origin are excluded as ambiguous.",
  "data": {
    "source": "NASA CCMC DONKI",
    "sourceId": "donki",
    "apiBase": "<address that worked>",
    "retrievedAt": "<from meta.json>",
    "firstFlare": "<date>",
    "lastFlare": "<date>",
    "filters": ["GOES class M1.0 or above", "begin and peak time present", "source location parseable"],
    "dropped": { "<reason>": 0 },
    "sepRecordClasses": { "observedOnly": 0, "mixed": 0, "modelOnly": 0, "unknown": 0 },
    "splits": {
      "train": { "years": "<first>-2020", "n": 0, "positives": 0, "excludedAmbiguous": 0 },
      "validation": { "years": "2021-2022", "n": 0, "positives": 0, "excludedAmbiguous": 0 },
      "test": { "years": "2023-<last>", "n": 0, "positives": 0, "excludedAmbiguous": 0 }
    }
  },
  "features": [
    { "name": "log10_peak_flux", "group": "Flare class", "mean": 0, "scale": 1, "coef": 0, "impute": null }
  ],
  "intercept": 0,
  "hyperparameters": { "C": 0, "penalty": "l2", "classWeight": null },
  "threshold": 0,
  "thresholdRule": "Highest TSS on the validation set; ties go to the higher threshold",
  "metrics": {
    "validation": { "rocAuc": 0, "prAuc": 0, "brier": 0, "brierSkill": 0, "tss": 0, "hss": 0, "precision": 0, "recall": 0, "falseAlarmRatio": 0, "confusion": { "tp": 0, "fp": 0, "tn": 0, "fn": 0 } },
    "test": { "rocAuc": 0, "rocAucCi95": [0, 0], "prAuc": 0, "brier": 0, "brierSkill": 0, "tss": 0, "tssCi95": [0, 0], "hss": 0, "precision": 0, "recall": 0, "falseAlarmRatio": 0, "confusion": { "tp": 0, "fp": 0, "tn": 0, "fn": 0 } },
    "reliability": [{ "binFrom": 0, "binTo": 0.2, "n": 0, "meanPredicted": 0, "observed": 0 }]
  },
  "comparisons": {
    "classOnly": { "test": { "rocAuc": 0, "tss": 0, "brierSkill": 0 } },
    "gradientBoosting": { "test": { "rocAuc": 0, "tss": 0, "brierSkill": 0 } }
  },
  "limitations": ["<from section 26.14>"],
  "sourceIds": ["donki", "sep-ml-inceoglu-2018", "sep-gsep-2023"]
}
```

   As built in A1 the file holds more than the shape above, all written by the script:
   - `data.retrievedFrom`, and `hyperparameters.candidates` with the validation ROC AUC of every `C`.
   - In `metrics`: `brierSkillVsOwnBaseRate` next to each `brierSkill`, `testFlaggedAtThreshold`, and `bootstrap` (resamples drawn and used, seed, method).
   - In `comparisons`: `climatology` (the training base rate and its test Brier score), and for `classOnly` and `gradientBoosting` the threshold, the validation scores, the test intervals, `shippedMinusThis` with its intervals, and a `finding` sentence.
   - `training`: the seed and the library versions.
   - Limitations with numbers follow the seven of section 26.14: the count of validation positives, the share of positives per split, how many of the flares flagged on the test years were negative, and, when it is so, that the lowest estimates were too high on the test years.

2. `ml/artifacts/sep-risk-v1-parity.json`: up to 50 rows from the test split (all of them if fewer), sorted by DONKI ID, each with the raw inputs the app receives (`classType`, `sourceLocation`, `riseMin`, `durationMin`, `cme`), the expected feature values and the expected probability. The 50 are spread evenly over the split in ID order, and include a flare without a CME, one with a CME, and one without a usable end time when the split has one.
3. `ml/reports/sep-risk-v1.md`, the model card: purpose; data and retrieval; label and selection policy (decision D22: why only instrument-observed SEP records count, the instrument names with their classes and supporting sources, SEP record classes by year and split, the model and unknown parts of mixed records, and positives, negatives and ambiguous exclusions by year and split); filters and drop counts; features in plain words; splits with counts; training choices; metrics with intervals; comparisons; reliability table; threshold; limitations; references; how to reproduce. The plots sit next to it.

A retrain that changes any coefficient becomes `v2` with new files; the app reads the version from the file. Zod validates the model file at load and in tests.

### 26.10 In the app

- **Inference.** `src/engine/models/sepRisk.ts` exports `flareFeatures(model, obs)`, `sepRiskProbability(model, obs)` and `topFactors(model, obs, n)`. Standardize with the stored mean and scale, compute `logit = intercept + Σ coef × z`, then `p = 1 / (1 + e^(−logit))`. A factor's contribution is `coef × z`, summed per display group; factors are sorted by absolute contribution. Pure functions, no I/O; the model parameters arrive through `EvaluationInput.models.sepRisk`.
- **Context feed `sep_risk`.** The highest model output among the flares in `EvaluationInput.spaceWeather` whose peak lies in the last `windowDays × 24` hours up to `nowMs` (`highestSepRisk`). A flare the app cannot read (class, location or a negative time) is skipped, never scored. This feed uses a time window, unlike the daily context feeds. No flare in the window, or no model, means no value, and the condition is false.
- **Rule `R-RAD-03`** (section 12): watch, region `whole_body`, `sep_risk` at or above the model threshold within 1 day, protocol `P-RAD-PREPARE`. `R-RAD-01` supersedes it, so an event in progress replaces the outlook.
- **Presentation: an experimental score, not a chance (decided by Divyanshu on 15 November 2026).** On the test years the model's output was not calibrated (the lowest outputs were too high) and most flagged flares were false alarms (section 26.14 and the model card). The app therefore never shows the output as a percent or as a chance. It shows an "Experimental model score": the output times 100, as a whole number kept between 1 and 99 (`sepRiskScore`). This is a display change only. The internal 0 to 1 output and the threshold are unchanged, and every comparison uses the unrounded output against the model file's threshold at full precision.
- **Evidence item.** Label "Experimental model score"; value such as "37 out of 100"; reference such as "Flare X1.6 at N11W74, peak on day 150 at 07:30. Alert level: at or above 18 out of 100. Model estimate from sep-risk v1." The item also carries `model` (`ModelEvidence`: model ID and version, the unrounded output and threshold, the factors, and the DONKI ID and link of the flare), which the screens use for the tag, the factors and the notes. The top three factors follow in words, for example "Flare class X1.6 raises the score", "No linked CME lowers the score". "Raises" and "lowers" are relative to an average flare of the training years, and the screen says so.
- **About this score.** Shown next to every score (`ModelScoreNote`), with numbers read from the model file: the score reflects how often flares like this one were linked to a recorded solar particle event in NASA's DONKI catalog; false alarms are frequent (how many of the flagged test-year flares had no such record); it is not a validated probability of an event, and it does not measure anyone's radiation exposure.
- **Historical and simulated.** A score is always for a real DONKI flare replayed on the mission timeline. The alert tags it "Historical flare" with its DONKI ID and link, and says that the crew and their health readings are simulated. Home shows "Historical solar event" for such a scenario, and the presenter tools mark those scenarios and show their `basedOn` note.
- **Alert detail.** "What changed" shows the score with the "Model estimate" tag, its factors, the historical flare and "About this score". "Evidence" adds the tag "Model estimate", says that the alert comes from the model and not from a measurement of the crew, and links "How this model was made" to the model card screen. A superseded outlook under "Also contributing" keeps its tag, one line on its limits and the link.
- **Model card screen `#/model/sep-risk`.** Reads the model file and shows, in plain words: what the score is and is not, and what the model may do in the app; the data (source, dates, counts per split, filters, flares excluded as ambiguous, the label policy); how it works (features in words with their coefficients, the threshold rule and value); how well it did on the held-out test years (flagged, caught and false-alarm counts, metrics with intervals, each with a one-line meaning); the two comparisons; a section "Why it is a score, not a percent chance" with the reliability table and both Brier skill scores; its limits; and the sources. A comparison whose 95% difference interval includes zero is called "inconclusive", with the sentence that this is not evidence that the two models perform equally; today that is the gradient boosting benchmark, for ROC AUC and for TSS. The wording follows the intervals in the file, so a retrain changes it without a code change. No number on this screen is typed by hand. It also states that DONKI is experimental research information and that official U.S. space weather forecasts come from NOAA's Space Weather Prediction Center (`donki`).
- **Wording.** "Experimental model score", "model estimate", "possible", "outlook". Never "chance", "probability of an event" or a percent for the score; never "will", never "predicts that"; never a score without the "Model estimate" tag and "About this score" nearby.

### 26.11 Types

Added to `src/engine/types.ts`, with matching Zod schemas:

```ts
export interface FlareObservation {
  donkiId: string;               // "2024-05-09T08:45:00-FLR-001"
  link: string;                  // the DONKI page of the flare
  day: MissionDay;
  peakMs: MissionMs;             // flare peak placed on the scenario's mission timeline
  classType: string;             // "X2.2"
  sourceLocation: string;        // "S17W33"
  riseMin: number;               // begin to peak, minutes
  durationMin: number | null;    // begin to end, minutes; null if DONKI has no end time
  cme: { speedKms: number; halfAngleDeg: number } | null;
}

export interface SepRiskFeature {
  name: string;
  group: string;
  mean: number;
  scale: number;
  coef: number;
  impute: number | null;
}

export interface SepRiskModel {
  modelId: "sep-risk";
  version: string;
  features: SepRiskFeature[];
  intercept: number;
  threshold: number;
  // the remaining fields of the file (data, metrics, comparisons, limitations, sourceIds)
  // are typed for the model card screen but not used by inference
}
```

`ContextFeedId` gains `"sep_risk"`, and `EvaluationInput` gains `spaceWeather` and `models` (section 7).

### 26.12 Tests

Python, `python -m unittest discover -s ml/tests`:

- Class parsing (`X2.2`, `M1`, `C9.9`, bad strings), location parsing (`S17W33`, `N05E80`, bad strings), minute differences.
- Instrument and record classes:
  - a `MODEL:` name is `model`, also when it contains an instrument's name;
  - a name missing from the table is `unknown`, never `observed`;
  - every `observed` entry of the table has a recorded source;
  - one record each for observed-only, mixed, model-only and unknown, including a record with no instruments;
  - a mixed record keeps and reports its `model` and `unknown` names.
- The label rule on a tiny hand-made link graph:
  - a direct link and a link through one CME to an observed record are positive;
  - an observed record plus an extra model-only record is still positive;
  - links only to model-only or unknown records are excluded as ambiguous and counted, never negative;
  - no qualifying link is negative;
  - paths through other flares or shocks do not count.
- The raw files stay untouched: building the dataset from fixture files leaves them byte-identical.
- The summary's SEP record classes and its positives, negatives and ambiguous exclusions by year and split add up to the totals.
- Split boundaries and the minimum-positives rule.
- Determinism: two training runs give identical coefficients and threshold.

TypeScript, Vitest:

- Parity: for every row of the parity file (all 50), each feature matches within 1e-12 and the output within 1e-9. The test years hold no flare without a usable end time, so the parity file cannot cover that path; a separate test checks that such a flare takes exactly the model file's `impute` value, as `ml/features.py` does.
- The model file in the app is byte-identical to `ml/artifacts/sep-risk-v1.json`, and its threshold and parameters are read at full precision.
- `R-RAD-03` uses the `modelThreshold` comparison (no number in `rules.json`), and evaluation applies the model file's `threshold`: a flare scored just below it gives no alert, one at or above it gives the alert.
- `topFactors`: sorted by absolute contribution; the intercept plus all contributions equals the logit.
- The `sep_risk` window: a flare 23 hours before `nowMs` counts, one 25 hours before does not, one after `nowMs` does not.
- No model, or no flares: no `R-RAD-03` and no error.
- Golden scenarios: `solar-flare-watch` gives exactly `R-RAD-03`; `solar-storm` gives `R-RAD-01`, with `R-RAD-03` superseded.
- The model file parses with its Zod schema, which refuses features in another order, a missing feature, a duration feature without a value for a missing end time, and a threshold of 0 or 1.
- A rule on the model feed is refused unless it is watch-level, needs no ground and uses `modelThreshold`; with and without the model, every other alert, status and route is identical.
- Screens: the score is "out of 100" with its tag and limits and never a percent; the route stays "You can handle this yourself" at every delay; the model card's numbers follow the model file, and a comparison is "inconclusive" exactly when its interval includes zero.

### 26.13 Reproduce

```
python ml/fetch_donki.py --start 2010-01-01            # once, in M2; standard library only
python -m venv .venv
.venv\Scripts\Activate.ps1                             # Windows PowerShell; macOS and Linux: source .venv/bin/activate
pip install numpy pandas scikit-learn matplotlib       # first time only, then freeze the versions:
pip freeze > ml/requirements.txt                       # keep only these four and their dependencies
python ml/build_dataset.py
python ml/train_sep_risk.py --seed 42
python ml/eval_personal_pattern.py --seed 42           # model 2 (A3)
python ml/fetch_physionet_sepsis.py                    # model 3 data (A4); kept out of git
python ml/build_hospital_dataset.py
python ml/train_earth_hospital.py --seed 42
python -m unittest discover -s ml/tests
```

On a fresh machine, `pip install -r ml/requirements.txt` replaces the install line. `.venv/` is in `.gitignore`. `ml/README.md` repeats these steps with the expected outputs.

### 26.14 Limitations (copied into the model card)

- DONKI links are analysts' judgments, and catalog practice changed over time (the M2M office from June 2020, `donki`); labels carry that noise.
- DONKI keeps SEP records per instrument and energy channel, and some records are model output (instrument names starting `MODEL:`). A positive label means "linked to at least one SEP record observed by an instrument", not a particular intensity or energy. A negative label means "no qualifying recorded SEP association", not that no particle event occurred.
- Flares whose only SEP evidence is model output or of unknown origin are excluded as ambiguous, with their counts by year and split. The model was neither trained nor tested on them.
- DONKI attributes some particle events to CMEs from the far side of the Sun with no visible flare (`donki`). A flare-based model cannot see those.
- CME analyses can come hours after the flare, so the full estimate is not available in the first minutes.
- Positive labels rest on particle events recorded by instruments that DONKI lists and that official instrument documentation supports as measurements (section 26.4). Names without that support count as unknown. How well the estimate carries over to a crew elsewhere in the solar system is not tested.
- Positive cases are few, so the intervals are wide. This is a prototype estimate for a hackathon, not an operational forecast.

### 26.15 Honesty rules

- Every number about the model, in the app, the README, the slides or the pitch, comes from the model file or the model card. Copy it; never retype or round it differently in different places.
- Say what the model is: a logistic regression on eight features from NASA DONKI flare and CME records, evaluated on held-out years. Do not call it "AI that predicts radiation" without that context. Say what its score is: an experimental score about recorded DONKI associations, with frequent false alarms; not a validated probability and not a measure of anyone's radiation exposure. Call the gradient boosting comparison inconclusive, never "as good as".
- The model never raises an act-level alert and never changes a route by itself (decision D9).
- If the API or the training fails and no model file exists, the app runs without `R-RAD-03`, and the submission says the model was not completed. Nobody invents a model file.
- The same holds for the second-opinion models. Say what each one is: a personal pattern check on each crew member's own readings, evaluated only on simulated data; and a logistic regression on five baseline-change features from Earth ICU patients, tested on a second hospital system and never on astronauts. Never call them "AI that detects illness". If either is not completed, the app runs without its insight and the submission says so.

### 26.16 Future work (not in this hackathon)

- Per-person (N-of-1) Bayesian baselines for vitals, the kind of method NASA's Artemis II data methodology challenge looked for, given four-person crews (`hrp-artemis2-data-challenge`).
- Exploratory analysis of Inspiration4 clinical data on OSDR (`osdr-i4-nasa`).
- Proton flux time series and solar magnetic field parameters as extra predictors, as in published SEP models (`sep-gsep-2023`).

### 26.17 Second opinions: how the three models fit together

Evidence ladder (decision D19):

| Signal | Evidence behind it | What it may do |
|---|---|---|
| Rules (section 12) | Sourced thresholds with a basis tag | Raise watch or act alerts; feed triage; set region status |
| `sep-risk` | Real outcomes (DONKI links), tested on held-out years | Raise the watch alert `R-RAD-03` only |
| `personal-pattern` | Simulated evaluation only | Show an insight |
| `earth-hospital` | Real Earth ICU outcomes, tested on a second hospital system; never tested on astronauts | Show an insight |

- **Insights.** An insight is a derived note that a second-opinion model found something notable for one crew member today. It never sets a region status, never creates or hides an alert, never changes a route, and never queues a message by itself. A test proves it: `evaluate()` with the two second-opinion models loaded and with them set to null gives identical alerts, statuses and routes.
- **Where insights show.** Home has a "Second opinions" card under the alert list: at most two insights, or a readiness line such as "Learning your pattern (9 of 14 days)", or "No unusual patterns today". Before today's check-in it says "Second opinions run after today's check-in". Region detail lists insights whose factors involve that region's indicators. Each model has a model card at `#/model/:modelId`.
- **Insight card.** Model name, the tag "Model estimate", the model version, a headline from the model file, the top three factors in words ("Sleep lower than your normal", "Resting heart rate higher than your normal"), one caveat line from the model file, a "How this model works" link, and a "Send to ground" button. Pressing it queues one consult labeled "Second opinion sent by crew", linked by `insightKey` (at most one per insight; the key includes the day); it is delivered after the one-way delay (simulated replies were cut on 14 November 2026).
- **Styling.** A neutral card with an icon and the word "Insight". Never status tokens, never on the body map. No percentage for the second-opinion models on the crew card; the model card shows the raw score with its meaning.
- **Wording.** "Unusual for you", "resembles", "consider", "second opinion". Never a diagnosis, never "you have", never "risk of" a named disease on the crew card.

Types, in `src/engine/types.ts`:

```ts
export type InsightModelId = "personal-pattern" | "earth-hospital";

export interface InsightFactor {
  indicator: IndicatorId;
  z: number;              // today's z-score against the person's baseline (section 10)
  contribution: number;   // this indicator's share of the model's score
}

export interface Insight {
  key: string;            // `${modelId}:${crewId}:${day}`
  modelId: InsightModelId;
  modelVersion: string;
  crewId: string;
  day: MissionDay;
  score: number;          // personal-pattern: today's distance ÷ the largest baseline-day distance; earth-hospital: model output
  factors: InsightFactor[];
}

export interface PatternReadiness {
  ready: boolean;
  daysAvailable: number;  // complete baseline days for today's indicators
  daysNeeded: number;     // minDays from the model file
}
```

`Evaluation` gains `insights` and `patternReadiness`, and `EvaluationInput.models` gains `personalPattern` and `earthHospital` (section 7). An insight exists only when it is notable.

As built in A3 (15 November 2026):

- `PatternReadiness` also carries `indicatorsToday` and `indicatorsNeeded`, so Home can say why there is no insight. `patternReadiness` is null while no personal pattern model is loaded. `EvaluationInput.models.earthHospital` is always null until A4.
- Before today's check-in (fewer than `minIndicatorsToday` of the model's readings today), readiness counts the baseline-window days on which at least that many of the model's readings were recorded. Home then says "Learning your pattern (n of 14 days)" if that count is short, and otherwise "Second opinions run after today's check-in", with how many of today's readings it has. After the check-in the count is the complete days for today's indicators, as in section 26.18.
- Factors: the largest positive contributions, at most three. A reading whose contribution is zero or negative is never named. The words are "<indicator label>: higher than your normal" or "lower than your normal", with today's value and the normal in brackets.
- Region view: until the region detail screen exists (M5), Home's region rows list the insight under each area of its factors. The area's status does not change.
- "Send to ground": the store action `sendInsightToGround` queues one `consult` per insight (section 15). Its body is marked "Private medical.", because mood is among the model's inputs and mood is private (section 28). It names the factors for the ground ("lower than usual for this crew member", with today's value and the usual value), the model version and the caveat, and says it is not an alert and sets no route. After sending, the button is replaced by "Second opinion sent by crew: queued for Earth at HH:MM mission time" with the "Simulated" tag; the store ignores a second request for the same insight. Nothing is queued unless the crew member presses the button.
- When a matrix cannot be factorized (only with constant, degenerate readings), the model gives no insight and no error.

### 26.18 Model 2: personal pattern (`personal-pattern`)

Priority P1, milestone A3. Code: `src/engine/models/personalPattern.ts` and `linalg.ts` in the app; `ml/personal_pattern.py` and `ml/eval_personal_pattern.py` offline.

- **Idea.** Rules look at one indicator at a time. This model looks at all daily readings together and asks whether today's combination is unusual for this person, given how their readings usually move together. It needs no external data: it learns on board from the crew member's own baseline window, the same window as the baseline engine (section 10).
- **Inputs.** The z-scores (section 10) of the daily indicators that have a reading today, among `systolic_bp`, `diastolic_bp`, `heart_rate`, `body_temp`, `blood_glucose`, `sleep_hours`, `mood` and `reaction_time`. At least four must be present today. `exercise_minutes` is left out because today's value is incomplete until the day ends.
- **Fit.** Take the baseline-window days on which all of today's indicators were recorded (last reading of each day). With fewer than `minDays` such days (14, a design value in the model file), the model is not ready. Otherwise estimate how the z-scores move together with Ledoit-Wolf shrinkage of the second-moment matrix about zero: scikit-learn's `LedoitWolf` with `assume_centered=True`, ported exactly to TypeScript. Shrinkage keeps the estimate stable with few days.
- **Score.** Today's squared Mahalanobis distance `d² = zᵀ S⁻¹ z`, solved with a Cholesky factorization.
- **Personal threshold.** For each baseline day, the leave-one-out distance: fit on the other baseline days, then score that day. Today is notable when `d²` is higher than every leave-one-out distance, which the card says as "More unusual than any day in your recent baseline". No fixed cut-off is invented; the person's own history is the threshold. `score = d² ÷ max(leave-one-out d²)`, so a score above 1 means notable.
- **Factors.** Each indicator's contribution `z_i × (S⁻¹ z)_i`; the contributions add up to `d²`, and one can be negative when readings that usually move together move apart. The three largest are shown with the direction of `z_i`: "higher than your normal" or "lower than your normal".
- **Evaluation, simulated and labeled so.** `ml/eval_personal_pattern.py` uses the simulator's physiology model (section 24.2) to create many fictional crew histories, injects shifts across several indicators at several sizes on chosen days, and reports per-day detection rate and false-notice rate for this model, for the rules alone (does the model catch combined small shifts that no single rule catches?), and for scikit-learn's `IsolationForest` as a benchmark. The script writes the results into `src/data/models/personal-pattern-v1.json` and the model card `ml/reports/personal-pattern-v1.md`. They show the method works as designed on our simulator; they do not show that it detects real illness, and the model card says so.
- **Parity.** `ml/artifacts/personal-pattern-v1-parity.json` holds fixed z-matrices and today-vectors with the expected shrunk matrix, distances, leave-one-out maximum and contributions; the TypeScript test matches them within 1e-9.
- **Model file.** `src/data/models/personal-pattern-v1.json`, written by `ml/eval_personal_pattern.py`: `modelId`, `version`, `kind` ("shrinkage-mahalanobis"), `indicators`, `minIndicatorsToday` (4) and `minDays` (14), both design values; `thresholdRule`; `headline` ("Unusual pattern for you"); `caveat` ("Learned from your own readings. Tested only on simulated data. A second opinion only."); the simulated evaluation results, comparisons and limitations.
- **Limitations, in the model card.** Evaluated only on simulated data; the simulator's independent noise makes correlations simpler than real physiology; a person whose readings are often unusual raises their own threshold; a slow drift over weeks becomes part of the baseline, by design (section 10); on stable readings a notice still appears by chance now and then, and the simulated evaluation measures how often; an insight can repeat what an alert already says.
- **Scenario.** `pattern-shift` (section 24.3): several readings drift a little at once, none enough for a rule. Expected alerts: none. Expected insight: `personal-pattern` for `c1`.

As built in A3 (15 November 2026):

- **Evaluation design** (constants at the top of `ml/eval_personal_pattern.py`). 300 fictional histories for each of the simulator's three crew profiles. Each history is checked on one day drawn from mission days 31 to 120, so its baseline window is full and the histories are independent. The clean day gives the false-notice rate. Shifted copies of the same history add a shift for the last three days (the days the baseline leaves out) on top of the same noise, so each shifted day has a clean twin. Three patterns: "combined" (sleep and mood lower, resting heart rate and reaction time higher), temperature and heart rate higher, and sleep only. Sizes 1, 1.5, 2, 2.5 and 3 times the simulator's day-to-day noise of each shifted reading. Every rate has a Wilson 95% interval.
- **Rules alone.** A Python copy of the rules engine for conditions on readings (`latest`, `streak`, `average`, `any`, `all`), reading `src/data/rules.json`. A test checks it against the expected alerts of every scenario file. Rules on habitat feeds, space weather or symptoms are not part of the simulation; the model file lists them.
- **IsolationForest.** scikit-learn's default settings, fitted on the same baseline z-scores. It flags today when today's score is lower than every baseline day's score. The baseline days are scored in-sample (no leave-one-out), to keep the run short. It is a benchmark, not tuned.
- **Results.** In `ml/reports/personal-pattern-v1.md` and on the app's model card screen, both read from the model file. They are not retyped here.
- **Parity file.** Six z-matrix cases: five from simulated histories (one cut to four indicators and exactly 14 days) and one built from numbers so that a contribution is negative. Four whole-history cases, from daily values to the factors: all eight readings today, six readings, three readings (before the check-in), and an early day that is not ready.
- **Reproducibility.** One run takes about a minute. `ml/tests` runs it once and checks that the committed model file (apart from `createdAt`), parity file and card are what it writes.

### 26.19 Model 3: Earth hospital (`earth-hospital`)

**Deferred on 14 November 2026; brought back on 15 November 2026 (Divyanshu's decision).** Built in A4, after M5 and M6. Until A4 is pushed, `EvaluationInput.models.earthHospital` stays null.

Originally priority P1, milestone A4. Code: `ml/fetch_physionet_sepsis.py`, `ml/build_hospital_dataset.py` and `ml/train_earth_hospital.py` offline; `src/engine/models/earthHospital.ts` on a shared `logistic.ts` in the app.

- **Data.** The public training data of the PhysioNet/Computing in Cardiology Challenge 2019 (`physionet-sepsis-2019`, `sepsis-ccm-2020`): hourly records of ICU patients from two hospital systems, training set A (20,336 patients) and training set B (20,000 patients), with 8 vital signs, 26 laboratory values and 6 demographic fields, and an hourly `SepsisLabel` based on the Sepsis-3 criteria: for a patient who develops sepsis it is 1 from 6 hours before onset, and otherwise 0. Open access; the AWS Open Data registry lists the license as Creative Commons Attribution 4.0. Confirm the license on the PhysioNet page, record it with the citation PhysioNet asks for in `ml/data/raw/physionet/meta.json`, and follow it. This is not NASA data and is credited separately (section 33).
- **Why Earth hospital data at all, given section 1.4?** Earth absolute ranges mislead in space, so the model never sees an absolute value. It sees only changes from each patient's own baseline, computed with the formula the app uses for a crew member's in-flight baseline (decision D20); only the window differs: the first 24 ICU hours there, about four weeks of days here. It learns "this combination of changes came before sepsis in ICU patients", not "this value is abnormal".
- **Fetch.** `ml/fetch_physionet_sepsis.py` (standard library) downloads training sets A and B from the official PhysioNet pages. The challenge pages link one ZIP file of the whole training set (about 42 MB); use it, and fall back to per-file downloads (one `.psv` file per patient) with a short delay, resumable, with a progress count. Raw files go to `ml/data/raw/physionet/` and are never committed (decision D21); `meta.json` (URL, version, license, citation, file counts per set, retrieval time) is committed. Time-box: 30 minutes, then the decision point in section 32.3.
- **Variables.** The five that match app indicators: `HR` to `heart_rate`, `Temp` to `body_temp`, `SBP` to `systolic_bp`, `DBP` to `diastolic_bp`, `Glucose` to `blood_glucose`. Check the units in the dataset's variable table against `indicators.json` before training (the table gives heart rate in beats per minute, temperature in °C, blood pressure in mm Hg, and serum glucose in mg/dL).
- **Baseline per patient.** The first 24 ICU hours (`ICULOS` 1 to 24): median and 1.4826 × MAD per variable, floored at the indicator's `minSpread` read from `src/data/indicators.json`, so training and app share one source. Exclusions, each counted: stay of 24 hours or less; a sepsis label of 1 within the first 24 hours; fewer than 3 baseline values for a vital sign or fewer than 2 for glucose.
- **Rows and features.** Every hour after the baseline window with all five variables available after carrying the last value forward (vital signs up to 4 hours, glucose up to 24 hours; documented processing choices). Features: the five z-scores `(value − baseline median) ÷ spread`. Label: the hourly sepsis label.
- **Splits.** Hospital A: 80% of patients for training, 20% for validation (patient-level, seed 42). Hospital B: external test, used once. The challenge paper concludes that generalizing to other hospital systems remains a challenge (`sepsis-ccm-2020`); the hospital B test measures exactly that.
- **Models.** Shipped: logistic regression on the five z-scores (standardized, L2, `C` from 0.01, 0.1, 1 and 10 by validation ROC AUC, no class weights). Baseline: the temperature z-score alone. Benchmark: `HistGradientBoostingClassifier`.
- **Operating point.** The score at which 1% of hospital A validation hours without the label would be flagged (`targetFalsePositiveRate` 0.01, a design value in the model file). A second opinion must stay quiet on ordinary days. On data this imbalanced, the threshold with the highest TSS lies near the base rate and would flag many ordinary days. The model card reports sensitivity at the operating point, and the highest-TSS point for comparison.
- **Evaluation.** As in section 26.8, at the operating point, on validation and on hospital B, with 95% bootstrap intervals that resample patients rather than hours, because hours from one patient are not independent.
- **Export.** `src/data/models/earth-hospital-v1.json` in the shape of section 26.9 (features with mean, scale and coefficient; intercept; threshold and `targetFalsePositiveRate`; counts per split and exclusion; metrics; comparisons; `headline`; `caveat`; limitations; `sourceIds`), the parity file, and the model card `ml/reports/earth-hospital-v1.md`, all written by the script. Raw and row-level processed data stay out of git; `ml/data/processed/hospital_dataset_summary.json` is committed.
- **In the app.** Needs ready baselines and today's readings for all five indicators. The probability comes from the shared logistic helper; an insight appears at or above the threshold. The crew card shows no percentage, because the output is calibrated for Earth ICU patients, not for an astronaut. It shows the headline ("Your recent changes resemble an early-warning pattern from Earth hospital data"), the top factors and the caveat ("Learned from Earth hospital patients. Never tested on astronauts. A second opinion only."). The model card shows today's raw score, explains the label (sepsis onset in ICU patients, Sepsis-3 criteria) and shows the hospital B results.
- **Sanity check in simulation, not validation.** `fever` (temperature and resting heart rate rising together) is expected to give the insight. If it does not, report the score and the threshold to Divyanshu and write the result in the model card; never change the scenario, the operating point or the model to force it. The golden tests then hold what the model gives in every scenario (`expectedInsights`, section 24.1), so a retrained model that behaves differently is noticed.
- **Limitations, in the model card.** ICU patients are already ill; the data is hourly and the app's is daily; ICU glucose is not a fasting value; spaceflight physiology differs; never tested on astronauts; generalizing across hospitals is already limited on Earth; five shared variables are a small part of what clinicians use.

---

## 27. Testing strategy

Tests exist to prove validity, not to chase coverage.

| Layer | What | Tool |
|---|---|---|
| Stats | median, MAD, mean on small fixed arrays | Vitest |
| Baseline | Window edges, exclusion of recent days, not-ready case, spread floor | Vitest |
| Conditions | One test per condition type and per comparison kind, including not-ready baselines | Vitest |
| Triage | Every cell of the table in section 13.5 with its four delay columns kept distinct (station 0 s, Moon 1.3 s, Mars near 180 s, Mars far 1320 s), link-down cases | Vitest |
| Data integrity | All JSON in `src/data` parses with its Zod schema; cross-references resolve (section 11.6) | Vitest |
| Golden scenarios | For each scenario file in `public/seed`, `evaluate()` at 09:00 on its mission day yields exactly its `expectedAlerts` | Vitest |
| UI smoke | Home renders with the default scenario; check-in accepts one reading; alert detail shows a route banner | React Testing Library |
| Model parity | TypeScript features and probabilities equal Python's on every parity row (section 26.12) | Vitest |
| Model rule | `R-RAD-03` takes its threshold from the model file through `modelThreshold`; the `sep_risk` window; no model means no alert and no error | Vitest |
| ML pipeline | Parsing, label rule, splits, determinism (section 26.12) | Python unittest |
| Body view logic | Report building and validation, entry labels, pin visibility by model version, crew separation, sensor readouts (current, stale, contact lost, no data) | Vitest |
| Pin anchoring | A pin's world position follows the model root when it rotates; a local point round-trips through world space (three.js math, no WebGL) | Vitest |
| Placeholder and contract | The placeholder has every contract node; `checkNodeNames` accepts, degrades and rejects correctly; `readGlbJson` reads a small GLB built in the test | Vitest |
| Delivered models | Every manifest entry with `status: "delivered"` has a file that parses, has the required nodes and is at most 4 MB; `tools/check_body_model.py` passes | Vitest, Python tool |
| Separation (invariance) | With fixed health inputs, mission time and link: adding soreness reports, anchoring or restarting the suit replay, switching placeholder and delivered models, and switching 2D and 3D leave the `Evaluation` and the outbox deep-equal | Vitest |
| Body smoke | The Body screen renders with WebGL unavailable (`canUseWebGL` mocked); a soreness report can be saved by keyboard only | React Testing Library |
| Copy | No data file contains the banned whole words or phrases "you have", "diagnosis", "diagnose", "injury", "strain" | Vitest |
| Tools | Simulator helpers; `check_body_model.py` on a tiny GLB built in the test | Python unittest |
| Personal pattern | Parity with Python; contributions add up to the distance; readiness; fewer than four indicators gives no insight | Vitest |
| Earth hospital (A4) | Parity with Python; needs five ready baselines; no percentage on the crew card | Vitest |
| Second-opinion invariance | `evaluate()` with the second-opinion models loaded and set to null gives identical alerts, statuses and routes | Vitest |
| Golden insights | Each scenario gives exactly its `expectedInsights` for the loaded models | Vitest |
| Hospital pipeline (A4) | Baseline window, floors read from `indicators.json`, carried-forward limits, exclusions, patient-level split, determinism | Python unittest |

The golden scenario tests double as evidence for judges: every claim "the app detects X" is backed by a test that runs.

As built in A3: `src/engine/__tests__/personalPattern.test.ts` (linear algebra, score, factors, readiness, the four-reading minimum, the glucose re-check, degenerate readings), `src/data/__tests__/personalPatternModel.test.ts` (model file and parity), `src/data/__tests__/secondOpinionInvariance.test.ts` (every scenario and crew member, with and without an unusual check-in, at three delays, with and without `sep-risk`), the golden insights in `goldenScenarios.test.ts`, `src/features/home/__tests__/SecondOpinions.test.tsx` (Home card, sending, region rows, model card), and in Python `ml/tests/test_personal_pattern.py` and `ml/tests/test_eval_personal_pattern.py`.

Where tests live (M1): engine logic tests use inline fixtures in `src/engine/__tests__/`. Tests that need the real data files (data integrity, the six P0 rules, the section 13.5 table) live in `src/data/__tests__/`, because engine code, its tests included, may not import `src/data`. Engine and body view tests may import Vitest; otherwise the same import boundary applies to them.

`npm run check` runs typecheck, lint and the Vitest tests. It must pass before every push to `main`. The Python tests run with `python -m unittest discover -s ml/tests` and `python -m unittest discover -s tools/tests` whenever `ml/` or `tools/` change.

Manual checks at every milestone close (Divyanshu): the steps listed in the milestone (section 31), plus a keyboard-only pass of what changed, a look at 390 px width, and, for body view milestones, a pass with "Force 2D" on.

---

## 28. Safety, privacy, offline, performance

- **Safety wording.** The app supports self-assessment. It never states a diagnosis and never gives medication instructions.
- **Privacy.** No real health data. No network requests. No analytics. Mood and behavioral items are marked private in the outbox.
- **Fictional crew.** Names are generic. Never use real astronauts' names or photos.
- **Offline.** After first load everything works with no network. A service worker for full offline install is a stretch item; do not let it risk the demo.
- **Performance.** Evaluation over about 2,000 readings must finish in a few milliseconds. Memoize selectors on the slices they read.
- **Failure behavior.** Bad storage resets to seed. A rule that throws is skipped and logged to the console, and a data-integrity test should have caught it first.
- **Model estimates.** Only the `sep-risk` model can raise an alert, and only the watch-level `R-RAD-03`, always tagged "Model estimate", with its model card one tap away (section 26.15). If a model file is missing or invalid, the app runs without that model: without `R-RAD-03` for `sep-risk`, without the insight for the other two.
- **Body view wording.** "Crew-reported soreness", "Simulated skin temperature", "local surface reading". Never "strain", "injury", "inflammation" or "fever" for a soreness entry or a sensor value.
- **Fictional bodies.** The body profiles are invented. No real person's measurements, photos or scans are used, and the models are not likenesses of anyone.
- **3D performance.** three.js loads only when the 3D view is turned on. Render on demand. Each `.glb` is at most 4 MB and 60,000 triangles.
- **Store writes.** Persist with `partialize` (no derived data, no replay samples) and write `nowMs` at most four times a second.
- **Second opinions.** Insights never set a status, create an alert, change a route or send a message by themselves (decision D19). The Earth hospital card shows no percentage and names no diagnosis; its model card explains the label.
- **Hospital data.** PhysioNet files stay out of git (decision D21). Follow the dataset's license and cite it as PhysioNet asks.

---

## 29. Deployment

- `npm run build` produces `dist/`. Any static host works because routing is hash-based.
- If hosting under a sub-path (for example GitHub Pages project sites), set `base` in `vite.config.ts` and load seed files with paths relative to `import.meta.env.BASE_URL`.
- Deploy early on day one and keep the public URL working from then on. The submission needs a public link with no login.
- Keep a second deployment or a recorded screen capture as a fallback for the demo.
- Vercel is connected to the GitHub repository and deploys every push to `main`, which is why `main` is pushed only after the milestone checks pass (section 30.2). Check the deployed site after every push.
- Model files are served from `public/models/` with the site and loaded with paths relative to `import.meta.env.BASE_URL`; they are fetched only when the 3D view opens.
- `ml/`, `tools/` and `docs/` are not part of the build; only `src/` and `public/` reach `dist/`.

---

## 30. Team and workflow

### 30.1 Who does what

| Person | Works with | Owns |
|---|---|---|
| Divyanshu | Claude Code, in this repository | Everything in this repository except the body model files: engine, data, simulator, machine-learning pipeline, UI, 3D viewer and placeholder body, tests, deployment, documentation and submission. Integrates the body models in B3. |
| Chirag | Blender, with his own Claude | The two body models and `docs/model-notes.md`, following section 23 and `docs/body-model-handoff.md`. |
| Other team members, if any | | Checking sources and setting `verified`, health adviser review of thresholds and protocols, slides or video, demo rehearsal. |

Claude Code never edits, repairs, converts or re-exports a file in `public/models/` (section 23.1), and never edits the trained model file by hand (section 26.9).

### 30.2 The milestone loop

Claude Code builds one milestone at a time, in the order of section 31, and repeats the same loop. All work happens directly on `main`; there are no other branches.

1. **Start.** Read the milestone's "Read first" sections and `docs/PROGRESS.md`. Run `git status` (it should be clean) and `git pull` so the local `main` matches GitHub.
2. **Plan.** Post a short numbered plan: files to create or change, tests to add. Then start. Stop and ask only if the plan conflicts with this document or `CLAUDE.md`, or needs a package that is not listed.
3. **Build.** Small steps, with small local commits on `main` if useful. After each step run the related tests (`npm run test -- <pattern>`, or the Python tests). Keep `npm run typecheck` clean as you go.
4. **Close.** Run `npm run check` and `npm run build`, plus the Python tests of any tool or `ml/` script that changed. Start `npm run dev` and give Divyanshu the manual checks of the milestone: the URL, what to click, and what he should see. Update `ARCHITECTURE.md` if a design decision changed, and `REFERENCES.md`, `AI_USAGE.md` and `docs/PROGRESS.md`.
5. **Confirm.** Wait for Divyanshu to report the manual checks. Fix what he finds and repeat the close step.
6. **Push.** Commit on `main` with the milestone message and run `git push origin main`. Vercel deploys every push, so check that the deployed site updated and still works. This push at the end of every milestone is standing permission; any other push needs Divyanshu to ask.
7. **Stop.** Report in a few lines and wait before starting the next milestone, unless Divyanshu said to continue.

If a milestone cannot pass its exit test, say so plainly, do not push, and propose the smallest fix or a cut (section 32). Unpushed local commits may be amended; pushed history is never rewritten.

### 30.3 Git conventions

- Repository: https://github.com/DivyanshuKirpal/nasa_hackathon. Remote `origin`, branch `main` only. No feature branches.
- `main` on GitHub must always build and demo, because every push deploys. Push only after the close step passes and Divyanshu confirms.
- Commit messages are imperative and start with the milestone: "M1: Add baseline engine with median and MAD", "A1: Train and export SEP risk model v1", "B2: Add pin anchoring in model coordinates". Fixes use "Fix: ...".
- Tags: `p0-complete` after A2 is pushed; `submission` after M8.
- Never force-push, never rewrite pushed history, never commit secrets, `.env` files or `.venv/`.
- Never edit `public/seed/`, `public/data/space-weather.json` or `src/data/models/` by hand; regenerate them with their scripts.

### 30.4 Progress log

`docs/PROGRESS.md` is how a new Claude Code session, or a teammate, sees where things stand. At every milestone close, add an entry at the top:

```
## A1 ML model 1: dataset, training and model card (done Sun 01:20)
- Built: DONKI dataset (flares.csv), logistic regression v1, model card, parity file
- Tests: Python 14 passed; npm run check green
- Results: see ml/reports/sep-risk-v1.md (numbers are not retyped here)
- Manual check: confirmed by Divyanshu
- Pushed: commit <short hash>; deployed URL checked
- Known issues: none
- Next: A2
```

### 30.5 Chirag's track

Chirag's work runs in parallel and joins the build in B3. Agree on these targets with him:

| Step | What | Target |
|---|---|---|
| C1 | Both bodies shaped to the profiles in section 23.8, in the same pose; a rough first export of one body sent early to test the format | Saturday night |
| C2 | The shoulder patch and the three sensor empties in both bodies; patch placement checked against the atlas | Sunday morning |
| C3 | Final export of both files, self-check done (section 23.9), `model-notes.md` written, files sent to Divyanshu | Sunday 14:00 at the latest |

When the first rough export arrives, bring the standalone checker forward (decided on 14 November 2026): `tools/check_body_model.py` from B2 step 8, Python standard library only, no app code, about 30 to 45 minutes. Claude Code flags the moment and asks Divyanshu before starting it, without starting the rest of B2. Divyanshu sends Chirag feedback within the hour. Integration waits for B3.

Decision of 14 November 2026 (option B): the 3D body (B2) and Chirag's models (B3) stay in the target scope, and the Earth hospital model (A4) is deferred instead. Changed on 15 November 2026 by Divyanshu: A4 is included in the hackathon submission and runs after M5 and M6 (order M5, M6, A4). The fallback stays: if the after-B1 checkpoint (section 32.3) shows too little time, Claude Code tells Divyanshu, and he decides whether to skip B2 and B3. The app then ships the 2D body view, and the README and slides credit Chirag's models as work in progress. `docs/body-model-handoff.md` tells Chirag this.

---

## 31. Milestones

Local schedule: work was planned to start about 11:00 on Saturday; M0 actually started at 17:13. Submission closes Sunday 23:59 India time; the plan is to submit by 21:00. Code freeze is Sunday 18:00: after it, only fixes for bugs found in rehearsal, documentation and submission assets. The targets assume work until about 01:30 on Saturday night and a restart at 08:00 on Sunday; the order matters more than the clock.

### 31.1 Overview

Recalculated on 14 November 2026 from the actual start (17:13, rounded to 17:15), with the plan's own durations. M6, B1 and M7 are shortened by the work the 14 November cuts removed; A4 is deferred. Changed on 15 November 2026 by Divyanshu: A4 is included in the hackathon submission and runs after M5 and M6 (order M5, M6, A4). The table keeps the plan's other rows unchanged.

| # | Milestone | Priority | Exit test | Plan hours | Target at plan pace |
|---|---|---|---|---|---|
| M0 | Scaffold and deploy | P0 | Public URL shows the shell; `npm run check` passes | 1.5 | Sat 18:45 |
| M1 | Engine core | P0 | Unit tests green; triage matches every row of section 13.5 | 3 | Sat 21:45 |
| M2 | Seed data and DONKI cache | P0 | Golden tests green for the three P0 scenarios; DONKI raw data committed | 1.5 | Sat 23:15 |
| M3 | Home and check-in | P0 | Enter a reading and see the status change | 3.5 | Sun 09:15 (2.25 h on Saturday, 1.25 h on Sunday) |
| M4 | Alerts, triage and environments | P0 | `solar-storm` starts at the station (5 min) and flips route when the slider reaches Mars far (1320 s, 49 min) | 2.5 | Sun 11:45 |
| A1 | ML model 1: dataset, training and model card | P0 | Model file, parity file and model card produced by one command; Python tests green | 2.5 | Sun 14:15 |
| A2 | ML model 1 in the app | P0 | Parity test green; `solar-flare-watch` shows `R-RAD-03` with its model estimate; model card screen reads the file | 1 | Sun 15:15 (P0 complete) |
| A3 | ML model 2: personal pattern | P1 | Parity green; `pattern-shift` shows the insight with no alert; second opinions cannot change alerts | 1.75 | Sun 17:00 |
| A4 | ML model 3: Earth hospital | P1 since 15 November 2026 (deferred on 14 November) | One command writes the model file, parity file and model card; parity green; `fever` shows the insight or the miss is recorded; no PhysioNet data in git | Not recalculated | After M6 |
| M5 | Trends and streak | P1 | Sleep chart shows the dip against the band; streak shows on Home | 1 | Sun 18:00 |
| M6 | Earth link, clock and demo panel | P1 | At 600×, a consult message is delivered after the one-way delay and shows its expected reply time | 1 | After the freeze at plan pace |
| B1 | Body view without 3D | P1 | Report saved by keyboard; forearm shows "No current reading"; invariance test green | 1 | After the freeze at plan pace |
| B2 | 3D viewer with the placeholder body | P1, target | Shoulder tap gives the named area, calf tap gives a free pin, pins stay on rotation, compare view and Force 2D work | 2 | After the freeze at plan pace |
| B3 | Chirag's body models | P1, target | Delivered files pass the checker and the B2 checks on the deployed site | 0.5 | After the freeze at plan pace; last start Sun 16:00 |
| M7 | Evidence, remaining rules and polish | P1 | Every alert shows sources and a basis tag; all golden tests green; keyboard pass done | 1.25 | After the freeze at plan pace |
| | Code freeze | | | | Sun 18:00 |
| M8 | Submission | P0 | Submitted with a working public link | 3 | Sun 21:00 |

What the recalculation shows: the remaining work up to the freeze is about 24 hours at the plan's durations, and the working hours before the freeze are about 18.25. At plan pace P0 is complete around Sunday 15:15, and the freeze falls after M5, so M6, B1, B2, B3 and M7 (about 5.75 hours) do not fit unless the pace beats the plan or the working hours grow. `docs/PROGRESS.md` records the actual finish of each milestone, and the projection is updated from it.

P0 is complete after A2. If ahead of schedule, continue in order. If more than an hour behind any target, use the decision points in section 32.3: Claude Code proposes, Divyanshu decides every cut.

### 31.2 M0 Scaffold and deploy

**Goal.** A real, empty app on a public URL, with every check wired up.
**Read first.** 3, 5, 6, 20, 29, 30.

Build:

1. Check the tools and report versions: Node, npm, git, Python (`python`, `python3` or `py`), and `gh` if present.
2. Check the repository. Divyanshu's project folder is `C:\Users\divya\Downloads\sem_5_project_work\hackathons\nasa`; teammates may use other paths. If the folder is not yet a git repository with `origin` set to https://github.com/DivyanshuKirpal/nasa_hackathon.git, show Divyanshu the exact commands first (`git init`, branch `main`, add `origin`, fetch, and bring in any commits GitHub already has without losing `CLAUDE.md`, `ARCHITECTURE.md` or `docs/`), and run them only after his go. If GitHub already holds files (for example a README), keep them.
3. Scaffold Vite's React and TypeScript template into the repository root, keeping `CLAUDE.md`, `ARCHITECTURE.md` and `docs/`. If the template refuses a non-empty folder, scaffold into a temporary folder and move the files in.
4. TypeScript strict, with `noUncheckedIndexedAccess`.
5. Install every npm package in section 5 now, including the ones used later (Recharts, three, `@types/three`) and the approved `@tailwindcss/vite` and `@testing-library/dom`, so versions are pinned at scaffold time.
6. Tailwind, following the current official Tailwind guide for Vite. Read the guide; do not write the setup from memory.
7. Tokens in `src/styles/`: the four status tokens (background, foreground and border each) and the 3D color variables from section 20. Check the amber text contrast on white against WCAG AA.
8. Hash router with placeholder pages for Home, Check-in and Earth link (the Library screen was cut on 14 November 2026).
9. Layout shell: header (crew member, mission day, environment, link status as placeholders) with the "Simulated data" tag; bottom navigation; footer with "Prototype for the NASA Space Apps Challenge. Not a medical device." and a "Presenter tools" link that does nothing yet.
10. ESLint from the template plus Prettier. Add the `no-restricted-imports` boundaries from section 6 now, while the folders are empty.
11. Vitest with jsdom and the Testing Library packages; one smoke test.
12. npm scripts: `dev`, `build`, `preview`, `typecheck`, `lint`, `test`, `test:watch`, `check` (typecheck, lint and test in order, stopping at the first failure), `format`. Cross-platform: no bash-only syntax.
13. The folders from section 6, with `.gitkeep` in source folders where useful. Not `public/models/` (Divyanshu creates it when the files arrive) and not the generated-output folders (`public/seed/`, `public/data/`, `src/data/models/`, `ml/data/`, `ml/artifacts/`, `ml/reports/`), which their scripts create. `.gitignore` covering `node_modules`, `dist`, coverage, `.env*`, `.venv/` and `ml/data/raw/physionet/`, and `.gitattributes` for LF line endings; both are created and checked before the first `git add`.
14. `README.md` stub (what it is, how to run, disclaimer), `AI_USAGE.md`, `REFERENCES.md` (sections: NASA; other space agencies; papers; data; libraries; tools and assets), `docs/PROGRESS.md`.
15. Commit and push `main`. M0 is the one milestone that pushes before the manual check, because the deployment needs the code on GitHub.
16. Deployment: give Divyanshu the Vercel steps (import the GitHub repository, framework preset Vite, build command `npm run build`, output folder `dist`). Confirm the public URL loads.

Tests: the shell renders the footer notice and the "Simulated data" tag.

Manual check (Divyanshu):

1. `npm run dev`, open the local URL: header, "Simulated data" tag, navigation, footer notice.
2. The same at 390 px wide (browser developer tools, device mode).
3. Tab through the page: every control shows a focus ring.
4. Open the public Vercel URL: the same shell.

Exit test: the public URL shows the shell; `npm run check` passes.
Docs: README stub; AI_USAGE (Claude in claude.ai for the planning documents; Claude Code for the code in this repository); REFERENCES (every installed library with its URL); PROGRESS.
Commit: "M0: Scaffold app with Tailwind, router, tests and deploy".

### 31.3 M1 Engine core

**Goal.** The health logic, proven by tests, with no UI.
**Read first.** 7, 8, 9, 10, 11, 12, 13, 14, 17, 18, 27.

Build:

1. `src/engine/types.ts` (section 7) and `schemas.ts`: Zod schemas for every health data file; derive types from schemas where practical. Include the space weather and model types from section 26.11 now so the shapes are fixed early, and the `modelThreshold` comparison kind (section 11.1) with its schema check (section 11.6); the `sep_risk` feed stays inactive until A2.
2. `stats.ts`: median, scaled MAD, mean.
3. `baseline.ts` (section 10), with the window constants in one place.
4. `conditions.ts`: every condition type and comparison kind (sections 11.1 and 11.2), each returning `{ met, evidence }`.
5. `rules.ts`: evaluation, one alert per rule per crew member, superseding (section 11.4).
6. `triage.ts`: exactly the function in section 13.3.
7. `status.ts`: region and overall roll-up and the overdue list (section 9).
8. `index.ts`: `evaluate(input)`.
9. Data files: `indicators.json` (all ten indicators, with `howToMeasure`, `whyInSpace` from section 8.3, and `sourceIds`), `regions.json`, `sources.json` (all of section 17, `verified: false`; before a rule that relies on a questionable entry is built, its primary source is checked and the passage shown to Divyanshu, section 17), `environments.json` (section 14, all five environments, with the station at 0 s and the Moon at 1.3 s), `rules.json` with the six P0 rules `R-SLEEP-01`, `R-TEMP-01`, `R-TEMP-02`, `R-GLU-02`, `R-CO2-01`, `R-RAD-01`, and `protocols.json` with their six protocols (drafts, `reviewed: false`, following section 18).

Tests:

- Stats on small fixed arrays.
- Baseline: window edges, recent days excluded, not ready below the minimum, spread floor, last reading of the day wins.
- Conditions: one test per condition type and comparison kind, including a baseline that is not ready.
- Rules: `R-TEMP-02` supersedes `R-TEMP-01`; one alert per rule per crew member.
- Triage: every cell of the table in section 13.5, building the rule objects inline in the test where a rule is not in `rules.json` yet, plus link-down cases (an `act` alert goes `act_on_board`; `replyEtaMin` is null). The reply estimates are checked per column: station 0 s gives 5 min, Mars near 180 s gives 11 min, Mars far 1320 s gives 49 min.
- Data integrity: every file parses; the cross-references in section 11.6 resolve.

Manual check: Claude Code prints the section 13.5 table as computed by the engine; Divyanshu compares it with the document.
Exit test: unit tests green; the printed triage table matches section 13.5 exactly.
Commit: "M1: Add health engine with baseline, rules, triage and status".

### 31.4 M2 Seed data and DONKI cache

**Goal.** Reproducible fictional scenarios that prove the engine end to end, and the NASA DONKI data on disk early, because A1 depends on it.
**Read first.** 24, 25, 8, 12, 27.

Build:

1. `tools/simulator/model.py`, `scenarios.py` and `generate.py` (sections 24.1 to 24.4), standard library only, seed 42, three fictional crew members.
2. Generate `baseline-healthy`, `sleep-debt` and `solar-storm`, plus `fever`, `low-glucose` and `early-mission` if they fit. Write `public/seed/index.json`.
3. A Zod schema for the scenario file format.
4. `ml/fetch_donki.py` (standard library only, section 25): fetch FLR, CME and SEP records from 2010 to now into `ml/data/raw/donki/`, with `meta.json`. Time-box the address search to 20 minutes, then use the fallback in section 25 and tell Divyanshu immediately.
5. `solar-storm` takes its timing from one real DONKI particle event; `basedOn` names it, and `public/data/space-weather.json` lists it. Its `environmentId` is `leo_station` (section 14).

DONKI status after M2: **retrieved and committed; M2 is complete** (closed 15 November 2026). A first attempt (14 November, 20:04 to 20:08) failed: every CCMC host (`ccmc`, `kauai`, `webtools`, `iswa`) refused or timed out from the team's network and from an outside fetch service, and `api.nasa.gov` refused the shared `DEMO_KEY` (HTTP 429). After the downloader was hardened (section 25, "Changed on 14 November 2026"), Divyanshu ran it over a personal mobile hotspot, where `https://ccmc.gsfc.nasa.gov/DONKI-API/get/` answered without a key (22:57 to 23:27 IST). Every one-year request got HTTP 400, and the month-by-month fallback then fetched every month from 2010-01 to 2026-10. `solar-storm` takes its timing from the SEP record `2023-08-08T01:00:00-SEP-001` (selection rule in `tools/simulator/scenarios.py`), which `public/data/space-weather.json` lists. Counts, coverage and limitations: `ml/data/raw/donki/meta.json`, `REFERENCES.md` and `docs/PROGRESS.md`. A1 is no longer blocked by data. Its label policy for model-only SEP records is decision D22 (section 26.4).

Tests:

- Golden: for each scenario file, `evaluate()` at 09:00 on its mission day gives exactly its `expectedAlerts`.
- Every scenario file parses with its schema.
- Determinism: generating twice with seed 42 gives identical files (Claude Code runs it and checks `git diff`).
- `python -m unittest discover -s tools/tests`: at least the record-parsing helpers of the generator.

Manual check: open one generated file and see `"simulated": true`, fictional names and the expected alerts; open `ml/data/raw/donki/meta.json` and see the address used, the years and the record counts.
Exit test: golden tests green for `baseline-healthy`, `sleep-debt` and `solar-storm`; the DONKI raw files and `meta.json` are committed.
Docs: REFERENCES (DONKI with its address and the retrieval date).
Commit: "M2: Add seed simulator, golden tests and DONKI raw data".

### 31.5 M3 Home and check-in

**Goal.** The daily flow in the browser: see status, enter readings, see the status change.
**Read first.** 9, 16, 19.1, 19.2, 20, 21.

Build:

1. Store (`src/store/index.ts`): the slices from section 21 except the body view ones; persist key `chc-state`, version 1, `migrate`, `partialize`; schema validation on load (bad storage loads the default scenario).
2. `src/clock/missionClock.ts`: `missionDay(nowMs)` and the only real-clock read. The ticker comes in M6; until then mission time stands still, which is fine.
3. `src/store/seed.ts`: fetch scenarios relative to `import.meta.env.BASE_URL`, validate, `loadScenario` (section 21). Default scenario `sleep-debt` on first load.
4. `selectors.ts`: build `EvaluationInput` from the health slices only; memoized `evaluate`.
5. Components: `StatusBadge` (color, icon and word), `Card`, `Tag`, `BodyMap2D` (an SVG figure; each region is a real button named like "Head: Watch"; Skin and Environment chips).
6. Home (section 19.1): body map, status list, Today card with overdue prompts and check-in progress, active alerts list (`act` first, linking to the alert route), empty state.
7. Check-in (section 19.2): fixed step order, validation with inline messages, "How to measure" and "Why it matters in space" with a source link, "Skip for now", yesterday's value as a hint, summary, Done. The reaction test step says "Reaction test: coming soon" until M7; near-vision is P2 and not shown.
8. The header shows the active crew member, mission day, environment label and link status from the store.

Tests (Testing Library):

- Home renders with `sleep-debt` and lists `R-SLEEP-01`.
- Check-in accepts a sleep value and rejects an out-of-range value with an inline message.
- In `baseline-healthy`, entering a temperature 2.5 °C above the baseline turns Abdomen to Act.

Manual check:

1. A fresh load shows `sleep-debt`: Head is Watch, with the sleep alert listed.
2. A full check-in by keyboard only; skip one step; the Today card still lists it as due.
3. Enter a high temperature; Abdomen turns Act on Home.
4. Reload the page: the entered readings are still there.
5. At 390 px the body map and the list are usable.

Exit test: enter a reading and see the status change on Home.
Commit: "M3: Add store, Home body map and daily check-in".

### 31.6 M4 Alerts, triage and environments

**Goal.** The centerpiece in the UI: every alert says who leads and why, and the route changes with distance.
**Read first.** 13, 14, 15, 17, 18, 19.4, 20, 21.

Build:

1. Alert detail `#/alert/:alertKey` in the fixed order: route banner, what changed, why it matters, what to do (checklist; ticks persist in `alertState`), evidence (source links, basis tag, "unverified" tag where `verified` is false), "Also contributing". A "Draft guidance" tag while `reviewed` is false. Actions: "Acknowledge"; "Send to ground" when the route is `self_care`.
2. Route banners with the reply estimate (section 13.4).
3. Environment selector in the header with all five environments, including `mars_rover`; the delay slider for the three Mars environments (180 to 1320 s); fixed delays for the station and the Moon. Actions `setEnvironment` and `setDelay`.
4. Outbox entries: an `act_on_board` alert queues one report and a `consult_ground` alert queues one consult, at most one message per alert key and kind however often the slider moves. The Earth link screen comes in M6; for now the alert shows "Queued for Earth".
5. A first demo panel with only the scenario picker (Shift+D and the footer link); the exit test needs it.
6. Sources on every alert (P0).

Tests:

- The alert detail shows a route banner and its sections in the fixed order.
- In `solar-storm`, a delay of 1320 s turns `R-RAD-01` from `consult_ground` to `act_on_board` (store and selector test).
- `solar-storm` loads at the station: `R-RAD-01` is `consult_ground` with a 5 min reply estimate. Mars near (180 s) gives 11 min and `consult_ground`; Mars far (1320 s) gives 49 min and `act_on_board`.
- Moving the slider many times leaves one outbox entry per alert key and kind.

Manual check:

1. Load `solar-storm` from the demo panel. Open the radiation alert: "Consult the ground. Reply expected in about 5 min.", with the first steps visible.
2. Switch to Mars transit: the slider starts at 180 s (Mars near) and the banner reads "Consult the ground. Reply expected in about 11 min." Move the slider to 1320 s (Mars far): the banner changes to "Act now on board. A reply from Earth would take about 49 min."; the steps stay at the top.
3. Switch to Mars rover: the same delay range and the same route logic.
4. Every alert shows sources and a basis tag.
5. Keyboard only: environment selector, slider, checklist ticks, acknowledge.

Exit test: `solar-storm` flips route when the slider moves to Mars at its farthest.
After the push, Divyanshu records a short screen capture of this flow as a demo fallback.
Docs: first draft of `docs/demo-script.md` (the decisive-moment step).
Commit: "M4: Add alert detail, triage route banner and environments".

### 31.7 A1 ML model 1: dataset, training and model card

**Goal.** A trained, evaluated and exported solar particle event risk model from real NASA DONKI data, with a model card, all produced by one reproducible run.
**Read first.** 26 (all of it), 25.

Build:

1. Python environment for `ml/` (section 26.13): `.venv`, the four packages, `ml/requirements.txt` pinned with the versions actually installed.
2. `ml/features.py`: parsing and features exactly as section 26.5.
3. `ml/sep_instrument_classes.json` (section 26.4, decision D22). Claude Code builds it during A1 from the inventory of SEP instrument names. It classifies each name from official instrument documentation and the DONKI record context, and records the supporting sources. Names without support stay `unknown`. Work continues with the supported classes; Claude Code asks Divyanshu only about a material unresolved decision.
4. `ml/build_dataset.py`: section 26.4, writing `flares.csv` and `dataset_summary.json`, with the SEP record classes and the ambiguous exclusions by year and split. The raw files stay unchanged.
5. `ml/train_sep_risk.py`: splits (26.6), models and threshold (26.7), evaluation with bootstrap intervals and plots (26.8), export of the model file, the parity file and the model card (26.9), and the copy to `src/data/models/sep-risk-v1.json`. Command-line option `--seed`, default 42.
6. `ml/tests/`: the Python tests in section 26.12.
7. `ml/README.md`: how to reproduce, with the expected outputs.

Tests: `python -m unittest discover -s ml/tests` green; a second training run gives an identical model file apart from `createdAt`.

Manual check (Divyanshu reads `ml/reports/sep-risk-v1.md`):

1. The dataset section: date range, counts per split, positives, drop reasons.
2. The label and selection policy section: the instrument names with their classes and supporting sources, the SEP record classes by year and split, the model and unknown parts of mixed records, and the positives, negatives and ambiguous exclusions by year and split.
3. The metrics on the test years, with intervals, and the comparison with the class-only baseline and gradient boosting.
4. The reliability table and the three plots open.
5. The limitations section is present.
6. The numbers in the app's model file and in the model card are the same (Claude Code shows a few side by side).

Exit test: the model file, the parity file and the model card are produced by one command; the Python tests are green; nothing in them was typed by hand.
Status after A1 (15 November 2026): built and pushed. The results, the label counts and the instrument classes are in `ml/reports/sep-risk-v1.md`; they are not repeated here. The manual check above is still open. The model is not in the app yet (A2).
Docs: REFERENCES (DONKI, scikit-learn, numpy, pandas, matplotlib, `sep-ml-inceoglu-2018`, `sep-gsep-2023`, and the instrument documentation behind the SEP instrument classes); AI_USAGE (the trained model is part of the project; Claude Code wrote the pipeline); PROGRESS (pointing to the model card, without retyping its numbers).
Commit: "A1: Build DONKI dataset and train SEP risk model v1".

### 31.8 A2 ML model 1 in the app

**Goal.** The model runs on board in the browser and gives an advisory, labeled radiation outlook that flows through the normal alert and triage path.
**Read first.** 26.10, 26.11, 26.12, 11, 12, 13.5, 18, 19.4, 19.11, 24.6.

Build:

1. Zod schema for the model file; `src/engine/models/sepRisk.ts` with `flareFeatures`, `sepRiskProbability` and `topFactors`.
2. Engine: `spaceWeather` and `models` in `EvaluationInput`; the `sep_risk` context feed with its 24-hour window; the evidence item with the top factors.
3. `R-RAD-03` in `rules.json` with a `modelThreshold` comparison that reads the threshold from the model file (no number typed in `rules.json`), protocol `P-RAD-PREPARE` (section 18), and `R-RAD-01` superseding `R-RAD-03`.
4. Scenarios (section 24.6): `solar-flare-watch` with a real flare from the test years, and the preceding flare in `solar-storm`; update `public/data/space-weather.json`.
5. The store loads `spaceWeather` with the scenario; the selector passes the model in.
6. Alert detail: the "Model estimate" tag, the experimental model score and its factors, "About this score", the "How this model was made" link.
7. The model card screen `#/model/sep-risk` (section 19.11), reading only the model file.
8. The demo panel shows the scenario's `basedOn` note (carried in `public/seed/index.json`), tagged "Historical solar event".

Tests: all TypeScript tests in section 26.12, including parity, the threshold reference, the window and the two golden scenarios.

Manual check:

1. Load `solar-flare-watch`: a watch alert "Solar flare outlook: possible particle event" with the "Model estimate" tag, an experimental model score out of 100 (never a percent), three factors in words and "About this score".
2. Open "How this model was made": the model card screen shows the same numbers as `ml/reports/sep-risk-v1.md`, calls the gradient boosting comparison inconclusive, and explains why the output is shown as a score.
3. Move the delay slider: the route stays "You can handle this yourself", because this is a watch alert without a ground need (section 13.5).
4. Load `solar-storm`: the act alert `R-RAD-01`, with the outlook listed under "Also contributing".
5. Keyboard only, and at 390 px.

Exit test: the parity test is green; `solar-flare-watch` shows `R-RAD-03` with its model estimate; the model card screen reads the file.
Status after A2 (15 November 2026): built and pushed. Changed from the plan above, by Divyanshu's decision of 15 November: the model output is shown as an experimental model score out of 100 with its limits, never as a percent chance (section 26.10). The frozen A1 model, its threshold and its parity file were not touched. The A1 model card `ml/reports/sep-risk-v1.md` still says "estimated chance" and "whole percent" in two sentences, because it is written by the training script and A2 did not re-run it; the app's model card screen is the current wording. (Corrected in A3 as a text-only change; see section 31.9.) The manual checks above were run by Claude Code in headless Chrome, not yet by a person.
After the push: tag `p0-complete`.
Docs: `docs/demo-script.md` gets the forecast step before the decisive moment.
Commit: "A2: Run SEP risk model in the app with the R-RAD-03 outlook".

### 31.9 A3 ML model 2: personal pattern

**Goal.** A second opinion that learns each crew member's own pattern across all daily readings and shows an insight when today's combination is unusual for them.
**Read first.** 26.17, 26.18, 10, 19.1, 19.3, 20, 24.

Build:

1. `src/engine/models/linalg.ts` (Cholesky factorization and solve) and `personalPattern.ts` as in section 26.18: z-vectors from the baseline engine, Ledoit-Wolf shrinkage (a port of scikit-learn's formula with `assume_centered=True`), squared distance, leave-one-out threshold, contributions, readiness.
2. The `Insight` and `PatternReadiness` types; `evaluate()` returns `insights` and `patternReadiness`. Insights never touch alerts, statuses or routes.
3. The Home "Second opinions" card and the insights on region detail (section 26.17); "Send to ground" queues one consult per insight per day (store action `sendInsightToGround`).
4. Generalize the model card screen to `#/model/:modelId`; `#/model/sep-risk` keeps working.
5. `ml/personal_pattern.py` (numpy and scikit-learn `LedoitWolf`) and `ml/eval_personal_pattern.py` (simulated evaluation, rules-only comparison, `IsolationForest` benchmark), writing `src/data/models/personal-pattern-v1.json`, `ml/artifacts/personal-pattern-v1-parity.json` and `ml/reports/personal-pattern-v1.md`.
6. Scenario `pattern-shift`, and `early-mission` if M2 did not build it. `expectedInsights` in the scenario schema and the golden tests, filled in for every scenario after Divyanshu has looked at each insight (section 24.1).

Tests:

- Parity: shrunk matrix entries, distances, leave-one-out maximum and contributions match Python within 1e-9.
- Contributions add up to the distance; readiness counts; fewer than four indicators today gives no insight.
- Second opinions cannot change alerts: `evaluate()` with the second-opinion models loaded and set to null gives identical alerts, region statuses, overall status and routes.
- Golden: `pattern-shift` gives no alert and exactly the `personal-pattern` insight for `c1`; every scenario lists its insights.
- The Home card shows the insight and the readiness line (Testing Library).
- `python -m unittest discover -s ml/tests` green.

Manual check (Divyanshu):

1. Load `pattern-shift`: no alerts; the "Second opinions" card shows "Unusual pattern for you" with three factors, the caveat and the "Model estimate" tag.
2. Open "How this model works": the simulated evaluation numbers match `ml/reports/personal-pattern-v1.md`, and the card says they come from simulated data.
3. Load `early-mission`: "Learning your pattern (n of 14 days)".
4. "Send to ground" queues one consult; pressing it again the same day adds nothing.
5. Keyboard only, and at 390 px.

Exit test: parity green; `pattern-shift` shows the insight with no alert; the second-opinion invariance test is green.
Status after A3 (15 November 2026): built; the exit test passes. Changed from the plan above: the insights are listed in Home's region rows, because the region detail screen is M5; `PatternReadiness` gained two counts (section 26.17). Also in this milestone, a text-only correction of the A1 model card: `ml/reports/sep-risk-v1.md` and the template in `ml/train_sep_risk.py` now call the output a model output that the app shows as an experimental model score, never a percent chance. Both were edited the same way and the script was not re-run, so the model, its threshold, the data, the parity file, the plots and every number are unchanged; the `ml` test that compares the committed card with the script's output passes. The reliability plot's axis label still reads "Mean estimated chance in the bin", because the plot is a frozen A1 file. The manual checks above were run by Claude Code in headless Chrome, not yet by a person, and Divyanshu has not yet looked at the scenario insights.
Docs: AI_USAGE (model 2); REFERENCES (scikit-learn `LedoitWolf` and `IsolationForest`); PROGRESS.
Commit: "A3: Add personal pattern model with on-board second opinions".

### 31.10 A4 ML model 3: Earth hospital

**Deferred on 14 November 2026 (option B); brought back on 15 November 2026 by Divyanshu's decision, to run after M6.** The PhysioNet download keeps its 30-minute time box (section 26.19).

**Goal.** A second opinion trained on real Earth ICU data that uses only changes from each person's own baseline, tested on a second hospital system.
**Read first.** 26.17, 26.19, 26.8, 26.13 to 26.15, 10, 28.

Build:

1. `ml/fetch_physionet_sepsis.py` (standard library; section 26.19). Add `ml/data/raw/physionet/` and the row-level processed files to `.gitignore`; commit `meta.json`. Time-box the download to 30 minutes.
2. `ml/build_hospital_dataset.py`: baselines, exclusions, carried-forward values, z-features and splits. Only `ml/data/processed/hospital_dataset_summary.json` is committed.
3. `ml/train_earth_hospital.py`: logistic regression, temperature-only baseline, gradient boosting benchmark, threshold on hospital A validation, hospital B external test with patient-level bootstrap; writes `src/data/models/earth-hospital-v1.json`, `ml/artifacts/earth-hospital-v1-parity.json` and `ml/reports/earth-hospital-v1.md`.
4. `src/engine/models/logistic.ts`, shared by `sepRisk.ts` and the new `earthHospital.ts`; model 1's parity test must stay green after this refactor. The `earth-hospital` insight with its headline, factors and caveat.
5. Scenario `fever` if M2 did not build it (section 24.3). Update `expectedInsights` for every scenario after Divyanshu has looked at each insight; `fever` is expected to give the `earth-hospital` insight (section 26.19).

Tests:

- Python: baseline window and floors read from `indicators.json`; carried-forward limits; each exclusion; patient-level split (no patient in two splits); determinism.
- TypeScript: parity within 1e-9; the insight needs all five baselines ready; no percentage reaches the crew card; the second-opinion invariance test is still green; golden insights.

Manual check (Divyanshu):

1. `ml/reports/earth-hospital-v1.md`: patient and row counts per split and exclusion; hospital B results with intervals; the comparison with temperature alone and with gradient boosting; limitations.
2. `git status`: no PhysioNet files staged; `meta.json` shows the license and the URL.
3. Load `fever`: the act alert from the rules, plus the "Earth hospital" insight with factors and the caveat; no diagnosis named on the card. If the insight is missing, follow section 26.19 (report it, never tune).
4. The model card shows today's raw score with its meaning and the hospital B results.

Exit test: the model file, parity file and model card are produced by one command; parity green; `fever` shows the insight, or the miss is recorded in the model card (section 26.19); no PhysioNet data in git.
Docs: REFERENCES (the PhysioNet dataset with the standard PhysioNet citation, the challenge paper, the license); AI_USAGE (model 3); README data credits; PROGRESS.
Commit: "A4: Train Earth hospital model on PhysioNet data and add its second opinion".

### 31.11 M5 Trends and streak

**Goal.** Show each reading against the person's own normal over time, and add the check-in streak from the challenge's gamification consideration.
**Read first.** 10, 19.1, 19.3, 20.

Build:

1. Region detail `#/region/:regionId`: status header; per indicator the latest value and "Your normal: ..." or "Learning your normal (n of 7)"; the region's alerts; "Why this matters in space" with sources.
2. `TrendChart` in components: 30 days, the baseline band `center ± 2 × spread` shaded, a one-line text summary under it.
3. A pure summary function in `src/lib/` ("Down 1.7 h from your normal over five nights").
4. Streak (section 19.1): consecutive mission days with a completed check-in, shown in the Today card with a short message at 3, 7 and 14 days. Derived from readings; nothing new is stored.

Tests: summary function cases (up, down, no baseline); streak counting (gaps, today not yet done); the region page renders for `head` in `sleep-debt`.
Manual check: the Head region in `sleep-debt`: the sleep line dips below the band and the summary line matches; the streak shows on Home; keyboard reaches every link; 390 px.
Exit test: the sleep chart shows the dip against the band; the streak shows on Home.
Status after M5 (15 November 2026): built; the exit test passes in headless Chrome, not yet checked by a person. Also fixed: source links are at least 44 px tall everywhere (the 390 px check found 24 px links on the new screen).
Commit: "M5: Add trend charts with baseline band and check-in streak".

### 31.12 M6 Earth link, clock and demo panel

**Goal.** Time moves, messages travel, and the presenter can drive the demo.
**Read first.** 15, 16, 19.5, 19.8, 21.

Build:

1. The ticker in `missionClock.ts`: speeds 0, 1, 60 and 600; it writes `nowMs` at most four times a second.
2. `src/link/earthLink.ts`: the pure state machine `advance(messages, nowMs, link)` with the transitions in section 15; link down keeps messages queued.
3. Cut on 14 November 2026: simulated ground replies. Consults stop at `delivered` and show their expected reply time (section 15).
4. Earth link screen: delay, link state, each message with progress between states and the expected reply time; private messages listed as "Private message".
5. Demo panel complete (section 16), without the body view items.

Tests: every transition (queued, in transit, delivered), including link down and link back up; a consult's expected reply time is sent + delay + handling + delay; the private message title.
Manual check: at 600×, send a consult at Mars far: it goes in transit, then delivered after the one-way delay, with its expected reply time shown; toggle the link down and up; "+1 day" moves the mission day.
Exit test: at 600×, a consult message is delivered after the one-way delay and shows its expected reply time.
Status after M6 (15 November 2026): built; the exit test passes in a store test and in headless Chrome (a consult sent at 09:00 at Mars far arrives at 09:22 and expects a reply around 09:49), not yet checked by a person.
Commit: "M6: Add Earth link outbox, mission clock and demo panel".

### 31.13 B1 Body view without 3D

**Goal.** Soreness reports and suit sensors that work by keyboard with no 3D, kept apart from the health logic.
**Read first.** 22 (all of it), 24.5, 21, 20, 17.

Build:

1. `src/bodyview/`: `types.ts`, `schemas.ts`, `pins.ts` (build and validate a report, entry label, crew filter, pin visibility rule), `sensors.ts` (readout rules in section 22.6).
2. Data: `body-models.json` (both entries `status: "placeholder"`, version `placeholder-1`, profiles from section 23.8), `body-areas.json`, `sensor-sites.json`; add `anthropometry-nasa-ntrs-2024`, `biomonitor-csa` and `deltoid-uw-atlas` to `sources.json` if not already there.
3. `tools/simulator/suit.py` and `generate.py --suit` (also run by `--all`): writes `public/seed/suit-replay.json` (section 24.5).
4. Store version 2 with `migrate`: the `soreness` and `suit` slices, `prefs.show3d` and `prefs.force2d`; actions `addSorenessReport`, `removeSorenessReport`, `restartSuitReplay`; `loadScenario` clears soreness and anchors the replay.
5. Body screen `#/body` and the "Body" navigation item: soreness form, report list, three sensor cards (sections 22.5 to 22.7), with the "Simulated skin temperature" and "Crew-reported soreness" tags. No 3D toggle yet.
6. Demo panel: "Restart suit replay".
7. The ESLint boundary for `src/bodyview` is active and passing.

Tests:

- Reports: validation (score an integer 0 to 10, location text required), entry label format, crew separation.
- Sensors: current value; stale after 15 minutes; contact lost shows no current value but keeps the last valid one; no data.
- `suit.py`: the same seed gives the same file; the forearm has no contact from offset −30.
- The separation (invariance) test in section 27.
- Keyboard only: save a report with Tab, arrow keys and Enter (Testing Library with user-event).

Manual check:

1. Keyboard only: save "Right outer shoulder · 4/10 · after overhead work".
2. Switch crew member: the other person's list is empty; switch back and the report returns.
3. The forearm card shows "No current reading" and "Last valid reading ... (35 min ago)".
4. The upper back card shows its current value with time and contact state (trend charts were cut on 14 November 2026).
5. Load another scenario: soreness cleared, sensors re-anchored.
6. Alerts and the outbox look the same before and after saving reports.
7. At 390 px.

Exit test: a report saved by keyboard; the forearm shows "No current reading" with the last valid time; the invariance test is green.
Docs: REFERENCES (the three sources).
Commit: "B1: Add body view with soreness reports and simulated suit sensors".

### 31.14 B2 3D viewer with the placeholder body

**Goal.** The 3D body, built and demonstrable before Chirag's files arrive.
**Read first.** 22.7 to 22.11, 23, 20, 27.

Build:

1. `src/features/body/viewer/`: `webgl.ts` (`canUseWebGL`), `createViewer.ts` (renderer, camera, controls, lights, render on demand, resize, dispose), `placeholderModel.ts` (section 22.9), `loadModel.ts` (placeholder or `GLTFLoader` with a 15-second timeout; gray material; patch and anchor lookup; contract result), `picking.ts` (tap or drag, raycast, local point and normal), `markers.ts` (pins and sensor markers as children of the model root; selection).
2. `src/bodyview/modelContract.ts`: `checkNodeNames(names)` with the outcomes accept, degrade (missing patch or anchor) and reject (missing `body`); `readGlbJson(buffer)`.
3. `Viewer3D.tsx`, loaded with `React.lazy`; the "Show 3D body" toggle; buttons Rotate left, Rotate right, Front, Back, Reset view; the canvas `aria-label`; the "Placeholder model" and "AI-assisted model" tags.
4. The tap flow: a tap opens the soreness form pre-filled (the named area on the patch; otherwise a free pin with focus in the description); "Remove pin" keeps the form without an anchor.
5. Sensor markers at the anchors; card and marker selection linked; "Turn to this sensor".
6. The compare view `#/body/compare` (section 22.7).
7. The fallbacks in section 22.10; the demo panel's "Force 2D" and the model line per crew member.
8. `tools/check_body_model.py` (standard library only; brought forward when Chirag's first rough export arrives, with Divyanshu's OK, section 30.5), implementing section 23.9 and reading expected values from `src/data/`; exit code 1 on any FAIL; output lines Divyanshu can forward to Chirag. A `unittest` in `tools/tests/` builds a tiny GLB in memory and checks a pass and a fail.
9. ESLint: `three` allowed only in `src/features/body/viewer/`.

Tests:

- Anchoring: rotate the model root; the pin's world position follows; the local point round-trips through world space.
- Pick result: a patch hit gives `shoulder_r_outer`; a body hit gives a free pin with `areaId` null.
- Pin visibility: same model and version drawn; another version not drawn, text kept.
- Placeholder: has `body`, the patch and the three anchors; height equals the profile; feet at y = 0; the right patch at negative x; the chest anchor in front of the back anchor.
- `checkNodeNames`: accept, degrade, reject. `readGlbJson`: reads a tiny GLB built in the test.
- The Body screen renders with `canUseWebGL` mocked to false and shows the fallback line.

Manual check:

1. On the Body screen, turn on "Show 3D body": the placeholder appears with its tags.
2. Rotate by dragging and with the buttons; the keyboard reaches every button.
3. Tap the right outer shoulder: the form shows "Right outer shoulder · deltoid area"; save 4/10 with "after overhead work"; the pin appears.
4. Tap the left calf: a free pin; type "Left calf"; save 2/10.
5. Rotate: both pins stay on the body. Select a list entry: its pin highlights.
6. Rotate to the back: the upper back sensor marker is visible; select its card; "Turn to this sensor" works.
7. Compare view: two bodies at the same height with visibly different shoulders and hips, and a profile table under each.
8. Demo panel "Force 2D": the 3D toggle disappears and the fallback line shows; the form and list still work.
9. At phone width the 3D view stacks above the form and stays usable.
10. `npm run build` shows three.js in its own chunk.

Exit test: shoulder tap gives the named area, calf tap gives a free pin, pins stay attached when rotating, the compare view and Force 2D work, on the deployed site.
Docs: REFERENCES (three.js, the glTF 2.0 specification); AI_USAGE (placeholder body built by Claude Code); `docs/body-model-handoff.md` if section 23 changed.
Commit: "B2: Add 3D body viewer with placeholder model, pins and sensors".

### 31.15 B3 Chirag's body models

**Goal.** Swap the placeholder for the delivered Blender bodies without code changes.
**When.** As soon as the files arrive and B2 is pushed; last start Sunday 16:00 (section 32.3). Repeat for every new delivery.
**Read first.** 23, 22.3, 22.10.

Build: the integration steps in section 23.10, in order. A file that fails the checker is not committed; Claude Code writes Chirag a short message with the failed check, the measured value, the expected value and the fix in Blender, and that crew member keeps the placeholder.

Tests: the delivered-models test in section 27 is green.

Manual check: the B2 manual list on the delivered bodies; pins saved on the placeholder show "Made on an earlier version of this body. Text kept." and are not drawn; the "AI-assisted model" tag shows if the notes say so; the compare view on the deployed site.
Exit test: the delivered files pass the checker and the B2 checks on the deployed site.
Docs: REFERENCES (Blender; any base mesh and its license; Chirag's credit); AI_USAGE (Chirag's use of Claude); README credits.
Commit: "B3: Add Chirag's Blender body models for crew A and B".

### 31.16 M7 Evidence, remaining rules and polish

**Goal.** Breadth and quality: every rule in section 12, the reaction test, and an accessibility pass.
**Read first.** 8.4, 12, 17, 18, 19.6, 19.7, 20, 24.3.

Build:

1. The remaining rules `R-COG-01`, `R-MOOD-01`, `R-VIS-01`, `R-BP-01`, `R-BP-02`, `R-HR-01`, `R-GLU-01`, `R-EXE-01`, `R-IMM-01`, `R-CO2-02` and `R-RAD-02`, with their protocols and superseding (section 12).
2. The remaining scenarios in section 24.3, with golden tests.
3. The reaction test `#/test/reaction` (section 8.4) as a check-in step; results saved with `origin: "in_app_test"`.
4. Cut on 14 November 2026: the standalone Library screen (section 19.6). Source links with verified tags stay on alerts and indicator explanations, and the model cards stay linked from alerts and insights.
5. Accessibility pass on every screen: keyboard only, focus rings, 44 px targets, 390 px, amber contrast, reduced motion, chart summaries, body map names.
6. The copy check over `src/data/*.json` (section 27).

Tests: golden tests for every scenario; reaction test logic (median of valid trials; a false start repeats the trial); the copy check; cross-references for the new rules.
Manual check: run `docs/demo-script.md` end to end on the deployed site; a keyboard-only pass; phone width.
Exit test: every alert shows sources and a basis tag; all golden tests green; keyboard pass done.
Commit: "M7: Add remaining rules, reaction test and accessibility fixes".

### 31.17 M8 Submission

**Goal.** A submitted project with a working public link by 21:00.
**Read first.** 29, 33, 34.

Build:

1. `README.md`: what it is; the live URL; how to run; how it works (one paragraph each for triage, the ML models that were built, including the Earth hospital model if A4 is complete, and the body view); what is simulated; "Prototype for the NASA Space Apps Challenge. Not a medical device."; team and roles; credits (Chirag for the body models; DONKI and CCMC for the space weather data); AI use summary; links to `REFERENCES.md`, `AI_USAGE.md` and the model cards in `ml/reports/`.
2. `REFERENCES.md` complete, NASA items first; `AI_USAGE.md` complete.
3. `docs/demo-script.md` final: the person (sleep change), a second opinion (`pattern-shift`), the radiation outlook (model estimate), the body (shoulder report, calf pin, sensors), the decisive moment (`solar-storm` flips to an onboard response at far-Mars delay), with timings and talking points.
4. Slides (at most seven, title included) or a video of 30 seconds or less, per the 2026 guide. Screenshots keep the "Simulated data" tag, the "Model estimate" tag on estimates and insights and, where it applies, the "AI-assisted model" tag. No NASA logos in AI-generated material. Model numbers are copied from the model card.
5. Final check on the deployed site in a private window: first load, default scenario, the full demo script, no console errors, 390 px.
6. Fallback: a second deployment or a screen recording of the demo.
7. Make sure the GitHub repository is public, or that judges can open it, since the submission links it.
8. Tag `submission`. Divyanshu fills in the submission form.

Exit test: submitted by 21:00 with a working public link and no login.
Commit: "M8: Add submission docs, demo script and final references".

---

## 32. Priorities and cut list

### 32.1 Priorities

- **P0, must ship**: daily check-in; 2D body map and accessible status list; personal baseline; at least six rules; alert detail with protocol; triage with environment and delay; sources on alerts; three scenarios; ML model 1 with its model card, running in the app as `R-RAD-03` (A1, A2); public deploy.
- **P1, should ship**: the personal pattern model (A3); trend charts and the check-in streak; the Earth link outbox; demo panel; reaction test; all v1 rules; the personal body view: soreness form and list with three simulated suit sensors (B1), the 3D viewer with free pins, the named shoulder patch and the compare view (B2), and Chirag's two models (B3).
- **Cut on 14 November 2026**: simulated ground replies; sensor trend charts; the standalone Library screen. The Earth hospital model (A4), deferred that day, was brought back on 15 November 2026 and runs after M6.
- **P2, stretch**: near-vision test; dark theme; link blackout windows; offline install; bone-loss projection graphic; soreness dots on the 2D figure (front and back); more named surface areas; NASA RadLab dose data for the radiation context, if the team agrees (section 34, item 22); the future ML work in section 26.16.

### 32.2 Cut order

Already cut on 14 November 2026, by Divyanshu's decision: P2 items, the near-vision check, simulated replies (the outbox list stays), sensor trend charts (value, contact and time stay on the cards), the standalone Library screen (source links on alerts and the model card screens stay), and the Earth hospital model (A4, deferred; option B kept the 3D body instead).

Next candidates, first to go first. Claude Code proposes; Divyanshu decides each one:

1. Compare view (keep the single body).
2. The 3D viewer and B3 (keep the B1 body view: form, list and sensor cards). This is the fallback in section 30.5.
3. Extra scenarios (keep the three P0 ones, `solar-flare-watch` and `pattern-shift`).
4. The personal pattern model (A3).
5. Only as a last resort, although it is P0: the in-app part of model 1 (A2), keeping the trained model, its model card and its tests from A1 for the submission.

Never cut: triage, sources on alerts, simulated-data labels, the "Not a medical device" notice, the 2D path, the honesty rules for the models (section 26.15) and the evidence ladder (section 26.17).

### 32.3 Decision points

Updated on 14 November 2026 for the actual start. In every row, Claude Code reports the situation and proposes; Divyanshu decides any cut.

| When | If | Then |
|---|---|---|
| M2, after the 20-minute DONKI time box | No DONKI address works | Use the hand-entered events for the scenarios (section 25); tell Divyanshu at once; carry on and run A1 and A2 as soon as the API answers. If there is still no data when A1 is due to start, propose dropping A1 and A2 and saying so in the submission |
| Sat 01:30, end of day 1 | More than an hour behind section 31.1 | Report the actual times and propose cuts from section 32.2 |
| Before A2 is pushed | Any P1 work tempts | Finish P0 before any P1 work |
| After A2 | The remaining P1 milestones need more time than is left before 18:00 | Propose the next cuts in the order of section 32.2 |
| When Chirag's first rough export arrives | | Propose bringing the standalone checker forward (section 30.5) |
| After B1 | Less than 3.5 hours left before 18:00 | Propose skipping B2 and B3 and going to M7: ship the 2D body view and credit the Blender models as work in progress in the README and slides (the fallback in section 30.5) |
| Sun 16:00 | Chirag's files are not integrated yet | Last start for B3; later files go in only if they pass the checker on the first run |
| Sun 17:00 | B2 is in and Chirag's files arrive late | Integrate only if both pass the checker on the first run and B3 takes under 30 minutes |
| Sun 18:00 | | Code freeze |

---

## 33. Submission mapping

Based on the Project Submission Guide available on November 11, 2026, which still showed the previous year's dates. Re-read the 2026 guide before submitting.

| Field | Where the content comes from |
|---|---|
| Project name | Team decision |
| High-level summary | Section 1.1 and 1.4, three sentences |
| Link to project demo | Slides (seven or fewer, title included) or a video (30 seconds or less), hosted publicly |
| Link to final project | Public deployed URL, with the repository linked from the README |
| Detailed description | Section 2 table turned into prose, plus how it works (section 4), the three ML models, the evidence ladder and their evaluations (section 26), the body view (section 22) and how validity is tested (section 27) |
| NASA data | `REFERENCES.md`, NASA section: DONKI (training and test data of the model, and the real events in scenarios) and the NASA research behind the rules |
| Space agency partner and other data | `REFERENCES.md`, other sections: the CSA articles from the Resources tab and the CSA Bio-Monitor page (the PhysioNet data, used by the Earth hospital model in A4, is credited there) |
| Use of artificial intelligence | `AI_USAGE.md`: the ML models in the product (with links to their model cards), Claude Code's work in this repository, Claude for the planning documents, and Chirag's use of Claude for the Blender models |

Other requirements noted in that guide: everything in English, AI-generated images and video carry a visible watermark, AI-generated code and data are acknowledged in text, no NASA logos in AI-generated material, and all external resources are listed. Screenshots or video that show a body model AI helped make keep the "AI-assisted model" tag visible, and any model number shown is copied from the model card.

---

## 34. Open questions and things to verify

1. Does the local event allow preparation before Saturday 09:00, and if so what kind? Ask the local lead before writing code early.
2. Done on 14 November 2026: the Resources tab items are in the registry (item 10).
3. Confirm the 2026 submission rules (demo length, required fields, AI disclosure).
4. Verify every figure in section 17 against its source and flip `verified`.
5. Find the primary paper for `sleep-barger-2014` and the journal for `immune-herpes-iss`.
6. Confirm the DONKI API address and fetch one real solar particle event range.
7. Health adviser review of section 12 thresholds, time-to-act values, and all protocols.
8. Decide the final project name.
9. Confirm the change to decision D9 with the whole team: a trained ML model now gives watch-level estimates (section 26).
10. Done on 14 November: the Resources tab is in `docs/challenge-resources.md`. It names no dataset.
11. Confirm the current DONKI API address and the CCMC acknowledgment wording (section 25).
12. Confirm with Chirag, before he exports, that the `.glb` format and the contract in section 23 replace the brief's OBJ plan.
13. Confirm the fictional profile values in section 23.8, or record the values Chirag used.
14. Who checks the shoulder patch placement against the atlas, and when? Record it in `body-models.json` (`patchChecks`) and `docs/model-notes.md`.
15. Did AI help make the body models (a script that generated or changed the geometry)? Record it in `AI_USAGE.md` and set `aiAssisted`.
16. Which base mesh did Chirag start from, and what is its license? Blender Studio's Human Base Meshes bundle is CC0 (`blender-base-meshes`); any other asset needs its own license check.
17. Update the concept brief PDF: it still names standalone MakeHuman and OBJ files, and does not mention the ML model.
18. Make the GitHub repository public before submission, or confirm that judges can open it.
19. Confirm the three-model plan and the evidence ladder (decision D19) with the whole team.
20. Record the PhysioNet license and its citation request before A4 (section 26.19). Back in scope with A4 on 15 November 2026.
21. Decided on 14 November 2026: option B. The 3D viewer (B2, B3) stays and the Earth hospital model (A4) is deferred. Chirag is told through `docs/body-model-handoff.md`. Changed on 15 November 2026 by Divyanshu: A4 is included in the hackathon submission and runs after M5 and M6 (order M5, M6, A4).
22. Decide whether to add NASA RadLab dose data (real ISS dosimetry) for the radiation context; it is P2 for now.
23. DONKI access: still open after M2 and a blocker for A1 (section 31.4). The CCMC servers did not answer from anywhere on 14 November, and `DEMO_KEY` was rate limited. Next step: Divyanshu gets a personal api.nasa.gov key, sets `NASA_API_KEY` privately in his terminal and runs `ml/fetch_donki.py`; or retry when the CCMC servers answer again.

---

## 35. Glossary

| Term | Meaning |
|---|---|
| Baseline | A crew member's own usual value for an indicator, computed from their recent in-flight readings |
| MAD | Median absolute deviation, a measure of spread that ignores outliers |
| Indicator | A health measurement the crew member records |
| Context feed | A habitat measurement such as cabin CO2 or radiation dose |
| Rule | A data-defined condition that raises an alert |
| Alert | An active rule for one crew member, with evidence, route and protocol |
| Protocol | The action card: steps to take, when to re-check, when to escalate |
| Route | Who leads the response: `self_care`, `consult_ground` or `act_on_board` |
| Time to act | How long the crew can safely wait before starting the response |
| Reply ETA | Expected minutes until a ground answer: round-trip signal time plus ground handling |
| Environment | Where the crew is: station, Moon base, Mars transit, Mars base |
| Scenario | A generated seed file that sets up a demo situation |
| Mission clock | Simulated time since mission start, which the demo can speed up |
| SANS | Spaceflight associated neuro-ocular syndrome, eye and vision changes from long missions |
| Solar particle event | A burst of high-energy particles from the Sun that raises radiation dose |
| CMO | Crew medical officer |
| OCHMO | NASA Office of the Chief Health and Medical Officer |
| HRP | NASA Human Research Program |
| DONKI | NASA's space weather event database |
| SEP event | Solar energetic particle event; the same thing as a solar particle event |
| CCMC | NASA's Community Coordinated Modeling Center, which runs DONKI |
| Flare class | The GOES X-ray class of a solar flare: a letter (A, B, C, M, X, each step ten times the flux of the one before) and a number, such as X2.2 |
| CME | Coronal mass ejection: a large cloud of solar material thrown into space |
| Model estimate | An output computed by a trained ML model, always shown with that label |
| Experimental model score | How the app shows the `sep-risk` output: a whole number from 1 to 99 "out of 100". Not a calibrated chance and not a measure of radiation exposure |
| Logistic regression | A model that turns a weighted sum of features into a probability between 0 and 1 |
| Feature | One number computed from the raw data and given to the model, such as the flare class as a logarithm |
| Label (ML) | The answer the model learns from: here, whether DONKI links the flare to a particle event observed by an instrument (decision D22) |
| Ambiguous flare (ML) | A flare whose DONKI links reach only model-generated or unknown SEP records. It is left out of training and testing, never counted as a negative, and its count is reported |
| Chronological split | Training on older years and testing on newer ones, so the test imitates the future |
| ROC AUC | How well the estimates rank positive cases above negative ones: 0.5 is chance, 1 is perfect |
| PR AUC | Average precision: how precise the estimates stay as more positive cases are found; useful when positives are rare |
| Brier score | The mean squared difference between estimated probabilities and what happened; lower is better |
| Brier skill score | Improvement of the Brier score over always forecasting the base rate; above 0 means better than that |
| TSS | True skill statistic: the share of events caught minus the share of non-events falsely flagged |
| HSS | Heidke skill score: correct forecasts beyond what chance agreement would give |
| False alarm ratio | The share of flagged cases that turned out to be non-events |
| Reliability | Whether cases given an estimate of, say, 30% turn out positive about 30% of the time |
| Threshold | The model output (0 to 1) at or above which `R-RAD-03` raises an alert; chosen on the validation years and read from the model file. The app also calls it the alert level |
| Parity test | A test that the app's TypeScript gives the same numbers as the Python that was evaluated |
| Model card | A plain-language page about a model: data, method, results, limits |
| Body view | The Body screen: soreness reports, suit sensor cards and the optional 3D body |
| Body observation | A soreness report or a suit sensor sample; never an input to the health engine |
| Soreness report | What the crew member says hurts: location, score 0 to 10, optional note |
| Pin | A soreness report's marker on the 3D body, stored in the model's own coordinates |
| Free pin | A pin outside any named area, described in the crew member's own words |
| Named area | A body surface area with a checked label and a source, such as the right outer shoulder (deltoid area) |
| Patch object | A named object in a model file marking a named area, such as `patch_shoulder_r_outer` |
| Sensor anchor | An empty in a model file marking where a suit sensor sits, such as `sensor_chest` |
| Suit replay | Pre-generated simulated suit sensor samples played back by the mission clock |
| Placeholder model | A simple body built in code to the model contract, used until the delivered models arrive |
| Model contract | The rules a delivered `.glb` must follow (section 23) |
| glTF and GLB | A standard 3D file format; GLB is its single-file binary form |
| WebGL | The browser feature that draws 3D graphics |
| Insight | A note from a second-opinion model; never an alert and never a status |
| Second opinion | The personal pattern and Earth hospital models, which can only show insights |
| Evidence ladder | The rule that what a signal may do depends on its evidence (decision D19) |
| Mahalanobis distance | A distance that accounts for how a person's readings usually move together |
| Shrinkage (Ledoit-Wolf) | A way to estimate how readings move together from few days, pulled toward a simple form for stability |
| Leave-one-out | Scoring each day with a model fitted on all the other days |
| External validation | Testing a model on data from a different source than it was trained on; here, a second hospital system |
| ICU | Intensive care unit |
| Sepsis | A life-threatening reaction to infection; the label of the Earth hospital training data |
| PhysioNet | A public repository of physiological and clinical research datasets |
| Carry forward | Using the last measured value until a newer one arrives, within a time limit |
