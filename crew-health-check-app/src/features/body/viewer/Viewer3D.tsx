import { useEffect, useMemo, useRef, useState, type PointerEvent } from 'react'
import { Mesh, Vector3, type Object3D } from 'three'
import {
  LAYER_FOR_REGION,
  breathPhase,
  heartbeatPhase,
} from '../../../bodyview/healthOverlay.ts'
import { STATUS_DISPLAY } from '../../../components/statusDisplay.ts'
import type { ContractResult } from '../../../bodyview/modelContract.ts'
import type {
  BodyModelEntry,
  PinAnchor,
  SensorSiteId,
} from '../../../bodyview/types.ts'
import { sensorSites } from '../../../data/bodyView.ts'
import { readViewerColors, type ViewerColors } from './colors.ts'
import { createViewer, type Viewer } from './createViewer.ts'
import { LayerControls } from './LayerControls.tsx'
import {
  ModelLoadError,
  loadBodyModel,
  type LayerState,
  type LoadedModel,
} from './loadModel.ts'
import { createMarkerSet, markerInfo, type MarkerSet } from './markers.ts'
import {
  isTap,
  pickResultFromHit,
  type PickResult,
  type PointerSample,
} from './picking.ts'
import { ViewButtons } from './ViewButtons.tsx'
import {
  ANIMATION_BREATHS_PER_MIN,
  BodyMotionControls,
  type MotionState,
} from './BodyMotionControls.tsx'
import { findMorphs } from './bodyMotion.ts'
import { HealthLegend, type LegendRow } from './HealthLegend.tsx'
import {
  createHealthOverlay,
  type HealthOverlay,
  type RegionStatuses,
} from './healthOverlay3d.ts'
import { viewDescription } from './viewText.ts'

export interface ModelStatus {
  state: 'loading' | 'ready' | 'failed'
  contract: ContractResult | null
}

/** Today's engine output for the active crew member, shown on the body (section 22.12). */
export interface ViewerHealth {
  statuses: RegionStatuses
  rows: LegendRow[]
  heartRateBpm: number | null
}

export interface Viewer3DProps {
  health?: ViewerHealth
  model: BodyModelEntry
  crewName: string
  pins: readonly { id: string; anchor: PinAnchor }[]
  sensors: readonly { site: SensorSiteId; contactLost: boolean }[]
  selectedReportId: string | null
  selectedSite: SensorSiteId | null
  highlightPatch: boolean
  turnRequest: { site: SensorSiteId; nonce: number } | null
  onPick: (pick: PickResult, model: BodyModelEntry) => void
  onSelectReport: (reportId: string) => void
  onSelectSite: (site: SensorSiteId) => void
  onStatus: (status: ModelStatus) => void
}

