import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { pollForThumbnail } from './avatar.ts'

const POLL_INTERVAL_MS = 2000
const MAX_POLL_ATTEMPTS = 30

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('pollForThumbnail', () => {
  it('calls onReady and stops polling once a thumbnail appears', async () => {
    const fetchUser = vi
      .fn()
      .mockResolvedValueOnce({ avatarThumbnailUrl: null })
      .mockResolvedValueOnce({ avatarThumbnailUrl: 'thumb.jpg' })
    const onReady = vi.fn()

    pollForThumbnail(fetchUser, onReady)

    await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS)
    expect(onReady).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS)
    expect(onReady).toHaveBeenCalledWith('thumb.jpg')

    const callsAfterReady = fetchUser.mock.calls.length
    await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS * 5)
    expect(fetchUser).toHaveBeenCalledTimes(callsAfterReady)
  })

  it('gives up after MAX_POLL_ATTEMPTS without calling onReady', async () => {
    const fetchUser = vi.fn().mockResolvedValue({ avatarThumbnailUrl: null })
    const onReady = vi.fn()

    pollForThumbnail(fetchUser, onReady)

    await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS * MAX_POLL_ATTEMPTS)
    expect(fetchUser).toHaveBeenCalledTimes(MAX_POLL_ATTEMPTS)

    await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS * 5)
    expect(fetchUser).toHaveBeenCalledTimes(MAX_POLL_ATTEMPTS)
    expect(onReady).not.toHaveBeenCalled()
  })

  it('stops polling once cancelled', async () => {
    const fetchUser = vi.fn().mockResolvedValue({ avatarThumbnailUrl: null })
    const onReady = vi.fn()

    const cancel = pollForThumbnail(fetchUser, onReady)
    await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS)
    cancel()

    await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS * 5)
    expect(fetchUser).toHaveBeenCalledTimes(1)
  })

  it('keeps retrying through a transient fetch failure', async () => {
    const fetchUser = vi
      .fn()
      .mockRejectedValueOnce(new Error('network hiccup'))
      .mockResolvedValueOnce({ avatarThumbnailUrl: 'thumb.jpg' })
    const onReady = vi.fn()

    pollForThumbnail(fetchUser, onReady)

    await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS)
    expect(onReady).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS)
    expect(onReady).toHaveBeenCalledWith('thumb.jpg')
  })
})
