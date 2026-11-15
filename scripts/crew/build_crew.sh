#!/usr/bin/env bash
# Builds and checks the two contract body models (ARCHITECTURE.md section 23): export/crew/crew-a.glb, crew-b.glb.
# Needs the CC0 Blender Studio Human Base Meshes bundle unzipped in sources/human-base-meshes/bundle/.
set -euo pipefail
cd "$(dirname "$0")/../.."
P="$PWD"
BLENDER=${BLENDER:-"flatpak run org.blender.Blender"}
SRC="$P/sources/human-base-meshes/bundle/human-base-meshes-bundle-v1.4.1/human_base_meshes_bundle.blend"
if [ ! -f "$SRC" ]; then
  mkdir -p "$P/sources/human-base-meshes" && cd "$P/sources/human-base-meshes"
  curl -sSL -o bundle.zip https://download.blender.org/demo/asset-bundles/human-base-meshes/human-base-meshes-bundle-v1.4.1.zip
  unzip -o -q bundle.zip -d bundle && cd "$P"
fi
for c in a b; do
  echo "== crew-$c"
  $BLENDER --background --factory-startup --python "$P/scripts/crew/build_crew.py" -- crew=$c 2>&1 | grep -E "^CREW (it|done)|Traceback|Error:" | cut -c1-200
  python3 "$P/scripts/crew/check_crew.py" "$P/export/crew/crew-$c.glb" --height-cm 175
done
