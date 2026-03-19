import express from 'express';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import { initDb } from './initDb';
import { pool, testDbConnection } from './db';

const app = express();
const PORT = Number(process.env.PORT || 4000);

app.use(cors());
app.use(express.json());

function toNumber(value: unknown) {
  if (value === null || value === undefined) return 0;
  return Number(String(value).replace(/\./g, '').replace(',', '.')) || 0;
}

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

app.get('/api/reports/maiores-quedas', async (req, res) => {
  const referenceDate = typeof req.query.referenceDate === 'string' ? req.query.referenceDate : new Date().toISOString().slice(0, 10);
  const top = Math.min(Number(req.query.top || 30), 200);

  try {
    const periodsResult = await pool.query(
      `WITH params AS (
         SELECT $1::date AS ref_date
       ),
       current_period AS (
         SELECT d::date AS day
         FROM params, generate_series(date_trunc('month', ref_date)::date, ref_date, interval '1 day') d
         WHERE EXTRACT(ISODOW FROM d) < 7
       ),
       count_days AS (
         SELECT COUNT(*)::int AS business_days FROM current_period
       ),
       previous_period AS (
         SELECT d::date AS day
         FROM params, count_days,
              generate_series((date_trunc('month', ref_date) - interval '1 month')::date,
                              (date_trunc('month', ref_date) - interval '1 day')::date,
                              interval '1 day') d
         WHERE EXTRACT(ISODOW FROM d) < 7
         ORDER BY d
         LIMIT (SELECT business_days FROM count_days)
       )
       SELECT
         (SELECT MIN(day) FROM current_period) AS current_start,
         (SELECT MAX(day) FROM current_period) AS current_end,
         (SELECT COUNT(*) FROM current_period) AS current_days,
         (SELECT MIN(day) FROM previous_period) AS previous_start,
         (SELECT MAX(day) FROM previous_period) AS previous_end,
         (SELECT COUNT(*) FROM previous_period) AS previous_days`,
      [referenceDate],
    );

    const periods = periodsResult.rows[0];

    const reportResult = await pool.query(
      `WITH pedidos AS (
         SELECT
           (raw_data->>'NUMPED') AS numped,
           (raw_data->>'CODCLI')::bigint AS codcli,
           MAX(raw_data->>'CLIENTE') AS cliente,
           MAX(raw_data->>'NOMECIDADE') AS cidade,
           MAX((raw_data->>'CODUSUR1')::bigint) AS codusur,
           MAX(raw_data->>'VENDEDOR') AS vendedor,
           MAX((raw_data->>'SUPERV')::bigint) AS codsuperv,
           (raw_data->>'DATA')::date AS data_pedido,
           SUM(REPLACE(raw_data->>'TOTAL', ',', '.')::numeric) AS total_pedido
         FROM staging."FATO_PEDIDO"
         WHERE raw_data->>'POSICAO' = 'F'
           AND (raw_data->>'DATA') IS NOT NULL
         GROUP BY 1, 2, 8
       ),
       clientes AS (
         SELECT DISTINCT ON ((raw_data->>'COD_CLIENTE')::bigint)
           (raw_data->>'COD_CLIENTE')::bigint AS cod_cliente,
           raw_data->>'NOME_CLIENTE' AS nome_cliente,
           raw_data->>'NOMECIDADE' AS nomecidade,
           raw_data->>'STATUS_CLIENTE' AS status_cliente,
           raw_data->>'TELEFONE_1' AS telefone_1,
           raw_data->>'TELEFONE_2' AS telefone_2,
           raw_data->>'TELEFONE_COMERCIAL' AS telefone_comercial,
           (raw_data->>'COD_VEND')::bigint AS cod_vend,
           (raw_data->>'COD_SUPERV')::bigint AS cod_superv,
           raw_data->>'SUPERVISOR' AS supervisor
         FROM staging."DIM_CLIENTES"
       ),
       funcionarios AS (
         SELECT DISTINCT ON ((raw_data->>'CODUSUR')::bigint)
           (raw_data->>'CODUSUR')::bigint AS codusur,
           raw_data->>'NOME' AS nome_funcionario,
           (raw_data->>'CODSUPERVISOR')::bigint AS codsupervisor,
           raw_data->>'NOMEGERENTE' AS nomegerente
         FROM staging."DIM_FUNCIONARIOS"
       ),
       consolidado AS (
         SELECT
           p.codcli AS cod_cliente,
           COALESCE(c.nome_cliente, p.cliente) AS cliente,
           COALESCE(c.nomecidade, p.cidade) AS cidade,
           COALESCE(f.nome_funcionario, p.vendedor) AS rca,
           COALESCE(c.supervisor, '') AS supervisor,
           COALESCE(NULLIF(c.telefone_1, ''), NULLIF(c.telefone_comercial, ''), NULLIF(c.telefone_2, '')) AS telefone,
           SUM(CASE WHEN p.data_pedido BETWEEN $1::date AND $2::date THEN p.total_pedido ELSE 0 END) AS mes_atual,
           SUM(CASE WHEN p.data_pedido BETWEEN $3::date AND $4::date THEN p.total_pedido ELSE 0 END) AS mes_passado
         FROM pedidos p
         LEFT JOIN clientes c ON c.cod_cliente = p.codcli
         LEFT JOIN funcionarios f ON f.codusur = p.codusur
         WHERE COALESCE(c.status_cliente, 'ATIVO') = 'ATIVO'
         GROUP BY 1,2,3,4,5,6
       )
       SELECT
         cod_cliente,
         cliente,
         cidade,
         rca,
         supervisor,
         telefone,
         ROUND(mes_passado, 2) AS mes_passado,
         ROUND(mes_atual, 2) AS mes_atual,
         ROUND(mes_atual - mes_passado, 2) AS perda_valor,
         ROUND(CASE WHEN mes_passado > 0 THEN ((mes_atual - mes_passado) / mes_passado) * 100 ELSE 0 END, 2) AS perda_percentual,
         ROUND((mes_atual / GREATEST($5::numeric, 1)) * $6::numeric, 2) AS projecao_mes,
         CASE
           WHEN mes_atual < mes_passado THEN 'queda'
           WHEN mes_atual > mes_passado THEN 'alta'
           ELSE 'estavel'
         END AS tendencia
       FROM consolidado
       WHERE mes_passado > 0
       ORDER BY perda_valor ASC, mes_passado DESC
       LIMIT $7`,
      [
        periods.current_start,
        periods.current_end,
        periods.previous_start,
        periods.previous_end,
        periods.current_days,
        periods.previous_days,
        top,
      ],
    );

    res.json({
      referenceDate,
      periods,
      summary: {
        clientesEmQueda: reportResult.rows.filter((row) => toNumber(row.perda_valor) < 0).length,
        perdaAcumulada: reportResult.rows.reduce((sum, row) => sum + Math.min(0, toNumber(row.perda_valor)), 0),
        vendaMesAtual: reportResult.rows.reduce((sum, row) => sum + toNumber(row.mes_atual), 0),
        vendaMesPassado: reportResult.rows.reduce((sum, row) => sum + toNumber(row.mes_passado), 0),
      },
      items: reportResult.rows,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Erro ao gerar relatório de maiores quedas' });
  }
});

app.get('/api/kpis', async (_req, res) => {
  try {
    const result = await pool.query('SELECT COUNT(*)::int AS total FROM public.app_users WHERE active = TRUE');
    res.json({ users: result.rows[0]?.total ?? 0, reports: 87, schedules: 23, historyItems: 416 });
  } catch {
    res.json({ users: 0, reports: 87, schedules: 23, historyItems: 416 });
  }
});

app.get('/api/reports', (_req, res) => {
  res.json([
    { id: 1, name: 'Maiores quedas', status: 'Novo motor em validação', updatedAt: new Date().toISOString() },
    { id: 2, name: 'Relatório Financeiro', status: 'Backlog', updatedAt: '2026-03-19 18:45' },
    { id: 3, name: 'Relatório Operacional', status: 'Backlog', updatedAt: '2026-03-19 19:00' }
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
