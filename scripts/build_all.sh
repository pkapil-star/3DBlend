#!/usr/bin/env bash
# Rebuilds the whole asset from the downloaded Z-Anatomy source, headless.
# Needs: Blender 5.3 (Flatpak org.blender.Blender, or set BLENDER=/path/to/blender), Node 22 + `npm install`.
set -euo pipefail
cd "$(dirname "$0")/.."
P="$PWD"
BLENDER=${BLENDER:-"flatpak run org.blender.Blender"}
SRC="$P/sources/z-anatomy/Z-Anatomy/Startup.blend"
[ -f "$SRC" ] || { echo "Missing $SRC: download Z-Anatomy.zip (see docs/README.md) and unzip it in sources/z-anatomy/"; exit 1; }
run() { echo "== $*"; $BLENDER --background "$@" 2>&1 | grep -E "^(EXTRACT|ASSEMBLE|APOSE|FINAL|EXPORT|VALIDATE|PREVIEW)|Traceback|Error:" ; }
run --disable-autoexec "$SRC" --python "$P/scripts/01_extract_zanatomy.py"
run --python "$P/scripts/02_assemble.py"
run "$P/build/stage2_assembled.blend" --python "$P/scripts/03_apose.py"
run "$P/build/stage3_apose.blend" --python "$P/scripts/04_finalize.py"
run "$P/blender/crew_health_check_master.blend" --python "$P/scripts/05_export.py"
run "$P/blender/crew_health_check_master.blend" --python "$P/scripts/06_validate_blend.py"
node "$P/viewer/validate_glb.mjs" "$P/export/astronaut_digital_twin.glb"
run "$P/blender/crew_health_check_master.blend" --python "$P/scripts/07_render_previews.py"
