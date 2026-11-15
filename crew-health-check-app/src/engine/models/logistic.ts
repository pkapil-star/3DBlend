// Shared arithmetic of the two logistic-regression models in the app,
// sep-risk (section 26.10) and earth-hospital (section 26.19). It mirrors the
// Python exports step by step: each input is standardized with the training
// mean and scale, multiplied by its coefficient, and summed with the intercept.

/** One standardized input of a logistic regression. */
export interface LogisticFeature {
  mean: number
  scale: number
  coef: number
}

/** This input's share of the logit: coef × (value − mean) ÷ scale. */
export function logisticContribution(
  feature: LogisticFeature,
  value: number,
): number {
  return (feature.coef * (value - feature.mean)) / feature.scale
}

/** intercept + the sum of the contributions, in feature order. */
export function logisticLogit(
  intercept: number,
  features: readonly LogisticFeature[],
  values: readonly number[],
): number {
  let logit = intercept
  features.forEach((feature, index) => {
    logit += logisticContribution(feature, values[index] ?? 0)
  })
  return logit
}

/** The model output between 0 and 1. */
export function logisticOutput(logit: number): number {
  return 1 / (1 + Math.exp(-logit))
}