/** The 3D body (section 22.8). Loaded lazily, so three.js is its own chunk. */
export default function Viewer3D(props: Viewer3DProps) {
  const {
    model,
    pins,
    sensors,
    selectedReportId,
    selectedSite,
    highlightPatch,
    turnRequest,
  } = props
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const viewerRef = useRef<Viewer | null>(null)
  const colorsRef = useRef<ViewerColors | null>(null)
  const markersRef = useRef<MarkerSet | null>(null)
  const downRef = useRef<PointerSample | null>(null)
  const latest = useRef(props)
  const [loaded, setLoaded] = useState<LoadedModel | null>(null)
  const [description, setDescription] = useState('Showing the front')
  const [progress, setProgress] = useState<number | null>(null)
  const [layers, setLayers] = useState<LayerState[]>([])
  const overlayRef = useRef<HealthOverlay | null>(null)
  const [overlayOn, setOverlayOn] = useState(true)
  const [identify, setIdentify] = useState(false)
  const [picked, setPicked] = useState<string | null>(null)
  const [motion, setMotion] = useState<MotionState>({
    animate: false,
    heart: 0,
    breath: 0,
    profileB: 0,
  })
  const morphs = useMemo(
    () => (loaded ? findMorphs(loaded.root) : null),
    [loaded],
  )
  const health = props.health

  useEffect(() => {
    latest.current = props
  })

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const colors = readViewerColors(canvas)
    const viewer = createViewer(canvas, colors)
    colorsRef.current = colors
    viewerRef.current = viewer
    markersRef.current = createMarkerSet(colors)
    return () => {
      markersRef.current?.dispose()
      viewer.dispose()
      viewerRef.current = null
      markersRef.current = null
    }
  }, [])

  useEffect(() => {
    const viewer = viewerRef.current
    const colors = colorsRef.current
    if (!viewer || !colors) return
    const controller = new AbortController()
    let current: LoadedModel | null = null
    latest.current.onStatus({ state: 'loading', contract: null })
    setProgress(null)
    loadBodyModel(
      model,
      colors,
      sensorSites.sites,
      controller.signal,
      (fraction) => {
        if (!controller.signal.aborted) setProgress(fraction)
      },
    )
      .then((result) => {
        if (controller.signal.aborted) {
          result.dispose()
          return
        }
        current = result
        overlayRef.current = createHealthOverlay(result, colors)
        viewer.setContent([result.root])
        setLoaded(result)
        setLayers(result.layers)
        setDescription('Showing the front')
        latest.current.onStatus({ state: 'ready', contract: result.contract })
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        latest.current.onStatus({
          state: 'failed',
          contract: error instanceof ModelLoadError ? error.contract : null,
        })
      })
    return () => {
      controller.abort()
      overlayRef.current?.dispose()
      overlayRef.current = null
      current?.dispose()
      setLoaded(null)
    }
  }, [model])

  useEffect(() => {
    overlayRef.current?.apply(
      health?.statuses ?? {},
      overlayOn && health !== undefined,
    )
    viewerRef.current?.requestRender()
  }, [loaded, health, overlayOn])

  const bpm = health?.heartRateBpm ?? null
  useEffect(() => {
    const viewer = viewerRef.current
    if (!morphs || !viewer) return
    morphs.set('Profile_B', motion.profileB)
    if (!motion.animate) {
      morphs.set('Heart_Contract', motion.heart)
      morphs.set('Lungs_Inhale', motion.breath)
      viewer.requestRender()
      return
    }
    // Animation-frame timestamps are interface timing, like tap detection.
    let frame = 0
    const tick = (ms: number) => {
      morphs.set('Heart_Contract', heartbeatPhase(ms / 1000, bpm ?? 60))
      morphs.set(
        'Lungs_Inhale',
        breathPhase(ms / 1000, ANIMATION_BREATHS_PER_MIN),
      )
      viewer.requestRender()
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [morphs, motion, bpm])

  useEffect(() => {
    const markers = markersRef.current
    if (!loaded || !markers) return
    const drawable = sensors.flatMap(({ site, contactLost }) => {
      const anchor = loaded.anchors.get(site)
      return anchor ? [{ site, anchor, contactLost }] : []
    })
    markers.update(loaded.root, pins, drawable, {
      reportId: selectedReportId,
      site: selectedSite,
    })
    loaded.setPatchHighlight(highlightPatch)
    viewerRef.current?.requestRender()
  }, [loaded, pins, sensors, selectedReportId, selectedSite, highlightPatch])

  useEffect(() => {
    const viewer = viewerRef.current
    const anchor = turnRequest && loaded?.anchors.get(turnRequest.site)
    if (!viewer || !anchor) return
    viewer.turnTowards(anchor.getWorldPosition(new Vector3()))
    setDescription(viewDescriptionOf(viewer))
  }, [turnRequest, loaded])

  function onPointerDown(event: PointerEvent<HTMLCanvasElement>) {
    downRef.current = {
      x: event.clientX,
      y: event.clientY,
      timeStamp: event.timeStamp,
    }
  }

  function onPointerUp(event: PointerEvent<HTMLCanvasElement>) {
    const down = downRef.current
    downRef.current = null
    const viewer = viewerRef.current
    if (!down || !viewer || !loaded) return
    const up = {
      x: event.clientX,
      y: event.clientY,
      timeStamp: event.timeStamp,
    }
    if (!isTap(down, up)) {
      setDescription(viewDescriptionOf(viewer))
      return
    }
    if (identify) {
      setPicked(
        namePart(
          loaded,
          viewer,
          event.clientX,
          event.clientY,
          health?.rows ?? [],
          overlayRef.current,
        ),
      )
      return
    }
    // Pins go on the skin and the shoulder patch only, never on an inner
    // layer; with the skin hidden only markers can be selected.
    const surface =
      loaded.surfacePickable() && motion.profileB === 0
        ? [loaded.body, ...(loaded.patch ? [loaded.patch] : [])]
        : []
    const targets = [...surface, ...(markersRef.current?.meshes() ?? [])]
    const hit = viewer.pick(event.clientX, event.clientY, targets)
    if (!hit) return
    const marker = markerInfo(hit.object)
    if (marker?.kind === 'pin') latest.current.onSelectReport(marker.reportId)
    else if (marker?.kind === 'sensor') latest.current.onSelectSite(marker.site)
    else
      latest.current.onPick(
        pickResultFromHit(hit, loaded.root, loaded.patch),
        loaded.entry,
      )
  }

  const drawnSensors = loaded
    ? sensors.filter(({ site }) => loaded.anchors.has(site)).length
    : 0
  const pinWord = pins.length === 1 ? 'soreness pin' : 'soreness pins'
  return (
    <div className="space-y-3">
      <canvas
        ref={canvasRef}
        role="img"
        aria-label={`3D body of ${props.crewName}, ${pins.length} ${pinWord}, ${drawnSensors} sensors`}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        className="block h-[420px] w-full rounded-lg border border-slate-300 lg:h-[540px]"
      />
      {!loaded && (
        <p className="text-slate-700">
          Loading the 3D body…
          {progress !== null && ` ${Math.round(progress * 100)}%`}
        </p>
      )}
      {loaded && health && (
        <HealthLegend
          rows={health.rows}
          on={overlayOn}
          onToggle={setOverlayOn}
          canShowOrgans={layers.length > 0}
          onShowAffected={() => {
            for (const row of health.rows) {
              const layer = LAYER_FOR_REGION[row.region]
              if (layer && (row.status === 'watch' || row.status === 'act')) {
                loaded.setLayerVisible(layer, true)
              }
            }
            setLayers(loaded.layers)
            viewerRef.current?.requestRender()
          }}
          identify={identify}
          onIdentify={(on) => {
            setIdentify(on)
            setPicked(null)
          }}
          picked={picked}
        />
      )}
      {loaded && morphs?.has('Heart_Contract') && (
        <BodyMotionControls
          state={motion}
          onChange={setMotion}
          heartRateBpm={bpm}
          hasProfileB={morphs.has('Profile_B')}
        />
      )}
      {loaded && layers.length > 0 && (
        <LayerControls
          layers={layers}
          onChange={(id, visible) => {
            loaded.setLayerVisible(id, visible)
            setLayers(loaded.layers)
            viewerRef.current?.requestRender()
          }}
        />
      )}
      <ViewButtons
        viewer={() => viewerRef.current}
        description={description}
        onMoved={setDescription}
      />
      {model.attribution && (
        <p className="text-slate-700">{model.attribution}</p>
      )}
    </div>
  )
}

function isShown(node: Object3D): boolean {
  for (let current: Object3D | null = node; current; current = current.parent) {
    if (!current.visible) return false
  }
  return true
}

/** Names the visible part under the pointer and its region's status; the skin is skipped while inner layers show. */
function namePart(
  loaded: LoadedModel,
  viewer: Viewer,
  clientX: number,
  clientY: number,
  rows: readonly LegendRow[],
  overlay: HealthOverlay | null,
): string {
  const innerShown = loaded.layers.some(
    (layer) => !layer.surface && layer.visible,
  )
  const skin = new Set<Object3D>(loaded.surfaceMeshes)
  const candidates: Object3D[] = []
  loaded.root.traverse((node) => {
    if (!(node instanceof Mesh) || node === loaded.patch) return
    if (node.userData.marker !== undefined || (innerShown && skin.has(node)))
      return
    if (isShown(node)) candidates.push(node)
  })
  const hit = viewer.pick(clientX, clientY, candidates)
  if (!hit) return 'Nothing there. Tap on the body.'
  const own: unknown = hit.object.userData.anatomy_name
  const name =
    typeof own === 'string'
      ? own
      : skin.has(hit.object)
        ? 'Skin'
        : hit.object.name
  const region = overlay?.regionOf(hit.object, hit.face?.a ?? null) ?? null
  const row = rows.find((entry) => entry.region === region)
  return row
    ? `${name} · ${row.label}: ${STATUS_DISPLAY[row.status].word}`
    : name
}

function viewDescriptionOf(viewer: Viewer): string {
  return viewDescription(viewer.azimuthDeg())
}
