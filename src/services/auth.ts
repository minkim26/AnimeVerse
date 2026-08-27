import { apiRequest } from './api.ts'

export interface User {
  id: number
  email: string
  avatarUrl: string | null
  avatarThumbnailUrl: string | null
  providerAvatarUrl: string | null
  createdAt: string
}

export async function getCurrentUser(): Promise<User> {
  return apiRequest<User>('/users/me', { auth: true })
}

export async function deleteAccount(): Promise<void> {
  await apiRequest<void>('/users/me', { method: 'DELETE', auth: true })
}
