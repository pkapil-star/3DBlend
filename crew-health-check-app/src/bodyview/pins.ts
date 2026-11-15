import {
  SORENESS_SCORE_MAX,
  pinAnchorSchema,
  sorenessScoreSchema,
} from './schemas.ts'
import type { BodyAreaId, PinAnchor, SorenessReport } from './types.ts'

// Soreness reports and their pins (ARCHITECTURE.md section 22.5). A report is
// what the crew member says: it is never read as evidence of anything else.

export const SORENESS_TAG = 'Crew-reported soreness'

export interface SorenessInput {
  score: number
  areaId: BodyAreaId | null
  locationText: string
  activityNote: string
  anchor: PinAnchor | null
}

export interface ReportContext {
  id: string
  crewId: string
  day: number
  atMs: number
}

export type ReportProblem = 'score' | 'location' | 'anchor'

export type BuildResult =
  | { ok: true; report: SorenessReport }
  | { ok: false; problems: ReportProblem[] }

/** Checks the form's values and builds the stored report, or says what is wrong. */
export function buildReport(
  input: SorenessInput,
  context: ReportContext,
): BuildResult {
  const problems: ReportProblem[] = []
  if (!sorenessScoreSchema.safeParse(input.score).success) {
    problems.push('score')
  }
  const locationText = input.locationText.trim()
  if (locationText === '') problems.push('location')
  if (
    input.anchor !== null &&
    !pinAnchorSchema.safeParse(input.anchor).success
  ) {
    problems.push('anchor')
  }
  if (problems.length > 0) return { ok: false, problems }
  return {
    ok: true,
    report: {
      id: context.id,
      crewId: context.crewId,
      day: context.day,
      atMs: context.atMs,
      score: input.score,
      areaId: input.areaId,
      locationText,
      activityNote: input.activityNote.trim(),
      anchor: input.anchor,
    },
  }
}

/** "Right outer shoulder · 4/10 · after overhead work · Crew-reported soreness". */
export function entryLabel(report: SorenessReport): string {
  const parts = [report.locationText, `${report.score}/${SORENESS_SCORE_MAX}`]
  if (report.activityNote !== '') parts.push(report.activityNote)
  parts.push(SORENESS_TAG)
  return parts.join(' · ')
}

/** One crew member's reports, newest first. Each person sees only their own. */
export function reportsForCrew(
  reports: readonly SorenessReport[],
  crewId: string,
): SorenessReport[] {
  return reports
    .filter((report) => report.crewId === crewId)
    .sort((a, b) => b.atMs - a.atMs || b.id.localeCompare(a.id))
}

export type PinVisibility = 'drawn' | 'other_version' | 'no_pin'

/**
 * A pin is drawn only on the exact model and version it was placed on. On any
 * other version it is not drawn and never moved to a guessed position; its
 * report keeps every field (decision D16).
 */
export function pinVisibility(
  report: SorenessReport,
  model: { id: string; version: string } | null,
): PinVisibility {
  if (report.anchor === null) return 'no_pin'
  if (
    model !== null &&
    report.anchor.modelId === model.id &&
    report.anchor.modelVersion === model.version
  ) {
    return 'drawn'
  }
  return 'other_version'
}
