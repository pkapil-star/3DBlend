/**
 * Which side of the body the camera shows, in words, for the live text under
 * the view buttons. Left and right are the crew member's own (section 22.4).
 */
export function viewDescription(azimuthDeg: number): string {
  const angle = ((((azimuthDeg % 360) + 540) % 360) - 180) | 0
  const size = Math.abs(angle)
  if (size <= 22) return 'Showing the front'
  if (size >= 158) return 'Showing the back'
  const side = angle > 0 ? 'left' : 'right'
  if (size < 68) return `Showing the front and the ${side} side`
  if (size <= 112) return `Showing the ${side} side`
  return `Showing the back and the ${side} side`
}
