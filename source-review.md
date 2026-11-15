# Source review (milestone M1)

Final status, 14 November 2026: Divyanshu approved the corrections and wording below, and they are applied to `src/data/`. **Every source keeps `verified: false`** until a team member has checked the relevant claim. This review checks that each source says what the app cites. It is not clinical validation, approval of a draft is not clinical validation, and thresholds marked `illustrative` stay illustrative. No health adviser has reviewed any rule or protocol yet.

Checked by Claude Code through the Europe PMC API, PubMed Central article pages, the NIDDK website, the NASA website and a web fetch service. Quotes are verbatim. NASA NTRS (`ntrs.nasa.gov`) did not answer, either from the team's network or through the fetch service.

## 1. `bp-norsk-2015`: supported, corrected

Norsk P, Asmar A, Damgaard M, Christensen NJ. Fluid shifts, vasodilatation and ambulatory blood pressure reduction during long duration spaceflight. *J Physiol.* 2015;593(Pt 3):573-584. DOI 10.1113/jphysiol.2014.284869, PMID 25774397, PMCID PMC4324706.

- Abstract: "The 24 h average systolic, diastolic and mean arterial pressures (mean ± se) in space were reduced by 8 ± 2 mmHg" ... "9 ± 2 mmHg (P < 0.001) and 10 ± 3 mmHg (P = 0.006), respectively."
- Abstract: "heart rate and catecholamine concentrations were unchanged"
- Results: "The mean 24 h heart rate was unchanged by spaceflight (64 ± 2 beats min–1 versus 63 ± 2 beats min–1)"
- Results (a nuance): "The lowest value, however, with the least variation ... was observed during the sleep period (night) in space (58 ± 1 beats min–1), which was significantly different to the in-flight ambulatory day-time period (64 ± 3 beats min–1; P = 0.034)"

Applied: URL `https://pmc.ncbi.nlm.nih.gov/articles/PMC4324706/`; key finding "In eight astronauts on the station, 24-hour average blood pressure was 8 to 10 mmHg lower in flight than before flight (systolic 8, diastolic 9, mean arterial 10 mmHg); the 24-hour average heart rate was unchanged." The app text describes this as one study's observation, not a change in every astronaut.

## 2. `insulin-commsbio-2024`: supported, corrected

Mathyk BA, Tabetah M, Karim R, et al. Spaceflight induces changes in gene expression profiles linked to insulin and estrogen. *Communications Biology* 2024;7:692, published 11 June 2024. DOI 10.1038/s42003-023-05213-2, PMID 38862620, PMCID PMC11166981.

- Introduction: "The presence of insulin resistance during spaceflight has been reported, and sex differences play a role, with female astronauts displaying better Homeostatic Model Assessment for Insulin Resistance (HOMA-IR) values than male astronauts"
- Introduction: "A few published studies show insulin resistance parameters may change during spaceflight but data are conflicting, suggesting either decreased insulin or no change"

Applied: the real title and the DOI link; key finding unchanged. It is background for the glucose indicator only, not a source for the cut-off or for treatment (section 4).

## 3. `sleep-barger-2014`: supported, corrected

Barger LK, Flynn-Evans EE, Kubey A, Walsh L, Ronda JM, Wang W, Wright KP, Czeisler CA. Prevalence of sleep deficiency and use of hypnotic drugs in astronauts before, during, and after spaceflight: an observational study. *Lancet Neurol.* 2014;13(9):904-912. DOI 10.1016/S1474-4422(14)70122-X, PMID 25127232, PMCID PMC4188436.

- Abstract, Findings: "Crew members on ISS missions obtained significantly less sleep during spaceflight (6·09 h [0·67])"
- Abstract, Findings: "during space shuttle missions (7·35 h [SD 0·47] attempted, 5·96 h [0·56] obtained)"
- Discussion: "sleep deficiency is pervasive among crewmembers despite NASA regulations that mandate 8·5 hours of protected time for sleep each night"
- Abstract, Interpretation: "Because chronic sleep loss leads to performance decrements, our findings emphasise the need for development of effective countermeasures to promote sleep."

Applied: the paper's title, publisher "The Lancet Neurology", the PMC link, and the key finding "Wrist actigraphy showed about 6 hours of sleep a night in flight (ISS 6.09 h, shuttle 5.96 h), although NASA rules set aside 8.5 hours for sleep."

## 4. `hypoglycemia-ada-2025`: the clinical source for the glucose cut-off and protocol

American Diabetes Association Professional Practice Committee. 6. Glycemic Goals and Hypoglycemia: Standards of Care in Diabetes—2025. *Diabetes Care* 2025 (Supplement 1). DOI 10.2337/dc25-s006, PMID 39651981, PMCID PMC11635034. A clinical practice guideline.

- "Level 1 hypoglycemia is defined as a measurable glucose concentration <70 mg/dL (<3.9 mmol/L) and ≥54 mg/dL (≥3.0 mmol/L). A blood glucose concentration of 70 mg/dL (3.9 mmol/L) has been recognized as a threshold for adrenergic responses to falling glucose in people without diabetes."
- Recommendation 6.15: "Glucose is the preferred treatment for the conscious individual with glucose <70 mg/dL (<3.9 mmol/L), although any form of carbohydrate that contains glucose may be used. Avoid using foods or beverages high in fat and/or protein for initial treatment of hypoglycemia. Fifteen minutes after initial treatment, repeat the treatment if hypoglycemia persists."
- "For most individuals, 15 g carbohydrates should be ingested." ... "Pure glucose is the preferred initial treatment, but any form of carbohydrate that contains glucose will raise blood glucose."
- "Individuals should be counseled to recheck their glucose 15 min after ingesting carbohydrates and to repeat carbohydrate ingestion and seek care for ongoing hypoglycemia."
- "Symptoms of hypoglycemia include, but are not limited to, shakiness, irritability, confusion, tachycardia, sweating, and hunger" and "Level 3 hypoglycemia may be recognized or unrecognized and can progress to loss of consciousness, seizure, coma, or death."
- On people who cannot eat or drink, the guideline names a medication for "people unable or unwilling to consume carbohydrates by mouth". The app names no medication: the protocol says nothing by mouth and calls the crew medical officer.

