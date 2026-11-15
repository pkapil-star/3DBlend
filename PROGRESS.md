# Progress

One entry per milestone, newest first (ARCHITECTURE.md section 30.4). Targets are in section 31.1.

## M6 Earth link, clock and demo panel (started Sun 10:20, checked and committed Sun 10:35; manual checks pending)
- M5 close recorded: commit `54e918c` pushed to `main`. Deployment confirmed from Vercel's own commit status on GitHub (state "success", "Deployment has completed", 10:18:26 IST; the first query hit GitHub's anonymous rate limit, one later query succeeded). The public site serves `index-BactSZzl.js`, `RegionPage-C1IXocY0.js` and `index-DhXs9j3C.css`, byte-identical to the local build, and the 16 M5 browser checks passed on the public site.
- Like M5, M6 follows ARCHITECTURE.md section 31.12 as written: the earlier prompt with M5 and M6 requirements never reached this session.
- Built:
  - The outbox state machine `advance` (in the outbox, on its way, delivered) in `src/link/earthLink.ts`, with the departure rule for a link that was down, the arrival after one delay and a consult's expected reply time. It never creates a message; the store runs it after every change.
  - The mission clock ticker (paused, 1×, 60×, 600×; at most four writes a second), started once in the layout; the header shows the mission time.
  - The Earth link screen: link, delay, handling time and every message with its steps, progress, arrival and expected reply; private messages without their text.
  - The presenter tools: mission clock, crew member, environment and delay, link down and up, "Reset to seed" (asks first), and the scenario picker.
  - New store actions `advanceTime`, `setSpeed`, `setLinkUp`, `switchCrew`. New optional fields `link.upSinceMs` and `message.departedAtMs`, so older stored states still load.
