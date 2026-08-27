import { describe, it, expect } from 'vitest'
import { syncErrorMessage } from './authSync.ts'
import { ApiError } from '../services/api.ts'

describe('syncErrorMessage', () => {
  it('names the missing-email case for a 400 from /users/sync', () => {
    const message = syncErrorMessage(new ApiError(400, 'Auth0 token is missing the email claim'))
    expect(message).toMatch(/share an email address/)
  })

  it('falls back to a generic message for any other failure', () => {
    expect(syncErrorMessage(new ApiError(500, 'Internal Server Error'))).toBe(
      'Something went wrong finishing your login. Please try again.'
    )
    expect(syncErrorMessage(new TypeError('Failed to fetch'))).toBe(
      'Something went wrong finishing your login. Please try again.'
    )
  })
})
