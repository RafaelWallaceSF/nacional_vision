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

  await pool.query(`
    CREATE TABLE IF NOT EXISTS public.report_groups (
      id BIGSERIAL PRIMARY KEY,
      name VARCHAR(160) NOT NULL UNIQUE,
      group_type VARCHAR(40) NOT NULL,
      delivery_mode VARCHAR(40) NOT NULL DEFAULT 'individual',
      description TEXT,
      active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)

  await pool.query(`
    CREATE TABLE IF NOT EXISTS public.report_group_members (
      id BIGSERIAL PRIMARY KEY,
      group_id BIGINT NOT NULL REFERENCES public.report_groups(id) ON DELETE CASCADE,
      member_type VARCHAR(40) NOT NULL,
      member_key VARCHAR(190) NOT NULL,
      member_label VARCHAR(190) NOT NULL,
      channel VARCHAR(40),
      destination VARCHAR(190),
      active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (group_id, member_type, member_key)
    )
  `)

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_report_group_members_group_id
    ON public.report_group_members (group_id)
  `)

  await pool.query(`ALTER TABLE public.daily_report_rules DROP CONSTRAINT IF EXISTS chk_daily_report_rules_channel`)
  await pool.query(`ALTER TABLE public.daily_report_rules ADD CONSTRAINT chk_daily_report_rules_channel CHECK (channel::text = ANY (ARRAY['whatsapp','email','telegram','system','webhook']::text[]))`)
  await pool.query(`ALTER TABLE public.daily_report_rules DROP CONSTRAINT IF EXISTS chk_daily_report_rules_target_type`)
  await pool.query(`ALTER TABLE public.daily_report_rules ADD CONSTRAINT chk_daily_report_rules_target_type CHECK (target_type::text = ANY (ARRAY['supervisor','gerente','vendedor','setor','grupo_contato','group']::text[]))`)

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
