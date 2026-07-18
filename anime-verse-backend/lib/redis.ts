import dotenv from 'dotenv'
import { createClient } from 'redis'

dotenv.config({ path: '.env.local' })

const redis = createClient({ url: process.env.REDIS_URL })

redis.on('error', (err) => console.error('Redis client error:', err))
redis.connect().catch((err) => console.error('Redis connect error:', err))

export default redis
