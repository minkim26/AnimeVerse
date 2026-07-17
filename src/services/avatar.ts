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
