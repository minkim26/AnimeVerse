import { getToken, ApiError } from './api.ts'

const API_URL = import.meta.env.VITE_API_URL

export async function uploadAvatar(file: File): Promise<{ avatarUrl: string }> {
  const formData = new FormData()
  formData.append('file', file)

  const token = getToken()
  const response = await fetch(`${API_URL}/avatar`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: formData,
  })

  const data = await response.json().catch(() => ({}))

  if (!response.ok) {
    throw new ApiError(response.status, data.error ?? 'Upload failed')
  }

  return data
}

const POLL_INTERVAL_MS = 2000
const MAX_POLL_ATTEMPTS = 30

/**
 * Polls `fetchUser` until it reports a thumbnail, then calls `onReady` once
 * and stops. Gives up silently after `MAX_POLL_ATTEMPTS` (the consumer likely
 * dead-lettered the job). Returns a cancel function for effect cleanup.
 */
export function pollForThumbnail(
  fetchUser: () => Promise<{ avatarThumbnailUrl: string | null }>,
  onReady: (thumbnailUrl: string) => void,
): () => void {
  let attempts = 0
  let cancelled = false

  const timer = setInterval(async () => {
    attempts += 1
    try {
      const user = await fetchUser()
      if (cancelled) return
      if (user.avatarThumbnailUrl) {
        clearInterval(timer)
        onReady(user.avatarThumbnailUrl)
        return
      }
    } catch {
      // transient network hiccup — fall through and retry
    }
    if (attempts >= MAX_POLL_ATTEMPTS) clearInterval(timer)
  }, POLL_INTERVAL_MS)

  return () => {
    cancelled = true
    clearInterval(timer)
  }
}
