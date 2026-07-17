import { apiRequest } from './api.ts'

export interface Title {
  id: number
  title: string
  episodes: number
}

export async function getRandomTitle(): Promise<Title> {
  return apiRequest<Title>('/titles/random')
}
