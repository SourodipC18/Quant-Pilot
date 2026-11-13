import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import * as schema from './schema'

const globalForDb = globalThis as typeof globalThis & { quantPilotPool?: Pool }
export const pool = globalForDb.quantPilotPool ?? new Pool({ connectionString: process.env.DATABASE_URL, max: 8, idleTimeoutMillis: 30_000, connectionTimeoutMillis: 10_000 })
if (process.env.NODE_ENV !== 'production') globalForDb.quantPilotPool = pool
export const db = drizzle(pool, { schema })
