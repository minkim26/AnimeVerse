import { defineConfig } from 'vitest/config'

export default defineConfig({
    test: {
        /*
         * Integration tests share real external Postgres/Redis/RabbitMQ
         * state (rate-limit counters, cached keys, queues). Running test
         * files in parallel would let their requests interleave against
         * that shared state and produce flaky counts, so files run one at
         * a time; each file is still responsible for cleaning up the keys
         * it owns.
         */
        fileParallelism: false,
        testTimeout: 15_000,
        hookTimeout: 15_000
    }
})
