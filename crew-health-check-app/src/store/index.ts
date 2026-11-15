import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { scenarioStartMs, type ClockSpeed } from '../clock/missionClock.ts'
import { healthData, linkDefaults } from '../data/index.ts'
import {
  missionDayOf,
  type EnvironmentId,
  type IndicatorId,
  type ScenarioFile,
  type SymptomId,
} from '../engine/index.ts'
import {
  buildReport,
  type BuildResult,
  type SorenessInput,
} from '../bodyview/pins.ts'
import { sorenessReportId } from '../lib/ids.ts'
import { advance } from '../link/earthLink.ts'
import { alertMessage, insightMessage, syncedAlertSlices } from './alertSync.ts'
import {
  STORAGE_KEY,
  STORAGE_VERSION,
  migratePersisted,
  readPersisted,
  type AlertInteraction,
  type PersistedState,
} from './persistence.ts'
import { selectEvaluation } from './selectors.ts'

// The app's state (ARCHITECTURE.md section 21). Components read through
// selectors and write through these named actions. The engine never writes here.

export type ActionResult = { ok: true } | { ok: false; message: string }

export interface AppActions {
  loadScenario(scenario: ScenarioFile): void
  /** Adds a reading for the active crew member at the current mission time. */
  addReading(
    indicator: IndicatorId,
    value: number,
    purpose?: 'routine' | 'recheck',
  ): ActionResult
  /** Today's symptom checklist; an empty list means "None today". */
  reportSymptoms(symptoms: readonly SymptomId[]): void
  setEnvironment(environmentId: EnvironmentId): void
  setDelay(oneWayDelaySec: number): void
  acknowledgeAlert(alertKey: string): void
  /** Ticks or unticks one protocol step (0-based) of an alert. */
  toggleStep(alertKey: string, stepIndex: number): void
  /** "Send to ground" for a self-care alert: the crew member's own choice. */
  sendToGround(alertKey: string): ActionResult
  /**
   * "Send to ground" for a second-opinion insight: only by the crew member's
   * choice, at most one consult per insight (its key includes the day).
   */
  sendInsightToGround(insightKey: string): ActionResult
  /**
   * Records first and last sight of each active alert and queues the
   * automatic messages: one report for "act on board", one consult for
   * "consult the ground", at most one per alert and kind (section 13.4).
   * Then lets the outbox travel (section 15). The actions below call it
   * after every change that can move a route or the time.
   */
  syncAlerts(): void
  /** Moves mission time forward: the ticker, "+10 min" and "+1 day" (section 16). */
  advanceTime(missionMs: number): void
  setSpeed(speed: ClockSpeed): void
  /** Link up or down. Queued messages leave when it comes back up. */
  setLinkUp(linkUp: boolean): void
  switchCrew(crewId: string): void
  /**
   * Saves a crew-reported soreness entry for the active crew member at the
   * current mission time (section 22.5). Body observations never touch
   * alerts, routes or the outbox (decision D11), so this does not sync them.
   */
  addSorenessReport(input: SorenessInput): BuildResult
  removeSorenessReport(reportId: string): void
  /** Re-anchors the simulated suit replay at the current mission time (section 24.5). */
  restartSuitReplay(): void
  setShow3d(show3d: boolean): void
  setForce2d(force2d: boolean): void
}

export type AppState = PersistedState & AppActions

function environmentById(id: EnvironmentId) {
  const environment = healthData.environments.find((entry) => entry.id === id)
  if (!environment) throw new Error(`environments.json has no ${id}`)
  return environment
}

/** Before any scenario is loaded. `scenarioId: null` tells the app to load the default one. */
export function emptyState(): PersistedState {
  return {
    mission: {
      nowMs: 0,
      speed: 0,
      environmentId: 'leo_station',
      link: {
        oneWayDelaySec: 0,
        linkUp: true,
        groundHandlingMin: linkDefaults.groundHandlingMin,
      },
      activeCrewId: 'c1',
      scenarioId: null,
    },
    crew: [],
    readings: [],
    symptoms: [],
    noSymptomDays: {},
    context: [],
    spaceWeather: [],
    alertState: {},
    outbox: [],
    soreness: [],
    suit: { anchorMs: null },
    prefs: { show3d: false, force2d: false },
  }
}

/** The stored interaction with an alert, created on first sight. */
function interactionFor(
  state: PersistedState,
  alertKey: string,
): AlertInteraction {
  const today = missionDayOf(state.mission.nowMs)
  return (
    state.alertState[alertKey] ?? {
      firstSeenDay: today,
      lastSeenDay: today,
      acknowledgedAtMs: null,
      stepsDone: [],
    }
  )
}

