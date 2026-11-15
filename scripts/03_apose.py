"""Stage 3: re-pose from the atlas' anatomical position to the A-pose (about 30 deg arm abduction).

The whole model (skin, bones, muscles, vessels, nerves, nodes) is rotated about the
glenohumeral joint with one smooth blend field per shoulder. The field is harmonic inside
the body: 1 on the bones of the free upper limb, 0 on every other bone, so soft tissue keeps
following the bone it is attached to. This is a geometric re-pose only, not a simulation.

blender --background build/stage2_assembled.blend --python scripts/03_apose.py
Output: build/stage3_apose.blend
"""
import bpy, os, re, sys, time, math
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "build", "stage3_apose.blend")
TARGET_ABDUCTION_DEG = 30.0
H = 0.003                       # voxel size of the blend field (m)
t0 = time.time()
log = lambda *a: print("APOSE", *a, flush=True)

meshes = [o for o in bpy.data.objects if o.type == "MESH"]
byname = {o.name: o for o in meshes}

def coords(o):
    a = np.empty(len(o.data.vertices) * 3, np.float32)
    o.data.vertices.foreach_get("co", a)
    return a.reshape(-1, 3)

ARM_RE = re.compile(r"^BONE_(Humerus|Radius|Ulna|Carpals|Metacarpals|Phalanges_Hand)_L$")
arm_pts = np.concatenate([coords(o) for o in meshes if ARM_RE.match(o.name)])
fixed_pts = np.concatenate([coords(o) for o in meshes if o.name.startswith("BONE_") and not ARM_RE.match(o.name)])

