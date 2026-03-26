import express from 'express';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import { initDb } from './initDb';
import { pool, testDbConnection } from './db';

const app = express();
const PORT = Number(process.env.PORT || 4000);
const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL || `http://74.1.21.111:${PORT}`;

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

function buildSemComprasCaption(report: any) {
  const topItems = report.items.slice(0, report.filters.top || 20);
  return [
    `🛑 Clientes sem compras`,
    `Referência: ${report.referenceDate}`,
    `Nome: ${report.filters.vendedor || report.filters.supervisor || 'sem filtro'}`,
    `Clientes sem compra no mês: ${report.summary.clientesSemCompra}`,
    `Base perdida: ${formatCurrency(report.summary.basePerdida)}`,
    '',
    `Top ${topItems.length}:`,
    ...topItems.map((item: any, index: number) => `${index + 1}. ${item.cliente} — ${item.cidade} — contato ${item.telefone || '-'} — mês anterior ${formatCurrency(toNumber(item.mes_passado))} — média 3 meses ${formatCurrency(toNumber(item.media_3_meses))}`),
  ].join('\n');
}

async function findStoredReportRequest(reportTypeCode: string, fileName: string) {
  const history = await pool.query(`SELECT payload_json FROM public.daily_report_executions WHERE report_type_code = $1 ORDER BY id DESC LIMIT 100`, [reportTypeCode]);
  for (const row of history.rows) {
    const payload = row.payload_json || {};
    const itens = payload?.webhookPayload?.itens;
    if (!Array.isArray(itens)) continue;
    const found = itens.find((item: any) => String(item?.link_pdf || '').endsWith(`/${fileName}.pdf`) || String(item?.link_pdf || '').endsWith(`/${fileName}`));
    if (found?.meta?.request) return found.meta.request;
  }
  return null;
}

function escapePdfText(value: string) {
  return value.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

function sanitizePdfCell(value: unknown, maxLength = 32) {
  const text = String(value ?? '-')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!text) return '-';
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text;
}

function pdfText(x: number, y: number, text: string, font = 'F1', size = 10, color: [number, number, number] = [0.06, 0.09, 0.16]) {
  return `${color[0].toFixed(3)} ${color[1].toFixed(3)} ${color[2].toFixed(3)} rg\nBT /${font} ${size} Tf 1 0 0 1 ${x.toFixed(2)} ${y.toFixed(2)} Tm (${escapePdfText(text)}) Tj ET`;
}

function pdfRect(x: number, y: number, w: number, h: number, fillRgb?: [number, number, number], strokeRgb?: [number, number, number], lineWidth = 1) {
  const ops: string[] = [];
  if (fillRgb) ops.push(`${fillRgb[0].toFixed(3)} ${fillRgb[1].toFixed(3)} ${fillRgb[2].toFixed(3)} rg`);
  if (strokeRgb) ops.push(`${strokeRgb[0].toFixed(3)} ${strokeRgb[1].toFixed(3)} ${strokeRgb[2].toFixed(3)} RG ${lineWidth} w`);
  ops.push(`${x.toFixed(2)} ${y.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re`);
  if (fillRgb && strokeRgb) ops.push('B');
  else if (fillRgb) ops.push('f');
  else ops.push('S');
  return ops.join('\n');
}

