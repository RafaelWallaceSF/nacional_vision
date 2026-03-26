import 'dotenv/config'
import { Pool } from 'pg'

export const pool = new Pool({
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 5432),
  database: process.env.DB_NAME || 'nacional_vision',
  user: process.env.DB_USER || 'nacional_user',
  password: process.env.DB_PASSWORD || 'nacional_123',
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
})

export async function testDbConnection() {
  const client = await pool.connect()
  try {
    const result = await client.query('SELECT NOW() AS now')
    return result.rows[0]
  } finally {
    client.release()
  }
}