Corroborated by NIDDK, "Low Blood Glucose (Hypoglycemia)", last reviewed July 2021: "For many people with diabetes, this means a blood glucose reading lower than 70 milligrams per deciliter (mg/dL)", "Wait 15 minutes and check your blood glucose level again", "Severe hypoglycemia is dangerous and needs to be treated right away", and "If your blood glucose level drops very low, you won't be able to treat it by yourself." Not added to the registry.

How the app uses it: `R-GLU-02` cites it for the cut-off (basis `clinical-general`; threshold unchanged at below 70 mg/dL), with `insulin-commsbio-2024` as background. `P-GLU-LOW` is a draft adaptation (ARCHITECTURE.md section 18). The guideline says 15 g "for most individuals"; the protocol says "for most people", matching it. These are Earth guidelines written mainly for people with diabetes, used here as a terrestrial safety net, not as a spaceflight-validated protocol.

## 5. `gateway-medical-conops`: the Moon delay, excerpt supplied by Divyanshu

NASA HRP-48012, Recommendation for a Medical System Concept of Operations for Gateway Missions, NTRS 20200001341, page 17, section 4.2 "Communication": "an average one-way light-time delay of approximately 1.3 seconds."

Divyanshu supplied this excerpt during the M1 review. Direct retrieval of the PDF failed from the team's network and through the fetch service, so Claude Code has not read the page itself. `verified` stays false pending the human check. The app describes 1.3 s as the approximate light-travel time, not the total communication latency.

## 6. `radiation-nasa-ochmo`: wording checked for `R-RAD-01`

The NASA-STD-3001 technical brief (downloaded from nasa.gov and searched as text) says:

- "short - term radiation exposure to solar particle events is limited to an effective dose of 250 mSv per event to minimize acute effects."
- "[V1 4031] The program shall protect crewmembers from exposure to the design reference solar particle event (SPE) environment proton energy spectrum (sum of the October 1989 events) to less than a NASA effective dose of 250 mSv."

`R-RAD-01` now describes 250 mSv as a protection requirement for the design-reference event: it does not trigger the alert and is not a dose considered harmless. `verified` stays false.

## 7. Still unchecked

`delay-nasa-timedelay-2017` (title placeholder; 182 s and 1338 s figures), `sleep-nasa-ntrs-2024` and `delay-nasa-m2m-2023`: all on NTRS, not reachable on 14 November. Not retried further during M1, as agreed.

## 8. App text reworded to match the sources (all approved by Divyanshu)

| Where | Draft | Final |
|---|---|---|
| `R-SLEEP-01` `whySpace` | ... Sleep loss slows reactions before you feel it. | ... Long-term sleep loss lowers performance. |
| `blood_glucose` `whyInSpace` | ... Trend matters more than a single value. | Sentence removed (no source). |
| `systolic_bp`, `diastolic_bp` | Ambulatory pressure is about 10 mmHg lower on long flights as fluid shifts headward and vessels relax. | In one study of eight astronauts on long flights, average 24-hour blood pressure was about 8 to 10 mmHg lower than before flight; the authors linked this to fluid shifting toward the head and blood vessels relaxing. |
| `heart_rate` | Heart rate stayed about the same in that study, so a sustained change from your own normal is worth attention. | In one study of eight astronauts on long flights, average 24-hour heart rate stayed about the same as before flight, so a lasting change from your own normal is worth checking. |
| `body_temp` | ... so an Earth fever cut-off gives false alarms. | In one study, resting core temperature rose about 1 °C over roughly 2.5 months in orbit, so the app compares readings with your own in-flight normal as well as with a fixed upper limit. |
| `reaction_time` | Sleep loss slows reactions before people notice it. Our test is a simplified vigilance check, not a validated instrument. | Long-term sleep loss lowers performance. Our test is a simplified check, not a validated instrument. |
| `R-TEMP-01` `whySpace` | ... not an Earth cut-off. | In one study, resting core temperature ran about 1 °C higher on long missions, so this check compares you with your own in-flight normal. |

## 9. Labels and assumptions

- `R-TEMP-02` basis is `illustrative` (approved): its 2.0 °C rise is a draft value and the registry has no clinical source for 39.0 °C. Thresholds unchanged.
- Time-to-act values and protocol timings without direct support are illustrative, not clinically validated.
- The station's 0 s delay and the 5-minute ground-handling allowance are prototype assumptions, not measured guarantees.
- CO2 evidence reads "Cabin CO2, today's worst 1-hour average"; NASA's 3 mmHg limit applies to a 1-hour average.
- An act alert routed to the ground still starts on board; the reply estimate is never permission to wait.
- Every protocol carries a `note` (why it is a draft, which timings are illustrative) that the protocol screen must show with the "Draft guidance" tag.

## 10. Not reviewed yet (not used by any M1 rule)

`immune-herpes-iss` (journal unknown), `osdr-i4-nasa` (title), `sep-ml-inceoglu-2018` and `sep-gsep-2023` (journal references). They are checked before the milestones that use them (M7, A1, B1).
