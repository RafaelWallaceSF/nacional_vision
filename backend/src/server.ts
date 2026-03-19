import express from 'express';
import cors from 'cors';

const app = express();
const PORT = Number(process.env.PORT || 4000);

const TEST_ADMIN = {
  id: 1,
  name: 'Admin Teste',
  email: 'admin@teste.local',
  password: 'Admin@123',
  role: 'admin'
};

app.use(cors());
app.use(express.json());

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'backend', timestamp: new Date().toISOString() });
});

app.get('/api/auth/test-user', (_req, res) => {
  res.json({
    id: TEST_ADMIN.id,
    name: TEST_ADMIN.name,
    email: TEST_ADMIN.email,
    role: TEST_ADMIN.role,
    password: TEST_ADMIN.password
  });
});

app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body ?? {};

  if (email === TEST_ADMIN.email && password === TEST_ADMIN.password) {
    return res.json({
      ok: true,
      token: 'mock-admin-token',
      user: {
        id: TEST_ADMIN.id,
        name: TEST_ADMIN.name,
        email: TEST_ADMIN.email,
        role: TEST_ADMIN.role
      }
    });
  }

  return res.status(401).json({
    ok: false,
    message: 'Credenciais inválidas'
  });
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

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Backend running on http://0.0.0.0:${PORT}`);
});