- Changed behaviour, with the tests updated to match: messages no longer stay "queued". At the station (0 s) a consult is delivered at once; at Mars a message is on its way while the clock is paused. The "sent" lines on alerts and insights now say "Sent to ground at 09:00 mission time. On its way to Earth: a consult request." The second-opinion rules are unchanged: an insight is still sent only when the crew member presses "Send to ground", once per insight and day.
- Tests: `npm run check` green with 611 tests in 38 files (583 before M6). New: every transition of `advance` (leaves at once, reply time, exactly one delay, one-step delivery, link down keeps it, leaves when the link is back, keeps going when the link goes down, keeps its arrival when the delay changes, unchanged array); the ticker with fake timers (600× moves ten minutes in four writes, paused writes nothing); the store (the exit test at Mars far, link down and back up, "+1 day", "+10 min", a step that does not move forward, the speed, crew switch with the other member's messages); the Earth link screen (delivered with reply time, in transit with progress and steps, link down, private message, empty); the presenter controls (speed pressed, "+10 min" and "+1 day" in the header, link, crew, reset only after the second press).
- Browser checks: headless Chrome against `vite preview` of the production build. 17 of 17 passed: by keyboard only, the slider to Mars far, "Send to ground" on the sleep alert (on its way at once), the Earth link screen with progress and "Expected reply around 09:49 on day 142", 600× from the presenter tools, then "Arrived at Earth at 09:22 on day 142" with the reply time still shown, link down and up, "+1 day" moves the day; at 390 px no sideways scrolling, tap targets at least 44 px and text at least 16 px on the Earth link screen and the presenter tools; every stop had a focus ring; no console errors.
- Known issues:
  - The progress bar uses the browser's own look.
  - While the clock runs, Home re-evaluates up to four times a second; it is paused by default.
  - The bundle is 587 kB (180 kB gzipped), still over Vite's 500 kB warning.
- **Manual checks pending** (none confirmed yet):
  - M6 (ARCHITECTURE.md section 31.12), on the deployed site: at 600×, send a consult at Mars far: it goes in transit, then is delivered after the one-way delay, with its expected reply time shown; toggle the link down and up; "+1 day" moves the mission day.
  - M5, A3, A2, A1 and the "before M5" checks listed in the entries below, unchanged.
- This commit's deployment is recorded in the next entry.

## M5 Trends and streak (started Sun about 10:05, checked and committed Sun 10:20; manual checks pending)
- A3 close recorded: commit `176d9ff` pushed to `main`. Deployment confirmed from Vercel's own commit status on GitHub (state "success", "Deployment has completed", 03:52:04 IST). The public site then served `index-CJ8JT9Td.js` and `index-D2LNX2L2.css`, byte-identical to the local build, and the same seed and space weather files; the 26 A3 browser checks passed on the public site as well.
- Scope change (Divyanshu, 15 November, Sun 09:55): A4 is included in the hackathon submission and the batch is M5, M6, A4, each with its own checks, commit and push. Recorded in ARCHITECTURE.md (sections 3, 24.3, 26.19, 27, 30, 31.1, 31.10, 31.17, 32.1, 33, 34) and CLAUDE.md. B1, B2, B3 and M7 are not started.
- The message refers to an earlier prompt with M5 and M6 requirements and an instruction to stop after M6. That prompt never reached this session (the session log holds no such message), so M5 follows ARCHITECTURE.md section 31.11 as written.
- A4 dataset access, checked first (details in the A4 entry): the official PhysioNet page answers from this machine; version 1.0.0, Open Access, Creative Commons Attribution 4.0 International. The page no longer links one ZIP file and the old challenge ZIP files return 404, so the download takes the official file list and fetches the patient files from PhysioNet's open-data bucket, which the page names. It ran in the background during M5, inside the 30-minute time box.
- Built:
  - Region detail `#/region/:regionId`: status header and missing data, the area's active alerts, second opinions about the area, the simulated habitat feed (Environment) or the skin note, one card per reading (latest value, normal, 30-day chart, summary line), and "Why this matters in space" with sources. It loads on first visit; the chart library is a separate file.
  - `TrendChart` (Recharts): the readings, the band `center ± 2 × spread` as "your usual range", the normal as a dashed line, round ticks, no animation; chart colours are new tokens, never status colours.
  - `src/lib/trendSummary.ts`: the 30-day window, the band and the summary line.
  - The check-in streak in the Today card (`src/lib/checkin.ts`), derived from readings and never stored.
  - Home: areas on the body map and rows of the status list open the region screen; the in-place summary is gone. `AlertItem`, `HabitatFeeds` and `RegionInsights` moved to `src/components` so both screens share them.
  - Fix found by the 390 px check: source links were 24 px tall; they are 44 px everywhere now.
- Tests: `npm run check` green with 583 tests in 33 files (560 before M5). New: the summary (down, up, same, one reading, five latest only, learning, no readings, the window, the band), the streak (yesterday, today done, gaps, a missing step, re-checks, other crew, day 1), the milestones, the region page (Head in `sleep-debt` with the summary, sources, Environment, early mission, second opinions, unknown area), Home's links and streak.
- Browser checks: headless Chrome against `vite preview` of the production build (the dev server had been stopped by Claude Code for low memory). 16 of 16 passed: the streak on Home; Head by keyboard opens `#/region/head`; the sleep card shows the value, the normal and the summary; the chart draws the band and the last five nights below it; the alert and the sources are there; the keyboard reaches every link on the page; a status row opens its area; at 390 px no sideways scrolling, tap targets at least 44 px, text at least 16 px; every stop had a focus ring; no console errors.
- Known issues:
  - The streak needs the exercise reading, which is logged in the evening, so today joins the streak only after the evening entry. Until then it counts up to yesterday.
  - The summary describes the last five readings, not a fixed number of days.
  - The bundle stays at 579 kB (177 kB gzipped); the region screen and its chart library load separately (340 kB, 100 kB gzipped).
- **Manual checks pending** (none confirmed yet):
  - M5 (ARCHITECTURE.md section 31.11), on the deployed site: the Head region in `sleep-debt`: the sleep line dips below the band and the summary line matches; the streak shows on Home; the keyboard reaches every link; 390 px.
  - The A3, A2, A1 and "before M5" checks listed in the A3 entry below, unchanged.
- This commit's deployment is recorded in the next entry.

## A3 ML model 2: personal pattern (started Sun 02:52, checked and committed Sun 03:55; manual checks pending)
- A2 close recorded: commit `3e9c906` pushed to `main`. Deployment confirmed from Vercel's own commit status on GitHub (state "success", 02:41:52 IST). The public site then served `index-Be89xDW-.js` and `index-BFMLICiP.css`, byte-identical to the local build, and the same seed, index and space weather files.
- A1 model card wording, corrected as text only (Divyanshu's instruction for A3):
  - Three places in `ml/reports/sep-risk-v1.md` and the same three in its template in `ml/train_sep_risk.py`: the purpose sentence ("estimates the chance" and the crew reading "estimated chance"), the reliability table header ("Estimated chance", "Mean estimate") and the formula sentence ("a whole percent between 1% and 99%"). The card now calls it the model's output, which the app shows as an "Experimental model score" out of 100, never a percent chance. The third place was not in the first count of two; it was found when the template was read.
  - The script was not re-run. The model, its threshold, the raw and processed data, the parity file, the plots, `createdAt` and every number are unchanged; `git status` shows only the two text files.
  - CLAUDE.md says generated files are not edited by hand. Here the committed card and the template were changed identically, and the existing test that compares the committed card with what the script writes passes, so the card is still exactly the script's output.
  - Left as it is: the reliability plot's axis label "Mean estimated chance in the bin". The PNG is a frozen A1 file and was not regenerated.
- Built:
  - Offline: `ml/personal_pattern.py` (baseline z-scores as in `baseline.ts`, scikit-learn `LedoitWolf` with `assume_centered=True`, a Cholesky factorization written out so both languages refuse the same matrices, leave-one-out threshold, contributions, readiness) and `ml/eval_personal_pattern.py` (the simulated evaluation and the export). One run of about a minute writes `src/data/models/personal-pattern-v1.json`, `ml/artifacts/personal-pattern-v1-parity.json` and `ml/reports/personal-pattern-v1.md`.
  - In the app: `src/engine/models/linalg.ts` and `personalPattern.ts`, a port of the same steps. `evaluate()` returns `insights` and `patternReadiness`, computed after alerts, statuses and routes and from the same daily values (urgent re-checks never enter). The model file is checked when the app loads: schema, known sources, daily indicators only.
  - Home: the "Second opinions" card under the alerts, with at most two insights or one line ("Learning your pattern (n of 14 days)", "Second opinions run after today's check-in", "No unusual patterns today"). The insight card is neutral: icon, "Insight", "Model estimate", the version, the headline, three readings in words with today's value and the normal, the caveat, "How this model works" and "Send to ground". No number and no percentage.
  - "Send to ground" (store action `sendInsightToGround`) queues one consult per insight and day, titled "Second opinion sent by crew" and marked private. Nothing is sent unless the crew member presses it. The message stays "queued" until M6 builds the Earth link transit.
  - The region rows on Home list the insight under the areas of its readings; their status does not change. (The region detail screen is M5.)
  - The model card screen is generalized: `#/model/personal-pattern` is new and `#/model/sep-risk` is unchanged.
  - Scenario `pattern-shift`: mission day 130 at the Mars base. Crew member A's sleep and mood go down and resting heart rate and reaction time go up for three days, each by 2.5 times the simulator's day-to-day noise of that reading, and this morning's check-in is logged. Every other scenario file is byte-identical.
- How `pattern-shift` was built: to show an insight, so the insight is there by construction. Its shift is the evaluation's "combined" pattern at one of the evaluated sizes (a test checks that they agree), with the noise reduced on the shifted days as in every scenario story. It is an illustration; how often the model notices such a shift is in the model card's simulated evaluation.
- **Results: read the model card, `ml/reports/personal-pattern-v1.md`, or the app's model card screen.** The numbers are not retyped here. In words, on simulated data only:
  - On ordinary days the model gave a notice on a small share of days, close to what chance alone would give if today were like the baseline days (that value is inside the model's 95% interval). IsolationForest, scored with the same "more unusual than every baseline day" rule, gave a similar share.
  - The small combined shift that no rule notices: the model noticed it more often than IsolationForest at every size; from size 1.5 on the two intervals do not overlap.
  - Temperature and heart rate higher: the model noticed more shifted days than IsolationForest at every size, with intervals that do not overlap.
  - A change in sleep alone was noticed far less often than the combined shift.
  - The rules alone noticed none of the shifted days and gave no notice on ordinary days: every shift is smaller or shorter than the rules' triggers.
  - These results show that the method works as designed on the project's own simulator, whose readings vary independently of each other. They do not show that it notices real illness. The card lists ten limitations.
- `expectedInsights`, filled from the models: `personal-pattern` for `c1` in `pattern-shift`, none in every other scenario (they have no readings today at 09:00). **Not reviewed by Divyanshu yet**, so not marked as reviewed.
- Tests:
  - `npm run check` green: 560 tests in 30 files (454 before A3).
  - New: parity with Python on six z-score matrices and four whole histories, all within 1e-9; contributions add up to the distance; readiness counts, including exactly four readings before the check-in; fewer than four readings today give no insight; an urgent glucose re-check never counts as today's fasting value; degenerate readings give no insight and no error; factors never name a zero or negative contribution; golden insights for every scenario; second-opinion invariance for every scenario and crew member, with and without an unusual check-in, at three delays and with and without `sep-risk`; the Home card, its readiness lines, sending once and only by choice, the factor directions, the region rows and the model card (Testing Library).
  - Python: 153 tests in `ml/tests` (30 new; about a minute and a half, because one runs the whole evaluation to prove the committed files are its output) and 36 in `tools/tests` (3 new) pass. Two runs give the same files apart from `createdAt`.
  - 21 deliberate bugs were planted one at a time (17 in TypeScript, 4 in Python), among them the wrong Ledoit-Wolf bound, the smallest instead of the largest leave-one-out distance, negative contributions named, an insight raising the overall status, sending twice, an unmarked private message, the raw score on the crew card, automatic sending and flipped directions. All 21 were caught, and every file was restored (SHA-256 checked).
- Browser checks: headless Chrome through the DevTools Protocol, fresh profile, local dev server. 26 of 26 passed: `pattern-shift` loaded by keyboard shows the insight with three factors, the caveat and the tag, no percentage, no alert and Good overall; "Send to ground" by keyboard moves focus to the result and queues one private consult, still one after a reload, with no second button; the model card says first that the evaluation is simulated and its numbers match the model file and the generated card; `early-mission` says "Learning your pattern"; at 390 px there is no sideways scrolling, every tap target is at least 44 px and text at least 16 px; 55 keyboard stops, all with a focus ring; no console errors.
- Docs: ARCHITECTURE.md sections 7, 15, 19.11, 24.1, 24.3, 26.17, 26.18, 27, 31.8 and 31.9; README, REFERENCES (the two scikit-learn estimators, the simulated histories), AI_USAGE (A3 and model 2), `ml/README.md`.
- Unchanged: every source stays `verified: false`, and every protocol stays `reviewed: false`. No rule, threshold or other scenario was changed. A4 stays deferred.
- Known issues:
  - The JavaScript bundle is now 579 kB (177 kB gzipped), over Vite's 500 kB warning (550 kB after A2). Loading the model card screens lazily is a later "Fix:" if wanted.
  - If a matrix cannot be factorized (only with constant readings), Home says "No unusual patterns today", because the model gives no insight then.
  - The reliability plot label above.
- **Manual checks pending** (none confirmed yet):
  - A3 (ARCHITECTURE.md section 31.9), on the deployed site:
    1. Load `pattern-shift`: no alerts; the "Second opinions" card shows "Unusual pattern for you" with three factors, the caveat and the "Model estimate" tag.
    2. Open "How this model works": the simulated evaluation numbers match `ml/reports/personal-pattern-v1.md`, and the card says they come from simulated data.
    3. Load `early-mission`: "Learning your pattern (n of 14 days)".
    4. "Send to ground" queues one consult; pressing it again the same day adds nothing (the button is replaced by "Second opinion sent by crew: queued for Earth").
    5. Keyboard only, and at 390 px.
  - A3: look at the `pattern-shift` insight and confirm the scenario expectations (`expectedInsights`) before they count as reviewed.
  - A3: read the new wording of the A1 model card (`ml/reports/sep-risk-v1.md`, the purpose sentence, the reliability table header and the formula sentence).
  - A2 (section 31.8), on the deployed site: the five checks listed in the A2 entry below: pending.
  - A1: read `ml/reports/sep-risk-v1.md` (the six points of section 31.7), and open two or three of its instrument documentation links: pending.
  - Pending — Divyanshu will complete before M5:
    - M2: open `public/seed/sleep-debt.json` and see `"simulated": true`, the fictional crew names and `expectedAlerts`.
    - M2: open `ml/data/raw/donki/meta.json` and see `apiBase`, `requested`, `recordCounts` and `complete: true`.
    - M3: a look by eye at Home and Check-in on the deployed site.
    - M4: record the short screen capture of the demo flow (with the outlook step first).
    - M4: a look by eye at the alert screen on the deployed site.
    - M4: approve the re-check name "Blood sugar re-check (not fasting)" and the reworded `R-GLU-02` explanation.
- Not done on purpose: `p0-complete` is still not tagged, because the human checks above are pending.
- This commit's deployment is recorded in the next entry.
- Next: stop. M5 and every other milestone wait for Divyanshu's approval; A4 stays deferred until after the hackathon.

## A2 ML model 1 in the app (first code Sun 01:58, checked and committed Sun 02:41, pushed right after; manual checks pending)
- A1 close recorded: commit `4304f07` pushed to `main`. Deployment confirmed from Vercel's own commit status on GitHub (state "success", "Deployment has completed", 01:30 IST). Two earlier status queries were refused by GitHub's anonymous rate limit; one query after the reset succeeded. The public site served the same asset files as before (`index-CEAMow3E.js`, `index-D7q4ypPC.css`), as expected, because A1 changed no app code.
- A1 kept frozen:
  - No file in `ml/` or `src/data/models/` changed. Nothing was re-trained, re-calibrated or re-downloaded, and nothing was chosen from the test years.
  - The 123 `ml` tests confirm that the committed A1 files still equal a fresh build. The app's model file is byte-identical to `ml/artifacts/sep-risk-v1.json`.
- Built:
  - `src/engine/models/sepRisk.ts`: the eight features, the output, the factors and the 24-hour window, mirroring `ml/features.py` step by step. A flare the app cannot read is skipped, never scored.
  - `sepRiskModelFileSchema` checks the model file when the app loads. It needs the eight features in order, a value for a missing end time on the duration feature only, a threshold strictly between 0 and 1, and the metrics and limitations.
  - The `sep_risk` feed and the rule `R-RAD-03`, "Solar flare outlook: possible particle event": watch, whole body, 2 hours, no ground need, basis illustrative. Its threshold comes from the model file through `modelThreshold`, at full precision. It uses the draft protocol `P-RAD-PREPARE` from ARCHITECTURE.md section 18, and `R-RAD-01` supersedes it.
  - The data check now refuses a rule on the model feed that is not watch-level, needs the ground, or types its own number. The evidence ladder (decision D19) is therefore enforced when the app loads.
  - The model card screen `#/model/sep-risk` and its link "How this model was made" from the alert. Every number on it is read from the model file.
  - Scenarios replay real DONKI flares from the model's test years only. The generator refuses any other flare.
    - `solar-flare-watch` (new): mission day 150 in the Mars transit vehicle, flare `2023-08-05T21:45:00-FLR-001` at 07:30. It expects `R-RAD-03` for all three crew members.
    - `solar-storm` now has the flare `2023-08-07T20:30:00-FLR-001` that DONKI links to its particle event, at 15:00 the day before.
  - `basedOn` notes are in the scenario files and `index.json`, and `space-weather.json` lists all three real events. Home shows "Historical solar event" for those scenarios, the presenter tools show their notes, and the alert list shows the "Model estimate" tag.
- Presentation, as decided by Divyanshu on 15 November:
  - The output is shown as "Experimental model score: N out of 100" (a whole number from 1 to 99), never as a percent or a chance. It carries the "Model estimate" tag, the alert level, the model version and the three factors in words.
  - The flare it is for is tagged "Historical flare", with its DONKI link.
  - The box "About this score" sits next to it: the score concerns recorded DONKI associations, false alarms are frequent (the count is read from the model file), and it is not a validated probability or a measure of anyone's radiation exposure.
  - The internal 0 to 1 output and the threshold are unchanged; every comparison uses the unrounded output.
  - The model card screen calls the gradient boosting comparison inconclusive, and says this is not evidence that the two models perform equally. A section explains why the output is a score, not a percent chance.
- How the `solar-flare-watch` flare was chosen: by rule, the earliest X-class flare of the test years that is a positive under D22, that the model flags, and that is not the `solar-storm` flare. A simulator test re-derives it. The demo therefore shows a hit by construction; the false-alarm count next to the score says how often the model is right.
- Tests:
  - `npm run check` green: 454 tests in 26 files (283 before A2).
  - New: inference and parsing; the window (23 hours counts, 25 hours and after now do not, exactly 24 hours does not); the feed and its evidence; the threshold from the file (just below gives no alert, at it gives the alert); watch-only and "handle this yourself" at every delay and with the link down; superseding; every other alert, status and route identical with and without the model; the model file schema and its full precision; screens; the model card; the presenter tools; golden scenarios; "Send to ground" only by choice, with a message that names the score and no percent.
  - Parity with Python: all 50 rows of `ml/artifacts/sep-risk-v1-parity.json`, each feature within 1e-12 and the output within 1e-9. The test years hold no flare without a usable end time, so the frozen parity file has no such row; a separate test checks that path against the model file's own value, as `ml/features.py` does.
  - Python: 33 simulator tests (9 new) and 123 `ml` tests pass. Two regenerations gave byte-identical seed files.
  - 19 deliberate bugs were planted one at a time, and all 19 were caught. Every file was restored to its original bytes (hash-checked). Three of them (the outlook made an act alert, the outlook needing the ground, a typed number in place of `modelThreshold`) stop the app at load: the data check refuses `rules.json`.
- Browser checks: headless Chrome 157 through the DevTools Protocol (the Chrome extension was not connected), fresh profile, local dev server. 53 of 53 passed:
  - the presenter tools mark exactly the two scenarios with real events;
  - `solar-flare-watch` loads by keyboard, with a Watch alert and its tag on Home and Environment at Watch;
  - the alert shows the score, three factors, the historical flare and "About this score", never a percent;
  - the route stays "You can handle this yourself" across the whole slider and every environment, and nothing is queued for Earth;
  - the model card numbers equal the model file, and the gradient boosting comparison reads "inconclusive";
  - `solar-storm` keeps its act alert and its Mars-far flip, and lists the outlook under "Also contributing";
  - at 390 px: no sideways scrolling, tap targets at least 44 px and text at least 16 px on four screens;
  - 68 keyboard stops, all with a focus ring; no console errors.
- Docs:
  - ARCHITECTURE.md sections 11.2, 11.6, 12, 13.5, 19.4, 19.11, 20, 24.3, 24.6, 26.1, 26.10, 26.12, 26.15, 31.8 and the glossary.
  - CLAUDE.md ML rule 4 and the extension summary, for the score presentation.
  - README, REFERENCES, AI_USAGE and `docs/demo-script.md` (the outlook step before the decisive moment).
- Unchanged: every source stays `verified: false`, and every protocol stays `reviewed: false`, including the new `P-RAD-PREPARE`.
- Not done on purpose: ARCHITECTURE.md says to tag `p0-complete` after the A2 push. Not tagged, because the human checks of M2, M3, M4, A1 and A2 are still pending. Divyanshu can tag it once he has confirmed them.
- Known issues:
  - The A1 model card `ml/reports/sep-risk-v1.md` still calls the output an "estimated chance" in two sentences. It is written by the training script, which A2 did not re-run, to keep A1 frozen. The README says so, and the app's model card screen has the current wording.
  - The JavaScript bundle grew to 550 kB (169 kB gzipped), over Vite's 500 kB warning. Loading the model card screen lazily is a later "Fix:" if wanted.
  - A browser that stored `solar-storm` before A2 has no flare for it. Loading the scenario again from the presenter tools shows the outlook under "Also contributing".
  - The model card screen is long on a phone, but it works at 390 px.
  - This commit's deployment is recorded in the next entry.
- **Manual checks pending** (none confirmed yet):
  - A2 (ARCHITECTURE.md section 31.8), on the deployed site: pending.
    1. Load `solar-flare-watch`: a Watch alert with the "Model estimate" tag, a score out of 100, three factors and "About this score".
    2. Open "How this model was made": the numbers match `ml/reports/sep-risk-v1.md`.
    3. Move the delay slider: the route stays "You can handle this yourself".
    4. Load `solar-storm`: the act alert `R-RAD-01`, with the outlook under "Also contributing".
    5. Keyboard only, and at 390 px.
  - A1: read `ml/reports/sep-risk-v1.md` (the six points of section 31.7), and open two or three of its instrument documentation links: pending.
  - Pending — Divyanshu will complete before M5:
    - M2: open `public/seed/sleep-debt.json` and see `"simulated": true`, the fictional crew names and `expectedAlerts`.
    - M2: open `ml/data/raw/donki/meta.json` and see `apiBase`, `requested`, `recordCounts` and `complete: true`.
    - M3: a look by eye at Home and Check-in on the deployed site.
    - M4: record the short screen capture of the demo flow (now with the outlook step first).
    - M4: a look by eye at the alert screen on the deployed site.
    - M4: approve the re-check name "Blood sugar re-check (not fasting)" and the reworded `R-GLU-02` explanation.
- Next: stop. A3, M5 and every other milestone wait for Divyanshu's approval.

## A1 ML model 1: dataset, training and model card (started Sun about 00:55, closed Sun 01:35)
- Documentation checkpoint recorded: commits `07e98de` and `d7b9c90` pushed to `main`. Deployment of `d7b9c90` confirmed once from Vercel's own commit status on GitHub (state "success", "Deployment has completed", 00:48 IST). The public site then served the same asset files as the local build (`index-CEAMow3E.js`, `index-D7q4ypPC.css`).
- Built, all offline in `ml/`:
  - `.venv` with numpy, pandas, scikit-learn and matplotlib; versions pinned in `ml/requirements.txt`.
  - `features.py`: the eight features, standard library only, so `sepRisk.ts` can mirror it in A2.
  - `sep_instrument_classes.json`: every SEP instrument name in the download with its class and the pages read for it.
  - `build_dataset.py`: writes `ml/data/processed/flares.csv` and `dataset_summary.json`. The raw DONKI files are only read.
  - `train_sep_risk.py`: one command writes the model file and the parity file (`ml/artifacts/`), the model card and three plots (`ml/reports/`), and the copy `src/data/models/sep-risk-v1.json`.
  - `ml/README.md`: how to reproduce, with the expected outputs.
- **Results: read the model card, `ml/reports/sep-risk-v1.md`.** Its numbers are not retyped here. In words:
  - On the held-out test years the shipped model ranked flares better than flare class alone: the intervals of both differences (ROC AUC and TSS) lie above zero.
  - The test years show no difference from the gradient boosting benchmark: both difference intervals include zero.
  - The estimates in the lowest range were too high. The share of positive flares is much lower in the recent years than in the training years, and the card reports the Brier skill against both references for that reason.
  - Most flares that the threshold flags are negative, and the validation years have only just enough positives. Both are stated in the card and in the model file's limitations.
- Instrument classes (decision D22):
  - Claude Code read official documentation through a web fetch service and recorded each source.
  - `observed`: the GOES SEISS, GOES-13 SEM, STEREO IMPACT and SOHO COSTEP names. The pages are from NOAA and from the instrument teams.
  - `model`: the four `MODEL:` names. The prefix is enough under D22; no REleASE documentation could be retrieved, and the table says so.
  - `unknown`: `ACE: EPAM >30 MeV`. The ACE documentation gives EPAM no proton channel that high. It is one record. The one eligible flare that reaches it is positive through other, observed records, so no label depends on it and this was not a material open decision.
  - Not reachable: pages on NASA GSFC hosts. None of them was needed for a class.
- Found in the data and handled by rules now written in ARCHITECTURE.md (sections 26.3, 26.4 and 26.6):
  - SEP records have no `catalog` field.
  - Every SEP record lists exactly one instrument, so no record is mixed. The code and tests still handle mixed records and report their other names.
  - Two flares have a peak before their begin and are dropped with that reason. An end time before the peak counts as a missing end time.
  - The planned split boundaries were kept.
- Split honesty, proved by tests:
  - The fitting function never receives the test years.
  - Flipping the test labels and replacing the test durations changes no coefficient, no `C` and no threshold.
  - The scaler and the missing-duration value equal the training years' own statistics.
  - Removing the ambiguous flares changes nothing, because they are never used.
  - The test years were scored after every choice was fixed. One reporting number, the Brier skill against the test years' own base rate, was added after the first run. No modelling choice changed after that run.
- Tests:
  - Python, inside `.venv`: 123 tests in `ml/tests` pass with none skipped (46 downloader tests and 77 new ones); 24 tests in `tools/tests` pass. Without `.venv` the 26 training tests are skipped with a message.
  - 14 deliberate bugs were planted in a temporary copy, among them model-only records counted as observed, ambiguous flares turned into negatives, a missing name treated as observed, a path through another flare, the scaler seeing the validation years, and a flipped longitude. 13 were caught at once. The fourteenth (the missing-duration value also using the test years) was not, because that value happens to be the same on this data; the test now also replaces the test durations, and catches it.
  - Reproducibility: two runs gave byte-identical dataset files, parity file and plots, and the same model file apart from `createdAt`. A test checks that the committed files are what the scripts write.
  - Raw DONKI files: unchanged (`git status` shows none, `--verify` passes).
  - `npm run check` green (283 tests in 21 files) and `npm run build` green; the asset files are unchanged because no app code changed. Seed files regenerate unchanged.
- Fixed on the way: ESLint scanned a JavaScript file inside `.venv` (one warning). `.venv` is now in ESLint's ignore list.
- Unchanged: every source stays `verified: false`, and every protocol stays `reviewed: false`. The model is not used by the app yet (A2).
- Known issues:
  - Nobody on the team has re-read the instrument documentation pages or the model card yet.
  - `R-RAD-03` does not exist yet, so the threshold test of section 26.12 and the TypeScript parity test belong to A2.
  - The JavaScript bundle size warning is unchanged.
- **Manual checks pending** (one list; none confirmed yet):
  - A1, read `ml/reports/sep-risk-v1.md` (ARCHITECTURE.md section 31.7):
    1. Dataset: date range, counts per split, positives, drop reasons.
    2. Label and selection policy: instrument names with classes and sources, SEP record classes by year and split, flare labels and exclusions by year and split.
    3. Test-year scores with intervals, and the comparison with flare class alone and gradient boosting.
    4. The reliability table, and the three plots open.
    5. The limitations section is present.
    6. The numbers in `src/data/models/sep-risk-v1.json` and in the card are the same.
  - A1: open two or three of the instrument documentation links in the card and confirm they say what the table says.
  - M2: open `public/seed/sleep-debt.json` and see `"simulated": true`, the fictional crew names and `expectedAlerts`.
  - M2: open `ml/data/raw/donki/meta.json` and see `apiBase`, `requested`, `recordCounts` and `complete: true`.
  - M3: a look by eye at Home and Check-in on the deployed site.
  - M4: record the short screen capture of the decisive-moment flow.
  - M4: a look by eye at the alert screen on the deployed site.
  - M4: approve the re-check name "Blood sugar re-check (not fasting)" and the reworded `R-GLU-02` explanation.
- Next: stop. A2, A3, M5 and every other milestone wait for Divyanshu's approval.

## After M2: decisions for A1 (Sun 00:31, clarified Sun 00:45; no milestone started)
- M2 close recorded: commit `b020fd0` pushed to `main`. Deployment confirmed once from Vercel's own commit status on GitHub (state "success", "Deployment has completed", 00:11:07 IST). The public site then served the new `data/space-weather.json` (event `2023-08-08T01:00:00-SEP-001`), with the same asset files as the local build (`index-CEAMow3E.js`, `index-D7q4ypPC.css`).
- Divyanshu accepted the M2 closure at `b020fd0` and its four additional changes: the real event in `solar-storm`, the retrieval-date fix, the clearer `--verify` wording and the documentation updates.
- **Decided for A1 (decision D22, by Divyanshu):**
  - Raw DONKI records stay unchanged.
  - A1 inventories the actual SEP instrument names and gives each one a class: `observed`, `model` or `unknown`.
    - Claude Code classifies the names during A1 from official instrument documentation and the DONKI record context, and records the supporting sources.
    - A name without that support stays `unknown`. Lacking the `MODEL:` prefix is not support.
    - A real instrument used as the input of a forecasting model does not make the forecast an observed SEP.
    - Work continues with the supported classes. Claude Code asks Divyanshu only about a material unresolved decision.
  - Each SEP record is then observed-only, mixed, model-only or unknown.
  - A mixed record (a measured instrument together with model or unknown names) can support a positive label, because it holds established instrument-observed evidence. Its model and unknown parts are kept and reported.
  - An eligible flare is positive only when a permitted association (direct, or through one linked CME) reaches an instrument-observed SEP record (observed-only or mixed). An extra model prediction does not disqualify it.
  - A flare whose only SEP evidence is model-generated or unknown is excluded as ambiguous, never turned into a negative.
  - A negative means "no qualifying recorded SEP association", not "no SEP occurred".
  - The model card explains this selection policy and reports the record classes and the flare labels and exclusions by year and split.
  - Where it is recorded in ARCHITECTURE.md:
    - decision D22;
    - section 26.4, rewritten;
    - sections 26.1, 26.6, 26.8, 26.9, 26.10, 26.12 and 26.14, reconciled with it;
    - section 24.6, for the `solar-flare-watch` choice;
    - section 31.7, for the instrument table with its sources and a new manual check item;
    - the glossary.
- **Endpoint documented:**
  - NASA CCMC's official announcement (https://ccmc.gsfc.nasa.gov/news/major-updates/) documents the replacement endpoint `https://ccmc.gsfc.nasa.gov/DONKI-API/get/` and the announced migration of 30 September 2026.
  - The announcement was supplied through external review. Claude Code could not retrieve the page itself: a fetch through a web service was refused at the connection, and a direct attempt from this machine timed out.
  - Recorded in ARCHITECTURE.md section 25 and its technical references table (`ccmc-major-updates`), REFERENCES.md and README.md.
  - The third-party note's claim that the older addresses redirect stays unconfirmed.
- Commits, both documentation only:
  - `07e98de` recorded the decision and the endpoint.
  - A follow-up commit corrected two things in it and added one. It had required Divyanshu to confirm every `observed` instrument name before training, which he did not ask for. It had said he confirmed the announcement himself. The follow-up also states that a mixed record's model and unknown parts are kept and reported.
- Checks on the final files: `npm run check` green (283 tests in 21 files), and a credential scan of the documentation changes found nothing.
- Unchanged: no data was downloaded again and no code changed. Every source stays `verified: false`, including `donki`, and every protocol stays `reviewed: false`.
- **Manual checks still pending** (none confirmed yet):
  - M2: open `public/seed/sleep-debt.json` and see `"simulated": true`, the fictional crew names and `expectedAlerts`.
  - M2: open `ml/data/raw/donki/meta.json` and see `apiBase`, `requested`, `recordCounts` and `complete: true`.
  - M3: a look by eye at Home and Check-in on the deployed site.
  - M4: record the short screen capture of the decisive-moment flow.
  - M4: a look by eye at the alert screen on the deployed site.
  - M4: approve the re-check name "Blood sugar re-check (not fasting)" and the reworded `R-GLU-02` explanation.
- Next: stop. A1, M5 and every other milestone wait for Divyanshu's approval.

## M2 close: DONKI data (download Sat 22:57 to 23:27, checked and closed Sun 00:10)
- M4 close recorded: commit `291cb20` pushed to `main`. Deployment confirmed from Vercel's own commit status on GitHub (state "success", 21:30:30 IST), and the public site then served exactly the asset files of the local M4 build (`index-CEAMow3E.js`, `index-D7q4ypPC.css`).
- Downloader fixed before the download (`ml/fetch_donki.py`; ARCHITECTURE.md section 25, "Changed on 14 November 2026"). A first run with Divyanshu's personal key logged only "HTTPError" and recorded zero events for types it never downloaded. Now:
  - Every failure shows its HTTP status and the API's own error, filtered so no key, no request address with its query and no raw body appears.
  - Redirects are reported, not followed.
  - An address counts as working only if it answers with SEP records.
  - Retries are limited.
  - A type without files has the count `null`.
  - `--diagnose` and `--verify` are new.
  - Tests: 46 offline tests, including a local test server. Six deliberate bugs were each caught.
- Download, run by Divyanshu on 14 November from 17:27:07 to 17:57:49 UTC (22:57 to 23:27 IST):
  - Over a personal mobile hotspot, `https://ccmc.gsfc.nasa.gov/DONKI-API/get/` (`ccmc-donki-api`) answered without a key. On the team's usual network the CCMC addresses had timed out (Windows error 10060).
  - Requested 2010-01-01 to 2026-10-31, the last full month.
  - All 51 one-year requests were refused with HTTP 400. The body was not JSON, so no reason was given. The month-by-month fallback then fetched all 606 months, each answered on the first attempt with HTTP 200 and a JSON list.
  - `meta.json`: `complete: true`, no missing files, `usesPersonalKey: false`, no problems in the last run.
- Counts, copied from `meta.json`:
  - FLR: 3399 records, 2010-04-03T09:04Z to 2026-10-26T18:17Z.
  - CME: 10332 records, 2010-04-03T09:54Z to 2026-10-31T05:00Z.
  - SEP: 494 records, 2010-08-14T12:30Z to 2026-09-05T16:30Z.
  - Divyanshu's `--verify` passed, and it passed again here offline. Counts match the files, IDs are unique, no record falls outside its file window, and no ID appears in two files.
- Periods without records are kept exactly as downloaded. Each one was a successful answer with an empty list: 55 FLR months, 4 CME months and 117 SEP months, including all of 2018 and 2019 for SEP. They mean DONKI listed no record when the data was downloaded, not that no event occurred.
- `--verify` wording: it now says this itself and lists the years without records. It says "year files 17 of 17" instead of "records in 17 of 17 years", which read as if every year had records.
- **Open question for A1 (not decided; A1 not started).** Decided on 15 November as decision D22: see "After M2" above.
  - 140 of the 494 SEP records come from models (instrument names starting "MODEL:"), not measurements.
  - One particle event often has several SEP records. On the morning of 2023-07-18, eight SEP records link to the same M5.0 flare: three instruments in several energy channels, plus model output.
  - Section 26.4 labels a flare positive when it links to any SEP record, which would count model-only records. Section 26.14 says the labels describe events recorded by instruments.
  - Divyanshu should decide before A1 whether model-only SEP records count.
- Real event in `solar-storm` (M2 build item 5): SEP `2023-08-08T01:00:00-SEP-001`, measured by GOES-P SEISS >10 MeV, starting at 01:00 UTC.
  - DONKI links it to flare `2023-08-07T20:30:00-FLR-001` (X1.5, peak 20:46 UTC the day before) and to CME `2023-08-07T20:48:00-CME-001`.
  - A script chose it by the rule in `tools/simulator/scenarios.py`: the earliest SEP record of the model's test years (2023 on) that GOES measured, that starts before 09:00 UTC, and that is linked to an X-class flare that peaked the previous UTC day. It was the only record that met all of these.
  - Regenerated with seed 42. Only `basedOn` in `public/seed/solar-storm.json` and `public/data/space-weather.json` changed; readings and expected alerts are unchanged, and two runs were byte-identical. The app does not show `basedOn` yet.
- Fixed: `public/data/space-weather.json` would have shown `retrievedAt: null`, because the new `meta.json` keeps one retrieval time per file. The generator now takes the time of the file that holds the event (`2026-11-14T17:56:14Z`), and stops if it is missing.
- Credential check: scanned `meta.json`, all 51 data files (decompressed), the downloader, its tests and `ARCHITECTURE.md`. Nothing found:
  - no key, no `api_key` value, no request header;
  - no token-like string except a public article ID already in `ARCHITECTURE.md`;
  - query strings in `meta.json` hold only `startDate` and `endDate`; those inside DONKI `note` fields are links to public solar data viewers;
  - the key in the tests is a labeled fake.
- Tests:
  - `npm run check` green: 283 tests in 21 files, including the golden tests for every scenario. `npm run build` green.
  - Python: 46 downloader tests and 24 simulator tests pass. The 4 new simulator tests cover an event with its file's retrieval time, a missing retrieval time, a missing event, and `solar-storm`'s event being measured, not modelled, and starting before 09:00 UTC.
- M2 exit test passed: the golden tests are green for `baseline-healthy`, `sleep-debt` and `solar-storm`, and the DONKI raw files and `meta.json` are committed with this entry.
- Unchanged: every source stays `verified: false`, and every protocol stays `reviewed: false`.
- Blocker for A1: resolved. A1 has not started.
- Manual check for Divyanshu: open `ml/data/raw/donki/meta.json` and look for `apiBase`, `requested`, `recordCounts` and `complete: true`.
- Known issues:
  - The JavaScript bundle size warning is unchanged.
  - ARCHITECTURE.md section 25 still asks for the `DONKI-API` address to be confirmed on the official DONKI page. (Documented by NASA CCMC's official announcement: see "After M2" above.)
  - The A1 question above. (Decided on 15 November.)
  - Blank lines inside the `AI_USAGE.md` table split it when rendered; they were removed.
- Next: stop. A1 waits for Divyanshu's approval.

## M4 Alerts, triage and environments (started Sat 21:02, closed Sat 21:30)
- Deployments before this milestone, confirmed from Vercel's own commit status on GitHub ("success", "Deployment has completed"): M2 `5e38dc5` and M3 `9f8a297`. At 21:00 the public site also served exactly the asset files of the local M3 build.
- Fixed first, before re-check entry was switched on: a blood sugar re-check would have been labeled "Fasting blood sugar, latest re-check". Indicators may now carry `recheckLabel`; blood sugar's is "Blood sugar re-check (not fasting)". The `R-GLU-02` explanation now says its latest reading is either the routine fasting measurement or an urgent re-check. The 70 mg/dL cut-off and its source are unchanged.
- Built: the alert screen `#/alert/:alertKey` in the fixed order (Who leads, What changed, Why it matters, What to do, Evidence, Also contributing), with "Acknowledge" and, for self care, "Send to ground"; the route banner with the reply estimate, the "Start the first steps now. The reply estimate is not a reason to wait." line for an act alert that consults the ground, and the first two steps of every act alert; "Draft guidance" and the protocol note above a checklist whose ticks persist; missing data next to the alert; basis tag and sources with "Unverified source" tags; an urgent re-check form (stored as `purpose: "recheck"`, never in the fasting baseline); the environment selector and the Mars delay slider in the header; automatic outbox messages (one per alert and kind, shown as "Queued for Earth" with a "Simulated" tag); the presenter tools drawer with the scenario picker (Shift+D or the footer); Home alerts as links, with "Start now:" and the first step for act alerts.
- Tests: `npm run check` green, 283 tests in 21 files (Python unchanged: 20 tool and 9 downloader tests pass; seed files regenerate byte-identical). The plan's tests: the fixed section order; `solar-storm` at the station is `consult_ground` with 5 min, Mars near 11 min `consult_ground`, Mars far 49 min `act_on_board` (store test and screen test: the exit test); 150 slider moves leave one message per alert and kind. Four deliberate bugs (no outbox de-duplication, the "do not wait" line hidden, first steps hidden while consulting the ground, re-checks entering the fasting history) were each caught.
- Browser checks: headless Chrome 157 through the DevTools Protocol (the Chrome extension was not connected), fresh profile, against the local dev server. 27 of 27 passed: Shift+D opens the drawer with focus on its heading; `solar-storm` loads from the drawer by keyboard; "Consult the ground. Reply expected in about 5 min." with the first steps visible without scrolling at 1024 by 768 (and at 390 by 844); arrow keys on the environment selector reach Mars transit (180 s, 11 min); End on the slider gives "Act now on board. A reply from Earth would take about 49 min." with the steps still at the top; 22 more slider moves leave one consult and one report; Mars rover has the same range and logic; ticks and acknowledge by keyboard survive a reload; every alert of every scenario shows a basis tag and at least one source; a 64 mg/dL re-check keeps the alert and is named "Blood sugar re-check (not fasting)", an 88 mg/dL re-check clears it, and the day keeps its fasting reading; no sideways scrolling at 390 px; tap targets at least 44 px; every keyboard stop showed a focus ring; no console errors.
- Fixed during checks: the delay text was an `<output>` live region, so a screen reader would have read each slider value twice; it is now plain text (the slider announces its value). The reply estimate note no longer repeats "5 min".
- Known issues and follow-ups: the JavaScript bundle is 511 kB (157 kB gzipped), just over Vite's 500 kB warning; splitting the screens into lazy chunks is a later "Fix:" if wanted. The countdown to the expected reply and self-care re-check reminders need the running clock (M6). Only the active crew member's alerts queue messages until the crew switch arrives (M6).
- Docs: first draft of `docs/demo-script.md` (the decisive moment).
- Manual checks for Divyanshu: record the short screen capture of the decisive-moment flow as the demo fallback (the plan asks for it after this push), and look at the alert screen by eye on the deployed site.
- Next: stop. M5 and the A and B milestones wait for Divyanshu's approval. A1 stays blocked on the DONKI data.

## M3 Home and check-in (written Sat 20:20 to 20:40, verified and closed Sat 21:00)
- Built: the store (`src/store/`: Zustand with `persist`, key `chc-state`, version 1, validated on load; bad storage falls back to the default scenario), the mission clock module (`src/clock/missionClock.ts`; time stands still until M6), the seed loader and memoized selectors, shared components (`StatusBadge`, `Card`, `Tag`, `SourceLink`, `BodyMap2D`), Home (body map, status by area with readings in place, active alerts, Today card) and the 9-step daily check-in (validation, "How to measure", "Why it matters in space" with sources and "Unverified source" tags, "Skip for now", yesterday's value as a hint, summary).
- Tests: `npm run check` green, 246 tests in 18 files (Python: 20 tool and 9 downloader tests, unchanged), including the three the plan asks for: Home with `sleep-debt` lists `R-SLEEP-01`; check-in accepts a sleep value and refuses an out-of-range one with an inline message; in `baseline-healthy` a temperature 2.5 °C above the baseline turns Abdomen to Act.
- Browser checks: the Chrome extension was not connected, so Claude Code drove the installed Chrome (157) headless through the DevTools Protocol with a fresh profile, keyboard input only. All 15 checks passed: first load shows `sleep-debt` with Head Watch and the sleep alert; a full check-in by keyboard with one step skipped; an out-of-range value refused inline; focus moves to each new step heading; a 40.1 °C reading turns Abdomen to Act; the skipped step stays listed as due; both survive a reload; no sideways scrolling at 390 px on Home and Check-in; every tap target at least 44 px; smallest text 16 px; every keyboard stop showed a focus ring; no console errors.
- Fixed from the browser checks: status rows now have a spoken name with clear breaks ("Head: Watch. Sleep has been low…" instead of the parts run together), and on a phone the headline gets its own line. Fixed from re-reading the exit checks: the Today card now names the steps still to do today.
- Manual check for Divyanshu: a quick look by eye at Home and Check-in on the deployed site (the automated checks cannot judge appearance).
- Next: M4 (approved).

## M2 Seed data and DONKI cache (started Sat 20:04, closed Sat 20:20: seed part done, DONKI part NOT met; DONKI part completed Sun 00:10, see "M2 close" above)
- M1 close recorded: commit 09f9cee pushed to `main`. Deployment confirmed at 20:05 from Vercel's own commit status on GitHub: state "success", "Deployment has completed" (the same record exists for M0's 556edb5). This is a commit-to-deployment record, not an inference from identical files.
- Built: `tools/simulator/` (`model.py`, `scenarios.py`, `generate.py`; standard library, seed 42, three fictional crew members), six scenarios in `public/seed/` (`baseline-healthy`, `sleep-debt`, `solar-storm`, `fever`, `low-glucose`, `early-mission`) with `index.json`, `public/data/space-weather.json`, Zod schemas for the scenario, index and space weather files, and `ml/fetch_donki.py` (standard library; resumable; key only from the `NASA_API_KEY` environment variable, never printed or written to `meta.json`).
- Engine: readings may carry `purpose: "recheck"`. Urgent re-checks count for "latest" rules but never enter a baseline, streak, average or the overdue list, and never replace the day's routine reading (needed before any re-check entry exists).
- Tests: `npm run check` green, 209 tests in 15 files, including golden tests (every scenario gives exactly its expected alerts at 09:00 on its mission day, for every crew member) and the re-check rules. Python: 20 simulator tests and 9 downloader tests pass. Determinism: three runs with seed 42 gave byte-identical files.
- **DONKI: not retrieved.** Investigated 20:04 to 20:08, inside the 20-minute limit. Every CCMC host refused or timed out, from the team's network and from an outside fetch service; `api.nasa.gov` refused the shared `DEMO_KEY` (retry after about 9 hours). The hand-entered fallback was not possible: the DONKI website is on the same hosts, and no event is typed from memory. So `solar-storm` uses fictional timing (`basedOn: null`), `space-weather.json` lists no event, and no `ml/data/raw/donki/` exists. The M2 exit test's DONKI half ("raw files and meta.json committed") is NOT passed.
- **Blocker for A1:** no training data. Needs a personal api.nasa.gov key set privately as `NASA_API_KEY`, or the CCMC servers answering again, then `py ml/fetch_donki.py --start 2010-01-01`. (Resolved on 15 November: see "M2 close" above.)
- Tooling: tests now have their own `tsconfig.test.json` (Node types for reading generated files); app code is still checked without Node types.
- Manual check for Divyanshu: open `public/seed/sleep-debt.json` and see `"simulated": true`, the fictional crew names and `expectedAlerts`.
- Next: M3 (approved).

## M1 Engine core (started Sat 18:08, done Sat 19:23)
- M0 close recorded: commit 556edb5 pushed to `main`; https://void-shifters.vercel.app/ served its build within about 30 seconds (HTTP 200, asset files identical to the local build of 556edb5, shell text present in the deployed bundle). Re-checked at 18:08: still serving that build.
- Built: `src/engine/` (Zod schemas and derived types; median, MAD and mean; baselines with the section 10 windows; every condition type and comparison kind, including `modelThreshold`; rules with one alert per rule per crew member and superseding; triage exactly as section 13.3; region and overall status with missing-data reporting; cross-reference checks; `evaluate()`). `src/data/`: indicators (10), regions (7), sources (37, all `verified: false`), environments (5), the six P0 rules and their six draft protocols, loaded and validated by `src/data/index.ts`.
- `sep_risk` stays inactive until A2: the feed has no value, so no condition on it can pass. No model threshold is typed anywhere; `rules.json` has no `modelThreshold` rule yet.
- Tests: 183 passing in 13 files (`npm run check` green; `npm run build` green). They cover baseline window edges, readiness and the spread floor; every comparison kind, including a not-ready baseline and a missing model; every condition type with missing data; superseding and deduplication; every cell of the section 13.5 table from the real rules and environments; link-down cases; missing habitat feeds and missing data kept next to active alerts; draft notes on protocols; and the cross-reference checks. Five deliberate bugs were each caught by the tests (mutation checks).
- Triage table: computed by the engine, 0 mismatches against section 13.5 (reply estimates 5, 5, 11 and 49 min). Approved by Divyanshu.
- Source review (`docs/source-review.md`): approved corrections applied (`bp-norsk-2015`, the Mathyk 2024 title and DOI, the Barger paper). New sources: `hypoglycemia-ada-2025` (glucose cut-off and protocol, passages read directly) and `gateway-medical-conops` (Moon delay; excerpt supplied by Divyanshu because the PDF could not be retrieved here). The `R-RAD-01` wording was checked against the NASA radiation brief. All sources stay `verified: false`.
- Decided in review: Environment shows No data when today's habitat sample is missing, and `Evaluation` reports `missingFeeds` and `regionGaps` next to any alert; Skin's Good means "no active alert" only; status order Act > Watch > No data > Good; `R-TEMP-02` basis `illustrative` (thresholds unchanged); study findings worded as observations in particular studies; 250 mSv worded as a design requirement, not the alert trigger or a harmless dose; CO2 evidence names the day's worst 1-hour average; the station's 0 s and the 5-minute ground handling are prototype assumptions; an act alert routed to the ground still starts on board.
- Protocols: all six remain drafts (`reviewed: false`), each with a `note` the protocol screen must show (M4). `P-GLU-LOW` is a draft adaptation of the ADA guideline: 15 g of fast-acting carbohydrate if awake and able to swallow safely, nothing by mouth otherwise, immediate help for danger signs, a 15-minute re-check that is not a fasting measurement. No medication instructions. Approval of these drafts is not clinical validation; no health adviser has reviewed them.
- Changed tooling: `resolveJsonModule` in `tsconfig.app.json`; the ESLint import boundary lets engine and body view tests import Vitest (boundary re-proved).
- Manual check: Divyanshu approved the triage table, the source corrections, the rewordings and the status semantics. No browser check applies: no screen uses the engine yet, so the engine is unit-tested only, not browser-tested.
- Known issues: NTRS-hosted sources other than the supplied Moon excerpt are unchecked. The data model has no way to mark a glucose reading as a non-fasting urgent re-check; M3 or M4 must keep such re-checks out of the fasting baseline. The Tailwind Markdown scanning and `npm audit` follow-ups from M0 are unchanged (not in scope).
- Next: M2, after Divyanshu's approval.

## M0 Scaffold and deploy (started Sat 17:13, done Sat 18:01)
- Built: Vite React TypeScript scaffold (strict, noUncheckedIndexedAccess), Tailwind v4 via `@tailwindcss/vite`, hash router (Home, Check-in, Earth link), layout shell with "Simulated data" tag and not-a-medical-device footer, status and 3D colour tokens, ESLint import boundaries (proved with throwaway bad imports: 10 of 10 caught), Prettier, Vitest with jsdom and Testing Library, `.gitignore` and `.gitattributes` (checked before the first `git add`).
- Tests: `npm run check` green (2 tests); `npm run build` green.
- Contrast: all status tokens pass WCAG AA; amber (Watch) text on white is 8.67:1.
- Plan updated: option B (A4 deferred), cuts (simulated replies, sensor trend charts, Library screen), `modelThreshold` for `R-RAD-03`, source review in M1, environment delays, recalculated schedule (section 31.1), handoff update for Chirag.
- Manual check (confirmed by Divyanshu):
  - Public site opens without a login and shows the shell, the "Simulated data" tag and the footer notice.
  - Home, Check-in and Earth link navigation works on the public site.
  - At 390 px wide (screenshot reviewed): the header uses two columns, text wraps cleanly, all three navigation items are visible, no horizontal clipping.
  - Keyboard: all four controls show a blue focus ring and Enter opens the navigation links. Focus order is Presenter tools → Home → Check-in → Earth link, because the footer comes before the bottom bar in the page.
  - The local dev server was not reported on separately; the deployed production build was checked instead.
- Deployed URL: https://void-shifters.vercel.app/ (Vercel, deploys every push to `main`). Checked by Claude Code at 17:52: HTTP 200, and its asset files match the local build of commit dd1a37a.
- Pushed: dd1a37a (the early scaffold push). The M0 close commit follows this entry; its hash and deployment check are recorded in the M1 entry.
- DONKI check (read-only): CCMC addresses not reachable from this network; `api.nasa.gov` returned 429 for `DEMO_KEY`. Decide before M2 (section 34, item 23).
- Known issues and follow-ups:
  - `npm audit` reports 7 moderate advisories, all one `minimatch` issue inside `typescript-eslint` (lint tooling only, not shipped). The only fix is a breaking downgrade, so it is left as is.
  - Follow-up: Tailwind's automatic source detection also scans the Markdown docs, so words such as "fixed" and "table" in the docs become unused CSS classes (about 0.6 kB), and the CSS file name changes whenever a doc changes. Harmless. Proposed fix: limit Tailwind's sources to `src/`, following the official Tailwind docs, as a "Fix:" commit after Divyanshu approves.
- Next: M1, awaiting Divyanshu's approval.
