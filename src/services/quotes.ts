import { apiRequest } from './api.ts'

export interface Quote {
  id: number
  quote: string
  character: string
  anime: string
}

export async function getRandomQuote(): Promise<Quote> {
  return apiRequest<Quote>('/quotes/random')
}
