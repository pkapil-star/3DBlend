import { Link, useParams } from 'react-router'
import {
  earthHospitalModel,
  personalPatternModel,
  sepRiskModel,
} from '../../data/index.ts'
import { EarthHospitalModelCard } from './EarthHospitalModelCard.tsx'
import { PersonalPatternModelCard } from './PersonalPatternModelCard.tsx'
import { SepRiskModelCard } from './SepRiskModelCard.tsx'

/**
 * The model card screen `#/model/:modelId` (sections 19.11 and 26.17): one
 * card per loaded model, every number read from that model's own file.
 */
export function ModelCardPage() {
  const { modelId = '' } = useParams()
  if (modelId === sepRiskModel.modelId) {
    return <SepRiskModelCard model={sepRiskModel} />
  }
  if (modelId === personalPatternModel.modelId) {
    return <PersonalPatternModelCard model={personalPatternModel} />
  }
  if (modelId === earthHospitalModel.modelId) {
    return <EarthHospitalModelCard model={earthHospitalModel} />
  }
  return (
    <section aria-labelledby="model-missing">
      <h1 id="model-missing" className="text-2xl font-semibold">
        No model card for this model
      </h1>
      <p className="mt-2">
        <Link to="/" className="underline underline-offset-4">
          Go to Home
        </Link>
      </p>
    </section>
  )
}
