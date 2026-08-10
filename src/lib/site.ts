export const SITE_NAME = 'AnimeVerse'

export const SITE_URL: string =
  import.meta.env.VITE_SITE_URL || (typeof window !== 'undefined' ? window.location.origin : '')
