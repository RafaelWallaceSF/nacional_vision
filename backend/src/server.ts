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
  const raw = String(value).trim();
  if (!raw) return 0;
  if (raw.includes(',') && raw.includes('.')) return Number(raw.replace(/\./g, '').replace(',', '.')) || 0;
  if (raw.includes(',')) return Number(raw.replace(',', '.')) || 0;
  return Number(raw) || 0;
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

function normalizePhone(value: unknown) {
  const digits = String(value || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('55')) return digits;
  if (digits.length >= 10 && digits.length <= 11) return `55${digits}`;
  return digits;
}

function buildMaioresQuedasCaption(report: any) {
  const topItems = report.items.slice(0, report.filters.top || 5);
  return [
    `📉 Maiores Quedas`,
    `Referência: ${report.referenceDate}`,
    `Filtro: ${report.filters.vendedor ? `RCA ${report.filters.vendedor}` : report.filters.supervisor ? `Supervisor ${report.filters.supervisor}` : 'sem filtro'}`,
    `Quedas encontradas: ${report.summary.clientesEmQueda}`,
    `Perda acumulada: ${formatCurrency(report.summary.perdaAcumulada)}`,
    `Mês atual: ${formatCurrency(report.summary.vendaMesAtual)} | Mês passado: ${formatCurrency(report.summary.vendaMesPassado)}`,
    `Dias úteis + sábado: ${report.periods.current_days}/${report.periods.previous_days}`,
    '',
    `Top ${topItems.length}:`,
    ...topItems.map((item: any, index: number) => `${index + 1}. ${item.cliente} — perda ${formatCurrency(toNumber(item.perda_valor))} — ${item.cidade} — ${item.rca} — ${item.perda_percentual}%`),
  ].join('\n');
}

