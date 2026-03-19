import express from 'express';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import { initDb } from './initDb';
import { pool, testDbConnection } from './db';

const app = express();
const PORT = Number(process.env.PORT || 4000);

app.use(cors());
app.use(express.json());

app.get('/api/health', async (_req, res) => {
  try {
    const db = await testDbConnection();
    res.json({ ok: true, service: 'backend', database: 'connected', timestamp: db.now });
  } catch (error) {
    console.error(error);
    res.status(500).json({ ok: false, service: 'backend', database: 'error' });
  }
});

app.get('/api/auth/test-user', async (_req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, name, email, role, active, created_at
       FROM public.app_users
       WHERE email = $1
       LIMIT 1`,
      ['admin@teste.local'],
    );

    res.json(result.rows[0] ?? null);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Erro ao consultar usuário de teste' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body ?? {};

  try {
    const result = await pool.query(
      `SELECT id, name, email, password_hash, role, active
       FROM public.app_users
       WHERE email = $1
       LIMIT 1`,
      [email],
    );

    const user = result.rows[0];

    if (!user || !user.active) {
      return res.status(401).json({ ok: false, message: 'Credenciais inválidas' });
    }

    const matches = await bcrypt.compare(password, user.password_hash);

    if (!matches) {
      return res.status(401).json({ ok: false, message: 'Credenciais inválidas' });
    }

    return res.json({
      ok: true,
      token: 'mock-admin-token',
      user: {
        id: Number(user.id),
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ ok: false, message: 'Erro interno no login' });
  }
});

app.get('/api/users', async (_req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, name, email, role, active, created_at, updated_at
       FROM public.app_users
       ORDER BY id ASC`,
    );

    res.json(result.rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Erro ao listar usuários' });
  }
});

app.post('/api/users', async (req, res) => {
  const { name, email, password, role, active } = req.body ?? {};

  if (!name || !email || !password) {
    return res.status(400).json({ message: 'Nome, e-mail e senha são obrigatórios' });
  }

  try {
    const existing = await pool.query('SELECT id FROM public.app_users WHERE email = $1 LIMIT 1', [email]);
    if (existing.rowCount) {
      return res.status(409).json({ message: 'Já existe usuário com esse e-mail' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const result = await pool.query(
      `INSERT INTO public.app_users (name, email, password_hash, role, active)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, name, email, role, active, created_at, updated_at`,
      [name, email, passwordHash, role || 'user', active ?? true],
    );

    return res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Erro ao criar usuário' });
  }
});

app.put('/api/users/:id', async (req, res) => {
  const { id } = req.params;
  const { name, email, role, active, password } = req.body ?? {};

  try {
    const existing = await pool.query('SELECT id FROM public.app_users WHERE id = $1 LIMIT 1', [id]);
    if (!existing.rowCount) {
      return res.status(404).json({ message: 'Usuário não encontrado' });
    }

    if (password) {
      const passwordHash = await bcrypt.hash(password, 10);
      const result = await pool.query(
        `UPDATE public.app_users
         SET name = $1, email = $2, role = $3, active = $4, password_hash = $5, updated_at = NOW()
         WHERE id = $6
         RETURNING id, name, email, role, active, created_at, updated_at`,
        [name, email, role, active, passwordHash, id],
      );
      return res.json(result.rows[0]);
    }

    const result = await pool.query(
      `UPDATE public.app_users
       SET name = $1, email = $2, role = $3, active = $4, updated_at = NOW()
       WHERE id = $5
       RETURNING id, name, email, role, active, created_at, updated_at`,
      [name, email, role, active, id],
    );

    return res.json(result.rows[0]);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Erro ao atualizar usuário' });
  }
});

app.delete('/api/users/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const result = await pool.query('DELETE FROM public.app_users WHERE id = $1 RETURNING id', [id]);
    if (!result.rowCount) {
      return res.status(404).json({ message: 'Usuário não encontrado' });
    }

    return res.json({ ok: true });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Erro ao remover usuário' });
  }
});

app.get('/api/kpis', async (_req, res) => {
  try {
    const result = await pool.query('SELECT COUNT(*)::int AS total FROM public.app_users WHERE active = TRUE');
    res.json({
      users: result.rows[0]?.total ?? 0,
      reports: 87,
      schedules: 23,
      historyItems: 416,
    });
  } catch {
    res.json({ users: 0, reports: 87, schedules: 23, historyItems: 416 });
  }
});

app.get('/api/reports', (_req, res) => {
  res.json([
    { id: 1, name: 'Relatório Comercial', status: 'Pronto', updatedAt: '2026-03-19 18:30' },
    { id: 2, name: 'Relatório Financeiro', status: 'Processando', updatedAt: '2026-03-19 18:45' },
    { id: 3, name: 'Relatório Operacional', status: 'Pronto', updatedAt: '2026-03-19 19:00' }
  ]);
});

app.get('/api/schedules', (_req, res) => {
  res.json([
    { id: 1, title: 'Envio diário', when: 'Todo dia às 08:00', status: 'Ativo' },
    { id: 2, title: 'Fechamento semanal', when: 'Sexta às 18:00', status: 'Ativo' },
    { id: 3, title: 'Backup mensal', when: 'Dia 1 às 02:00', status: 'Pausado' }
  ]);
});

app.get('/api/history', (_req, res) => {
  res.json([
    { id: 1, event: 'Login realizado', user: 'admin', at: '2026-03-19 17:58' },
    { id: 2, event: 'Relatório gerado', user: 'sistema', at: '2026-03-19 18:32' },
    { id: 3, event: 'Agendamento atualizado', user: 'admin', at: '2026-03-19 19:06' }
  ]);
});

async function start() {
  try {
    await initDb();

    app.listen(PORT, '0.0.0.0', () => {
      console.log(`Backend running on http://0.0.0.0:${PORT}`);
    });
  } catch (error) {
    console.error('Failed to start backend:', error);
    process.exit(1);
  }
}

start();
