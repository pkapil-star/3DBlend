"""Self-check for a delivered body model, mirroring ARCHITECTURE.md section 23.9 (the app's
tools/check_body_model.py is the authority; this copy lets us check before sending). Standard library only.

python3 scripts/crew/check_crew.py export/crew/crew-a.glb --height-cm 175
"""
import argparse, json, os, struct, sys

NAMES = ["body", "patch_shoulder_r_outer", "sensor_chest", "sensor_upper_back", "sensor_forearm_l"]
BANNED_EXT = {"KHR_draco_mesh_compression", "EXT_meshopt_compression", "KHR_mesh_quantization"}


def read_glb(path):
    data = open(path, "rb").read()
    magic, version, length = struct.unpack_from("<4sII", data, 0)
    assert magic == b"glTF" and version == 2 and length == len(data), "not a GLB 2 container"
    off, js = 12, None
    while off < len(data):
        clen, ctype = struct.unpack_from("<II", data, off)
        if ctype == 0x4E4F534A:
            js = json.loads(data[off + 8: off + 8 + clen])
        off += 8 + clen
    return js


def is_identity(n):
    return (n.get("translation", [0, 0, 0]) == [0, 0, 0] and n.get("rotation", [0, 0, 0, 1]) == [0, 0, 0, 1]
            and n.get("scale", [1, 1, 1]) == [1, 1, 1] and "matrix" not in n)


def bounds(js, mesh_index):
    prims = js["meshes"][mesh_index]["primitives"]
    acc = [js["accessors"][p["attributes"]["POSITION"]] for p in prims]
    return ([min(a["min"][i] for a in acc) for i in range(3)], [max(a["max"][i] for a in acc) for i in range(3)])


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("glb")
    ap.add_argument("--height-cm", type=float, required=True)
    a = ap.parse_args()
    results = []

    def check(name, ok, detail=""):
        results.append(bool(ok))
        print(("PASS " if ok else "FAIL ") + name + (f"  ({detail})" if detail else ""))

    js = read_glb(a.glb)
    check("1 valid GLB, asset.version 2.0", js["asset"]["version"] == "2.0")
    nodes = {n.get("name"): n for n in js["nodes"]}
    missing = [n for n in NAMES if n not in nodes]
    check("2 node names present", not missing, f"missing {missing}" if missing else ", ".join(NAMES))
    extra = sorted(set(nodes) - set(NAMES))
    check("2b exactly these five objects", not extra, f"extra {extra}" if extra else "")
    if missing:
        sys.exit(1)
    used = set(js.get("extensionsUsed", []))
    check("3 no skins, animations, cameras or compression extensions",
          not js.get("skins") and not js.get("animations") and not js.get("cameras") and not (used & BANNED_EXT),
          f"extensions: {sorted(used) or 'none'}")
    check("4 mesh nodes have identity transforms", all(is_identity(n) for n in js["nodes"] if "mesh" in n))
    parented = [js["nodes"][c].get("name") for n in js["nodes"] for c in n.get("children", [])]
    check("4b nothing parented", not parented, f"children {parented}" if parented else "")
    check("4c empties have rotation 0 and scale 1",
          all(n.get("rotation", [0, 0, 0, 1]) == [0, 0, 0, 1] and n.get("scale", [1, 1, 1]) == [1, 1, 1]
              for n in js["nodes"] if "mesh" not in n))

    mins, maxs = bounds(js, nodes["body"]["mesh"])
    h = (maxs[1] - mins[1]) * 100
    check("5a height within 1 cm of the profile", abs(h - a.height_cm) <= 1.0, f"{h:.2f} cm, expected {a.height_cm:g}")
    check("5b lowest point within 1 cm of the ground", abs(mins[1] * 100) <= 1.0, f"{mins[1] * 100:.2f} cm")
    mid = (mins[0] + maxs[0]) / 2 * 100
    check("5c midline within 3 cm of x = 0", abs(mid) <= 3.0, f"{mid:.2f} cm")

    tris = sum(js["accessors"][p["indices"]]["count"] // 3 for m in js["meshes"] for p in m["primitives"])
    size = os.path.getsize(a.glb)
    check("6a at most 60,000 triangles", tris <= 60000, f"{tris}" + (" (WARNING: below 20,000)" if tris < 20000 else ""))
    check("6b file at most 4 MB", size <= 4 * 1024 * 1024, f"{size / 1e6:.2f} MB")

    pos = {n: nodes[n].get("translation", [0, 0, 0]) for n in NAMES[2:]}
    check("7a chest sensor in front of the upper-back sensor", pos["sensor_chest"][2] > pos["sensor_upper_back"][2],
          f"z {pos['sensor_chest'][2]:.3f} > {pos['sensor_upper_back'][2]:.3f}")
    pmin, pmax = bounds(js, nodes["patch_shoulder_r_outer"]["mesh"])
    pc = [(x + y) / 2 for x, y in zip(pmin, pmax)]
    check("7b shoulder patch on the right (x < 0), above 65% of the height",
          pc[0] < 0 and pc[1] > 0.65 * (maxs[1] - mins[1]), f"centre x {pc[0]:.3f}, y {pc[1]:.3f}")
    check("7c forearm sensor on the left (x > 0)", pos["sensor_forearm_l"][0] > 0, f"x {pos['sensor_forearm_l'][0]:.3f}")
    span = max(pmax[i] - pmin[i] for i in range(3)) * 100
    check("extra: patch at least about 6 cm across", span >= 6.0, f"{span:.1f} cm")
    check("extra: no materials, textures or images",
          not js.get("materials") and not js.get("textures") and not js.get("images"))
    print(f"\n{sum(results)}/{len(results)} checks passed: {a.glb}")
    sys.exit(0 if all(results) else 1)


if __name__ == "__main__":
    main()