function escapePdfText(value: string) {
  return value.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

function buildPdfTextLines(report: any) {
  const lines = [
    'RELATORIO - MAIORES QUEDAS',
    `Referencia: ${report.referenceDate}`,
    `Filtro: ${report.filters.vendedor ? `RCA ${report.filters.vendedor}` : report.filters.supervisor ? `Supervisor ${report.filters.supervisor}` : 'sem filtro'}`,
    `Clientes em queda: ${report.summary.clientesEmQueda}`,
    `Perda acumulada: ${formatCurrency(report.summary.perdaAcumulada)}`,
    `Mes atual: ${formatCurrency(report.summary.vendaMesAtual)}`,
    `Mes passado: ${formatCurrency(report.summary.vendaMesPassado)}`,
    '',
    'TOP CLIENTES:',
    ...report.items.slice(0, report.filters.top || 5).flatMap((item: any, index: number) => ([
      `${index + 1}. ${String(item.cliente || '').slice(0, 70)}`,
      `   RCA: ${item.rca || '-'} | Cidade: ${item.cidade || '-'} | Cliente: ${item.cod_cliente || '-'}`,
      `   Mes passado: ${formatCurrency(toNumber(item.mes_passado))} | Mes atual: ${formatCurrency(toNumber(item.mes_atual))}`,
      `   Perda: ${formatCurrency(toNumber(item.perda_valor))} | Queda: ${item.perda_percentual}%`,
      '',
    ])),
  ];
  return lines;
}

function createSimplePdfBuffer(report: any) {
  const lines = buildPdfTextLines(report);
  const fontSize = 11;
  const leading = 15;
  const startY = 800;
  const textOps = [
    'BT',
    '/F1 11 Tf',
    `1 0 0 1 48 ${startY} Tm`,
  ];

  lines.forEach((line, index) => {
    const safe = escapePdfText(line);
    if (index === 0) textOps.push(`(${safe}) Tj`);
    else textOps.push(`0 -${leading} Td (${safe}) Tj`);
  });
  textOps.push('ET');

  const contentStream = textOps.join('\n');
  const objects = [
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj',
    '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj',
    '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>\nendobj',
    '4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj',
    `5 0 obj\n<< /Length ${Buffer.byteLength(contentStream, 'utf8')} >>\nstream\n${contentStream}\nendstream\nendobj`,
  ];

  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [0];
  for (const object of objects) {
    offsets.push(Buffer.byteLength(pdf, 'utf8'));
    pdf += `${object}\n`;
  }
  const xrefOffset = Buffer.byteLength(pdf, 'utf8');
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += '0000000000 65535 f \n';
  for (let i = 1; i <= objects.length; i += 1) {
    pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return Buffer.from(pdf, 'utf8');
}

async function getMaioresQuedas(params: { referenceDate: string; top: number; vendedor?: string; supervisor?: string }) {
  const { referenceDate, top, vendedor = '', supervisor = '' } = params;
  const periodsResult = await pool.query(`WITH params AS (SELECT $1::date AS ref_date), current_period AS (SELECT d::date AS day FROM params, generate_series(date_trunc('month', ref_date)::date, ref_date, interval '1 day') d WHERE EXTRACT(ISODOW FROM d) < 7), count_days AS (SELECT COUNT(*)::int AS business_days FROM current_period), previous_period AS (SELECT d::date AS day FROM params, count_days, generate_series((date_trunc('month', ref_date) - interval '1 month')::date, (date_trunc('month', ref_date) - interval '1 day')::date, interval '1 day') d WHERE EXTRACT(ISODOW FROM d) < 7 ORDER BY d LIMIT (SELECT business_days FROM count_days)) SELECT (SELECT MIN(day) FROM current_period) AS current_start, (SELECT MAX(day) FROM current_period) AS current_end, (SELECT COUNT(*) FROM current_period) AS current_days, (SELECT MIN(day) FROM previous_period) AS previous_start, (SELECT MAX(day) FROM previous_period) AS previous_end, (SELECT COUNT(*) FROM previous_period) AS previous_days`, [referenceDate]);
  const periods = periodsResult.rows[0];
  const reportResult = await pool.query(`WITH pedidos AS ( SELECT (raw_data->>'NUMPED') AS numped, (raw_data->>'CODCLI')::bigint AS codcli, MAX(raw_data->>'CLIENTE') AS cliente, MAX(raw_data->>'NOMECIDADE') AS cidade, MAX((raw_data->>'CODUSUR1')::bigint) AS codusur, MAX(TRIM(raw_data->>'VENDEDOR')) AS vendedor, MAX((raw_data->>'SUPERV')::bigint) AS codsuperv, (raw_data->>'DATA')::date AS data_pedido, SUM(REPLACE(raw_data->>'TOTAL', ',', '.')::numeric) AS total_pedido FROM staging."FATO_PEDIDO" WHERE raw_data->>'POSICAO' = 'F' AND (raw_data->>'DATA') IS NOT NULL GROUP BY 1,2,8 ), clientes AS ( SELECT DISTINCT ON ((raw_data->>'COD_CLIENTE')::bigint) (raw_data->>'COD_CLIENTE')::bigint AS cod_cliente, raw_data->>'NOME_CLIENTE' AS nome_cliente, raw_data->>'NOMECIDADE' AS nomecidade, raw_data->>'STATUS_CLIENTE' AS status_cliente, raw_data->>'TELEFONE_1' AS telefone_1, raw_data->>'TELEFONE_2' AS telefone_2, raw_data->>'TELEFONE_COMERCIAL' AS telefone_comercial, (raw_data->>'COD_VEND')::bigint AS cod_vend, (raw_data->>'COD_SUPERV')::bigint AS cod_superv, TRIM(raw_data->>'SUPERVISOR') AS supervisor FROM staging."DIM_CLIENTES" ), funcionarios AS ( SELECT DISTINCT ON ((raw_data->>'CODUSUR')::bigint) (raw_data->>'CODUSUR')::bigint AS codusur, TRIM(raw_data->>'NOME') AS nome_funcionario, (raw_data->>'CODSUPERVISOR')::bigint AS codsupervisor, raw_data->>'NOMEGERENTE' AS nomegerente FROM staging."DIM_FUNCIONARIOS" ), consolidado AS ( SELECT p.codcli AS cod_cliente, COALESCE(c.nome_cliente, p.cliente) AS cliente, COALESCE(c.nomecidade, p.cidade) AS cidade, COALESCE(f.nome_funcionario, p.vendedor) AS rca, COALESCE(c.supervisor, '') AS supervisor, COALESCE(NULLIF(c.telefone_1, ''), NULLIF(c.telefone_comercial, ''), NULLIF(c.telefone_2, '')) AS telefone, SUM(CASE WHEN p.data_pedido BETWEEN $1::date AND $2::date THEN p.total_pedido ELSE 0 END) AS mes_atual, SUM(CASE WHEN p.data_pedido BETWEEN $3::date AND $4::date THEN p.total_pedido ELSE 0 END) AS mes_passado FROM pedidos p LEFT JOIN clientes c ON c.cod_cliente = p.codcli LEFT JOIN funcionarios f ON f.codusur = p.codusur WHERE COALESCE(c.status_cliente, 'ATIVO') = 'ATIVO' AND ($7 = '' OR COALESCE(f.nome_funcionario, p.vendedor) = $7) AND ($8 = '' OR COALESCE(c.supervisor, '') = $8) GROUP BY 1,2,3,4,5,6 ) SELECT cod_cliente, cliente, cidade, rca, supervisor, telefone, ROUND(mes_passado, 2) AS mes_passado, ROUND(mes_atual, 2) AS mes_atual, ROUND(mes_atual - mes_passado, 2) AS perda_valor, ROUND(CASE WHEN mes_passado > 0 THEN ((mes_atual - mes_passado) / mes_passado) * 100 ELSE 0 END, 2) AS perda_percentual, ROUND((mes_atual / GREATEST($5::numeric, 1)) * $6::numeric, 2) AS projecao_mes, CASE WHEN mes_atual < mes_passado THEN 'queda' WHEN mes_atual > mes_passado THEN 'alta' ELSE 'estavel' END AS tendencia FROM consolidado WHERE mes_passado > 0 ORDER BY perda_valor ASC, mes_passado DESC LIMIT $9`, [periods.current_start, periods.current_end, periods.previous_start, periods.previous_end, periods.current_days, periods.previous_days, vendedor, supervisor, top]);
  return { referenceDate, periods, filters: { vendedor, supervisor, top }, summary: { clientesEmQueda: reportResult.rows.filter((row) => toNumber(row.perda_valor) < 0).length, perdaAcumulada: reportResult.rows.reduce((sum, row) => sum + Math.min(0, toNumber(row.perda_valor)), 0), vendaMesAtual: reportResult.rows.reduce((sum, row) => sum + toNumber(row.mes_atual), 0), vendaMesPassado: reportResult.rows.reduce((sum, row) => sum + toNumber(row.mes_passado), 0) }, items: reportResult.rows };
}

async function getAllVendedores() {
  const result = await pool.query(`SELECT DISTINCT TRIM(raw_data->>'VENDEDOR') AS vendedor FROM staging."FATO_PEDIDO" WHERE raw_data->>'POSICAO'='F' AND COALESCE(TRIM(raw_data->>'VENDEDOR'),'')<>'' ORDER BY 1`);
  return result.rows.map((row) => row.vendedor);
}

async function executeMaioresQuedasRule(ruleId: string, referenceDate?: string) {
  const ruleResult = await pool.query(`SELECT * FROM public.daily_report_rules WHERE id = $1 LIMIT 1`, [ruleId]);
  if (!ruleResult.rowCount) throw new Error('Regra não encontrada');
  const rule = ruleResult.rows[0];
  const payload = Array.isArray(rule.recipients_json) ? rule.recipients_json[0] || {} : {};
  const filters = payload.filters || {};
  const delivery = payload.delivery || {};
  const effectiveReferenceDate = referenceDate || new Date().toISOString().slice(0, 10);
  const webhookUrl = delivery.webhookUrl || process.env.DEFAULT_WEBHOOK_URL || null;

  let members: any[] = [];
  if (rule.target_type === 'group') {
    const membersResult = await pool.query(`SELECT * FROM public.report_group_members WHERE group_id = $1 AND active = TRUE ORDER BY member_label ASC`, [rule.target_id]);
    members = membersResult.rows;
  } else if (rule.target_type === 'all_vendedores') {
    const vendedores = await getAllVendedores();
    members = vendedores.map((name) => ({ member_type: 'vendedor', member_key: name, member_label: name, channel: 'webhook', destination: null }));
  } else {
    members = [{ member_type: rule.target_type, member_key: rule.target_id, member_label: rule.target_id, channel: rule.channel, destination: rule.target_id }];
  }

  const executions = [];

  for (const member of members) {
    const vendedor = member.member_type === 'vendedor' ? member.member_key : filters.vendedor || '';
    const supervisor = member.member_type === 'supervisor' ? member.member_key : filters.supervisor || '';
    const report = await getMaioresQuedas({ referenceDate: effectiveReferenceDate, top: Number(filters.top) || 5, vendedor, supervisor });
    const message = buildMaioresQuedasCaption(report);
    const pdfBuffer = createSimplePdfBuffer(report);
    const pdfFileName = `maiores-quedas-${effectiveReferenceDate}-${String(member.member_label || member.member_key || 'destino').replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').toLowerCase() || 'destino'}.pdf`;
    const webhookPayload = {
      campaign: { ruleId: rule.id, ruleName: rule.rule_name, reportCode: rule.report_type_code },
      member: {
        type: member.member_type,
        key: member.member_key,
        label: member.member_label,
        phone: member.destination || null,
        destination: member.destination || null,
      },
      delivery: { channel: 'webhook', webhookUrl },
      report,
      message,
      attachment: {
        kind: 'pdf',
        fileName: pdfFileName,
        mimeType: 'application/pdf',
        size: pdfBuffer.length,
        base64: pdfBuffer.toString('base64'),
      },
    };

    let delivered = false;
    let statusCode: number | null = null;
    let webhookError: string | null = null;
    let responseBody: any = null;

    if (webhookUrl) {
      try {
        const response = await fetch(webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(webhookPayload),
        });
        statusCode = response.status;
        delivered = response.ok;
        const text = await response.text();
        responseBody = text;
        if (!response.ok) webhookError = `Webhook HTTP ${response.status}`;
      } catch (error) {
        webhookError = error instanceof Error ? error.message : 'Falha ao enviar webhook';
      }
    } else {
      webhookError = 'Webhook não configurado';
    }

    const executionResult = await pool.query(
      `INSERT INTO public.daily_report_executions (
        rule_id, rule_name, report_type_code, target_type, target_id, channel, reference_date,
        recipients_json, payload_json, webhook_url, webhook_delivered, webhook_status, webhook_error, status
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb,$10,$11,$12,$13,$14)
      RETURNING id, status, webhook_delivered, webhook_status, webhook_error, created_at`,
      [
        rule.id,
        rule.rule_name,
        rule.report_type_code,
        member.member_type,
        member.member_key,
        'webhook',
        effectiveReferenceDate,
        JSON.stringify([{ member }]),
        JSON.stringify({ webhookPayload, responseBody }),
        webhookUrl,
        delivered,
        statusCode,
        webhookError,
        delivered ? 'delivered' : 'error',
      ],
    );

    executions.push({ member: member.member_label, delivered, statusCode, webhookError, execution: executionResult.rows[0] });
  }

  return { ruleId: rule.id, ruleName: rule.rule_name, membersProcessed: members.length, executions };
}

app.get('/api/health', async (_req, res) => {
  try { const db = await testDbConnection(); res.json({ ok: true, service: 'backend', database: 'connected', timestamp: db.now }); }
  catch (error) { console.error(error); res.status(500).json({ ok: false, service: 'backend', database: 'error' }); }
});

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body ?? {};
  try {
    const result = await pool.query(`SELECT id, name, email, password_hash, role, active FROM public.app_users WHERE email = $1 LIMIT 1`, [email]);
    const user = result.rows[0];
    if (!user || !user.active) return res.status(401).json({ ok: false, message: 'Credenciais inválidas' });
    const matches = await bcrypt.compare(password, user.password_hash);
    if (!matches) return res.status(401).json({ ok: false, message: 'Credenciais inválidas' });
    return res.json({ ok: true, token: 'mock-admin-token', user: { id: Number(user.id), name: user.name, email: user.email, role: user.role } });
  } catch (error) { console.error(error); return res.status(500).json({ ok: false, message: 'Erro interno no login' }); }
});

