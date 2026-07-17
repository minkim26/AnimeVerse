import { vi } from 'vitest'

/*
 * A real (tiny, valid) 1x1 PNG, so sharp's resize pipeline runs against
 * real image bytes in tests instead of a fake buffer that would just throw.
 */
export const FAKE_PNG = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
    'base64'
)

export const mockUpload = vi.fn().mockResolvedValue({ error: null })
export const mockDownload = vi.fn().mockResolvedValue({
    data: { arrayBuffer: async () => FAKE_PNG },
    error: null
})
export const mockGetPublicUrl = vi.fn().mockReturnValue({ data: { publicUrl: 'http://fake.test/avatar.png' } })

/*
 * The shape api/avatar.ts and consumer.ts actually call:
 * supabase.storage.from(bucket).{upload,download,getPublicUrl}(...).
 * Import this as the `default` export of a `vi.mock('../lib/supabase.ts', ...)`
 * factory in each test file that needs it — vi.mock is hoisted and
 * file-scoped, so it can't be called from here directly.
 */
export const supabaseMock = {
    storage: {
        from: () => ({
            upload: mockUpload,
            download: mockDownload,
            getPublicUrl: mockGetPublicUrl
        })
    }
}
