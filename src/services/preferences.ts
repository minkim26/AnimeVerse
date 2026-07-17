import { apiRequest } from './api.ts'

export async function getPreferences(): Promise<string[]> {
  const { genres } = await apiRequest<{ genres: string[] }>('/preferences/me', { auth: true })
  return genres
}

export async function savePreferences(genres: string[]): Promise<string[]> {
  const result = await apiRequest<{ genres: string[] }>('/preferences/me', {
    method: 'PUT',
    auth: true,
    body: { genres },
  })
  return result.genres
}
