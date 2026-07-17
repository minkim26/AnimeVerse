# Avatar Upload Pipeline

Uploading a profile picture is the one feature in AnimeVerse with a genuinely asynchronous request lifecycle: the HTTP response comes back before the thumbnail exists. This doc walks through the full path, end to end, referencing the actual code.

## Overview

```
Browser                Express API              Supabase Storage        RabbitMQ           consumer.ts
   |  POST /avatar          |                          |                    |                    |
   |  multipart/form-data   |                          |                    |                    |
   |------------------------>                          |                    |                    |
   |                        |-- upload original ------->                    |                    |
   |                        |   (avatars bucket)        |                    |                    |
   |                        |<-- publicUrl -------------|                    |                    |
   |                        |-- UPDATE User.avatarUrl (Prisma)               |                    |
   |                        |-- publish {userId, filename} ------------------>                    |
   |  201 { avatarUrl }     |                          |                    |                    |
   |<------------------------|                          |                    |                    |
   |                        |                          |                    |-- consume message --->
   |                        |                          |                    |                    |-- download original
   |                        |                          |<-------------------------------------------|
   |                        |                          |                    |                    |-- resize 128x128 (sharp)
   |                        |                          |<-- upload thumbnail (avatar-thumbnails) --|
   |                        |                          |                    |                    |-- UPDATE User.avatarThumbnailUrl (Prisma)
   |                        |                          |                    |                    |-- ack message
```

The client only sees the top row (`POST /avatar` → `201 { avatarUrl }`). Everything below the dashed line happens after the HTTP response has already been sent.

## Step by step

### 1. Upload (`anime-verse-backend/api/avatar.ts`)

- `POST /avatar` is `requireAuth`-protected and expects `multipart/form-data` with a single file field named `file`.
- `multer` is configured with `memoryStorage()` (the file buffer never touches disk) and a `fileFilter` that rejects anything whose MIME type doesn't start with `image/`.
- The filename is generated as `${userId}-${Date.now()}${ext}` — extension is derived from MIME type via a small lookup table (`MIME_TO_EXT`), falling back to the MIME subtype or `.bin`.
- The buffer is uploaded to the `avatars` Supabase Storage bucket with `upsert: true`.
- `User.avatarUrl` is updated via Prisma **immediately**, using the bucket's public URL — the frontend can show the full-size original right away, even before a thumbnail exists.
- A message `{ userId, filename }` is published to the `avatar-thumbnails` RabbitMQ queue (`durable: true`, message `persistent: true`, so it survives a RabbitMQ restart).
- The RabbitMQ channel is lazily created and cached (module-level `channel` variable) rather than reconnecting per request.
- If the RabbitMQ publish fails, the error is logged but the request still returns `201` — the user gets their full-size avatar either way; they just won't get a thumbnail until the failure is investigated (there's currently no retry-on-publish-failure logic).

### 2. Consume and thumbnail (`anime-verse-backend/consumer.ts`)

- Runs as its own long-lived process (`consumer` service in `compose.yml`, or `npx tsx consumer.ts` outside Docker).
- Connects to RabbitMQ, asserts the same `avatar-thumbnails` queue (`durable: true`), and sets `prefetch(1)` — it processes one message at a time rather than pulling the whole queue into memory.
- For each message: downloads the original from the `avatars` bucket, resizes to 128x128 with `sharp` (`fit: 'cover'`, re-encoded as JPEG regardless of the original format), and uploads the result to the `avatar-thumbnails` bucket using the same base filename with a `.jpg` extension.
- `User.avatarThumbnailUrl` is updated via Prisma using the thumbnail's public URL.
- On success, the message is acknowledged (`channel.ack`). On any failure (bad JSON, download error, upload error, Prisma error), the message is `nack`'d with `requeue: false` — it goes to RabbitMQ's default dead-lettering behavior (dropped, since no dead-letter exchange is configured) rather than retried indefinitely.

### 3. Frontend behavior (`src/pages/Profile.tsx`)

- `AvatarUpload` calls `uploadAvatar(file)` (`src/services/avatar.ts`), which posts the file via `FormData` and a manual `fetch` call (not the shared `apiRequest` wrapper, since that wrapper always sets a JSON `Content-Type` header, which would break the multipart boundary).
- On success, `Profile.tsx` updates local state with the new `avatarUrl` and resets `avatarThumbnailUrl` to `null`.
- While `avatarUrl` is set but `avatarThumbnailUrl` is still `null`, the UI shows "Generating thumbnail..." beneath the full-size image.
- There is currently no polling or websocket to notify the frontend when the thumbnail becomes ready — a manual refresh (which re-fetches `GET /users/me`) is what picks up `avatarThumbnailUrl` once the consumer finishes. This is a known gap, not a bug: the pipeline was verified by uploading, waiting, then re-querying `/users/me` directly.

## Debugging

- **Thumbnail never appears**: check the `consumer` service logs (`docker compose logs consumer`) for a stack trace, and check the RabbitMQ management UI (if enabled) for messages stuck in `avatar-thumbnails` or being redelivered.
- **Upload succeeds but `avatarUrl` doesn't load in the browser**: confirm the `avatars` bucket is public (see [supabase-setup.md](supabase-setup.md)) — a private bucket's public URL will 400/403 even though the upload itself succeeded.
- **RabbitMQ publish errors in the API logs**: confirm `RABBITMQ_URL` is reachable from wherever the API process is running (`rabbitmq` as host inside Docker Compose, `localhost` outside it) and that the `rabbitmq` container's health check is passing before the API starts.
