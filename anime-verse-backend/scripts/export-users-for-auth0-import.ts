// anime-verse-backend/scripts/export-users-for-auth0-import.ts
//
// Run once, before Task 2's migration is applied to production Postgres
// (it reads the password column, which that migration drops). Writes an
// Auth0 bulk-user-import-formatted JSON file. See Auth0's docs for the
// import job itself: https://auth0.com/docs/manage-users/user-migration/bulk-user-imports
//
// Usage: npx tsx scripts/export-users-for-auth0-import.ts > users-import.json
//
// The output contains bcrypt hashes. Never commit it, and delete it as soon
// as the Auth0 import job succeeds.

import prisma from '../lib/prisma.ts'

async function main() {
    const users = await prisma.$queryRaw<{ email: string; password: string }[]>`
        SELECT email, password FROM "User"
    `

    const importFormat = users.map((user) => ({
        email: user.email,
        email_verified: true,
        custom_password_hash: { algorithm: 'bcrypt', hash: user.password }
    }))

    console.log(JSON.stringify(importFormat, null, 2))
}

main()
    .catch((err) => {
        console.error(err)
        process.exitCode = 1
    })
    .finally(() => prisma.$disconnect())
