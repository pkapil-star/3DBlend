// Health status overlay (section 22.12): which parts of a 3D body show which
// region's status. The overlay only reads the engine's output; nothing here
// feeds back into the engine, an alert, a route or a message (decision D11).
// Pure TypeScript: the viewer applies the result to three.js objects.

export type OverlayStatus = 'good' | 'watch' | 'act' | 'no_data'
export type OverlayRegion =
  'head' | 'eyes' | 'heart' | 'core' | 'bones_muscle' | 'skin' | 'whole_body'

export const OVERLAY_REGIONS: readonly OverlayRegion[] = [
  'head',
  'eyes',
  'heart',
  'core',
  'bones_muscle',
  'skin',
  'whole_body',
]

const RANK: Record<OverlayStatus, number> = {
  no_data: 0,
  good: 1,
  watch: 2,
  act: 3,
}

/** The more serious of two statuses; "no data" never hides a real status. */
export function worse(a: OverlayStatus, b: OverlayStatus): OverlayStatus {
  return RANK[a] >= RANK[b] ? a : b
}

/** Skin region ids of the anatomical model (its `_region_id` vertex attribute) to app regions. */
export function regionForSkinId(id: number): OverlayRegion | null {
  if (id === 1 || id === 2) return 'head' // head, neck
  if (id === 3 || id === 4) return 'heart' // chest front and back
  if (id === 5 || id === 6) return 'core' // abdomen, pelvis
  if (id >= 7 && id <= 22) return 'bones_muscle' // shoulders to feet
  return null
}

/** Inner parts of the anatomical model, matched by node-name prefix (own name first, then ancestors). */
const PART_PREFIXES: readonly { region: OverlayRegion; prefixes: string[] }[] =
  [
    {
      region: 'heart',
      prefixes: [
        'ORG_Heart',
        'VESSEL_Aorta',
        'VESSEL_VenaCava',
        'VESSEL_Pulmonary',
        'VESSEL_Coronary',
        'VESSEL_CardiacVeins',
        'VESSEL_Carotid',
      ],
    },
    {
      region: 'whole_body',
      prefixes: [
        'ORG_Lung',
        'SYS_Trachea',
        'SYS_Bronchi',
        'SYS_Larynx',
        'SYS_Pharynx',
        'SYS_NasalCavity',
        'MUSCLE_Diaphragm',
      ],
    },
    {
      region: 'head',
      prefixes: ['ORG_Brain', 'GLAND_Pituitary', 'GLAND_Pineal'],
    },
    { region: 'eyes', prefixes: ['BODY_Eye_'] },
    {
      region: 'core',
      prefixes: [
        'ORG_Stomach',
        'ORG_Liver',
        'ORG_Gallbladder',
        'ORG_Pancreas',
        'ORG_SmallIntestine',
        'ORG_LargeIntestine',
        'ORG_Rectum',
        'ORG_Kidney',
        'GLAND_Adrenal',
      ],
    },
    {
      region: 'bones_muscle',
      prefixes: ['SYSTEM_Skeletal', 'SYSTEM_Muscular'],
    },
  ]

/**
 * The region a named part belongs to, from its own name or the nearest
 * ancestor that matches; null for parts the overlay leaves as they are.
 */
export function regionForPart(
  namesUpward: readonly string[],
): OverlayRegion | null {
  for (const name of namesUpward) {
    for (const { region, prefixes } of PART_PREFIXES) {
      if (prefixes.some((prefix) => name.startsWith(prefix))) return region
    }
  }
  return null
}

/** The layer to turn on to see a region's inner parts (layer ids of the anatomical manifest entry). */
export const LAYER_FOR_REGION: Partial<Record<OverlayRegion, string>> = {
  heart: 'heart_vessels',
  whole_body: 'lungs_airway',
  head: 'nerves',
  core: 'digestive',
  bones_muscle: 'skeleton',
}

/** What each region tints, for the legend. */
export const PARTS_TEXT: Record<OverlayRegion, string> = {
  head: 'Brain, and the skin of the head and neck',
  eyes: 'Eyes',
  heart: 'Heart and major vessels, and the skin of the chest and upper back',
  core: 'Stomach, liver, pancreas, intestines and kidneys, and the skin of the abdomen',
  bones_muscle: 'Bones and muscles, and the skin of the arms and legs',
  skin: 'The whole skin',
  whole_body: 'Lungs and airway (cabin environment)',
}

/**
 * Zone of a skin point on a body without region data (the contract
 * mannequins and the placeholder), from its height and distance from the
 * midline as fractions of the body height. Rough on purpose: it colours areas,
 * it does not locate anatomy.
 */
export function zoneForPoint(
  x: number,
  y: number,
  height: number,
): OverlayRegion {
  const h = y / height
  const side = Math.abs(x) / height
  if (h > 0.86) return 'head'
  if (h > 0.7 && side < 0.11) return 'heart'
  if (h > 0.5 && side < 0.1) return 'core'
  return 'bones_muscle'
}

/** Status shown on a skin point: its zone's status or the skin's own, whichever is more serious. */
export function skinPointStatus(
  zone: OverlayRegion | null,
  statuses: Partial<Record<OverlayRegion, OverlayStatus>>,
): OverlayStatus {
  const own = zone ? (statuses[zone] ?? 'no_data') : 'no_data'
  return worse(own, statuses.skin ?? 'no_data')
}

/** How strongly a status tints the gray skin (0 keeps it gray). */
export function tintStrength(status: OverlayStatus): number {
  return { no_data: 0, good: 0.35, watch: 0.7, act: 0.8 }[status]
}

interface ReadingLike {
  crewId: string
  indicator: string
  value: number
  atMs: number
}

/** The newest reading of one indicator for one crew member up to `nowMs`, or null. */
export function latestValue(
  readings: readonly ReadingLike[],
  crewId: string,
  indicator: string,
  nowMs: number,
): number | null {
  let best: ReadingLike | null = null
  for (const reading of readings) {
    if (reading.crewId !== crewId || reading.indicator !== indicator) continue
    if (reading.atMs > nowMs) continue
    if (!best || reading.atMs > best.atMs) best = reading
  }
  return best ? best.value : null
}

/** Heart contraction, 0 to 1, at `seconds` for a rate in beats per minute (a short squeeze, a longer rest). */
export function heartbeatPhase(seconds: number, bpm: number): number {
  const beat = (seconds * bpm) / 60
  const t = beat - Math.floor(beat)
  return t < 0.35 ? Math.sin((t / 0.35) * Math.PI) : 0
}

/** Breathing, 0 (out) to 1 (in), at `seconds` for breaths per minute. */
export function breathPhase(seconds: number, perMinute: number): number {
  return 0.5 - 0.5 * Math.cos((2 * Math.PI * seconds * perMinute) / 60)
}
