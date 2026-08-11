import { Router } from 'express'

import usersRouter from './users.ts'
import preferencesRouter from './preferences.ts'
import watchlistRouter from './watchlist.ts'
import reviewsRouter from './reviews.ts'
import quotesRouter from './quotes.ts'
import titlesRouter from './titles.ts'
import avatarRouter from './avatar.ts'
import swipesRouter from './swipes.ts'
import recommendationsRouter from './recommendations.ts'

const router = Router()
router.use('/users', usersRouter)
router.use('/preferences', preferencesRouter)
router.use('/watchlist', watchlistRouter)
router.use('/reviews', reviewsRouter)
router.use('/quotes', quotesRouter)
router.use('/titles', titlesRouter)
router.use('/avatar', avatarRouter)
router.use('/swipes', swipesRouter)
router.use('/recommendations', recommendationsRouter)

export default router
