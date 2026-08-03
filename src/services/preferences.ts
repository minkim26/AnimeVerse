import { apiRequest } from './api.ts'

export interface Preferences {
  genres: string[]
  showAdultContent: boolean
}

export async function getPreferences(): Promise<Preferences> {
  return apiRequest<Preferences>('/preferences/me', { auth: true })
}

export async function savePreferences(preferences: Preferences): Promise<Preferences> {
  return apiRequest<Preferences>('/preferences/me', {
    method: 'PUT',
    auth: true,
    body: preferences,
  })
}
