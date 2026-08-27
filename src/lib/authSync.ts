import { ApiError } from '../services/api.ts'

// The exact string anime-verse-backend/api/users.ts sends for a token with
// no email claim — matched on message, not just status, since /users/sync
// also 400s a request signature error and 409s a duplicate-email conflict,
// and those need their own wording, not this one's.
const MISSING_EMAIL_MESSAGE = 'Auth0 token is missing the email claim'

/*
 * /users/sync can fail for more than one reason. The missing-email case is
 * the only one whose backend message is written for logs, not for a user to
 * read, so it gets its own friendlier copy here. Every other failure the
 * backend sends from this route (e.g. the 409 when this email already
 * belongs to a different sign-in identity) already carries a message
 * written for display, so it's shown as-is instead of being flattened into
 * one generic string that would hide what actually went wrong.
 */
export function syncErrorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.message === MISSING_EMAIL_MESSAGE) {
      return "We couldn't finish signing you in because your account didn't share an email address with us. Enable email access with your sign-in provider, or use a different sign-in method."
    }
    return err.message
  }
  return 'Something went wrong finishing your login. Please try again.'
}
