import prisma from '../lib/prisma.ts'

import quotes from '../data/quotes.json' with { type: 'json' }
import titles from '../data/titles.json' with { type: 'json' }

const quoteResult = await prisma.quote.createMany({ data: quotes })
console.log(`Created ${quoteResult.count} quotes`)

const titleResult = await prisma.title.createMany({ data: titles })
console.log(`Created ${titleResult.count} titles`)

await prisma.$disconnect()