# ---------------------------------------------------------------- joint centre and current abduction
hum = coords(byname["BONE_Humerus_L"])
order = np.argsort(hum[:, 2])
k = max(20, len(hum) // 20)
lo, hi = hum[order[:k]].mean(0), hum[order[-k:]].mean(0)
d = (lo - hi) / np.linalg.norm(lo - hi)
abd_now = math.degrees(math.atan2(d[0], -d[2]))
head = hum[hum[:, 2] > hum[:, 2].max() - 0.045]
head = head[head[:, 0] < np.median(head[:, 0])]            # the articular head faces medially
A = np.c_[2 * head, np.ones(len(head))]
sol = np.linalg.lstsq(A, (head ** 2).sum(1), rcond=None)[0]
J = sol[:3]
radius = math.sqrt(sol[3] + (J ** 2).sum())
theta = math.radians(TARGET_ABDUCTION_DEG - abd_now)
log("humerus abduction now %.1f deg -> rotating %.1f deg; joint centre (%.4f %.4f %.4f), head radius %.1f mm"
    % (abd_now, math.degrees(theta), J[0], J[1], J[2], radius * 1000))
assert 0.015 < radius < 0.035, "humeral head sphere fit looks wrong"

# ---------------------------------------------------------------- voxel grid on the left side
skin = byname["BODY_Skin"]
sv = coords(skin)
origin = np.array([-0.03, sv[:, 1].min() - 0.02, arm_pts[:, 2].min() - 0.06], np.float32)
top = np.array([arm_pts[:, 0].max() + 0.06, sv[:, 1].max() + 0.02, J[2] + 0.16], np.float32)
dims = np.ceil((top - origin) / H).astype(int)
nx, ny, nz = dims
log("grid", dims.tolist(), "voxels %.2fM" % (dims.prod() / 1e6))

bvh = BVHTree.FromPolygons([tuple(v) for v in sv.tolist()], [tuple(p.vertices) for p in skin.data.polygons])
inside = np.zeros(dims, bool)
back = Vector((0, 1, 0))                                     # rays run front to back: limbs are crossed, not followed
y_start, y0 = float(origin[1]) - 0.05, float(origin[1])
bad_cols = 0
for i in range(nx):
    for kz in range(nz):
        for attempt in range(4):
            x = float(origin[0]) + (i + 0.5) * H + 3.7e-5 * (attempt + 1)
            z = float(origin[2]) + (kz + 0.5) * H + 6.1e-5 * (attempt + 1)
            hits, y = [], y_start
            while True:
                hit = bvh.ray_cast(Vector((x, y, z)), back)
                if hit[0] is None:
                    break
                hits.append(hit[0].y)
                y = hit[0].y + 1e-5
            if len(hits) % 2 == 0:
                break
        else:                                                # still a grazing hit: reuse the column below
            bad_cols += 1
            if kz:
                inside[i, :, kz] = inside[i, :, kz - 1]
            continue
        for a in range(0, len(hits), 2):                     # enter, leave, enter, ...
            j0 = int(math.ceil((hits[a] - y0) / H - 0.5))
            j1 = int(math.floor((hits[a + 1] - y0) / H - 0.5))
            if j1 >= 0:
                inside[i, max(j0, 0):min(j1 + 1, ny), kz] = True
log("inside voxels %.2fM, unreliable columns %d of %d, %.1fs" % (inside.sum() / 1e6, bad_cols, nx * nz, time.time() - t0))

def voxelize(pts):
    idx = np.floor((pts - origin) / H).astype(int)
    ok = ((idx >= 0) & (idx < dims)).all(1)
    m = np.zeros(dims, bool)
    m[tuple(idx[ok].T)] = True
    return m

one, zero = voxelize(arm_pts), voxelize(fixed_pts)
both = one & zero
one &= ~both
zero &= ~both

def solve(inside, one, zero, u0, iters):
    domain = inside | one | zero
    free = domain & ~one & ~zero
    dmask = domain.astype(np.float32)
    pad = np.zeros(tuple(s + 2 for s in domain.shape), np.float32)
    def nsum(a):
        pad[1:-1, 1:-1, 1:-1] = a
        return (pad[2:, 1:-1, 1:-1] + pad[:-2, 1:-1, 1:-1] + pad[1:-1, 2:, 1:-1] +
                pad[1:-1, :-2, 1:-1] + pad[1:-1, 1:-1, 2:] + pad[1:-1, 1:-1, :-2])
    cnt = np.maximum(nsum(dmask), 1.0)
    u = np.where(one, 1.0, np.where(zero, 0.0, u0)).astype(np.float32)
    for it in range(iters):
        un = nsum(u * dmask) / cnt
        if it % 200 == 199:
            delta = float(np.abs(un - u)[free].max())
            if delta < 2e-5:
                break
        u = np.where(free, un, u)
    return u, domain

def pool(m):                                                  # 2x coarser, "any" pooling
    sx, sy, sz = (s // 2 * 2 for s in m.shape)
    c = m[:sx, :sy, :sz].reshape(sx // 2, 2, sy // 2, 2, sz // 2, 2)
    return c.any(axis=(1, 3, 5))

ci, c1, c0 = pool(inside), pool(one), pool(zero)
cb = c1 & c0
uc, _ = solve(ci, c1 & ~cb, c0 & ~cb, np.zeros(ci.shape, np.float32), 10000)
u0 = np.zeros(dims, np.float32)
up = np.repeat(np.repeat(np.repeat(uc, 2, 0), 2, 1), 2, 2)
u0[:up.shape[0], :up.shape[1], :up.shape[2]] = up
u, domain = solve(inside, one, zero, u0, 3000)
log("field solved in %.1fs" % (time.time() - t0))

# extend the field a few centimetres outside the body so structures touching the skin sample cleanly
known = domain.copy()
pad = np.zeros(tuple(s + 2 for s in dims), np.float32)
def nsum(a):
    pad[1:-1, 1:-1, 1:-1] = a
    return (pad[2:, 1:-1, 1:-1] + pad[:-2, 1:-1, 1:-1] + pad[1:-1, 2:, 1:-1] +
            pad[1:-1, :-2, 1:-1] + pad[1:-1, 1:-1, 2:] + pad[1:-1, 1:-1, :-2])
u = np.where(known, u, 0.0).astype(np.float32)
for _ in range(14):
    kf = known.astype(np.float32)
    cnt = nsum(kf)
    new = (~known) & (cnt > 0)
    if not new.any():
        break
    val = nsum(u * kf) / np.maximum(cnt, 1.0)
    u = np.where(new, val, u)
    known |= new

def sample(pts):
    g = (pts - origin) / H - 0.5
    outside = ((g < -0.5) | (g > dims - 0.5)).any(1)
    g = np.clip(g, 0, dims - 1.001)
    i0 = np.floor(g).astype(int)
    f = (g - i0).astype(np.float32)
    w = np.zeros(len(pts), np.float32)
    for dx in (0, 1):
        for dy in (0, 1):
            for dz in (0, 1):
                wt = (f[:, 0] if dx else 1 - f[:, 0]) * (f[:, 1] if dy else 1 - f[:, 1]) * (f[:, 2] if dz else 1 - f[:, 2])
                w += wt * u[i0[:, 0] + dx, i0[:, 1] + dy, i0[:, 2] + dz]
    w[outside] = 0.0
    return np.clip(w, 0.0, 1.0)

# ---------------------------------------------------------------- apply the rotation
ARM_BOTH = re.compile(ARM_RE.pattern.replace("_L$", "_[LR]$"))

def repose(pts, rigid=None):
    left = pts[:, 0] >= 0
    q = pts.copy()
    q[~left, 0] *= -1                                         # the right side uses the mirrored field
    w = sample(q) if rigid is None else np.full(len(q), rigid, np.float32)
    if w.max() < 1e-4:
        return None, w
    ang = -theta * w                                          # about +Y through the joint, hand moves laterally
    c, s = np.cos(ang), np.sin(ang)
    rx, rz = q[:, 0] - J[0], q[:, 2] - J[2]
    q[:, 0] = J[0] + rx * c + rz * s
    q[:, 2] = J[2] - rx * s + rz * c
    q[~left, 0] *= -1
    return q, w

moved = 0
stats = {}
for o in meshes:
    p = coords(o)
    rigid = None
    if o.name.startswith("BONE_"):                           # bones never bend: all or nothing
        rigid = 1.0 if ARM_BOTH.match(o.name) else 0.0
        if rigid == 0.0:
            continue
    q, w = repose(p, rigid)
    if q is None:
        continue
    o.data.vertices.foreach_set("co", q.ravel())
    o.data.update()
    moved += 1
    if o.name in ("BODY_Skin", "BONE_Humerus_L", "BONE_Scapula_L", "MUSCLE_Deltoid_L", "MUSCLE_PectoralisMajor_L",
                  "MUSCLE_LatissimusDorsi_L", "MUSCLE_Biceps_L", "VESSEL_Subclavian_L", "SYS_Nerve_BrachialPlexus_L", "BONE_Radius_R"):
        stats[o.name] = "w min %.2f mean %.2f max %.2f blend(0.05-0.95) %d of %d verts" % (
            w.min(), w.mean(), w.max(), int(((w > 0.05) & (w < 0.95)).sum()), len(w))
for k_, v in stats.items():
    log(k_, v)

root = bpy.data.objects["ROOT_CrewHealthCheck"]
root["pose"] = "A-pose"
root["apose_arm_abduction_deg"] = TARGET_ABDUCTION_DEG
root["apose_shoulder_rotation_applied_deg"] = round(math.degrees(theta), 2)
root["shoulder_joint_centre_L"] = [round(float(v), 5) for v in J]
root["shoulder_joint_centre_R"] = [round(float(-J[0]), 5), round(float(J[1]), 5), round(float(J[2]), 5)]

hum2 = coords(byname["BONE_Humerus_L"])
lo, hi = hum2[order[:k]].mean(0), hum2[order[-k:]].mean(0)       # same vertices as before the rotation
d2 = (lo - hi) / np.linalg.norm(lo - hi)
log("objects moved %d; humerus abduction after: %.1f deg" % (moved, math.degrees(math.atan2(d2[0], -d2[2]))))
bpy.ops.wm.save_as_mainfile(filepath=OUT, compress=True)
log("saved", OUT, "in %.1fs" % (time.time() - t0))
