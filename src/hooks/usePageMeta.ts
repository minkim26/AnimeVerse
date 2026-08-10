import { useEffect } from 'react'
import { SITE_NAME, SITE_URL } from '../lib/site.ts'

interface PageMetaOptions {
  title: string
  description: string
}

export function applyPageMeta({ title, description }: PageMetaOptions): void {
  document.title = `${title} | ${SITE_NAME}`

  let descriptionTag = document.querySelector('meta[name="description"]')
  if (!descriptionTag) {
    descriptionTag = document.createElement('meta')
    descriptionTag.setAttribute('name', 'description')
    document.head.appendChild(descriptionTag)
  }
  descriptionTag.setAttribute('content', description)

  let canonicalTag = document.querySelector('link[rel="canonical"]')
  if (!canonicalTag) {
    canonicalTag = document.createElement('link')
    canonicalTag.setAttribute('rel', 'canonical')
    document.head.appendChild(canonicalTag)
  }
  canonicalTag.setAttribute('href', `${SITE_URL}${window.location.pathname}`)
}

export default function usePageMeta(options: PageMetaOptions): void {
  useEffect(() => {
    applyPageMeta(options)
  }, [options.title, options.description])
}
