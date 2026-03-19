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
        id: user.id,
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

app.get('/api/kpis', (_req, res) => {
  res.json({
    users: 1284,
    reports: 87,
    schedules: 23,
    historyItems: 416
  });
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