function buildStyledPdfBuffer(report: any) {
  const pageWidth = 595;
  const pageHeight = 842;
  const margin = 28;
  const tableTop = 650;
  const rowHeight = 22;
  const headerHeight = 24;
  const columns = [
    { key: 'idx', label: '#', width: 24, align: 'left' },
    { key: 'rca', label: 'RCA', width: 74, align: 'left' },
    { key: 'cod_cliente', label: 'COD', width: 40, align: 'left' },
    { key: 'cliente', label: 'RAZAO SOCIAL', width: 145, align: 'left' },
    { key: 'cidade', label: 'CIDADE', width: 70, align: 'left' },
    { key: 'mes_atual', label: 'MES ATUAL', width: 58, align: 'right' },
    { key: 'mes_passado', label: 'MES PASSADO', width: 58, align: 'right' },
    { key: 'perda_valor', label: 'PERDA', width: 52, align: 'right' },
    { key: 'perda_percentual', label: 'VAR %', width: 42, align: 'right' },
  ] as const;

  const rows = report.items.slice(0, report.filters.top || 5).map((item: any, index: number) => ({
    idx: String(index + 1),
    rca: sanitizePdfCell(item.rca, 14),
    cod_cliente: sanitizePdfCell(item.cod_cliente, 8),
    cliente: sanitizePdfCell(item.cliente, 30),
    cidade: sanitizePdfCell(item.cidade, 14),
    mes_atual: formatCurrency(toNumber(item.mes_atual)),
    mes_passado: formatCurrency(toNumber(item.mes_passado)),
    perda_valor: formatCurrency(toNumber(item.perda_valor)),
    perda_percentual: `${toNumber(item.perda_percentual).toFixed(2)}%`,
  }));

  const ops: string[] = [];
  ops.push(pdfRect(0, 0, pageWidth, pageHeight, [1, 1, 1]));
  ops.push(pdfRect(margin, 770, pageWidth - margin * 2, 40, [0.125, 0.286, 0.639]));
  ops.push(pdfText(margin + 12, 794, 'RELATORIO - MAIORES QUEDAS', 'F2', 18));
  ops.push(pdfText(margin + 12, 778, `Referencia: ${report.referenceDate}`, 'F1', 10));

  const filtro = report.filters.vendedor ? `RCA ${report.filters.vendedor}` : report.filters.supervisor ? `Supervisor ${report.filters.supervisor}` : 'Sem filtro';
  ops.push(pdfText(margin, 748, `Filtro: ${sanitizePdfCell(filtro, 80)}`, 'F2', 10));
  ops.push(pdfText(margin + 180, 748, `Clientes em queda: ${report.summary.clientesEmQueda}`, 'F1', 10));
  ops.push(pdfText(margin + 330, 748, `Perda acumulada: ${formatCurrency(report.summary.perdaAcumulada)}`, 'F1', 10));
  ops.push(pdfText(margin, 730, `Mes atual: ${formatCurrency(report.summary.vendaMesAtual)}`, 'F1', 10));
  ops.push(pdfText(margin + 180, 730, `Mes passado: ${formatCurrency(report.summary.vendaMesPassado)}`, 'F1', 10));
  ops.push(pdfText(margin + 360, 730, `Dias uteis + sabado: ${report.periods.current_days}/${report.periods.previous_days}`, 'F1', 10));

  ops.push(pdfRect(margin, tableTop, pageWidth - margin * 2, headerHeight, [0.125, 0.286, 0.639]));

  let currentX = margin;
  for (const column of columns) {
    ops.push(pdfText(currentX + 4, tableTop + 7, column.label, 'F2', 8));
    currentX += column.width;
  }

  rows.forEach((row: any, rowIndex: number) => {
    const y = tableTop - ((rowIndex + 1) * rowHeight);
    const fill: [number, number, number] = rowIndex % 2 === 0 ? [0.945, 0.961, 0.992] : [1, 1, 1];
    ops.push(pdfRect(margin, y, pageWidth - margin * 2, rowHeight, fill, [0.82, 0.86, 0.93], 0.5));

    let x = margin;
    columns.forEach((column) => {
      const raw = String((row as any)[column.key] ?? '-');
      const text = sanitizePdfCell(raw, column.key === 'cliente' ? 30 : 16);
      const approxCharWidth = 4.6;
      const textWidth = Math.min(text.length * approxCharWidth, column.width - 8);
      const textX = column.align === 'right' ? x + column.width - textWidth - 4 : x + 4;
      ops.push(pdfText(textX, y + 7, text, 'F1', 8.5));
      x += column.width;
    });
  });

  const tableBottom = tableTop - (rows.length * rowHeight);
  ops.push(pdfRect(margin, tableBottom, pageWidth - margin * 2, headerHeight, [0.929, 0.945, 0.976], [0.82, 0.86, 0.93], 0.5));
  ops.push(pdfText(margin + 6, tableBottom + 7, `Total exibido: ${rows.length} registro(s)`, 'F2', 9));
  ops.push(pdfText(margin + 180, tableBottom + 7, `Gerado em: ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`, 'F1', 9));

  const contentStream = ops.join('\n');
  const objects = [
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj',
    '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj',
    '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>\nendobj',
    '4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj',
    '5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>\nendobj',
    `6 0 obj\n<< /Length ${Buffer.byteLength(contentStream, 'utf8')} >>\nstream\n${contentStream}\nendstream\nendobj`,
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

function buildSemComprasPdfBuffer(report: any) {
  const pageWidth = 595;
  const pageHeight = 842;
  const margin = 24;
  const tableTop = 642;
  const rowHeight = 24;
  const headerHeight = 26;
  const responsibleName = report.filters.vendedor || report.filters.supervisor || 'Todos';
  const generatedAt = new Date().toISOString().slice(0, 16).replace('T', ' ');
  const columns = [
    { key: 'idx', label: '#', width: 22, align: 'left' },
    { key: 'cod_cliente', label: 'CODIGO', width: 52, align: 'left' },
    { key: 'cliente', label: 'NOME', width: 178, align: 'left' },
    { key: 'cidade', label: 'CIDADE', width: 74, align: 'left' },
    { key: 'telefone', label: 'CONTATO', width: 78, align: 'left' },
    { key: 'mes_passado', label: 'VENDA MES ANTERIOR', width: 92, align: 'right' },
    { key: 'media_3_meses', label: 'MEDIA 3 MESES', width: 75, align: 'right' },
  ] as const;

  const rows = report.items.slice(0, report.filters.top || 20).map((item: any, index: number) => ({
    idx: String(index + 1),
    cod_cliente: sanitizePdfCell(item.cod_cliente, 10),
    cliente: sanitizePdfCell(item.cliente, 40),
    cidade: sanitizePdfCell(item.cidade, 16),
    telefone: sanitizePdfCell(item.telefone, 16),
    mes_passado: formatCurrency(toNumber(item.mes_passado)),
    media_3_meses: formatCurrency(toNumber(item.media_3_meses)),
  }));

  const ops: string[] = [];
  ops.push(pdfRect(0, 0, pageWidth, pageHeight, [0.988, 0.992, 0.998]));
  ops.push(pdfRect(margin, 754, pageWidth - margin * 2, 58, [0.067, 0.169, 0.404]));
  ops.push(pdfText(margin + 14, 790, 'RELATORIO DE CLIENTES SEM COMPRAS', 'F2', 17, [1, 1, 1]));
  ops.push(pdfText(margin + 14, 772, `Data do relatorio: ${report.referenceDate}`, 'F1', 10, [0.92, 0.96, 1]));
  ops.push(pdfText(pageWidth - 150, 772, `Gerado em: ${generatedAt}`, 'F1', 9, [0.92, 0.96, 1]));

  ops.push(pdfRect(margin, 710, 250, 30, [1, 1, 1], [0.84, 0.88, 0.95], 0.8));
  ops.push(pdfRect(margin + 260, 710, 150, 30, [1, 1, 1], [0.84, 0.88, 0.95], 0.8));
  ops.push(pdfRect(margin + 420, 710, 151, 30, [1, 1, 1], [0.84, 0.88, 0.95], 0.8));
  ops.push(pdfText(margin + 10, 729, `Nome: ${sanitizePdfCell(responsibleName, 56)}`, 'F2', 10));
  ops.push(pdfText(margin + 270, 729, `Qtd sem compra: ${report.summary.clientesSemCompra}`, 'F2', 10));
  ops.push(pdfText(margin + 430, 729, `Base perdida: ${formatCurrency(report.summary.basePerdida)}`, 'F2', 10));

  ops.push(pdfRect(margin, tableTop, pageWidth - margin * 2, headerHeight, [0.125, 0.286, 0.639]));
  let currentX = margin;
  for (const column of columns) {
    ops.push(pdfText(currentX + 4, tableTop + 8, column.label, 'F2', 7.4, [1, 1, 1]));
    currentX += column.width;
  }

  rows.forEach((row: any, rowIndex: number) => {
    const y = tableTop - ((rowIndex + 1) * rowHeight);
    const fill: [number, number, number] = rowIndex % 2 === 0 ? [1, 1, 1] : [0.96, 0.972, 0.992];
    ops.push(pdfRect(margin, y, pageWidth - margin * 2, rowHeight, fill, [0.87, 0.9, 0.95], 0.45));
    let x = margin;
    columns.forEach((column) => {
      const raw = String((row as any)[column.key] ?? '-');
      const text = sanitizePdfCell(raw, column.key === 'cliente' ? 40 : 18);
      const approxCharWidth = 4.35;
      const textWidth = Math.min(text.length * approxCharWidth, column.width - 8);
      const textX = column.align === 'right' ? x + column.width - textWidth - 4 : x + 4;
      ops.push(pdfText(textX, y + 8, text, 'F1', 8.1, [0.09, 0.12, 0.2]));
      x += column.width;
    });
  });

  const tableBottom = tableTop - (rows.length * rowHeight);
  ops.push(pdfRect(margin, tableBottom, pageWidth - margin * 2, headerHeight, [0.929, 0.945, 0.976], [0.82, 0.86, 0.93], 0.5));
  ops.push(pdfText(margin + 8, tableBottom + 8, `Total exibido: ${rows.length} registro(s)`, 'F2', 9));
  ops.push(pdfText(pageWidth - 145, tableBottom + 8, 'Relatorio individual', 'F1', 9));

  const contentStream = ops.join('\n');
  const objects = [
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj',
    '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj',
    '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>\nendobj',
    '4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj',
    '5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>\nendobj',
    `6 0 obj\n<< /Length ${Buffer.byteLength(contentStream, 'utf8')} >>\nstream\n${contentStream}\nendstream\nendobj`,
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

async function getComparisonPeriods(referenceDate: string) {
  const periodsResult = await pool.query(`WITH params AS (SELECT $1::date AS ref_date), current_period AS (SELECT d::date AS day FROM params, generate_series(date_trunc('month', ref_date)::date, ref_date, interval '1 day') d WHERE EXTRACT(ISODOW FROM d) < 7), count_days AS (SELECT COUNT(*)::int AS business_days FROM current_period), previous_period AS (SELECT d::date AS day FROM params, count_days, generate_series((date_trunc('month', ref_date) - interval '1 month')::date, (date_trunc('month', ref_date) - interval '1 day')::date, interval '1 day') d WHERE EXTRACT(ISODOW FROM d) < 7 ORDER BY d LIMIT (SELECT business_days FROM count_days)) SELECT (SELECT MIN(day) FROM current_period) AS current_start, (SELECT MAX(day) FROM current_period) AS current_end, (SELECT COUNT(*) FROM current_period) AS current_days, (SELECT MIN(day) FROM previous_period) AS previous_start, (SELECT MAX(day) FROM previous_period) AS previous_end, (SELECT COUNT(*) FROM previous_period) AS previous_days`, [referenceDate]);
  return periodsResult.rows[0];
}

async function getMaioresQuedas(params: { referenceDate: string; top: number; vendedor?: string; supervisor?: string }) {
  const { referenceDate, top, vendedor = '', supervisor = '' } = params;
  const periods = await getComparisonPeriods(referenceDate);
  const reportResult = await pool.query(`WITH pedidos AS ( SELECT (raw_data->>'NUMPED') AS numped, (raw_data->>'CODCLI')::bigint AS codcli, MAX(raw_data->>'CLIENTE') AS cliente, MAX(raw_data->>'NOMECIDADE') AS cidade, MAX((raw_data->>'CODUSUR1')::bigint) AS codusur, MAX(TRIM(raw_data->>'VENDEDOR')) AS vendedor, MAX((raw_data->>'SUPERV')::bigint) AS codsuperv, (raw_data->>'DATA')::date AS data_pedido, SUM(REPLACE(raw_data->>'TOTAL', ',', '.')::numeric) AS total_pedido FROM staging."FATO_PEDIDO" WHERE raw_data->>'POSICAO' = 'F' AND (raw_data->>'DATA') IS NOT NULL GROUP BY 1,2,8 ), clientes AS ( SELECT DISTINCT ON ((raw_data->>'COD_CLIENTE')::bigint) (raw_data->>'COD_CLIENTE')::bigint AS cod_cliente, raw_data->>'NOME_CLIENTE' AS nome_cliente, raw_data->>'NOMECIDADE' AS nomecidade, raw_data->>'STATUS_CLIENTE' AS status_cliente, raw_data->>'TELEFONE_1' AS telefone_1, raw_data->>'TELEFONE_2' AS telefone_2, raw_data->>'TELEFONE_COMERCIAL' AS telefone_comercial, (raw_data->>'COD_VEND')::bigint AS cod_vend, (raw_data->>'COD_SUPERV')::bigint AS cod_superv, TRIM(raw_data->>'SUPERVISOR') AS supervisor FROM staging."DIM_CLIENTES" ), funcionarios AS ( SELECT DISTINCT ON ((raw_data->>'CODUSUR')::bigint) (raw_data->>'CODUSUR')::bigint AS codusur, TRIM(raw_data->>'NOME') AS nome_funcionario, (raw_data->>'CODSUPERVISOR')::bigint AS codsupervisor, raw_data->>'NOMEGERENTE' AS nomegerente FROM staging."DIM_FUNCIONARIOS" ), consolidado AS ( SELECT p.codcli AS cod_cliente, COALESCE(c.nome_cliente, p.cliente) AS cliente, COALESCE(c.nomecidade, p.cidade) AS cidade, COALESCE(f.nome_funcionario, p.vendedor) AS rca, COALESCE(c.supervisor, '') AS supervisor, COALESCE(NULLIF(c.telefone_1, ''), NULLIF(c.telefone_comercial, ''), NULLIF(c.telefone_2, '')) AS telefone, SUM(CASE WHEN p.data_pedido BETWEEN $1::date AND $2::date THEN p.total_pedido ELSE 0 END) AS mes_atual, SUM(CASE WHEN p.data_pedido BETWEEN $3::date AND $4::date THEN p.total_pedido ELSE 0 END) AS mes_passado FROM pedidos p LEFT JOIN clientes c ON c.cod_cliente = p.codcli LEFT JOIN funcionarios f ON f.codusur = p.codusur WHERE COALESCE(c.status_cliente, 'ATIVO') = 'ATIVO' AND ($7 = '' OR COALESCE(f.nome_funcionario, p.vendedor) = $7) AND ($8 = '' OR COALESCE(c.supervisor, '') = $8) GROUP BY 1,2,3,4,5,6 ) SELECT cod_cliente, cliente, cidade, rca, supervisor, telefone, ROUND(mes_passado, 2) AS mes_passado, ROUND(mes_atual, 2) AS mes_atual, ROUND(mes_atual - mes_passado, 2) AS perda_valor, ROUND(CASE WHEN mes_passado > 0 THEN ((mes_atual - mes_passado) / mes_passado) * 100 ELSE 0 END, 2) AS perda_percentual, ROUND((mes_atual / GREATEST($5::numeric, 1)) * $6::numeric, 2) AS projecao_mes, CASE WHEN mes_atual < mes_passado THEN 'queda' WHEN mes_atual > mes_passado THEN 'alta' ELSE 'estavel' END AS tendencia FROM consolidado WHERE mes_passado > 0 ORDER BY perda_valor ASC, mes_passado DESC LIMIT $9`, [periods.current_start, periods.current_end, periods.previous_start, periods.previous_end, periods.current_days, periods.previous_days, vendedor, supervisor, top]);
  return { referenceDate, periods, filters: { vendedor, supervisor, top }, summary: { clientesEmQueda: reportResult.rows.filter((row) => toNumber(row.perda_valor) < 0).length, perdaAcumulada: reportResult.rows.reduce((sum, row) => sum + Math.min(0, toNumber(row.perda_valor)), 0), vendaMesAtual: reportResult.rows.reduce((sum, row) => sum + toNumber(row.mes_atual), 0), vendaMesPassado: reportResult.rows.reduce((sum, row) => sum + toNumber(row.mes_passado), 0) }, items: reportResult.rows };
}

async function getSemCompras(params: { referenceDate: string; top: number; vendedor?: string; supervisor?: string }) {
  const { referenceDate, top, vendedor = '', supervisor = '' } = params;
  const periods = await getComparisonPeriods(referenceDate);
  const reportResult = await pool.query(`
    WITH limites AS (
      SELECT
        $1::date AS current_start,
        $2::date AS current_end,
        $3::date AS previous_start,
        $4::date AS previous_end,
        date_trunc('month', $1::date - interval '3 month')::date AS avg_start,
        (date_trunc('month', $1::date) - interval '1 day')::date AS avg_end
    ),
    pedidos AS (
      SELECT
        (raw_data->>'CODCLI')::bigint AS codcli,
        MAX(raw_data->>'CLIENTE') AS cliente,
        MAX(raw_data->>'NOMECIDADE') AS cidade,
        MAX((raw_data->>'CODUSUR1')::bigint) AS codusur,
        MAX(TRIM(raw_data->>'VENDEDOR')) AS vendedor,
        (raw_data->>'DATA')::date AS data_pedido,
        SUM(REPLACE(raw_data->>'TOTAL', ',', '.')::numeric) AS total_pedido
      FROM staging."FATO_PEDIDO"
      WHERE raw_data->>'POSICAO' = 'F' AND (raw_data->>'DATA') IS NOT NULL
      GROUP BY 1,6
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
        TRIM(raw_data->>'SUPERVISOR') AS supervisor
      FROM staging."DIM_CLIENTES"
    ),
    funcionarios AS (
      SELECT DISTINCT ON ((raw_data->>'CODUSUR')::bigint)
        (raw_data->>'CODUSUR')::bigint AS codusur,
        TRIM(raw_data->>'NOME') AS nome_funcionario
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
        SUM(CASE WHEN p.data_pedido BETWEEN l.current_start AND l.current_end THEN p.total_pedido ELSE 0 END) AS mes_atual,
        SUM(CASE WHEN p.data_pedido BETWEEN l.previous_start AND l.previous_end THEN p.total_pedido ELSE 0 END) AS mes_passado,
        ROUND(SUM(CASE WHEN p.data_pedido BETWEEN l.avg_start AND l.avg_end THEN p.total_pedido ELSE 0 END) / 3.0, 2) AS media_3_meses
      FROM pedidos p
      CROSS JOIN limites l
      LEFT JOIN clientes c ON c.cod_cliente = p.codcli
      LEFT JOIN funcionarios f ON f.codusur = p.codusur
      WHERE COALESCE(c.status_cliente, 'ATIVO') = 'ATIVO'
        AND ($5 = '' OR COALESCE(f.nome_funcionario, p.vendedor) = $5)
        AND ($6 = '' OR COALESCE(c.supervisor, '') = $6)
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
      ROUND(media_3_meses, 2) AS media_3_meses,
      ROUND(mes_passado, 2) AS potencial_recuperacao
    FROM consolidado
    WHERE mes_passado > 0 AND mes_atual = 0
    ORDER BY mes_passado DESC, cliente ASC
    LIMIT $7
  `, [periods.current_start, periods.current_end, periods.previous_start, periods.previous_end, vendedor, supervisor, top]);
  return { referenceDate, periods, filters: { vendedor, supervisor, top }, summary: { clientesSemCompra: reportResult.rows.length, basePerdida: reportResult.rows.reduce((sum, row) => sum + toNumber(row.mes_passado), 0), vendaMesAtual: reportResult.rows.reduce((sum, row) => sum + toNumber(row.mes_atual), 0), vendaMesPassado: reportResult.rows.reduce((sum, row) => sum + toNumber(row.mes_passado), 0) }, items: reportResult.rows };
}

async function getAllVendedores() {
  const result = await pool.query(`SELECT DISTINCT TRIM(raw_data->>'VENDEDOR') AS vendedor FROM staging."FATO_PEDIDO" WHERE raw_data->>'POSICAO'='F' AND COALESCE(TRIM(raw_data->>'VENDEDOR'),'')<>'' ORDER BY 1`);
  return result.rows.map((row) => row.vendedor);
}

function getReportCatalog() {
  return [
    { code: 'top_5_quedas', name: 'Maiores quedas', description: 'Clientes com retração / perda no período comparado.', implemented: true, defaults: { top: 5 } },
    { code: 'sem_compras', name: 'Sem compras', description: 'Clientes sem compra no recorte selecionado.', implemented: true, defaults: { top: 20 } },
    { code: 'top_oportunidades', name: 'Top oportunidades', description: 'Ranking comercial priorizado para ação.', implemented: false, defaults: { top: 10 } },
    { code: 'top_10_maiores', name: '10 maiores', description: 'Maiores clientes / contas do período.', implemented: false, defaults: { top: 10 } },
  ];
}

async function executeCampaignRule(ruleId: string, referenceDate?: string) {
  const ruleResult = await pool.query(`SELECT * FROM public.daily_report_rules WHERE id = $1 LIMIT 1`, [ruleId]);
  if (!ruleResult.rowCount) throw new Error('Regra não encontrada');
  const rule = ruleResult.rows[0];
  const payload = Array.isArray(rule.recipients_json) ? rule.recipients_json[0] || {} : {};
  const filters = payload.filters || {};
  const delivery = payload.delivery || {};
  const reportCatalog = getReportCatalog();
  const reportMeta = reportCatalog.find((item) => item.code === rule.report_type_code);
  if (!reportMeta) throw new Error(`Tipo de relatório inválido: ${rule.report_type_code}`);
  if (!reportMeta.implemented) throw new Error(`Relatório ainda não implementado: ${reportMeta.name}`);
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

  const reportTop = Number(filters.top) || Number(reportMeta.defaults?.top) || 5;
  const campaignHour = String(rule.send_time || '').slice(0, 5) || new Date().toISOString().slice(11, 16);
  const safeCampaignName = String(rule.rule_name || `campanha-${rule.id}`)
    .replace(/\s+/g, ' ')
    .trim();
  const reportTypeLabel = reportMeta.name;
  const reportSlug = rule.report_type_code === 'sem_compras' ? 'sem-compras' : 'maiores-quedas';
  const campaignBatchId = `campaign-${rule.id}-${Date.now()}`;
  const periodRef = effectiveReferenceDate.slice(0, 7).replace('-', '');
  const batchItems: any[] = [];

  for (const member of members) {
    const vendedor = member.member_type === 'vendedor' ? member.member_key : filters.vendedor || '';
    const supervisor = member.member_type === 'supervisor' ? member.member_key : filters.supervisor || '';
    const report = rule.report_type_code === 'sem_compras'
      ? await getSemCompras({ referenceDate: effectiveReferenceDate, top: reportTop, vendedor, supervisor })
      : await getMaioresQuedas({ referenceDate: effectiveReferenceDate, top: reportTop, vendedor, supervisor });

    const memberName = String(member.member_label || member.member_key || '').trim();
    const pdfBaseName = `${reportSlug}-${effectiveReferenceDate}-${String(memberName || 'destino').replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').toLowerCase() || 'destino'}`;
    const linkPdf = rule.report_type_code === 'sem_compras'
      ? `${PUBLIC_BASE_URL}/api/reports/sem-compras/pdf/${pdfBaseName}.pdf`
      : `${PUBLIC_BASE_URL}/api/reports/maiores-quedas/pdf/${pdfBaseName}.pdf`;

    batchItems.push({
      nome: memberName,
      tipo: member.member_type,
      telefone: member.destination || null,
      tipo_relatorio: rule.report_type_code,
      link_pdf: linkPdf,
      hora: campaignHour,
      campanha: safeCampaignName,
      meta: {
        memberKey: member.member_key,
        referenceDate: report.referenceDate,
        periodRef,
        request: {
          referenceDate: effectiveReferenceDate,
          top: reportTop,
          vendedor,
          supervisor,
          nome: memberName,
        },
      },
    });
  }

  const webhookPayload = {
    event: 'campaign.batch_dispatch',
    campanha_id: String(rule.id),
    campanha_nome: safeCampaignName,
    hora: campaignHour,
    tipo_relatorio: rule.report_type_code,
    nome_relatorio: reportTypeLabel,
    reference_date: effectiveReferenceDate,
    total_itens: batchItems.length,
    itens: batchItems,
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
      rule.target_type,
      rule.target_id,
      'webhook',
      effectiveReferenceDate,
      JSON.stringify(batchItems.map((item) => ({ nome: item.nome, tipo: item.tipo, telefone: item.telefone }))),
      JSON.stringify({ batchId: campaignBatchId, webhookPayload, responseBody }),
      webhookUrl,
      delivered,
      statusCode,
      webhookError,
      delivered ? 'delivered' : 'error',
    ],
  );

  return {
    ruleId: rule.id,
    ruleName: rule.rule_name,
    membersProcessed: members.length,
    batchId: campaignBatchId,
    delivered,
    statusCode,
    webhookError,
    execution: executionResult.rows[0],
  };
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
app.put('/api/groups/:id', async (req, res) => {
  const { name, groupType, deliveryMode = 'individual', description = '', active = true } = req.body ?? {};
  if (!name || !groupType) return res.status(400).json({ message: 'name e groupType são obrigatórios' });
  try {
    const result = await pool.query(`UPDATE public.report_groups SET name = $1, group_type = $2, delivery_mode = $3, description = $4, active = $5, updated_at = NOW() WHERE id = $6 RETURNING *`, [name, groupType, deliveryMode, description, active, req.params.id]);
    if (!result.rowCount) return res.status(404).json({ message: 'Grupo não encontrado' });
    res.json(result.rows[0]);
  }
  catch (error) { console.error(error); res.status(500).json({ message: 'Erro ao atualizar grupo' }); }
});
app.delete('/api/groups/:id', async (req, res) => {
  try {
    const result = await pool.query(`DELETE FROM public.report_groups WHERE id = $1 RETURNING id, name`, [req.params.id]);
    if (!result.rowCount) return res.status(404).json({ message: 'Grupo não encontrado' });
    res.json({ ok: true, deleted: result.rows[0] });
  }
  catch (error) { console.error(error); res.status(500).json({ message: 'Erro ao excluir grupo' }); }
});
app.get('/api/members', async (_req, res) => {
  try {
    const result = await pool.query(`SELECT m.*, g.name AS group_name, g.id AS group_id, g.group_type, g.delivery_mode FROM public.report_group_members m INNER JOIN public.report_groups g ON g.id = m.group_id WHERE m.active = TRUE ORDER BY m.member_label ASC`);
    res.json(result.rows);
  }
  catch (error) { console.error(error); res.status(500).json({ message: 'Erro ao listar usuários dos grupos' }); }
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
  const { memberType, memberKey, memberLabel, channel = 'webhook', destination = null, active = true, groupId } = req.body ?? {};
  if (!memberType || !memberKey || !memberLabel) return res.status(400).json({ message: 'memberType, memberKey e memberLabel são obrigatórios' });
  const normalizedDestination = normalizePhone(destination);
  if (!normalizedDestination) return res.status(400).json({ message: 'Telefone é obrigatório' });
  try {
    const targetGroupId = groupId || req.params.groupId;
    const result = await pool.query(`UPDATE public.report_group_members SET group_id = $1, member_type = $2, member_key = $3, member_label = $4, channel = $5, destination = $6, active = $7, updated_at = NOW() WHERE id = $8 AND group_id = $9 RETURNING *`, [targetGroupId, memberType, memberKey, memberLabel, channel, normalizedDestination, active, req.params.memberId, req.params.groupId]);
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
    const pdfBuffer = buildStyledPdfBuffer(report);
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

async function sendMaioresQuedasPdf(req: express.Request, res: express.Response) {
  const referenceDate = typeof req.query.referenceDate === 'string' ? req.query.referenceDate : new Date().toISOString().slice(0, 10);
  const top = Math.min(Number(req.query.top || 5), 20);
  const vendedor = typeof req.query.vendedor === 'string' ? req.query.vendedor : '';
  const supervisor = typeof req.query.supervisor === 'string' ? req.query.supervisor : '';
  try {
    const report = await getMaioresQuedas({ referenceDate, top, vendedor, supervisor });
    const pdfBuffer = buildStyledPdfBuffer(report);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="maiores-quedas-${referenceDate}.pdf"`);
    res.send(pdfBuffer);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Erro ao gerar PDF do relatório' });
  }
}

app.get('/api/reports/maiores-quedas/pdf', sendMaioresQuedasPdf);
app.get('/api/reports/maiores-quedas/pdf/:fileName.pdf', sendMaioresQuedasPdf);

app.get('/api/reports/sem-compras', async (req, res) => {
  const referenceDate = typeof req.query.referenceDate === 'string' ? req.query.referenceDate : new Date().toISOString().slice(0, 10);
  const top = Math.min(Number(req.query.top || 20), 200);
  const vendedor = typeof req.query.vendedor === 'string' ? req.query.vendedor : '';
  const supervisor = typeof req.query.supervisor === 'string' ? req.query.supervisor : '';
  try { res.json(await getSemCompras({ referenceDate, top, vendedor, supervisor })); }
  catch (error) { console.error(error); res.status(500).json({ message: 'Erro ao gerar relatório de sem compras' }); }
});

async function sendSemComprasPdf(req: express.Request, res: express.Response) {
  let referenceDate = typeof req.query.referenceDate === 'string' ? req.query.referenceDate : '';
  let top = Math.min(Number(req.query.top || 20), 50);
  let vendedor = typeof req.query.vendedor === 'string' ? req.query.vendedor : '';
  let supervisor = typeof req.query.supervisor === 'string' ? req.query.supervisor : '';

  const cleanFileName = Array.isArray(req.params.fileName) ? req.params.fileName[0] : req.params.fileName;
  if (!referenceDate && cleanFileName) {
    const stored = await findStoredReportRequest('sem_compras', cleanFileName);
    if (stored) {
      referenceDate = stored.referenceDate || referenceDate;
      top = Math.min(Number(stored.top || top), 50);
      vendedor = stored.vendedor || vendedor;
      supervisor = stored.supervisor || supervisor;
    }
  }

  if (!referenceDate) referenceDate = new Date().toISOString().slice(0, 10);

  try {
    const report = await getSemCompras({ referenceDate, top, vendedor, supervisor });
    const pdfBuffer = buildSemComprasPdfBuffer(report);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="sem-compras-${referenceDate}.pdf"`);
    res.send(pdfBuffer);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Erro ao gerar PDF do relatório sem compras' });
  }
}

app.get('/api/reports/sem-compras/pdf', sendSemComprasPdf);
app.get('/api/reports/sem-compras/pdf/:fileName.pdf', sendSemComprasPdf);

app.get('/api/report-types', async (_req, res) => {
  res.json(getReportCatalog());
});

app.get('/api/schedules', async (_req, res) => {
  try { const result = await pool.query(`SELECT id, rule_name, report_type_code, target_type, target_id, send_time, frequency, channel, active, created_at, updated_at, recipients_json FROM public.daily_report_rules ORDER BY id DESC`); res.json(result.rows); }
  catch (error) { console.error(error); res.status(500).json({ message: 'Erro ao listar agendamentos' }); }
});
app.post('/api/schedules', async (req, res) => {
  const { ruleName, reportTypeCode = 'top_5_quedas', targetType, targetId, sendTime, channel, webhookUrl, vendedor, supervisor, top } = req.body ?? {};
  if (!ruleName || !targetType || !sendTime) return res.status(400).json({ message: 'ruleName, targetType e sendTime são obrigatórios' });
  if (targetType !== 'all_vendedores' && !targetId) return res.status(400).json({ message: 'targetId é obrigatório para este tipo de alvo' });
  const reportMeta = getReportCatalog().find((item) => item.code === reportTypeCode);
  if (!reportMeta) return res.status(400).json({ message: 'reportTypeCode inválido' });
  try {
    const finalChannel = channel || 'webhook';
    const finalWebhookUrl = webhookUrl || process.env.DEFAULT_WEBHOOK_URL || null;
    const normalizedTargetId = targetType === 'all_vendedores' ? 'ALL' : targetId;
    const recipientsPayload = [{ kind: reportTypeCode, filters: { vendedor: vendedor || '', supervisor: supervisor || '', top: Number(top) || reportMeta.defaults.top || 5 }, delivery: { channel: finalChannel, webhookUrl: finalWebhookUrl } }];
    const result = await pool.query(`INSERT INTO public.daily_report_rules (rule_name, report_type_code, target_type, target_id, send_time, frequency, channel, recipients_json, active) VALUES ($1, $2, $3, $4, $5, 'daily', $6, $7::jsonb, TRUE) RETURNING id, rule_name, report_type_code, target_type, target_id, send_time, frequency, channel, active, created_at, updated_at, recipients_json`, [ruleName, reportTypeCode, targetType, normalizedTargetId, sendTime, finalChannel, JSON.stringify(recipientsPayload)]);
    res.status(201).json(result.rows[0]);
  } catch (error) { console.error(error); res.status(500).json({ message: 'Erro ao criar campanha' }); }
});
app.post('/api/schedules/maiores-quedas', async (req, res) => {
  const nextReqBody = { ...req.body, reportTypeCode: 'top_5_quedas' };
  const { ruleName, reportTypeCode = 'top_5_quedas', targetType, targetId, sendTime, channel, webhookUrl, vendedor, supervisor, top } = nextReqBody ?? {};
  if (!ruleName || !targetType || !sendTime) return res.status(400).json({ message: 'ruleName, targetType e sendTime são obrigatórios' });
  if (targetType !== 'all_vendedores' && !targetId) return res.status(400).json({ message: 'targetId é obrigatório para este tipo de alvo' });
  const reportMeta = getReportCatalog().find((item) => item.code === reportTypeCode);
  if (!reportMeta) return res.status(400).json({ message: 'reportTypeCode inválido' });
  try {
    const finalChannel = channel || 'webhook';
    const finalWebhookUrl = webhookUrl || process.env.DEFAULT_WEBHOOK_URL || null;
    const normalizedTargetId = targetType === 'all_vendedores' ? 'ALL' : targetId;
    const recipientsPayload = [{ kind: reportTypeCode, filters: { vendedor: vendedor || '', supervisor: supervisor || '', top: Number(top) || reportMeta.defaults.top || 5 }, delivery: { channel: finalChannel, webhookUrl: finalWebhookUrl } }];
    const result = await pool.query(`INSERT INTO public.daily_report_rules (rule_name, report_type_code, target_type, target_id, send_time, frequency, channel, recipients_json, active) VALUES ($1, $2, $3, $4, $5, 'daily', $6, $7::jsonb, TRUE) RETURNING id, rule_name, report_type_code, target_type, target_id, send_time, frequency, channel, active, created_at, updated_at, recipients_json`, [ruleName, reportTypeCode, targetType, normalizedTargetId, sendTime, finalChannel, JSON.stringify(recipientsPayload)]);
    res.status(201).json(result.rows[0]);
  } catch (error) { console.error(error); res.status(500).json({ message: 'Erro ao criar campanha' }); }
});
app.post('/api/schedules/:id/run', async (req, res) => {
  try {
    const result = await executeCampaignRule(req.params.id, req.body?.referenceDate);
    res.json({ ok: true, ...result });
  } catch (error) {
    console.error(error);
    res.status(500).json({ ok: false, message: error instanceof Error ? error.message : 'Erro ao executar regra' });
  }
});
app.delete('/api/schedules/:id', async (req, res) => {
  try {
    const result = await pool.query(`DELETE FROM public.daily_report_rules WHERE id = $1 RETURNING id, rule_name`, [req.params.id]);
    if (!result.rowCount) return res.status(404).json({ ok: false, message: 'Campanha não encontrada' });
    res.json({ ok: true, deleted: result.rows[0] });
  } catch (error) {
    console.error(error);
    res.status(500).json({ ok: false, message: 'Erro ao excluir campanha' });
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
