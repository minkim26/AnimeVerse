import { describe, it, expect } from 'vitest'
import { syncErrorMessage } from './authSync.ts'
import { ApiError } from '../services/api.ts'

describe('syncErrorMessage', () => {
  it('names the missing-email case for a 400 from /users/sync', () => {
    const message = syncErrorMessage(new ApiError(400, 'Auth0 token is missing the email claim'))
    expect(message).toMatch(/share an email address/)
  })

  it('shows the backend message as-is for a known ApiError that is not the missing-email case', () => {
    const message = syncErrorMessage(
      new ApiError(409, 'An account with this email already exists. Sign in with the method you used before.')
    )
    expect(message).toBe('An account with this email already exists. Sign in with the method you used before.')
  })

  it('falls back to a generic message for a non-ApiError failure', () => {
    expect(syncErrorMessage(new TypeError('Failed to fetch'))).toBe(
      'Something went wrong finishing your login. Please try again.'
    )
  })
})
