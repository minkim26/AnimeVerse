import { ApiError } from '../services/api.ts'

/*
 * The backend 400s /users/sync specifically when the Auth0 token has no
 * email claim — happens when a social connection's IdP doesn't return an
 * email (e.g. a GitHub account with a private email, if the connection
 * isn't scoped to read it). That's a real, recoverable case, not a bug
 * report, so it gets its own message instead of a generic failure one.
 */
export function syncErrorMessage(err: unknown): string {
  if (err instanceof ApiError && err.status === 400) {
    return "We couldn't finish signing you in because your account didn't share an email address with us. Enable email access with your sign-in provider, or use a different sign-in method."
  }
  return 'Something went wrong finishing your login. Please try again.'
}
