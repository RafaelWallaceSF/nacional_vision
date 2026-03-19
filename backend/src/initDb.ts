import bcrypt from 'bcryptjs'
import { pool } from './db'

export async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS public.app_users (
      id BIGSERIAL PRIMARY KEY,
      name VARCHAR(150) NOT NULL,
      email VARCHAR(190) NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role VARCHAR(50) NOT NULL DEFAULT 'user',
      active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_app_users_email
    ON public.app_users (email)
  `)

  const existing = await pool.query(
    'SELECT id FROM public.app_users WHERE email = $1 LIMIT 1',
    ['admin@teste.local'],
  )

  if (existing.rowCount === 0) {
    const passwordHash = await bcrypt.hash('Admin@123', 10)

    await pool.query(
      `INSERT INTO public.app_users (name, email, password_hash, role, active)
       VALUES ($1, $2, $3, $4, $5)`,
      ['Admin Teste', 'admin@teste.local', passwordHash, 'admin', true],
    )
  }
}
