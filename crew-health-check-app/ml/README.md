# Offline machine learning (`ml/`)

Everything here runs offline, before the app is built. The app never imports from this folder: the only bridge is the generated model file in `src/data/models/`.

Design: ARCHITECTURE.md sections 25 and 26. Label policy: decision D22 in section 3.

## What is here

| File | What it does | Needs |
|---|---|---|
| `fetch_donki.py` | Downloads the NASA DONKI records into `data/raw/donki/`. Done once; the files are committed | Python standard library |
| `sep_instrument_classes.json` | Which SEP instrument names count as observed, model or unknown, with the documentation read for each | none (a reviewed table) |
| `features.py` | The eight features of the `sep-risk` model. The app's `sepRisk.ts` mirrors it | Python standard library |
| `build_dataset.py` | Labels the flares and writes `data/processed/` | Python standard library |
| `train_sep_risk.py` | Trains, evaluates and exports the model | the packages in `requirements.txt` |
| `personal_pattern.py` | The personal pattern model: baseline z-scores, Ledoit-Wolf shrinkage, distance, leave-one-out threshold, contributions. The app's `personalPattern.ts` mirrors it | the packages in `requirements.txt` |
| `eval_personal_pattern.py` | The simulated evaluation of the personal pattern model, and its export | the packages in `requirements.txt`, and `tools/simulator` |
| `fetch_physionet_sepsis.py` | Downloads the PhysioNet 2019 challenge files into `data/raw/physionet/` and checks them; `--verify` re-checks offline. The patient files are never committed; `meta.json` is | Python standard library |
| `build_hospital_dataset.py` | Baselines, exclusions, carried-forward values, z-features and the patient-level split; writes row-level files to the ignored `data/processed/hospital/` and the counts-only `data/processed/hospital_dataset_summary.json` | the packages in `requirements.txt` |
| `train_earth_hospital.py` | Trains, evaluates and exports the Earth hospital model | the packages in `requirements.txt` |
| `tests/` | Tests for all of the above | the packages in `requirements.txt` for the training tests |

## Reproduce

Windows PowerShell (Python is `py`; on macOS and Linux use `python3` and `source .venv/bin/activate`):

```
py -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r ml/requirements.txt

python ml/fetch_donki.py --verify        # checks the committed raw files; no network
python ml/build_dataset.py
python ml/train_sep_risk.py --seed 42
python ml/eval_personal_pattern.py --seed 42
python ml/fetch_physionet_sepsis.py                     # about 16 minutes, 40,336 files; never committed
python ml/build_hospital_dataset.py
python ml/train_earth_hospital.py --seed 42
python -m unittest discover -s ml/tests
```

No download is needed: the raw DONKI files are in the repository. Nothing here changes them.

## Expected outputs

`python ml/build_dataset.py` writes two files and prints the counts it wrote:

- `ml/data/processed/flares.csv`: one row per eligible flare (class M1.0 or above), with its features, its label status (`positive`, `negative` or `ambiguous`), the SEP records it reaches and its split.
- `ml/data/processed/dataset_summary.json`: the instrument inventory with classes and sources, SEP record classes and flare labels by year and by split, drop reasons, and the split boundaries.

Running it twice gives byte-identical files.

`python ml/train_sep_risk.py --seed 42` writes, in a few seconds:

- `ml/artifacts/sep-risk-v1.json`: the model file. `src/data/models/sep-risk-v1.json` is a copy of it for the app.
- `ml/artifacts/sep-risk-v1-parity.json`: up to 50 test flares with their inputs, features and estimate. The app's TypeScript model must reproduce them.
- `ml/reports/sep-risk-v1.md`: the model card, with three plots next to it (`-roc.png`, `-reliability.png`, `-coefficients.png`).

It prints the split sizes, the chosen `C`, the threshold and the test scores. Running it twice gives the same model file apart from `createdAt`.

`python ml/eval_personal_pattern.py --seed 42` writes, in about a minute:

- `src/data/models/personal-pattern-v1.json`: the model file the app loads: the settings (two of them design values), the wording of the insight, and the simulated evaluation with every rate, count and 95% interval.
- `ml/artifacts/personal-pattern-v1-parity.json`: six z-score matrices and four whole histories with the expected numbers. The app's TypeScript model must reproduce them within 1e-9.
- `ml/reports/personal-pattern-v1.md`: the model card.

The evaluation uses simulated data only, made with `tools/simulator/model.py`; nothing is downloaded. It prints its findings in words. Running it twice gives the same model file apart from `createdAt`.

`python -m unittest discover -s ml/tests` ends with `OK`. It takes about a minute and a half, because one test runs the whole personal pattern evaluation to check the committed files. Without the virtual environment the training tests are skipped and the last line says how many; inside it nothing is skipped.

## Rules

- Never type or edit a number in `ml/artifacts/`, `ml/reports/`, `ml/data/processed/` or `src/data/models/`. Run the scripts again.
- The scaler and the coefficients come from the training years only. `C` and the threshold are chosen on the validation years only. The test years are scored once; nothing is chosen from them.
- A flare is positive only when DONKI links it, directly or through one linked CME, to an SEP record observed by an instrument. A flare with only model or unknown SEP evidence is excluded as ambiguous. A negative means "no qualifying recorded SEP association", not that no particle event occurred.
- A new instrument name in a later download is `unknown` until `sep_instrument_classes.json` records official documentation for it.
- A retrain that changes any coefficient becomes `v2` with new files.
- The personal pattern evaluation is simulated, and every place that shows its results says so. Never change a shift, a size or a scenario to make the results look better.
- PhysioNet patient files and row-level hospital data never go into git (decision D21). Before every commit that touches `ml/`, `git status` must show no file under `data/raw/physionet/` other than `meta.json`, and nothing under `data/processed/hospital/`. Parity files hold synthetic numbers only.
- Hospital B is the external test: nothing is chosen from it. C and the threshold come from hospital A validation patients.

Data credit: NASA Community Coordinated Modeling Center (CCMC), DONKI. DONKI describes its content as experimental research information.