app.get('/api/groups', async (_req, res) => {
  try { const result = await pool.query(`SELECT g.*, COUNT(m.id)::int AS members_count FROM public.report_groups g LEFT JOIN public.report_group_members m ON m.group_id = g.id AND m.active = TRUE GROUP BY g.id ORDER BY g.name ASC`); res.json(result.rows); }
  catch (error) { console.error(error); res.status(500).json({ message: 'Erro ao listar grupos' }); }
});
app.post('/api/groups', async (req, res) => {
  const { name, groupType, deliveryMode = 'individual', description = '', active = true } = req.body ?? {};
  if (!name || !groupType) return res.status(400).json({ message: 'name e groupType são obrigatórios' });
  try { const result = await pool.query(`INSERT INTO public.report_groups (name, group_type, delivery_mode, description, active) VALUES ($1, $2, $3, $4, $5) RETURNING *`, [name, groupType, deliveryMode, description, active]); res.status(201).json(result.rows[0]); }
  catch (error) { console.error(error); res.status(500).json({ message: 'Erro ao criar grupo' }); }
});
app.get('/api/groups/:id/members', async (req, res) => {
  try { const result = await pool.query(`SELECT * FROM public.report_group_members WHERE group_id = $1 ORDER BY member_label ASC`, [req.params.id]); res.json(result.rows); }
  catch (error) { console.error(error); res.status(500).json({ message: 'Erro ao listar membros do grupo' }); }
});
app.post('/api/groups/:id/members', async (req, res) => {
  const { memberType, memberKey, memberLabel, channel = 'webhook', destination = null, active = true } = req.body ?? {};
  if (!memberType || !memberKey || !memberLabel) return res.status(400).json({ message: 'memberType, memberKey e memberLabel são obrigatórios' });
  const normalizedDestination = normalizePhone(destination);
  if (!normalizedDestination) return res.status(400).json({ message: 'Telefone é obrigatório' });
  try { const result = await pool.query(`INSERT INTO public.report_group_members (group_id, member_type, member_key, member_label, channel, destination, active) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`, [req.params.id, memberType, memberKey, memberLabel, channel, normalizedDestination, active]); res.status(201).json(result.rows[0]); }
  catch (error) { console.error(error); res.status(500).json({ message: 'Erro ao adicionar membro ao grupo' }); }
});
app.put('/api/groups/:groupId/members/:memberId', async (req, res) => {
  const { memberType, memberKey, memberLabel, channel = 'webhook', destination = null, active = true } = req.body ?? {};
  if (!memberType || !memberKey || !memberLabel) return res.status(400).json({ message: 'memberType, memberKey e memberLabel são obrigatórios' });
  const normalizedDestination = normalizePhone(destination);
  if (!normalizedDestination) return res.status(400).json({ message: 'Telefone é obrigatório' });
  try {
    const result = await pool.query(`UPDATE public.report_group_members SET member_type = $1, member_key = $2, member_label = $3, channel = $4, destination = $5, active = $6, updated_at = NOW() WHERE id = $7 AND group_id = $8 RETURNING *`, [memberType, memberKey, memberLabel, channel, normalizedDestination, active, req.params.memberId, req.params.groupId]);
    if (!result.rowCount) return res.status(404).json({ message: 'Membro não encontrado' });
    res.json(result.rows[0]);
  }
  catch (error) { console.error(error); res.status(500).json({ message: 'Erro ao atualizar membro do grupo' }); }
});
app.delete('/api/groups/:groupId/members/:memberId', async (req, res) => {
  try {
    const result = await pool.query(`DELETE FROM public.report_group_members WHERE id = $1 AND group_id = $2 RETURNING id`, [req.params.memberId, req.params.groupId]);
    if (!result.rowCount) return res.status(404).json({ message: 'Membro não encontrado' });
    res.json({ ok: true });
  }
  catch (error) { console.error(error); res.status(500).json({ message: 'Erro ao excluir membro do grupo' }); }
});

