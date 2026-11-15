import { existsSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  checkNodeNames,
  gltfNodeNames,
  readGlbJson,
} from '../../bodyview/modelContract.ts'
import { bodyModels } from '../bodyView.ts'

// Section 27: every manifest entry with status "delivered" has a file that
// parses, has every required node and is at most 4 MB. tools/check_body_model.py
// runs the full contract check on the same files.
// The lightweight mannequin contract allows 4 MB; an anatomical model with
// layers, 20 MB (section 23.12, set from the B3 load measurements).
const MAX_BYTES = 4_000_000
const ANATOMICAL_MAX_BYTES = 20_000_000
const delivered = bodyModels.filter((model) => model.status === 'delivered')

describe('delivered body models', () => {
  it('placeholders have no file and delivered models have one', () => {
    for (const model of bodyModels) {
      expect(model.file === null).toBe(model.status === 'placeholder')
    }
  })

  it.each(
    delivered.map((model) => [model.id, model.file ?? '', model] as const),
  )(
    '%s: %s parses, has every contract role and fits its size budget',
    (_id, file, model) => {
      const path = join(process.cwd(), 'public', file)
      expect(existsSync(path)).toBe(true)
      expect(statSync(path).size).toBeLessThanOrEqual(
        model.layers ? ANATOMICAL_MAX_BYTES : MAX_BYTES,
      )
      const bytes = readFileSync(path)
      const buffer = bytes.buffer.slice(
        bytes.byteOffset,
        bytes.byteOffset + bytes.byteLength,
      )
      const names = gltfNodeNames(readGlbJson(buffer))
      expect(checkNodeNames(names, model.nodeMap)).toEqual({
        outcome: 'accept',
        missing: [],
      })
    },
  )
})
