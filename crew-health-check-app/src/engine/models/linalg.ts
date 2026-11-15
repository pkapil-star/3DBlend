// Small dense linear algebra for the personal pattern model (ARCHITECTURE.md
// section 26.18). Matrices are arrays of rows. The loops mirror cholesky()
// and solve_cholesky() in ml/personal_pattern.py, so both refuse exactly the
// same matrices.

export type Matrix = readonly (readonly number[])[]

function entry(matrix: Matrix, row: number, column: number): number {
  return matrix[row]?.[column] ?? Number.NaN
}

/**
 * The lower factor L with L Lᵀ = matrix, or null when the matrix is not
 * positive definite (a pivot that is not a positive finite number).
 */
export function cholesky(matrix: Matrix): number[][] | null {
  const size = matrix.length
  const lower = Array.from({ length: size }, () =>
    new Array<number>(size).fill(0),
  )
  for (let i = 0; i < size; i++) {
    const rowI = lower[i] ?? []
    for (let j = 0; j <= i; j++) {
      const rowJ = lower[j] ?? []
      let total = entry(matrix, i, j)
      for (let k = 0; k < j; k++) {
        total -= (rowI[k] ?? 0) * (rowJ[k] ?? 0)
      }
      if (i === j) {
        if (!(Number.isFinite(total) && total > 0)) return null
        rowI[i] = Math.sqrt(total)
      } else {
        rowI[j] = total / (rowJ[j] ?? Number.NaN)
      }
    }
  }
  return lower
}

/** x with L Lᵀ x = vector: forward, then back substitution. */
export function solveCholesky(
  lower: Matrix,
  vector: readonly number[],
): number[] {
  const size = lower.length
  const forward = new Array<number>(size).fill(0)
  for (let i = 0; i < size; i++) {
    let total = vector[i] ?? Number.NaN
    for (let k = 0; k < i; k++) {
      total -= entry(lower, i, k) * (forward[k] ?? 0)
    }
    forward[i] = total / entry(lower, i, i)
  }
  const solution = new Array<number>(size).fill(0)
  for (let i = size - 1; i >= 0; i--) {
    let total = forward[i] ?? Number.NaN
    for (let k = i + 1; k < size; k++) {
      total -= entry(lower, k, i) * (solution[k] ?? 0)
    }
    solution[i] = total / entry(lower, i, i)
  }
  return solution
}