app.get('/api/webhook/info', async (_req, res) => {
  const webhookUrl = process.env.DEFAULT_WEBHOOK_URL || null;
  res.json({ configured: Boolean(webhookUrl), webhookUrl });
});

app.get('/api/webhook/tests', async (_req, res) => {
  try {
    const result = await pool.query(`SELECT id, employee_name, alias_name, phone, webhook_url, response_status, success, response_text, error_message, created_at FROM public.webhook_test_logs ORDER BY created_at DESC LIMIT 20`);
    res.json(result.rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Erro ao carregar histórico de testes de webhook' });
  }
});

app.post('/api/webhook/test', async (req, res) => {
  const webhookUrl = process.env.DEFAULT_WEBHOOK_URL || null;
  const phone = normalizePhone(req.body?.phone);
  const employeeName = String(req.body?.employeeName || 'Teste').trim() || 'Teste';
  const aliasName = String(req.body?.aliasName || employeeName).trim() || employeeName;

  if (!webhookUrl) return res.status(400).json({ message: 'Webhook padrão não configurado' });
  if (!phone) return res.status(400).json({ message: 'Telefone é obrigatório para teste' });

  const payload = {
    test: true,
    sentAt: new Date().toISOString(),
    campaign: { ruleId: null, ruleName: 'Teste manual de webhook', reportCode: 'webhook_test' },
    member: { type: 'teste', key: employeeName, label: aliasName, phone, destination: phone },
    delivery: { channel: 'webhook', webhookUrl },
    message: `Teste de webhook para ${aliasName}`,
  };

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const responseText = await response.text();
    await pool.query(`INSERT INTO public.webhook_test_logs (employee_name, alias_name, phone, webhook_url, response_status, success, response_text, error_message) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`, [employeeName, aliasName, phone, webhookUrl, response.status, response.ok, responseText, response.ok ? null : `Webhook HTTP ${response.status}`]);
    res.status(response.ok ? 200 : 502).json({ ok: response.ok, status: response.status, webhookUrl, responseText });
  } catch (error) {
    console.error(error);
    const errorMessage = error instanceof Error ? error.message : 'Falha ao testar webhook';
    await pool.query(`INSERT INTO public.webhook_test_logs (employee_name, alias_name, phone, webhook_url, response_status, success, response_text, error_message) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`, [employeeName, aliasName, phone, webhookUrl, null, false, null, errorMessage]);
    res.status(500).json({ ok: false, message: errorMessage });
  }
});

