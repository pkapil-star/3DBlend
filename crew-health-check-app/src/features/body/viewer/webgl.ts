// No three.js here: the Body screen imports this eagerly to decide whether to
// offer the 3D view at all, and three.js must stay in its own lazy chunk.

let cached: boolean | null = null

/** True if this browser can create a WebGL context (section 22.10). */
export function canUseWebGL(): boolean {
  if (cached !== null) return cached
  try {
    const canvas = document.createElement('canvas')
    cached = Boolean(canvas.getContext('webgl2') ?? canvas.getContext('webgl'))
  } catch {
    cached = false
  }
  return cached
}
