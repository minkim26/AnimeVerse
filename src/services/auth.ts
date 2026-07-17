import { apiRequest, setToken, clearToken, getToken } from './api.ts'

export interface User {
  id: number
  email: string
  avatarUrl: string | null
  avatarThumbnailUrl: string | null
  createdAt: string
}

export async function signUp(email: string, password: string): Promise<void> {
  await apiRequest('/users', { method: 'POST', body: { email, password } })
}

export async function signIn(email: string, password: string): Promise<void> {
  const { token } = await apiRequest<{ token: string }>('/users/login', {
    method: 'POST',
    body: { email, password },
  })
  setToken(token)
}

export function signOut(): void {
  clearToken()
}

export function isAuthenticated(): boolean {
  return getToken() !== null
}

export async function getCurrentUser(): Promise<User> {
  return apiRequest<User>('/users/me', { auth: true })
}

export async function updatePassword(oldPassword: string, newPassword: string): Promise<void> {
  await apiRequest('/users/me/password', {
    method: 'PATCH',
    auth: true,
    body: { oldPassword, newPassword },
  })
}