app.get('/api/funcionarios', async (_req, res) => {
  try {
    const result = await pool.query(`SELECT DISTINCT TRIM(raw_data->>'NOME') AS name FROM staging."DIM_FUNCIONARIOS" WHERE COALESCE(TRIM(raw_data->>'NOME'),'') <> '' ORDER BY 1`);
    res.json(result.rows.map((row) => row.name));
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Erro ao carregar funcionários' });
  }
});

app.get('/api/vendedores', async (_req, res) => {
  try {
    const result = await pool.query(`SELECT DISTINCT TRIM(raw_data->>'NOME') AS name FROM staging."DIM_CLIENTES" WHERE COALESCE(TRIM(raw_data->>'COD_VEND'),'') <> '' AND COALESCE(TRIM(raw_data->>'NOME'),'') <> '' ORDER BY 1`);
    res.json(result.rows.map((row) => row.name));
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Erro ao carregar vendedores' });
  }
});

app.get('/api/supervisores', async (_req, res) => {
  try {
    const result = await pool.query(`SELECT DISTINCT TRIM(raw_data->>'SUPERVISOR') AS name FROM staging."DIM_CLIENTES" WHERE COALESCE(TRIM(raw_data->>'COD_SUPERV'),'') <> '' AND COALESCE(TRIM(raw_data->>'SUPERVISOR'),'') <> '' ORDER BY 1`);
    res.json(result.rows.map((row) => row.name));
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Erro ao carregar supervisores' });
  }
});

