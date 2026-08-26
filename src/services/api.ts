const API_URL = import.meta.env.VITE_API_URL

export class ApiError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

let tokenGetter: (() => Promise<string>) | null = null

// Registered once by Auth0SyncGate, since getAccessTokenSilently is only
// reachable via the useAuth0() hook, but apiRequest is a plain function
// called from services/*.ts files with no component tree of their own.
export function setAccessTokenGetter(fn: () => Promise<string>): void {
  tokenGetter = fn
}

export function getToken(): string | null {
  return localStorage.getItem('token')
}

export function setToken(token: string): void {
  localStorage.setItem('token', token)
}

export function clearToken(): void {
  localStorage.removeItem('token')
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  body?: unknown
  auth?: boolean
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, auth = false } = options
  // FormData bodies (file uploads) are passed through as-is: the browser
  // sets its own multipart Content-Type with boundary, and JSON.stringify
  // would mangle a File into "{}".
  const isFormData = body instanceof FormData

  const headers: Record<string, string> = {}
  if (body !== undefined && !isFormData) {
    headers['Content-Type'] = 'application/json'
  }
  if (auth) {
    if (!tokenGetter) {
      throw new Error('Auth0 is not initialized yet')
    }
    headers.Authorization = `Bearer ${await tokenGetter()}`
  }

  const response = await fetch(`${API_URL}${path}`, {
    method,
    headers,
    body: isFormData ? body : body !== undefined ? JSON.stringify(body) : undefined,
  })

  if (response.status === 204) {
    return undefined as T
  }

  const data = await response.json().catch(() => ({}))

  if (!response.ok) {
    throw new ApiError(response.status, data.error ?? 'Request failed')
  }

  return data as T
}
