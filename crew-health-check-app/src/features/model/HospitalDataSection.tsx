import { Card } from '../../components/Card.tsx'
import type { EarthHospitalModelFile } from '../../engine/index.ts'

const EXCLUSION_WORDS: Record<string, string> = {
  stayAtMost24Hours: 'stay of 24 hours or less',
  labelInFirst24Hours: 'labelled in the first 24 hours',
  tooFewBaselineValues: 'too few values in the first 24 hours',
  noHourWithAllFive: 'no later hour with all five values',
}

/** The data, its licence and citations, and the patient counts per hospital and split. */
export function HospitalDataSection({
  model,
}: {
  model: EarthHospitalModelFile
}) {
  const { data } = model
  const splits = [
    ['Training (hospital A)', data.splits.train],
    ['Validation (hospital A)', data.splits.validation],
    ['External test (hospital B)', data.splits.test],
  ] as const
  return (
    <Card title="Data">
      <p>
        {data.source}, version {data.version}:{' '}
        <a
          href={data.page}
          target="_blank"
          rel="noreferrer"
          className="underline underline-offset-4"
        >
          PhysioNet project page
        </a>{' '}
        ({data.doi}). Hourly records of ICU patients from two hospital systems.
        Not NASA data, and not about astronauts.
      </p>
      <p className="mt-2">
        Licence: the project page says &ldquo;{data.licenseOnPage}&rdquo;; the
        licence file in the project&rsquo;s files begins &ldquo;
        {data.licenseFileFirstLine.replace(/^#+\s*/, '')}&rdquo;. This project
        gives the attribution both ask for and publishes no part of the
        database.
      </p>
      <h3 className="mt-4 font-semibold">Citations, as PhysioNet asks</h3>
      <ul className="mt-1 list-disc space-y-1 pl-5">
        {data.citations.map((citation) => (
          <li key={citation}>{citation}</li>
        ))}
      </ul>
      <h3 className="mt-4 font-semibold">Patients</h3>
      <ul className="mt-1 list-disc space-y-1 pl-5">
        {Object.entries(data.hospitals).map(([code, hospital]) => (
          <li key={code}>
            Hospital {code}: {hospital.patients} patients, {hospital.included}{' '}
            included. Left out:{' '}
            {Object.entries(hospital.excluded)
              .map(
                ([reason, count]) =>
                  `${count} ${EXCLUSION_WORDS[reason] ?? reason}`,
              )
              .join('; ')}
            .
          </li>
        ))}
      </ul>
      <h3 className="mt-4 font-semibold">Splits, by patient</h3>
      <ul className="mt-1 list-disc space-y-1 pl-5">
        {splits.map(([name, split]) => (
          <li key={name}>
            {name}: {split.patients} patients, {split.rows} hours,{' '}
            {split.positiveRows} labelled hours from{' '}
            {split.patientsWithPositiveRow} patients.
          </li>
        ))}
      </ul>
    </Card>
  )
}
