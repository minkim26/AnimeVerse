import { describe, it, expect } from 'vitest'

import { computeTasteVector } from './tasteVector.ts'
import { VECTOR_DIMENSION } from './tagVector.ts'

function uniformVector(value: number): number[] {
    return new Array(VECTOR_DIMENSION).fill(value)
}

describe('computeTasteVector', () => {
    it('returns null for zero swipes', () => {
        expect(computeTasteVector([])).toBeNull()
    })

    it('produces a vector of the correct dimension', () => {
        const result = computeTasteVector([{ action: 'LIKE', tasteVector: uniformVector(1) }])
        expect(result).toHaveLength(VECTOR_DIMENSION)
    })

    it('weights LOVE more heavily than LIKE', () => {
        const result = computeTasteVector([
            { action: 'LOVE', tasteVector: uniformVector(1) },
            { action: 'LIKE', tasteVector: uniformVector(1) },
        ])
        // 2*1 + 1*1 = 3 in every dimension
        expect(result?.[0]).toBeCloseTo(3)
    })

    it('weights SKIP as negative signal', () => {
        const result = computeTasteVector([{ action: 'SKIP', tasteVector: uniformVector(1) }])
        expect(result?.[0]).toBeCloseTo(-1)
    })

    it('aggregates each vector dimension independently', () => {
        const a = new Array(VECTOR_DIMENSION).fill(0)
        a[0] = 1
        const b = new Array(VECTOR_DIMENSION).fill(0)
        b[1] = 1
        const result = computeTasteVector([
            { action: 'LIKE', tasteVector: a },
            { action: 'LIKE', tasteVector: b },
        ])
        expect(result?.[0]).toBeCloseTo(1)
        expect(result?.[1]).toBeCloseTo(1)
        expect(result?.[2]).toBeCloseTo(0)
    })
})
