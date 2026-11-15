import { useAppStore } from '../../store/index.ts'
import { canUseWebGL } from './viewer/webgl.ts'

/** The one line shown instead of the 3D view (section 22.10). */
export const NO_3D_TEXT =
  '3D view is not available here. The list and sensor cards show the same information.'

/** The compare view's line when 3D is not available: its tables carry the same facts. */
export const NO_3D_COMPARE_TEXT =
  '3D view is not available here. The tables below give the same measurements.'

/** Whether the 3D view can be offered at all: WebGL present and "Force 2D" off. */
export function use3dAvailable(): boolean {
  const force2d = useAppStore((state) => state.prefs.force2d)
  return !force2d && canUseWebGL()
}
