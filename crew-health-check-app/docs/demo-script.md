# Demo script

First draft, written in milestone M4 (14 November 2026). Milestone A2 (15 November 2026) added the radiation outlook step before the decisive moment. M8 adds the person, the second opinion and the body steps, with timings, and runs the whole script on the deployed site.

The crew members and their health readings are simulated, and the crew members are fictional. Two scenarios also replay real solar events from NASA's DONKI catalog; the app marks them "Historical solar event". The app is a prototype, not a medical device. Say all three out loud once.

## Before you start

- Open https://void-shifters.vercel.app/ in a fresh browser window, at 1024 by 768 or larger, zoom 100%.
- Keep the fallback ready: Divyanshu's screen capture of this exact flow. It is not recorded yet (pending).
- If the app shows an earlier demo's state, press Shift+D and load the scenario again: loading resets the readings, ticks and outbox.

## The radiation outlook: a model score with its limits (about one minute)

| Step | Do | The audience sees | Say |
|---|---|---|---|
| 1 | Press Shift+D, or choose "Presenter tools" in the footer. Under "A large solar flare this morning: the model outlook", choose "Load". | Home for Crew member A on mission day 150, in the Mars transit vehicle. A Watch alert, "Solar flare outlook: possible particle event", with the tag "Model estimate". Above it: "Historical solar event". | "This morning a large solar flare was recorded. The flare is real: it is in NASA's DONKI catalog, and we replay it on a simulated mission. The crew and their readings are simulated." |
| 2 | Open the alert. | "Who leads: You can handle this yourself." Under "What changed": "Experimental model score", a number out of 100, three factors in words, and the box "About this score". | "A small model, trained on NASA's records of past flares, scores this flare. It is a prompt to get ready, not a forecast. Read the box: false alarms are frequent, and the score is not a validated probability or a measure of anyone's radiation exposure." |
| 3 | Move the delay slider to the right end (keyboard: End). | "22 min each way (Mars far)". The banner does not change. | "However far away the crew is, a model never decides who leads and never raises an Act alert. It can only raise this one watch-level prompt." |
| 4 | Choose "How this model was made". | The model card: the held-out results, the false-alarm count, the comparison marked "inconclusive", and "Why it is a score, not a percent chance". | "Every number here is read from the model's own file. On the held-out years most of the flares it flagged were false alarms, and the comparison with a larger benchmark model is inconclusive. We show that instead of hiding it." |

Facts behind the talking points, so nobody improvises a number:

- Read every model number from the screen or from `ml/reports/sep-risk-v1.md`. Never quote one from memory.
- Never say "chance", "probability", "predicts" or "will" about the score. Say "experimental model score" and "possible".
- The flare is `2023-08-05T21:45:00-FLR-001`. It was picked by a fixed rule as a flare from the held-out years that the model flags and that DONKI links to an observed particle event. The demo therefore shows a hit by construction. If asked how often the model is right, point to the false-alarm count on the screen.
- The model is a logistic regression on eight features of the flare and its linked coronal mass ejection. It is not "AI that predicts radiation".

## The decisive moment: one alert, two answers (about one minute)

| Step | Do | The audience sees | Say |
|---|---|---|---|
| 1 | Press Shift+D, or choose "Presenter tools" in the footer. Under "A solar particle event starts today", choose "Load". | Home for Crew member A on mission day 120, on the space station. An Act alert, "Solar particle event in progress", with "Start now: Stop your current task and make it safe." The outlook alert is gone. | "A solar particle event has just started. This crew is on the space station. The event in progress replaces the outlook." |
| 2 | Open the alert. | The banner "Who leads": "Consult the ground. Reply expected in about 5 min." Under it: "Start the first steps now. The reply estimate is not a reason to wait.", then the first two steps. | "Close to Earth, an answer comes back in minutes, so the ground leads. The crew still starts the first steps right away." |
| 3 | In the header, set Environment to "Mars transit vehicle". | The delay slider appears at "3 min each way (Mars near)". The banner: "Consult the ground. Reply expected in about 11 min." | "Now the same crew is on the way to Mars. At the nearest point, a signal takes about three minutes each way." |
| 4 | Move the slider to the right end (keyboard: End). | "22 min each way (Mars far)". The banner turns to "Act now on board. A reply from Earth would take about 49 min." The first steps stay where they were. A second line appears: "Queued for Earth: a report". | "At the far point, the answer would take about 49 minutes. The prototype gives this alert 30 minutes to act, so the crew leads and Earth gets a report instead of a question. The steps never move: only who leads changes." |
| 5 | Scroll to "What to do" and "Evidence". | The checklist with the "Draft guidance" tag and its note, the basis tag "Illustrative threshold", the NASA sources and their "Unverified source" tags. | "Every alert shows where its numbers come from and how firm they are. These steps are drafts: no health adviser has reviewed them yet." |
| 6 | Scroll to "Also contributing". | "Solar flare outlook: possible particle event" with its experimental model score and the "Model estimate" tag. | "Yesterday's flare had already raised the outlook. It is listed here, under the alert that replaced it." |

Facts behind the talking points, so nobody improvises a number:

- The Mars one-way delay ranges up to about 22 minutes (`delay-nasa-m2m-2023`; light-time figures in `delay-nasa-timedelay-2017`). The slider runs from 180 s to 1320 s.
- The 5 minutes the ground needs to answer, and the station's 0 s delay, are prototype assumptions, not measured values. The banner says so.
- The 30 minutes to act comes from the prototype's rule `R-RAD-01` (`timeToActMin`); it is a design value of this prototype, not a published figure.
- The timing of this scenario comes from the real DONKI particle event `2023-08-08T01:00:00-SEP-001` and the X1.5 flare DONKI links to it. The crew and their readings are simulated.

## Not in this step yet

- The countdown to the expected reply and the Earth link screen (M6).