app.get('/api/gerentes', async (_req, res) => {
  try {
    res.json(['JUNIOR']);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Erro ao carregar gerentes' });
  }
});

app.get('/api/employees', async (_req, res) => {
  try {
    const result = await pool.query(`
      WITH nomes AS (
        SELECT DISTINCT TRIM(raw_data->>'NOME') AS name
        FROM staging."DIM_FUNCIONARIOS"
        WHERE COALESCE(TRIM(raw_data->>'NOME'),'') <> ''
        UNION
        SELECT DISTINCT TRIM(raw_data->>'VENDEDOR') AS name
        FROM staging."FATO_PEDIDO"
        WHERE COALESCE(TRIM(raw_data->>'VENDEDOR'),'') <> ''
      )
      SELECT name FROM nomes ORDER BY 1
    `);
    res.json(result.rows.map((row) => row.name));
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Erro ao carregar funcionários' });
  }
});

app.get('/api/reports/filters', async (_req, res) => {
  try {
    const [vendedores, supervisores] = await Promise.all([
      pool.query(`SELECT DISTINCT TRIM(raw_data->>'NOME') AS value FROM staging."DIM_CLIENTES" WHERE COALESCE(TRIM(raw_data->>'COD_VEND'),'') <> '' AND COALESCE(TRIM(raw_data->>'NOME'),'') <> '' ORDER BY 1`),
      pool.query(`SELECT DISTINCT TRIM(raw_data->>'SUPERVISOR') AS value FROM staging."DIM_CLIENTES" WHERE COALESCE(TRIM(raw_data->>'COD_SUPERV'),'') <> '' AND COALESCE(TRIM(raw_data->>'SUPERVISOR'),'') <> '' ORDER BY 1`),
    ]);
    res.json({ vendedores: vendedores.rows.map((r) => r.value), supervisores: supervisores.rows.map((r) => r.value) });
  } catch (error) { console.error(error); res.status(500).json({ message: 'Erro ao carregar filtros dos relatórios' }); }
});
app.get('/api/reports/maiores-quedas', async (req, res) => {
  const referenceDate = typeof req.query.referenceDate === 'string' ? req.query.referenceDate : new Date().toISOString().slice(0, 10);
  const top = Math.min(Number(req.query.top || 30), 200);
  const vendedor = typeof req.query.vendedor === 'string' ? req.query.vendedor : '';
  const supervisor = typeof req.query.supervisor === 'string' ? req.query.supervisor : '';
  try { res.json(await getMaioresQuedas({ referenceDate, top, vendedor, supervisor })); }
  catch (error) { console.error(error); res.status(500).json({ message: 'Erro ao gerar relatório de maiores quedas' }); }
});
app.get('/api/reports/maiores-quedas/preview', async (req, res) => {
  const referenceDate = typeof req.query.referenceDate === 'string' ? req.query.referenceDate : new Date().toISOString().slice(0, 10);
  const top = Math.min(Number(req.query.top || 5), 20);
  const vendedor = typeof req.query.vendedor === 'string' ? req.query.vendedor : '';
  const supervisor = typeof req.query.supervisor === 'string' ? req.query.supervisor : '';
  try {
    const report = await getMaioresQuedas({ referenceDate, top, vendedor, supervisor });
    const pdfBuffer = createSimplePdfBuffer(report);
    res.json({
      caption: buildMaioresQuedasCaption(report),
      report,
      attachment: {
        kind: 'pdf',
        fileName: `maiores-quedas-${referenceDate}.pdf`,
        mimeType: 'application/pdf',
        size: pdfBuffer.length,
      },
    });
  }
  catch (error) { console.error(error); res.status(500).json({ message: 'Erro ao gerar preview do envio' }); }
});

