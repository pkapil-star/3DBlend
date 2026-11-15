# Challenge resources

Recorded on 14 November 2026 from the Resources tab of the challenge page, "Create Health Monitoring Software for Astronauts on Space Missions" (NASA Space Apps Challenge 2026). The tab lists informational pages. It lists no datasets.

## NASA data and resources

| Resource | URL | Source ID | How the project uses it |
|---|---|---|---|
| 5 Hazards of Human Spaceflight | https://www.nasa.gov/hrp/hazards/ | `hrp-hazards` | Evidence for rules and "Why it matters in space" text (ARCHITECTURE.md sections 8.3 and 12) |
| Risks of Human Spaceflight | https://www.nasa.gov/hrp/risks/ | `hrp-risks` | Evidence for rules (section 12) |
| Ongoing HRP Research in Space | https://www.nasa.gov/hrp/ongoing-hrp-research/ | `hrp-ongoing-research` | Background; listed in `REFERENCES.md` and the source registry (the Library screen was cut on 14 November 2026) |

## Space agency partner resources

| Resource | URL | Source ID | How the project uses it |
|---|---|---|---|
| CSA: Monitoring Radiation for Astronaut Health | https://www.asc-csa.gc.ca/eng/news/articles/2026/2026-02-26-monitoring-radiation-astronaut-health.asp | `csa-radiation-monitoring-2026` | Context for the radiation features (sections 2 and 26); listed in `REFERENCES.md` and the source registry |
| CSA: Why Do We Conduct Science Experiments in Space? | https://www.asc-csa.gc.ca/eng/iss/science/why-do-we-conduct-science-experiments-in-space.asp | `csa-why-science` | Background; listed in `REFERENCES.md` and the source registry |

## Disclaimer on the tab

> NASA does not endorse any non-U.S. Government entity and is not responsible for information contained on non-U.S. Government websites. For non-U.S. Government websites, participants must comply with any data use parameters of that specific website.

## What this means for the project

- No dataset is listed, so the training data stay as planned: NASA DONKI for the solar particle event risk model (ARCHITECTURE.md sections 25 and 26), PhysioNet ICU data for the Earth hospital model (section 26.19), and each crew member's own readings for the personal pattern model, which learns on board (section 26.18).
- The CSA pages and PhysioNet are non-U.S. Government websites, so their data use terms apply. The project only links to and cites the CSA pages. PhysioNet data follow the dataset's license (the AWS Open Data registry lists Creative Commons Attribution 4.0; confirm it on the PhysioNet page) and are never committed to the repository (decision D21).
- All five items are in the evidence registry (section 17) and go into `REFERENCES.md`. In `src/data/sources.json` their `verified` flag stays `false` until a team member has opened the page and confirmed what the app says about it.
