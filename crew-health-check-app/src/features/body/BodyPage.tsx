import { useMemo, useRef } from 'react'
import { pinVisibility, reportsForCrew } from '../../bodyview/pins.ts'
import {
  anchorReplay,
  hasSuitData,
  sensorReadout,
} from '../../bodyview/sensors.ts'
import { bodyModelFor, sensorSites } from '../../data/bodyView.ts'
import { useBodyModelStatus } from '../../lib/bodyModelStatus.ts'
import { crewLabel } from '../../lib/labels.ts'
import { useAppStore } from '../../store/index.ts'
import { selectActiveCrew } from '../../store/selectors.ts'
import { use3dAvailable } from './body3d.ts'
import { BodyViewSection, type ViewerInputs } from './BodyViewSection.tsx'
import { SensorSection } from './SensorSection.tsx'
import { SorenessForm } from './SorenessForm.tsx'
import { SorenessList } from './SorenessList.tsx'
import { areaLabel } from './sorenessDraft.ts'
import { useBodyHealth } from './useBodyHealth.ts'
import { useBodyScreenState } from './useBodyScreenState.ts'
import { useSuitReplay } from './suitReplay.ts'

/**
 * The personal body view (section 22): crew-reported soreness, simulated
 * suit sensors and an optional 3D body for showing where. None of it reaches
 * the engine, an alert, a route or a message to Earth (decision D11).
 */
export function BodyPage() {
  const crew = useAppStore(selectActiveCrew)
  const crewId = useAppStore((state) => state.mission.activeCrewId)
  const nowMs = useAppStore((state) => state.mission.nowMs)
  const soreness = useAppStore((state) => state.soreness)
  const anchorMs = useAppStore((state) => state.suit.anchorMs)
  const show3d = useAppStore((state) => state.prefs.show3d)
  const replay = useSuitReplay()
  const locationRef = useRef<HTMLInputElement>(null)
  const screen = useBodyScreenState(crewId)
  const health = useBodyHealth()
  const model = bodyModelFor(crewId)
  const status = useBodyModelStatus((state) =>
    model ? state.byModel[model.id] : undefined,
  )
  const loadFailed =
    status !== undefined &&
    status.version === model?.version &&
    status.state === 'failed'
  const viewerOn = use3dAvailable() && show3d && model !== null && !loadFailed

  const reports = useMemo(
    () => reportsForCrew(soreness, crewId),
    [soreness, crewId],
  )
  const pins = useMemo(
    () =>
      reports.flatMap((report) =>
        report.anchor && pinVisibility(report, model) === 'drawn'
          ? [{ id: report.id, anchor: report.anchor }]
          : [],
      ),
    [reports, model],
  )
  const replayFile = replay.status === 'ready' ? replay.replay : null
  const samples = useMemo(
    () =>
      replayFile && anchorMs !== null ? anchorReplay(replayFile, anchorMs) : [],
    [replayFile, anchorMs],
  )
  const readouts = useMemo(
    () =>
      sensorSites.sites.map((site) =>
        sensorReadout(samples, crewId, site.id, nowMs, sensorSites),
      ),
    [samples, crewId, nowMs],
  )
  // Markers change only when a contact state does, not on every clock tick.
  const lostKey = readouts.map((readout) => readout.contact === 'lost').join()
  const viewerSensors = useMemo(
    () =>
      sensorSites.sites.map((site, index) => ({
        site: site.id,
        contactLost: lostKey.split(',')[index] === 'true',
      })),
    [lostKey],
  )

  const viewer: ViewerInputs = {
    health,
    crewName: crew?.name ?? '',
    pins,
    sensors: viewerSensors,
    selectedReportId: screen.selectedReportId,
    selectedSite: screen.selectedSite,
    highlightPatch: screen.draft.area === 'shoulder_r_outer',
    turnRequest: screen.turnRequest,
    onPick(pick, picked) {
      const onPatch = pick.target === 'patch_shoulder_r_outer'
      screen.setDraft({
        ...screen.draft,
        area: onPatch ? 'shoulder_r_outer' : 'other',
        locationText: onPatch ? areaLabel('shoulder_r_outer') : '',
        anchor: { modelId: picked.id, modelVersion: picked.version, ...pick },
      })
      if (!onPatch) locationRef.current?.focus()
    },
    onSelectReport: screen.selectReport,
    onSelectSite: screen.selectSite,
  }

  const sorenessPart = (
    <>
      <SorenessForm
        draft={screen.draft}
        setDraft={screen.setDraft}
        locationRef={locationRef}
        placementUnchecked={
          viewerOn && model?.patchChecks.shoulder_r_outer.checked === false
        }
      />
      <SorenessList
        reports={reports}
        model={model}
        selectedId={viewerOn ? screen.selectedReportId : undefined}
        onSelect={viewerOn ? screen.selectReport : undefined}
      />
    </>
  )

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold">Your body</h1>
        {crew && <p className="text-lg">{crewLabel(crew)}</p>}
        <p className="max-w-3xl text-slate-700">
          Two kinds of information, kept apart from your health checks:
          crew-reported soreness, which is what you say, and simulated skin
          temperature from three suit sensors. Neither is used in health alerts,
          your status or messages to Earth.
        </p>
      </header>
      <div className="grid gap-8 lg:grid-cols-2">
        <div className="space-y-8">
          <BodyViewSection model={model} viewer={viewer} />
          {!viewerOn && sorenessPart}
        </div>
        <div className="space-y-8">
          {viewerOn && sorenessPart}
          <SensorSection
            replay={replay}
            readouts={readouts}
            hasData={hasSuitData(samples, crewId)}
            nowMs={nowMs}
            selectedSite={viewerOn ? screen.selectedSite : undefined}
            onSelectSite={viewerOn ? screen.selectSite : undefined}
            onTurn={viewerOn ? screen.requestTurn : undefined}
          />
        </div>
      </div>
    </div>
  )
}
