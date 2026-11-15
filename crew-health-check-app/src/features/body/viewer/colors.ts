import { Color } from 'three'

/**
 * The 3D colors, read once at mount from the CSS variables in
 * src/styles/tokens.css (section 20). Viewer code holds no color values.
 */
export interface ViewerColors {
  background: Color
  surface: Color
  patch: Color
  pin: Color
  pinSelected: Color
  sensor: Color
  sensorLost: Color
  statusGood: Color
  statusWatch: Color
  statusAct: Color
}

export function readViewerColors(element: Element): ViewerColors {
  const style = getComputedStyle(element)
  const read = (name: string) => {
    const value = style.getPropertyValue(name).trim()
    return value === '' ? new Color() : new Color(value)
  }
  return {
    background: read('--viewer-bg'),
    surface: read('--body-surface'),
    patch: read('--body-patch'),
    pin: read('--pin'),
    pinSelected: read('--pin-selected'),
    sensor: read('--sensor'),
    sensorLost: read('--sensor-lost'),
    statusGood: read('--body-status-good'),
    statusWatch: read('--body-status-watch'),
    statusAct: read('--body-status-act'),
  }
}
