// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest'
import { applyPageMeta } from './usePageMeta.ts'

beforeEach(() => {
  document.head.innerHTML = ''
  document.title = ''
})

describe('applyPageMeta', () => {
  it('sets the document title with the " | AnimeVerse" suffix', () => {
    applyPageMeta({ title: 'Login', description: 'Log in to AnimeVerse.' })
    expect(document.title).toBe('Login | AnimeVerse')
  })

  it('creates the description meta tag if missing and sets its content', () => {
    applyPageMeta({ title: 'Login', description: 'Log in to AnimeVerse.' })
    const tag = document.querySelector('meta[name="description"]')
    expect(tag?.getAttribute('content')).toBe('Log in to AnimeVerse.')
  })

  it('updates an existing description meta tag instead of duplicating it', () => {
    applyPageMeta({ title: 'Login', description: 'First.' })
    applyPageMeta({ title: 'Signup', description: 'Second.' })
    const tags = document.querySelectorAll('meta[name="description"]')
    expect(tags).toHaveLength(1)
    expect(tags[0].getAttribute('content')).toBe('Second.')
  })

  it('sets the canonical link href to the site URL plus the current path', () => {
    window.history.pushState({}, '', '/login')
    applyPageMeta({ title: 'Login', description: 'Log in to AnimeVerse.' })
    const tag = document.querySelector('link[rel="canonical"]')
    expect(tag?.getAttribute('href')).toBe(`${window.location.origin}/login`)
  })

  it('updates an existing canonical link instead of duplicating it', () => {
    window.history.pushState({}, '', '/login')
    applyPageMeta({ title: 'Login', description: 'First.' })
    window.history.pushState({}, '', '/signup')
    applyPageMeta({ title: 'Signup', description: 'Second.' })
    const tags = document.querySelectorAll('link[rel="canonical"]')
    expect(tags).toHaveLength(1)
    expect(tags[0].getAttribute('href')).toBe(`${window.location.origin}/signup`)
  })
})
