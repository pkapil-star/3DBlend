// IDs for stored records (CLAUDE.md: never crypto.randomUUID, which is
// missing on plain-HTTP origins).

/**
 * A message is sent at most once per subject and kind (ARCHITECTURE.md
 * section 15), so the pair is the id: "consult:R-GLU-02:c1".
 */
export function messageId(kind: string, subjectKey: string): string {
  return `${kind}:${subjectKey}`
}

/** A soreness report: crew member, mission time and a counter for reports saved at the same moment. */
export function sorenessReportId(
  crewId: string,
  atMs: number,
  taken: ReadonlySet<string>,
): string {
  let count = 1
  while (taken.has(`soreness:${crewId}:${atMs}:${count}`)) count += 1
  return `soreness:${crewId}:${atMs}:${count}`
}