function pickPersisted(state: AppState): PersistedState {
  return {
    mission: state.mission,
    crew: state.crew,
    readings: state.readings,
    symptoms: state.symptoms,
    noSymptomDays: state.noSymptomDays,
    context: state.context,
    spaceWeather: state.spaceWeather,
    alertState: state.alertState,
    outbox: state.outbox,
    soreness: state.soreness,
    suit: state.suit,
    prefs: state.prefs,
  }
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      ...emptyState(),

      loadScenario(scenario) {
        const environment = environmentById(scenario.environmentId)
        const nowMs = scenarioStartMs(scenario.missionDay)
        set({
          mission: {
            nowMs,
            speed: 0,
            environmentId: scenario.environmentId,
            // The station and the Moon have one fixed delay; a Mars environment
            // starts at its nearest distance (section 14).
            link: {
              oneWayDelaySec: environment.oneWayDelaySecMin,
              linkUp: true,
              groundHandlingMin: linkDefaults.groundHandlingMin,
            },
            activeCrewId: scenario.crew[0]?.id ?? 'c1',
            scenarioId: scenario.scenarioId,
          },
          crew: scenario.crew,
          readings: scenario.readings,
          symptoms: scenario.symptoms,
          noSymptomDays: {},
          context: scenario.context,
          spaceWeather: scenario.spaceWeather,
          alertState: {},
          outbox: [],
          soreness: [],
          suit: { anchorMs: nowMs },
        })
        get().syncAlerts()
      },

      addReading(indicator, value, purpose = 'routine') {
        const def = healthData.indicators.find(
          (entry) => entry.id === indicator,
        )
        if (!def) return { ok: false, message: 'Unknown measurement.' }
        if (!Number.isFinite(value)) {
          return { ok: false, message: 'Enter a number.' }
        }
        // Out-of-range values are refused, never corrected (section 19.2).
        if (value < def.inputMin || value > def.inputMax) {
          const unit = def.unit === '' ? '' : ` ${def.unit}`
          return {
            ok: false,
            message: `Enter a value between ${def.inputMin} and ${def.inputMax}${unit}.`,
          }
        }
        const { mission, readings } = get()
        set({
          readings: [
            ...readings,
            {
              crewId: mission.activeCrewId,
              indicator,
              value,
              day: missionDayOf(mission.nowMs),
              atMs: mission.nowMs,
              origin: 'manual',
              ...(purpose === 'recheck' ? { purpose: 'recheck' as const } : {}),
            },
          ],
        })
        get().syncAlerts()
        return { ok: true }
      },

      reportSymptoms(reported) {
        const { mission, symptoms, noSymptomDays } = get()
        const crewId = mission.activeCrewId
        const today = missionDayOf(mission.nowMs)
        const others = symptoms.filter(
          (report) => !(report.crewId === crewId && report.day === today),
        )
        const todays = reported.map((symptom) => ({
          crewId,
          symptom,
          day: today,
          atMs: mission.nowMs,
        }))
        const noneDays = (noSymptomDays[crewId] ?? []).filter(
          (day) => day !== today,
        )
        set({
          symptoms: [...others, ...todays],
          noSymptomDays: {
            ...noSymptomDays,
            [crewId]: reported.length === 0 ? [...noneDays, today] : noneDays,
          },
        })
        get().syncAlerts()
      },

      setEnvironment(environmentId) {
        const environment = environmentById(environmentId)
        const { mission } = get()
        set({
          mission: {
            ...mission,
            environmentId,
            link: {
              ...mission.link,
              oneWayDelaySec: environment.oneWayDelaySecMin,
            },
          },
        })
        get().syncAlerts()
      },

      setDelay(oneWayDelaySec) {
        const { mission } = get()
        const environment = environmentById(mission.environmentId)
        if (!Number.isFinite(oneWayDelaySec)) return
        const clamped = Math.min(
          environment.oneWayDelaySecMax,
          Math.max(environment.oneWayDelaySecMin, oneWayDelaySec),
        )
        if (clamped === mission.link.oneWayDelaySec) return
        set({
          mission: {
            ...mission,
            link: { ...mission.link, oneWayDelaySec: clamped },
          },
        })
        get().syncAlerts()
      },

      acknowledgeAlert(alertKey) {
        const state = get()
        const interaction = interactionFor(state, alertKey)
        if (interaction.acknowledgedAtMs !== null) return
        set({
          alertState: {
            ...state.alertState,
            [alertKey]: {
              ...interaction,
              acknowledgedAtMs: state.mission.nowMs,
            },
          },
        })
      },

      toggleStep(alertKey, stepIndex) {
        if (!Number.isInteger(stepIndex) || stepIndex < 0) return
        const state = get()
        const interaction = interactionFor(state, alertKey)
        const stepsDone = interaction.stepsDone.includes(stepIndex)
          ? interaction.stepsDone.filter((index) => index !== stepIndex)
          : [...interaction.stepsDone, stepIndex].sort((a, b) => a - b)
        set({
          alertState: {
            ...state.alertState,
            [alertKey]: { ...interaction, stepsDone },
          },
        })
      },

      sendToGround(alertKey) {
        const state = get()
        const alert = selectEvaluation(state).alerts.find(
          (entry) => entry.key === alertKey && entry.supersededBy === null,
        )
        if (!alert) {
          return { ok: false, message: 'This alert is no longer active.' }
        }
        if (alert.route !== 'self_care') {
          // Other routes queue their message automatically (section 13.4).
          return { ok: false, message: 'This alert is already sent.' }
        }
        const message = alertMessage(state, alert, 'consult')
        if (state.outbox.some((entry) => entry.id === message.id)) {
          return { ok: true }
        }
        set({ outbox: [...state.outbox, message] })
        get().syncAlerts()
        return { ok: true }
      },

      sendInsightToGround(insightKey) {
        const state = get()
        const evaluation = selectEvaluation(state)
        const insight = evaluation.insights.find(
          (entry) => entry.key === insightKey,
        )
        if (!insight) {
          return { ok: false, message: 'This insight is no longer shown.' }
        }
        const message = insightMessage(state, insight, evaluation)
        if (state.outbox.some((entry) => entry.id === message.id)) {
          return { ok: true }
        }
        set({ outbox: [...state.outbox, message] })
        get().syncAlerts()
        return { ok: true }
      },

      syncAlerts() {
        const changed = syncedAlertSlices(get())
        if (changed) set(changed)
        // Messages never start by themselves here: this only moves the ones
        // already in the outbox along (section 15).
        const { outbox, mission } = get()
        const moved = advance(outbox, mission.nowMs, mission.link)
        if (moved !== outbox) set({ outbox: moved })
      },

      advanceTime(missionMs) {
        if (!Number.isFinite(missionMs) || missionMs <= 0) return
        const { mission } = get()
        set({ mission: { ...mission, nowMs: mission.nowMs + missionMs } })
        get().syncAlerts()
      },

      setSpeed(speed) {
        const { mission } = get()
        if (mission.speed === speed) return
        set({ mission: { ...mission, speed } })
      },

      setLinkUp(linkUp) {
        const { mission } = get()
        if (mission.link.linkUp === linkUp) return
        set({
          mission: {
            ...mission,
            link: linkUp
              ? { ...mission.link, linkUp, upSinceMs: mission.nowMs }
              : { ...mission.link, linkUp },
          },
        })
        get().syncAlerts()
      },

      switchCrew(crewId) {
        const { mission, crew } = get()
        if (mission.activeCrewId === crewId) return
        if (!crew.some((member) => member.id === crewId)) return
        set({ mission: { ...mission, activeCrewId: crewId } })
        get().syncAlerts()
      },

      addSorenessReport(input) {
        const { mission, soreness } = get()
        const taken = new Set(soreness.map((report) => report.id))
        const result = buildReport(input, {
          id: sorenessReportId(mission.activeCrewId, mission.nowMs, taken),
          crewId: mission.activeCrewId,
          day: missionDayOf(mission.nowMs),
          atMs: mission.nowMs,
        })
        if (result.ok) set({ soreness: [...soreness, result.report] })
        return result
      },

      removeSorenessReport(reportId) {
        const { soreness } = get()
        const kept = soreness.filter((report) => report.id !== reportId)
        if (kept.length !== soreness.length) set({ soreness: kept })
      },

      restartSuitReplay() {
        set({ suit: { anchorMs: get().mission.nowMs } })
      },

      setShow3d(show3d) {
        const { prefs } = get()
        if (prefs.show3d !== show3d) set({ prefs: { ...prefs, show3d } })
      },

      setForce2d(force2d) {
        const { prefs } = get()
        if (prefs.force2d !== force2d) set({ prefs: { ...prefs, force2d } })
      },
    }),
    {
      name: STORAGE_KEY,
      version: STORAGE_VERSION,
      partialize: pickPersisted,
      // Version 2 (B1) added the body view; a version 1 state is migrated,
      // then validated. Anything invalid is discarded, never trusted.
      migrate: (stored, version) =>
        readPersisted(migratePersisted(stored, version)) ?? emptyState(),
      merge: (stored, current) => {
        const valid = readPersisted(stored)
        return valid ? { ...current, ...valid } : current
      },
    },
  ),
)
