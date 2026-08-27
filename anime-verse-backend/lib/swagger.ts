import swaggerJSDoc from 'swagger-jsdoc'

/*
 * Spec is assembled once at startup from @openapi JSDoc blocks in api/*.ts —
 * see any route file for the annotation format. Served at GET /api-docs
 * (app.ts) via swagger-ui-express.
 */
const spec = swaggerJSDoc({
    definition: {
        openapi: '3.0.0',
        info: {
            title: 'AnimeVerse API',
            version: '1.0.0',
            description: 'Express + Prisma + Postgres API backing AnimeVerse. Endpoints marked with a lock icon require `Authorization: Bearer <jwt>`.'
        },
        components: {
            securitySchemes: {
                bearerAuth: {
                    type: 'http',
                    scheme: 'bearer',
                    bearerFormat: 'JWT',
                    description: 'An Auth0-issued access token (see POST /users/sync), not a self-issued one.'
                },
                cronSecret: { type: 'apiKey', in: 'header', name: 'X-Cron-Secret' }
            }
        }
    },
    apis: ['./api/*.ts', './app.ts']
})

export default spec
