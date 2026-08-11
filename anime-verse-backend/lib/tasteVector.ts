import { VECTOR_DIMENSION } from './tagVector.ts'

export interface SwipedAnime {
    action: 'SKIP' | 'LIKE' | 'LOVE'
    tasteVector: number[]
}

const SWIPE_WEIGHT: Record<SwipedAnime['action'], number> = { LOVE: 2, LIKE: 1, SKIP: -1 }

/*
 * computeTasteVector aggregates a user's swiped anime into one vector: a
 * weighted sum, weighted by how strongly each swipe action signals taste
 * (LOVE > LIKE > SKIP as negative signal). Not divided into an average —
 * cosine distance (the only consumer, in the recommendation query) is
 * scale-invariant, so dividing by swipe count would change every
 * dimension's magnitude without changing its direction or the resulting
 * ranking. Nor is the result normalized to unit length, for the same
 * reason. Returns null for zero swipes; mandatory onboarding means this
 * shouldn't happen in practice, but the endpoint that calls this treats it
 * as "no recommendations yet" rather than risking a divide-by-zero.
 */
export function computeTasteVector(swipes: SwipedAnime[]): number[] | null {
    if (swipes.length === 0) return null

    const sum = new Array<number>(VECTOR_DIMENSION).fill(0)
    for (const { action, tasteVector } of swipes) {
        const weight = SWIPE_WEIGHT[action]
        for (let i = 0; i < VECTOR_DIMENSION; i++) {
            sum[i]! += weight * tasteVector[i]!
        }
    }
    return sum
}
