"""Shape-key displacement fields for the heart and the lungs (animation controls only).

The fields are plain functions of position, so the same keys can be rebuilt on the
decimated web meshes. Nothing here models physiology: Heart_Contract is a visual squeeze,
Lungs_Inhale / Lungs_Exhale a visual expansion / relaxation.
"""
import numpy as np

HEART_OBJECTS = ("ORG_Heart_LeftVentricle", "ORG_Heart_RightVentricle", "ORG_Heart_LeftAtrium", "ORG_Heart_RightAtrium",
                 "ORG_Heart_Septum", "ORG_Heart_Valves", "VESSEL_CoronaryArteries", "VESSEL_CardiacVeins")
LUNG_OBJECTS = ("ORG_Lung_L_SuperiorLobe", "ORG_Lung_L_InferiorLobe", "ORG_Lung_R_SuperiorLobe",
                "ORG_Lung_R_MiddleLobe", "ORG_Lung_R_InferiorLobe")
DIAPHRAGM = "MUSCLE_Diaphragm"
HEART_KEYS = ("Heart_Basis", "Heart_Contract")
LUNG_KEYS = ("Lungs_Basis", "Lungs_Inhale", "Lungs_Exhale")
EXHALE_FACTOR = -0.45

def smoothstep(a, b, x):
    t = np.clip((x - a) / (b - a), 0.0, 1.0)
    return t * t * (3.0 - 2.0 * t)

def world_points(ob):
    a = np.empty(len(ob.data.vertices) * 3, np.float32)
    ob.data.vertices.foreach_get("co", a)
    return a.reshape(-1, 3) + np.array(ob.matrix_world.translation, np.float32)

def compute_params(objs):
    """objs: name -> object (undecimated master meshes)."""
    valves = world_points(objs["ORG_Heart_Valves"])
    vent = np.concatenate([world_points(objs["ORG_Heart_LeftVentricle"]), world_points(objs["ORG_Heart_RightVentricle"])])
    base = valves.mean(0)
    apex = vent[np.linalg.norm(vent - base, axis=1).argmax()]
    lungs = np.concatenate([world_points(objs[n]) for n in LUNG_OBJECTS])
    return {
        "heart": {"base": [float(v) for v in base], "apex": [float(v) for v in apex], "radial": 0.14, "longitudinal": 0.07},
        "lungs": {"z_top": float(lungs[:, 2].max()), "z_bottom": float(lungs[:, 2].min()),
                  "y_centre": float(lungs[:, 1].mean()), "down": 0.012, "out": 0.007},
    }

def heart_contract(p, prm):
    base, apex = np.array(prm["base"], np.float32), np.array(prm["apex"], np.float32)
    axis = apex - base
    length = float(np.linalg.norm(axis))
    axis /= length
    rel = p - base
    along = rel @ axis
    t = along / length                                   # 0 at the valve plane, 1 at the apex
    radial = rel - np.outer(along, axis)
    squeeze = smoothstep(0.02, 0.45, t)[:, None]         # nothing moves at the base: great vessels stay attached
    lift = smoothstep(0.0, 1.0, t)[:, None]
    return (-prm["radial"] * squeeze * radial - prm["longitudinal"] * length * lift * axis).astype(np.float32)

def lungs_inhale(p, prm):
    d = np.zeros_like(p)
    wz = smoothstep(0.0, 1.0, (prm["z_top"] - p[:, 2]) / (prm["z_top"] - prm["z_bottom"]))   # 0 apex, 1 base
    d[:, 2] = -prm["down"] * wz
    h = p[:, :2] - np.array([0.0, prm["y_centre"]], np.float32)
    dist = np.maximum(np.linalg.norm(h, axis=1), 1e-6)
    wr = smoothstep(0.02, 0.10, dist) * (0.35 + 0.65 * wz)   # the mediastinal surface stays put
    out = prm["out"] * wr[:, None] * (h / dist[:, None])
    out[:, 1] *= np.where(h[:, 1] > 0, 0.25, 1.0)           # the back of the chest barely moves
    d[:, :2] += out
    return d.astype(np.float32)

def diaphragm_inhale(p, prm):
    d = np.zeros_like(p)
    d[:, 2] = -prm["down"] * smoothstep(prm["z_bottom"] - 0.08, prm["z_bottom"], p[:, 2])   # dome moves, rim is fixed
    return d.astype(np.float32)

def set_keys(ob, basis_name, keys):
    """keys: list of (name, displacement array in world axes)."""
    if ob.data.shape_keys:
        ob.shape_key_clear()
    ob.shape_key_add(name=basis_name, from_mix=False)
    n = len(ob.data.vertices)
    base = np.empty(n * 3, np.float32)
    ob.data.vertices.foreach_get("co", base)
    for name, disp in keys:
        k = ob.shape_key_add(name=name, from_mix=False)
        k.data.foreach_set("co", (base.reshape(-1, 3) + disp).ravel())
        k.value, k.slider_min, k.slider_max = 0.0, 0.0, 1.0
    ob.data.shape_keys.name = "KEYS_" + ob.name
    ob.active_shape_key_index = 0

def apply_all(objs, params):
    """(Re)build every heart / lung shape key. objs: name -> object. Returns the names touched."""
    done = []
    for name in HEART_OBJECTS:
        ob = objs.get(name)
        if ob:
            set_keys(ob, HEART_KEYS[0], [(HEART_KEYS[1], heart_contract(world_points(ob), params["heart"]))])
            done.append(name)
    for name in LUNG_OBJECTS + (DIAPHRAGM,):
        ob = objs.get(name)
        if ob:
            p = world_points(ob)
            disp = diaphragm_inhale(p, params["lungs"]) if name == DIAPHRAGM else lungs_inhale(p, params["lungs"])
            set_keys(ob, LUNG_KEYS[0], [(LUNG_KEYS[1], disp), (LUNG_KEYS[2], disp * EXHALE_FACTOR)])
            done.append(name)
    return done
