"""Shared helpers for the crew body models (contract: ARCHITECTURE.md section 23 / body-model-handoff.md).

Landmarks and measurements are taken on the mesh itself, Blender axes: +Z up, body faces -Y, body's right at -X.
"""
import numpy as np
import bmesh
from mathutils import geometry


def coords(obj):
    me = obj.data
    a = np.empty(len(me.vertices) * 3, np.float64)
    me.vertices.foreach_get("co", a)
    return a.reshape(-1, 3)


def set_coords(obj, co):
    obj.data.vertices.foreach_set("co", co.astype(np.float32).ravel())
    obj.data.update()


def arm_mask(co, side):
    """Vertices of one arm (side=+1 left/+X, -1 right/-X), below the armpit, plus the hand."""
    H = co[:, 2].max()
    s = co[:, 0] * side
    return (s > 0.19 * H / 1.75) & (co[:, 2] < 0.80 * H) & (co[:, 2] > 0.35 * H)


def arm_joints(co, side):
    """Elbow and wrist joint centres from the radius profile along the arm's principal axis."""
    pts = co[arm_mask(co, side)]
    c = pts.mean(0)
    axis = np.linalg.svd(pts - c)[2][0]
    if axis[2] > 0:
        axis = -axis  # point down the arm
    t = (pts - c) @ axis
    bins = np.linspace(t.min(), t.max(), 61)
    rad, cen = [], []
    for a, b in zip(bins[:-1], bins[1:]):
        p = pts[(t >= a) & (t < b)]
        if len(p) < 8:
            rad.append(np.inf); cen.append(None); continue
        m = p.mean(0)
        d = (p - m) - np.outer((p - m) @ axis, axis)
        rad.append(np.sqrt((d ** 2).sum(1)).mean()); cen.append(m)
    rad = np.array(rad)
    n = len(rad)
    # wrist: narrowest section in the distal part (before the hand widens); elbow: narrowest around mid-arm
    wi = int(np.argmin(rad[int(0.55 * n):int(0.85 * n)])) + int(0.55 * n)
    ei = int(np.argmin(rad[int(0.15 * n):int(0.45 * n)])) + int(0.15 * n)
    return np.array(cen[ei]), np.array(cen[wi]), axis


def section(obj, z, exclude=None):
    """(x, y) points of the horizontal mesh section at height z, optionally without the masked vertices."""
    b = bmesh.new()
    b.from_mesh(obj.data)
    if exclude is not None:
        b.verts.ensure_lookup_table()
        bmesh.ops.delete(b, geom=[b.verts[i] for i in np.flatnonzero(exclude)], context="VERTS")
    bmesh.ops.bisect_plane(b, geom=b.verts[:] + b.edges[:] + b.faces[:], dist=1e-7,
                           plane_co=(0, 0, z), plane_no=(0, 0, 1), clear_inner=True, clear_outer=True)
    pts = np.array([(v.co.x, v.co.y) for v in b.verts])
    b.free()
    return pts


def tape(obj, z, exclude=None):
    """Tape-measure circumference (convex hull) at height z."""
    pts = section(obj, z, exclude)
    if len(pts) < 3:
        return 0.0
    hull = geometry.convex_hull_2d([tuple(p) for p in pts])
    return float(sum(np.linalg.norm(pts[hull[i]] - pts[hull[(i + 1) % len(hull)]]) for i in range(len(hull))))


def crotch_z(obj, co):
    """Lowest height (above the knees) at which the section crosses the midline."""
    H = co[:, 2].max()
    z = 0.35 * H
    while z < 0.6 * H:
        p = section(obj, z)
        if len(p) and np.any(np.abs(p[:, 0]) < 0.004):
            return z
        z += 0.002
    raise RuntimeError("crotch not found")


def measure(obj):
    """Contract measurements (metres) and the landmarks they were taken from."""
    co = coords(obj)
    H = float(co[:, 2].max() - co[:, 2].min())
    arms = arm_mask(co, 1) | arm_mask(co, -1)
    trunk_excl = arms | (np.abs(co[:, 0]) > 0.17 * H / 1.75)  # tape runs under the armpits
    zc = crotch_z(obj, co)
    out = {"height": H, "inseam": zc - co[:, 2].min()}
    band = (co[:, 2] > 0.79 * H) & (co[:, 2] < 0.83 * H)  # outermost skin of the shoulders (deltoids)
    xr, xl = co[band, 0].min(), co[band, 0].max()
    lm = {"crotch": np.array((0.0, 0.0, zc))}
    ua, fa = [], []
    for side, tag in ((1, "l"), (-1, "r")):
        e, w, _ = arm_joints(co, side)
        sx = (xl if side > 0 else xr) - side * 0.04 * H / 1.75
        near = np.abs(co[:, 0] - sx) < 0.01
        top = co[near][co[near, 2].argmax()]  # top of the shoulder
        ua.append(np.linalg.norm(top - e)); fa.append(np.linalg.norm(e - w))
        lm.update({"shoulder_top_" + tag: top, "elbow_" + tag: e, "wrist_" + tag: w})
    # shoulder breadth: between the tops of the two shoulders (acromion level), not across the deltoid bulge
    out["shoulder_breadth"] = float(lm["shoulder_top_l"][0] - lm["shoulder_top_r"][0])
    out["upper_arm"], out["forearm"] = float(np.mean(ua)), float(np.mean(fa))
    out["chest"], lm["z_chest"] = max((tape(obj, z, trunk_excl), z) for z in np.arange(0.70 * H, 0.75 * H, 0.004))
    out["waist"], lm["z_waist"] = min((tape(obj, z, trunk_excl), z) for z in np.arange(0.58 * H, 0.66 * H, 0.004))
    out["hip"], lm["z_hip"] = max((tape(obj, z, arms), z) for z in np.arange(zc + 0.02, zc + 0.16, 0.004))
    foot = co[(co[:, 0] > 0) & (co[:, 2] < 0.06 * H)]
    out["foot"] = float(foot[:, 1].max() - foot[:, 1].min())
    v = lm["wrist_l"] - lm["elbow_l"] + (lm["elbow_l"] - lm["shoulder_top_l"])
    out["arm_angle_deg"] = float(np.degrees(np.arctan2(abs(v[0]), -v[2])))
    return out, lm


def smooth_region(obj, weight, iters):
    """Laplacian smoothing of the vertices with weight > 0 (weight scales the step); edges from the mesh."""
    me = obj.data
    ed = np.empty(len(me.edges) * 2, np.int64)
    me.edges.foreach_get("vertices", ed)
    ed = ed.reshape(-1, 2)
    n = len(me.vertices)
    deg = np.bincount(ed.ravel(), minlength=n).astype(np.float64)
    co = coords(obj)
    for _ in range(iters):
        acc = np.zeros_like(co)
        np.add.at(acc, ed[:, 0], co[ed[:, 1]])
        np.add.at(acc, ed[:, 1], co[ed[:, 0]])
        avg = acc / np.maximum(deg, 1)[:, None]
        co += weight[:, None] * 0.5 * (avg - co)
    set_coords(obj, co)


def falloff(co, centres, radius):
    """1 at each centre, 0 beyond radius (smooth)."""
    w = np.zeros(len(co))
    for c in centres:
        d = np.linalg.norm(co - np.asarray(c), axis=1) / radius
        w = np.maximum(w, np.clip(1 - d, 0, 1) ** 2 * (3 - 2 * np.clip(1 - d, 0, 1)) if False else np.clip(1 - d * d, 0, 1))
    return w