app.get('/api/reports/maiores-quedas/pdf', async (req, res) => {
  const referenceDate = typeof req.query.referenceDate === 'string' ? req.query.referenceDate : new Date().toISOString().slice(0, 10);
  const top = Math.min(Number(req.query.top || 5), 20);
  const vendedor = typeof req.query.vendedor === 'string' ? req.query.vendedor : '';
  const supervisor = typeof req.query.supervisor === 'string' ? req.query.supervisor : '';
  try {
    const report = await getMaioresQuedas({ referenceDate, top, vendedor, supervisor });
    const pdfBuffer = createSimplePdfBuffer(report);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="maiores-quedas-${referenceDate}.pdf"`);
    res.send(pdfBuffer);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Erro ao gerar PDF do relatório' });
  }
});

app.get('/api/schedules', async (_req, res) => {
  try { const result = await pool.query(`SELECT id, rule_name, report_type_code, target_type, target_id, send_time, frequency, channel, active, created_at, updated_at, recipients_json FROM public.daily_report_rules ORDER BY id DESC`); res.json(result.rows); }
  catch (error) { console.error(error); res.status(500).json({ message: 'Erro ao listar agendamentos' }); }
});
app.post('/api/schedules/maiores-quedas', async (req, res) => {
  const { ruleName, targetType, targetId, sendTime, channel, webhookUrl, vendedor, supervisor, top = 5 } = req.body ?? {};
  if (!ruleName || !targetType || !sendTime) return res.status(400).json({ message: 'ruleName, targetType e sendTime são obrigatórios' });
  if (targetType !== 'all_vendedores' && !targetId) return res.status(400).json({ message: 'targetId é obrigatório para este tipo de alvo' });
  try {
    const finalChannel = channel || 'webhook';
    const finalWebhookUrl = webhookUrl || process.env.DEFAULT_WEBHOOK_URL || null;
    const normalizedTargetId = targetType === 'all_vendedores' ? 'ALL' : targetId;
    const recipientsPayload = [{ kind: 'maiores-quedas', filters: { vendedor: vendedor || '', supervisor: supervisor || '', top: Number(top) || 5 }, delivery: { channel: finalChannel, webhookUrl: finalWebhookUrl } }];
    const result = await pool.query(`INSERT INTO public.daily_report_rules (rule_name, report_type_code, target_type, target_id, send_time, frequency, channel, recipients_json, active) VALUES ($1, 'top_5_quedas', $2, $3, $4, 'daily', $5, $6::jsonb, TRUE) RETURNING id, rule_name, report_type_code, target_type, target_id, send_time, frequency, channel, active, created_at, updated_at, recipients_json`, [ruleName, targetType, normalizedTargetId, sendTime, finalChannel, JSON.stringify(recipientsPayload)]);
    res.status(201).json(result.rows[0]);
  } catch (error) { console.error(error); res.status(500).json({ message: 'Erro ao criar agendamento de maiores quedas' }); }
});
app.post('/api/schedules/:id/run', async (req, res) => {
  try {
    const result = await executeMaioresQuedasRule(req.params.id, req.body?.referenceDate);
    res.json({ ok: true, ...result });
  } catch (error) {
    console.error(error);
    res.status(500).json({ ok: false, message: error instanceof Error ? error.message : 'Erro ao executar regra' });
  }
});

app.get('/api/history', async (_req, res) => {
  try { const result = await pool.query(`SELECT id, rule_name, report_type_code, target_type, target_id, status, created_at, updated_at, payload_json, webhook_url, webhook_delivered, webhook_status, webhook_error FROM public.daily_report_executions ORDER BY id DESC LIMIT 50`); res.json(result.rows); }
  catch (error) { console.error(error); res.status(500).json({ message: 'Erro ao listar histórico' }); }
});
app.get('/api/kpis', async (_req, res) => {
  try {
    const [users, schedules, history, groups] = await Promise.all([
      pool.query('SELECT COUNT(*)::int AS total FROM public.app_users WHERE active = TRUE'),
      pool.query('SELECT COUNT(*)::int AS total FROM public.daily_report_rules WHERE active = TRUE'),
      pool.query('SELECT COUNT(*)::int AS total FROM public.daily_report_executions'),
      pool.query('SELECT COUNT(*)::int AS total FROM public.report_groups WHERE active = TRUE'),
    ]);
    res.json({ users: users.rows[0]?.total ?? 0, reports: 1, schedules: schedules.rows[0]?.total ?? 0, historyItems: history.rows[0]?.total ?? 0, groups: groups.rows[0]?.total ?? 0 });
  } catch { res.json({ users: 0, reports: 1, schedules: 0, historyItems: 0, groups: 0 }); }
});

async function start() {
  try { await initDb(); app.listen(PORT, '0.0.0.0', () => { console.log(`Backend running on http://0.0.0.0:${PORT}`); }); }
  catch (error) { console.error('Failed to start backend:', error); process.exit(1); }
}

start();
