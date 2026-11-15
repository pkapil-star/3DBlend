# Crew Health Check

Team VoidShifters' entry for the 2026 NASA Space Apps Challenge, challenge "Create Health Monitoring Software for Astronauts on Space Missions".

> Prototype for the NASA Space Apps Challenge. Not a medical device. All data in the app is simulated, and the crew members are fictional.

## What it is

A browser-only web app for a crew member checking their own health once a day. They enter a few readings; the app compares each one with that person's own in-flight normal, shows status on a body map, explains each result with a source, gives a short action card, and says whether to handle the problem on board or consult doctors on Earth, based on how long a reply from Earth would take.

Status: milestones M0 to M6 are done: the health engine, the simulated scenarios and the NASA DONKI space weather records (see [Data](#data)), Home with the body map, the daily check-in, the alert screen with triage by communication delay (change the environment or the Mars delay slider in the header and watch the route change), a screen per body area with 30-day trends against the person's own usual range and a check-in streak, and the Earth link: messages travel for the one-way delay while a mission clock runs (open "Presenter tools" to set its speed, take the link down or switch crew member). The first machine learning model, `sep-risk`, is trained, evaluated and running in the app as a watch-level solar flare outlook (milestones A1 and A2, see [Machine learning](#machine-learning)). To see it, open "Presenter tools" in the footer and load "A large solar flare this morning: the model outlook". The second, `personal-pattern`, gives on-board second opinions (milestone A3); to see one, load "Several readings shift a little at once". The plan is in [ARCHITECTURE.md](ARCHITECTURE.md), section 31; progress is in [docs/PROGRESS.md](docs/PROGRESS.md).

Live site: https://void-shifters.vercel.app/

## Run it locally

You need Node.js 24.15 or newer, or 22.22.2 or newer (the test tools require it; developed on 24.22), and npm.

```
npm install
npm run dev        # local dev server, prints the URL
npm run check      # type check, lint and tests; must pass before every push
npm run build      # production build into dist/
npm run preview    # serve the production build
```

Other scripts: `npm run test:watch`, `npm run format` (Prettier).

Offline tools (Python 3, standard library; on Windows use `py` instead of `python`):

```
python tools/simulator/generate.py --all --seed 42    # regenerate public/seed/*.json
python -m unittest discover -s tools/tests
python -m unittest discover -s ml/tests
python ml/fetch_donki.py --verify                     # check the committed DONKI files, no network
python ml/fetch_donki.py --start 2010-01-01           # NASA DONKI download (done once; the files are committed)
```

Offline machine learning (Python packages in a virtual environment; steps and expected outputs in [ml/README.md](ml/README.md)):

```
python -m venv .venv                                  # then activate it
pip install -r ml/requirements.txt
python ml/build_dataset.py                            # labelled flares from the raw DONKI files
python ml/train_sep_risk.py --seed 42                 # model file, parity file, model card and plots
```

## Machine learning

`sep-risk` is a logistic regression on eight features of a solar flare and its linked coronal mass ejection, taken from NASA DONKI records. It scores a flare by how often similar flares were linked in DONKI to a solar particle event that an instrument observed. It was trained on the earlier years and tested once on held-out later years.

- The model card has the data, the label policy, the scores with their intervals, the comparison with two baselines, and the limitations: [ml/reports/sep-risk-v1.md](ml/reports/sep-risk-v1.md). Every number in it is written by `ml/train_sep_risk.py`. Its wording was corrected in A3 (text only; the model, the data and every number are unchanged): it calls the output a model output that the app shows as an experimental score, never a percent chance. The reliability plot's axis label still says "estimated chance", because the plot is a frozen A1 file.
- Labels: a flare is positive only when DONKI links it to an SEP record observed by an instrument. Flares with only model or unknown SEP evidence are left out. A negative means "no qualifying recorded SEP association", not that no particle event occurred.
- In the app the same model runs in the browser, in plain TypeScript, and a test checks it against Python on 50 flares from the held-out years. It can raise one watch-level alert, "Solar flare outlook: possible particle event", labeled "Model estimate". It never raises an act-level alert and never decides who leads the response. The alert for a particle event in progress replaces it.
- The app shows the model's output as an "Experimental model score" out of 100, not as a percent chance. On the held-out years the output was not well calibrated and most flagged flares were false alarms. The score is about recorded DONKI associations. It is not a validated probability of an event, and it does not measure anyone's radiation exposure.
- The model card screen in the app (`#/model/sep-risk`, linked from the alert as "How this model was made") reads every number from the model file. It calls the comparison with the gradient boosting benchmark inconclusive, because the interval of the difference includes zero.
- The demo scenario "A large solar flare this morning" replays a flare picked by a fixed rule: a flare from the held-out years that the model flags and that DONKI links to an observed particle event. The demo therefore shows a hit by construction. It is an illustration, not a measure of how often the model is right; the model card and the false-alarm count next to the score are.
- It is a prototype, not an operational forecast. DONKI describes its content as experimental research information.

`personal-pattern` is a second opinion that learns each crew member's own pattern across their daily readings, on board, with no outside data. It turns today's readings into z-scores against the person's own baseline, learns from the baseline days how those readings usually move together (Ledoit-Wolf shrinkage), and shows an insight, "Unusual pattern for you", when today's combination is more unusual than every baseline day.

- **It was evaluated only on simulated data** from this project's simulator, against the rules alone and scikit-learn's IsolationForest. The results show that the method works as designed on that simulator; they do not show that it notices real illness. The numbers, how they were made and the limits are in the model card, [ml/reports/personal-pattern-v1.md](ml/reports/personal-pattern-v1.md), written by `ml/eval_personal_pattern.py`, and on the app's model card screen (`#/model/personal-pattern`).
- An insight is never an alert. It never sets a status, never creates or hides an alert, never changes who leads the response and never sends anything by itself. A test checks that every scenario gives the same alerts, statuses and routes with and without the model. The crew may choose "Send to ground", which queues one consult marked private.
- The crew card shows no number and no percentage: three readings in words ("Sleep last night: lower than your normal"), the "Model estimate" tag and the note "Learned from your own readings. Tested only on simulated data. A second opinion only."
- The app runs the same steps as the Python code, in plain TypeScript, and a test matches them within 1e-9.
- The scenario "Several readings shift a little at once" (`pattern-shift`) was built to show an insight: four readings shift a little for three days, too little for any rule. The insight is there by construction; it is not a measure of how often the model notices such a change.

## Data

- **Simulated health data.** Every crew member, reading and scenario in `public/seed/` comes from `tools/simulator` (seed 42). The crew are fictional, and the app labels this data "Simulated". Two scenarios also replay real solar events from DONKI on the simulated mission timeline; the app marks them "Historical solar event", and `public/data/space-weather.json` lists the records.
- **NASA DONKI space weather records** (Space Weather Database Of Notifications, Knowledge, Information), from NASA's Community Coordinated Modeling Center (CCMC). They are in `ml/data/raw/donki/`: one gzip JSON file per record type and year, plus `meta.json` with every query. They train the `sep-risk` model, and they give two scenarios their real events: `solar-storm` uses SEP record `2023-08-08T01:00:00-SEP-001` and the flare `2023-08-07T20:30:00-FLR-001` that DONKI links to it, and `solar-flare-watch` uses the flare `2023-08-05T21:45:00-FLR-001`. Both flares are from the model's held-out test years.
  - Retrieved on 14 November 2026, 17:27 to 17:57 UTC (22:57 to 23:27 India time), from `https://ccmc.gsfc.nasa.gov/DONKI-API/get/`, with no API key. NASA CCMC's [official announcement](https://ccmc.gsfc.nasa.gov/news/major-updates/) documents this address as the replacement endpoint, with the migration announced for 30 September 2026. The download ran over a personal mobile hotspot, where this address answered. On the team's usual network the CCMC addresses had timed out.
  - DONKI refused every one-year request (HTTP 400). The downloader then fetched each month instead: 606 requests, all answered (HTTP 200).
  - Requested range: 2010-01-01 to 2026-10-31, and all 51 year files are present. Record counts: solar flares (FLR) 3399, coronal mass ejections (CME) 10332, solar energetic particle events (SEP) 494. The first records are dated April 2010 (FLR and CME) and August 2010 (SEP).
  - Limitations:
    - These are catalog entries, not counts of physical events. One particle event can have several SEP records, one per instrument or energy channel.
    - 140 of the 494 SEP records come from models (instrument names starting "MODEL:") rather than measurements. The `sep-risk` model learns only from SEP records observed by an instrument, as supported by official instrument documentation. Flares with only model or unknown SEP evidence are left out, not counted as negatives (decision D22 in ARCHITECTURE.md).
    - A month without records means DONKI listed none when the data was downloaded, not that nothing happened. This applies to 55 FLR months, 4 CME months and 117 SEP months, including all of 2018 and 2019 for SEP.
    - The files are a snapshot, and a later download may differ.
  - DONKI describes its content as experimental research information. Official U.S. space weather forecasts come from NOAA's Space Weather Prediction Center.

## Documents

- [ARCHITECTURE.md](ARCHITECTURE.md): the design, the milestones and the cut list
- [CLAUDE.md](CLAUDE.md): working rules for Claude Code in this repository
- [AI_USAGE.md](AI_USAGE.md): where and how AI was used
- [REFERENCES.md](REFERENCES.md): data, sources, libraries and tools
- [ml/README.md](ml/README.md): how to rebuild the dataset and the model
- [ml/reports/sep-risk-v1.md](ml/reports/sep-risk-v1.md): the model card of the `sep-risk` model
- [ml/reports/personal-pattern-v1.md](ml/reports/personal-pattern-v1.md): the model card of the `personal-pattern` model (simulated evaluation)
- [docs/body-model-handoff.md](docs/body-model-handoff.md): the 3D body model contract for the Blender work
