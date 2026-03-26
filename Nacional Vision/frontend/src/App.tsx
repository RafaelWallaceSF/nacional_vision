import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { BrowserRouter, Navigate, NavLink, Route, Routes, useNavigate } from 'react-router-dom'
import './App.css'

type User = { id: number; name: string; email: string; role: string }
type ReportItem = { cod_cliente: number; cliente: string; cidade: string; rca: string; supervisor: string; telefone: string; mes_passado: number; mes_atual: number; perda_valor: number; perda_percentual: number; projecao_mes: number; tendencia: string }
type ReportResponse = { referenceDate: string; periods: { current_start: string; current_end: string; current_days: number; previous_start: string; previous_end: string; previous_days: number }; filters: { vendedor: string; supervisor: string; top: number }; summary: { clientesEmQueda: number; perdaAcumulada: number; vendaMesAtual: number; vendaMesPassado: number }; items: ReportItem[] }
type ReportAttachment = { kind: string; fileName: string; mimeType: string; size: number }
type Schedule = { id: number; rule_name: string; report_type_code: string; target_type: string; target_id: string; send_time: string; frequency: string; channel: string; active: boolean; recipients_json?: any[] }
type HistoryItem = { id: number; rule_name: string; report_type_code: string; target_type: string; target_id: string; status: string; created_at: string; webhook_status?: number; webhook_error?: string | null }
type Group = { id: number; name: string; group_type: string; delivery_mode: string; description?: string; active: boolean; members_count: number }
type GroupMember = { id: number; group_id: number; group_name?: string; member_type: string; member_key: string; member_label: string; channel?: string; destination?: string; active: boolean }
type WebhookInfo = { configured: boolean; webhookUrl: string | null }
type ReportTypeOption = { code: string; name: string; description: string; implemented: boolean; defaults?: { top?: number } }

type GroupMemberForm = { memberType: string; employeeName: string; aliasName: string; phone: string }
type PeopleOptions = { funcionarios: string[]; vendedores: string[]; supervisores: string[]; gerentes: string[] }

type PeopleSourceMeta = {
  funcionarios: { label: string; source: string; description: string }
  vendedores: { label: string; source: string; description: string }
  supervisores: { label: string; source: string; description: string }
  gerentes: { label: string; source: string; description: string }
}

function normalizePhoneInput(value: string) {
  let digits = value.replace(/\D/g, '')
  if (digits.startsWith('55')) digits = digits.slice(2)
  return digits.slice(0, 11)
}

function formatPhoneDisplay(value: string) {
  const digits = normalizePhoneInput(value)
  if (!digits) return ''
  if (digits.length <= 2) return `(${digits}`
  if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`
  if (digits.length <= 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`
}

function toWebhookPhone(value: string) {
  const digits = normalizePhoneInput(value)
  return digits ? `55${digits}` : ''
}

const AUTH_STORAGE_KEY = 'ops-core-auth'
const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
const peopleSourceMeta: PeopleSourceMeta = {
  funcionarios: {
    label: 'Funcionários',
    source: 'staging."DIM_FUNCIONARIOS"',
    description: 'Usa somente o campo raw_data->>\'NOME\'.',
  },
  vendedores: {
    label: 'Vendedores',
    source: 'staging."DIM_CLIENTES"',
    description: 'Usa COD_VEND + NOME.',
  },
  supervisores: {
    label: 'Supervisores',
    source: 'staging."DIM_CLIENTES"',
    description: 'Usa COD_SUPERV + SUPERVISOR.',
  },
  gerentes: {
    label: 'Gerentes',
    source: 'regra fixa',
    description: 'Lista atual com um único gerente: JUNIOR.',
  },
}

function LoginPage({ onLogin }: { onLogin: (user: User) => void }) {
  const navigate = useNavigate()
  const [email, setEmail] = useState('admin@teste.local')
  const [password, setPassword] = useState('Admin@123')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setLoading(true); setError('')
    try { const response = await fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) }); const data = await response.json(); if (!response.ok) throw new Error(data.message || 'Falha no login'); onLogin(data.user); navigate('/dashboard') } catch (err) { setError(err instanceof Error ? err.message : 'Falha no login') } finally { setLoading(false) }
  }
  return <div className="login-page"><div className="login-card"><p className="section-kicker">PAINEL COMERCIAL</p><h1>Acessar sistema</h1><p className="section-subtitle">Entrar no painel para relatórios, carteira e agendamentos.</p><div className="credential-box"><strong>Admin de teste</strong><span>admin@teste.local</span><span>Admin@123</span></div><form className="form-grid" onSubmit={handleSubmit}><label>E-mail<input value={email} onChange={(e) => setEmail(e.target.value)} type="email" /></label><label>Senha<input value={password} onChange={(e) => setPassword(e.target.value)} type="password" /></label>{error ? <p className="error-text">{error}</p> : null}<button type="submit" className="primary-btn" disabled={loading}>{loading ? 'Entrando...' : 'Entrar'}</button></form></div></div>
}

function SummaryTile({ label, value, note, tone = 'neutral' }: { label: string; value: string; note: string; tone?: 'neutral' | 'danger' | 'warning' }) { return <div className={`summary-tile ${tone}`}><span>{label}</span><strong>{value}</strong><small>{note}</small></div> }
function SourceHint({ meta, count }: { meta: PeopleSourceMeta[keyof PeopleSourceMeta]; count?: number }) {
  return <div className="source-hint"><strong>{meta.label}</strong><span>{meta.source}</span><small>{meta.description}{typeof count === 'number' ? ` ${count} item(ns) carregado(s).` : ''}</small></div>
}

function DashboardPage() { return <section className="screen-block"><div className="hero-row"><div className="title-area"><h1>Inteligência de Carteira</h1><p>Última atualização da base: {new Date().toLocaleDateString('pt-BR')}</p></div><div className="hero-actions"><button className="outline-btn">Dashboard Comercial</button><button className="primary-btn">Nova análise</button></div></div><div className="tab-strip"><button className="tab active">Carteira</button><button className="tab">Estratégicos</button></div><div className="summary-grid"><SummaryTile label="Ativos" value="419" note="clientes ativos" /><SummaryTile label="Atenção" value="298" note="base observada" tone="warning" /><SummaryTile label="Risco" value="219" note="queda relevante" tone="danger" /><SummaryTile label="Perdidos" value="15.680" note="clientes sem reação" tone="danger" /><SummaryTile label="Potencial parado" value="R$ 1,2 mi" note="receita travada" /><SummaryTile label="Limite disponível" value="R$ 0" note="crédito em análise" /></div></section> }

function ReportsPage() {
  const today = new Date().toISOString().slice(0, 10)
  const [referenceDate, setReferenceDate] = useState(today)
  const [vendedor, setVendedor] = useState('')
  const [supervisor, setSupervisor] = useState('')
  const [top, setTop] = useState(5)
  const [search, setSearch] = useState('')
  const [data, setData] = useState<ReportResponse | null>(null)
  const [preview, setPreview] = useState('')
  const [previewAttachment, setPreviewAttachment] = useState<ReportAttachment | null>(null)
  const [filters, setFilters] = useState<{ vendedores: string[]; supervisores: string[] }>({ vendedores: [], supervisores: [] })
  const [people, setPeople] = useState<PeopleOptions>({ funcionarios: [], vendedores: [], supervisores: [], gerentes: [] })
  const [loading, setLoading] = useState(false)
  async function loadReport(date = referenceDate, nextVendedor = vendedor, nextSupervisor = supervisor, nextTop = top) {
    setLoading(true)
    try {
      const query = new URLSearchParams({ referenceDate: date, top: String(nextTop) })
      if (nextVendedor) query.set('vendedor', nextVendedor)
      if (nextSupervisor) query.set('supervisor', nextSupervisor)
      const [reportResponse, previewResponse] = await Promise.all([fetch(`/api/reports/maiores-quedas?${query.toString()}`), fetch(`/api/reports/maiores-quedas/preview?${query.toString()}`)])
      setData(await reportResponse.json())
      const previewJson = await previewResponse.json()
      setPreview(previewJson.caption || '')
      setPreviewAttachment(previewJson.attachment || null)
    } finally { setLoading(false) }
  }
  async function loadFilters() { const response = await fetch('/api/reports/filters'); setFilters(await response.json()) }
  async function loadPeople() {
    const [funcionarios, vendedores, supervisores, gerentes] = await Promise.all([
      fetch('/api/funcionarios').then((r) => r.json()),
      fetch('/api/vendedores').then((r) => r.json()),
      fetch('/api/supervisores').then((r) => r.json()),
      fetch('/api/gerentes').then((r) => r.json()),
    ])
    setPeople({ funcionarios, vendedores, supervisores, gerentes })
  }
  useEffect(() => { loadFilters().catch(() => undefined); loadPeople().catch(() => undefined); loadReport(today, '', '', 5).catch(() => undefined) }, [])
  const filteredItems = (data?.items || []).filter((item) => { const q = search.trim().toLowerCase(); if (!q) return true; return [item.cliente, item.rca, item.supervisor, item.cidade, String(item.cod_cliente)].some((v) => String(v).toLowerCase().includes(q)) })
  return <section className="screen-block"><div className="hero-row"><div className="title-area"><h1>Inteligência de Carteira</h1><p>Última atualização da base: {new Date(referenceDate).toLocaleDateString('pt-BR')}</p></div><div className="hero-actions"><button className="outline-btn">Exportar PDF</button><button className="primary-btn">Compartilhar ranking</button></div></div><div className="tab-strip"><button className="tab active">Carteira</button><button className="tab">Estratégicos</button></div><div className="summary-grid"><SummaryTile label="Clientes em queda" value={String(data?.summary.clientesEmQueda ?? 0)} note="ranking atual" tone="danger" /><SummaryTile label="Perda acumulada" value={brl.format(data?.summary.perdaAcumulada ?? 0)} note="top retornado" tone="danger" /><SummaryTile label="Mês atual" value={brl.format(data?.summary.vendaMesAtual ?? 0)} note="pedidos posição F" /><SummaryTile label="Mês passado" value={brl.format(data?.summary.vendaMesPassado ?? 0)} note="recorte equivalente" /><SummaryTile label="Top analisado" value={String(top)} note="clientes no ranking" tone="warning" /><SummaryTile label="Filtro" value={vendedor || supervisor || 'Geral'} note="escopo atual" /></div><div className="panel-shell main-panel"><div className="panel-head"><div><h2>Top Oportunidades</h2><p className="panel-subtitle">Leitura operacional dos clientes com maior retração no período equivalente.</p></div><div className="head-badges"><span className="soft-badge">Pasta: Carteira</span><span className="soft-badge active">Atualizado</span></div></div><div className="toolbar-grid refined"><input className="search-input" placeholder="Buscar cliente, RCA, cidade ou código" value={search} onChange={(e) => setSearch(e.target.value)} /><select value={vendedor} onChange={(e) => setVendedor(e.target.value)}><option value="">Todos os vendedores ({peopleSourceMeta.vendedores.source})</option>{filters.vendedores.map((item) => <option key={item} value={item}>{item}</option>)}</select><select value={supervisor} onChange={(e) => setSupervisor(e.target.value)}><option value="">Todos os supervisores ({peopleSourceMeta.supervisores.source})</option>{filters.supervisores.map((item) => <option key={item} value={item}>{item}</option>)}</select><input type="date" value={referenceDate} onChange={(e) => setReferenceDate(e.target.value)} /><select value={String(top)} onChange={(e) => setTop(Number(e.target.value))}><option value="5">Top 5</option><option value="10">Top 10</option><option value="20">Top 20</option></select><button className="primary-btn" onClick={() => loadReport()}>{loading ? 'Atualizando...' : 'Atualizar'}</button></div><div className="source-hint-grid"><SourceHint meta={peopleSourceMeta.funcionarios} count={people.funcionarios.length} /><SourceHint meta={peopleSourceMeta.vendedores} count={people.vendedores.length} /></div><div className="table-wrap refined-wrap"><table className="modern-table refined-table"><thead><tr><th>RCA</th><th>Cód. Cliente</th><th>Razão Social</th><th>Cidade</th><th>Mês passado</th><th>Mês atual</th><th>Perda</th><th>Queda %</th><th>Status</th></tr></thead><tbody>{filteredItems.map((item) => <tr key={`${item.cod_cliente}-${item.rca}`}><td><div className="cell-title">{item.rca}</div><div className="cell-sub">{item.supervisor}</div></td><td>{item.cod_cliente}</td><td><div className="cell-title">{item.cliente}</div><div className="cell-sub">{item.telefone || '-'}</div></td><td>{item.cidade}</td><td>{brl.format(item.mes_passado)}</td><td>{brl.format(item.mes_atual)}</td><td className="negative strong">{brl.format(item.perda_valor)}</td><td className="negative strong">{item.perda_percentual}%</td><td><span className="status-pill lost">PERDIDO</span></td></tr>)}</tbody></table></div></div><div className="panel-shell preview-shell"><div className="panel-head compact-head"><div><h2>Preview da mensagem</h2><p className="panel-subtitle">Formato atual do relatório selecionado para análise.</p></div></div>{previewAttachment ? <div className="source-hint pdf-hint"><strong>PDF pronto para webhook</strong><span>{previewAttachment.fileName}</span><small>{previewAttachment.mimeType} · {previewAttachment.size} bytes</small><a className="inline-link" href={`/api/reports/maiores-quedas/pdf/${String(previewAttachment.fileName).replace(/\.pdf$/i, '')}.pdf?referenceDate=${referenceDate}&top=${top}${vendedor ? `&vendedor=${encodeURIComponent(vendedor)}` : ''}${supervisor ? `&supervisor=${encodeURIComponent(supervisor)}` : ''}`} target="_blank" rel="noreferrer">Abrir PDF</a></div> : null}<pre className="message-preview light refined-preview">{preview || 'Sem preview'}</pre></div></section>
}

function GroupsPage() {
  const [groups, setGroups] = useState<Group[]>([])
  const [selectedGroupId, setSelectedGroupId] = useState<string>('')
  const [message, setMessage] = useState('')
  const [editingGroupId, setEditingGroupId] = useState<number | null>(null)
  const [groupForm, setGroupForm] = useState({ name: '', groupType: 'vendedor', deliveryMode: 'individual', description: '' })
  const [webhookInfo, setWebhookInfo] = useState<WebhookInfo>({ configured: false, webhookUrl: null })

  async function loadGroups() {
    const response = await fetch('/api/groups')
    const data = await response.json()
    setGroups(data)
    if (!selectedGroupId && data[0]) setSelectedGroupId(String(data[0].id))
  }

  async function loadWebhookInfo() {
    const response = await fetch('/api/webhook/info')
    setWebhookInfo(await response.json())
  }

  async function saveGroup() {
    setMessage('')
    const url = editingGroupId ? `/api/groups/${editingGroupId}` : '/api/groups'
    const method = editingGroupId ? 'PUT' : 'POST'
    const response = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(groupForm) })
    const json = await response.json()
    if (!response.ok) return setMessage(json.message || 'Erro ao salvar grupo')
    setGroupForm({ name: '', groupType: 'vendedor', deliveryMode: 'individual', description: '' })
    setEditingGroupId(null)
    setSelectedGroupId(String(json.id))
    await loadGroups()
    setMessage(editingGroupId ? `Grupo atualizado #${json.id}` : `Grupo criado #${json.id}`)
  }

  function handleEditGroup(group: Group) {
    setSelectedGroupId(String(group.id))
    setEditingGroupId(group.id)
    setGroupForm({ name: group.name, groupType: group.group_type, deliveryMode: group.delivery_mode, description: group.description || '' })
    setMessage(`Editando grupo ${group.name}`)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function handleDeleteGroup(groupId: number) {
    setMessage('')
    const response = await fetch(`/api/groups/${groupId}`, { method: 'DELETE' })
    const json = await response.json()
    if (!response.ok) return setMessage(json.message || 'Erro ao excluir grupo')
    if (editingGroupId === groupId) {
      setEditingGroupId(null)
      setGroupForm({ name: '', groupType: 'vendedor', deliveryMode: 'individual', description: '' })
    }
    if (selectedGroupId === String(groupId)) setSelectedGroupId('')
    await loadGroups()
    setMessage('Grupo removido com sucesso')
  }

  function resetGroupForm() {
    setEditingGroupId(null)
    setGroupForm({ name: '', groupType: 'vendedor', deliveryMode: 'individual', description: '' })
  }

  useEffect(() => { loadGroups().catch(() => undefined); loadWebhookInfo().catch(() => undefined) }, [])

  return <section className="screen-block"><div className="hero-row"><div className="title-area"><h1>Grupos operacionais</h1><p>Aqui fica só a gestão dos grupos.</p></div></div><div className="panel-shell"><div className="panel-head compact-head"><div><h2>Webhook padrão</h2><p className="panel-subtitle">Destino fixo usado nos disparos via webhook.</p></div></div><div className="webhook-info-row"><span className={`soft-badge ${webhookInfo.configured ? 'active' : ''}`}>{webhookInfo.configured ? 'Configurado' : 'Não configurado'}</span><code className="webhook-url">{webhookInfo.webhookUrl || 'Webhook padrão não configurado'}</code></div></div>{message ? <div className="panel-shell"><p className="success-text no-margin">{message}</p></div> : null}<div className="bottom-grid refined-bottom"><div className="panel-shell"><div className="panel-head compact-head"><div><h2>{editingGroupId ? 'Editar grupo' : 'Novo grupo'}</h2><p className="panel-subtitle">Base para campanhas por lote.</p></div></div><div className="toolbar-grid refined-schedule"><input value={groupForm.name} onChange={(e) => setGroupForm({ ...groupForm, name: e.target.value })} placeholder="Nome do grupo" /><select value={groupForm.groupType} onChange={(e) => setGroupForm({ ...groupForm, groupType: e.target.value })}><option value="vendedor">vendedor</option><option value="supervisor">supervisor</option><option value="gerente">gerente</option><option value="contato">contato</option></select><select value={groupForm.deliveryMode} onChange={(e) => setGroupForm({ ...groupForm, deliveryMode: e.target.value })}><option value="individual">individual</option><option value="consolidado">consolidado</option></select><input value={groupForm.description} onChange={(e) => setGroupForm({ ...groupForm, description: e.target.value })} placeholder="Descrição" /><button className="primary-btn" onClick={saveGroup}>{editingGroupId ? 'Salvar grupo' : 'Criar grupo'}</button>{editingGroupId ? <button className="outline-btn" onClick={resetGroupForm}>Cancelar</button> : null}</div></div><div className="panel-shell"><div className="panel-head compact-head"><div><h2>Grupos cadastrados</h2><p className="panel-subtitle">Selecione, edite ou exclua grupos.</p></div></div><div className="table-wrap refined-wrap"><table className="modern-table refined-table"><thead><tr><th>Grupo</th><th>Tipo</th><th>Modo</th><th>Membros</th><th>Ações</th></tr></thead><tbody>{groups.map((group) => <tr key={group.id} className={String(group.id) === selectedGroupId ? 'selected-row' : ''}><td onClick={() => setSelectedGroupId(String(group.id))}>{group.name}</td><td onClick={() => setSelectedGroupId(String(group.id))}>{group.group_type}</td><td onClick={() => setSelectedGroupId(String(group.id))}>{group.delivery_mode}</td><td onClick={() => setSelectedGroupId(String(group.id))}>{group.members_count}</td><td><div className="row-actions"><button type="button" className="outline-btn small-btn" onClick={() => handleEditGroup(group)}>Editar</button><button type="button" className="outline-btn small-btn danger-btn" onClick={() => handleDeleteGroup(group.id)}>Excluir</button></div></td></tr>)}</tbody></table></div></div></div></section>
}

function CampaignsPage() {
  const [items, setItems] = useState<Schedule[]>([])
  const [groups, setGroups] = useState<Group[]>([])
  const [people, setPeople] = useState<PeopleOptions>({ funcionarios: [], vendedores: [], supervisores: [], gerentes: [] })
  const [reportTypes, setReportTypes] = useState<ReportTypeOption[]>([])
  const [message, setMessage] = useState('')
  const [scheduleForm, setScheduleForm] = useState({ ruleName: 'Campanha diária', scope: 'individual', reportTypeCode: 'top_5_quedas', targetType: 'vendedor', targetId: '', sendTime: '08:00', channel: 'webhook' })

  async function load() { const response = await fetch('/api/schedules'); setItems(await response.json()) }
  async function loadGroups() { const response = await fetch('/api/groups'); setGroups(await response.json()) }
  async function loadPeople() {
    const [funcionarios, vendedores, supervisores, gerentes] = await Promise.all([
      fetch('/api/funcionarios').then((r) => r.json()),
      fetch('/api/vendedores').then((r) => r.json()),
      fetch('/api/supervisores').then((r) => r.json()),
      fetch('/api/gerentes').then((r) => r.json()),
    ])
    setPeople({ funcionarios, vendedores, supervisores, gerentes })
  }
  async function loadReportTypes() {
    const response = await fetch('/api/report-types')
    setReportTypes(await response.json())
  }
  function formatTarget(item: Schedule) {
    if (item.target_type === 'all_vendedores') return 'Todos os vendedores'
    if (item.target_type === 'group') {
      const group = groups.find((entry) => String(entry.id) === String(item.target_id))
      return group ? `Grupo — ${group.name}` : `Grupo — ${item.target_id}`
    }
    if (item.target_type === 'vendedor') return `Vendedor — ${item.target_id}`
    if (item.target_type === 'supervisor') return `Supervisor — ${item.target_id}`
    if (item.target_type === 'gerente') return `Gerente — ${item.target_id}`
    return `${item.target_type}: ${item.target_id}`
  }
  async function createCampaign() {
    setMessage('')
    const effectiveTargetType = scheduleForm.scope === 'group' ? 'group' : scheduleForm.targetType
    const payload = {
      ruleName: scheduleForm.ruleName,
      reportTypeCode: scheduleForm.reportTypeCode,
      targetType: effectiveTargetType,
      targetId: effectiveTargetType === 'all_vendedores' ? '' : scheduleForm.targetId,
      sendTime: scheduleForm.sendTime,
      channel: scheduleForm.channel,
    }
    const response = await fetch('/api/schedules', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
    const json = await response.json()
    setMessage(response.ok ? `Campanha criada #${json.id}` : (json.message || 'Erro ao criar campanha'))
    if (response.ok) load().catch(() => undefined)
  }
  async function runNow(id: number) {
    setMessage('')
    const response = await fetch(`/api/schedules/${id}/run`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) })
    const json = await response.json()
    setMessage(response.ok ? `Campanha ${id} executada. Membros processados: ${json.membersProcessed}` : (json.message || 'Erro ao executar campanha'))
    if (response.ok) load().catch(() => undefined)
  }
  async function deleteCampaign(id: number) {
    setMessage('')
    const response = await fetch(`/api/schedules/${id}`, { method: 'DELETE' })
    const json = await response.json()
    setMessage(response.ok ? `Campanha ${id} excluída com sucesso` : (json.message || 'Erro ao excluir campanha'))
    if (response.ok) load().catch(() => undefined)
  }
  useEffect(() => { load().catch(() => undefined); loadGroups().catch(() => undefined); loadPeople().catch(() => undefined); loadReportTypes().catch(() => undefined) }, [])

  const campaignTargetOptions = scheduleForm.scope === 'group'
    ? groups.map((group) => ({ value: String(group.id), label: group.name }))
    : scheduleForm.targetType === 'vendedor'
      ? people.vendedores.map((name) => ({ value: name, label: name }))
      : scheduleForm.targetType === 'supervisor'
        ? people.supervisores.map((name) => ({ value: name, label: name }))
        : scheduleForm.targetType === 'gerente'
          ? people.gerentes.map((name) => ({ value: name, label: name }))
          : []
  const campaignTargetPlaceholder = scheduleForm.scope === 'group' ? 'Selecione um grupo' : scheduleForm.targetType === 'supervisor' ? 'Selecione um supervisor' : scheduleForm.targetType === 'gerente' ? 'Selecione um gerente' : scheduleForm.targetType === 'all_vendedores' ? 'Todos os vendedores' : 'Selecione um vendedor'
  const selectedReportType = reportTypes.find((item) => item.code === scheduleForm.reportTypeCode) || null
  const activeItems = items.filter((item) => item.active)

  return <section className="screen-block"><div className="title-area"><h1>Campanhas</h1><p>Criação, acompanhamento das ativas e disparo manual.</p></div>{message ? <div className="panel-shell"><p className="success-text no-margin">{message}</p></div> : null}<div className="panel-shell"><p className="plain-text no-margin">Se o disparo não gerar envio, confira se o grupo selecionado possui membros ativos. O grupo <strong>testev</strong> hoje está vazio.</p></div><div className="bottom-grid campaign-layout"><div className="panel-shell"><div className="panel-head compact-head"><div><h2>Nova campanha</h2><p className="panel-subtitle">Escolha o relatório, o grupo/individual e o horário do disparo.</p></div></div><div className="toolbar-grid refined-schedule"><input value={scheduleForm.ruleName} onChange={(e) => setScheduleForm({ ...scheduleForm, ruleName: e.target.value })} placeholder="Nome da campanha" /><select value={scheduleForm.scope} onChange={(e) => setScheduleForm({ ...scheduleForm, scope: e.target.value, targetId: '', targetType: e.target.value === 'group' ? 'group' : 'vendedor' })}><option value="individual">Individual</option><option value="group">Grupo</option></select><select value={scheduleForm.reportTypeCode} onChange={(e) => setScheduleForm({ ...scheduleForm, reportTypeCode: e.target.value })}>{reportTypes.map((item) => <option key={item.code} value={item.code}>{item.name}{item.implemented ? '' : ' (em breve)'}</option>)}</select>{scheduleForm.scope === 'group' ? <select value={scheduleForm.targetId} onChange={(e) => setScheduleForm({ ...scheduleForm, targetId: e.target.value })}><option value="">Selecione um grupo</option>{campaignTargetOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select> : <><select value={scheduleForm.targetType} onChange={(e) => setScheduleForm({ ...scheduleForm, targetType: e.target.value, targetId: '' })}><option value="vendedor">Vendedor</option><option value="supervisor">Supervisor</option><option value="gerente">Gerente</option><option value="all_vendedores">Todos os vendedores</option></select>{scheduleForm.targetType === 'all_vendedores' ? <div className="input-like disabled">Todos os vendedores ativos da base</div> : <select value={scheduleForm.targetId} onChange={(e) => setScheduleForm({ ...scheduleForm, targetId: e.target.value })}><option value="">{campaignTargetPlaceholder}</option>{campaignTargetOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select>}</>}<input type="time" value={scheduleForm.sendTime} onChange={(e) => setScheduleForm({ ...scheduleForm, sendTime: e.target.value })} /><select value={scheduleForm.channel} onChange={(e) => setScheduleForm({ ...scheduleForm, channel: e.target.value })}><option value="webhook">webhook</option></select><button className="primary-btn" onClick={createCampaign}>Criar campanha</button></div>{selectedReportType ? <div className="source-hint"><strong>{selectedReportType.name}</strong><span>{selectedReportType.code}</span><small>{selectedReportType.description}{selectedReportType.implemented ? '' : ' Implementação pendente do motor de geração/disparo.'}</small></div> : null}</div><div className="panel-shell"><div className="panel-head compact-head"><div><h2>Campanhas ativas</h2><p className="panel-subtitle">Lista das campanhas vigentes com disparo manual.</p></div></div><div className="table-wrap refined-wrap"><table className="modern-table refined-table"><thead><tr><th>Campanha</th><th>Relatório</th><th>Alvo</th><th>Hora</th><th>Canal</th><th>Ações</th></tr></thead><tbody>{activeItems.map((item) => <tr key={item.id}><td>{item.rule_name}</td><td>{item.report_type_code}</td><td>{formatTarget(item)}</td><td>{String(item.send_time).slice(0, 5)}</td><td>{item.channel}</td><td><div className="row-actions"><button className="outline-btn small-btn" onClick={() => runNow(item.id)}>Disparar</button><button className="outline-btn small-btn danger-btn" onClick={() => deleteCampaign(item.id)}>Excluir</button></div></td></tr>)}</tbody></table></div></div></div></section>
}

function HistoryPage() {
  const [items, setItems] = useState<HistoryItem[]>([])
  useEffect(() => { fetch('/api/history').then((r) => r.json()).then(setItems).catch(() => undefined) }, [])
  return <section className="screen-block"><div className="title-area"><h1>Histórico</h1><p>Execuções e auditoria.</p></div><div className="panel-shell"><div className="table-wrap refined-wrap"><table className="modern-table refined-table"><thead><tr><th>ID</th><th>Regra</th><th>Alvo</th><th>Status</th><th>Webhook</th><th>Erro</th></tr></thead><tbody>{items.map((item) => <tr key={item.id}><td>{item.id}</td><td>{item.rule_name}</td><td>{item.target_type}: {item.target_id}</td><td>{item.status}</td><td>{item.webhook_status || '-'}</td><td>{item.webhook_error || '-'}</td></tr>)}</tbody></table></div></div></section>
}

function UsersPage() {
  const [groups, setGroups] = useState<Group[]>([])
  const [members, setMembers] = useState<GroupMember[]>([])
  const [message, setMessage] = useState('')
  const [editingMemberId, setEditingMemberId] = useState<number | null>(null)
  const [editingMemberGroupId, setEditingMemberGroupId] = useState<string>('')
  const [memberForm, setMemberForm] = useState<GroupMemberForm & { groupId: string }>({ groupId: '', memberType: 'vendedor', employeeName: '', aliasName: '', phone: '' })
  const [people, setPeople] = useState<PeopleOptions>({ funcionarios: [], vendedores: [], supervisores: [], gerentes: [] })

  async function loadGroups() {
    const response = await fetch('/api/groups')
    const data = await response.json()
    setGroups(data)
    setMemberForm((current) => current.groupId ? current : { ...current, groupId: data[0] ? String(data[0].id) : '' })
  }

  async function loadMembers() {
    const response = await fetch('/api/members')
    setMembers(await response.json())
  }

  async function loadPeople() {
    const [funcionarios, vendedores, supervisores, gerentes] = await Promise.all([
      fetch('/api/funcionarios').then((r) => r.json()),
      fetch('/api/vendedores').then((r) => r.json()),
      fetch('/api/supervisores').then((r) => r.json()),
      fetch('/api/gerentes').then((r) => r.json()),
    ])
    setPeople({ funcionarios, vendedores, supervisores, gerentes })
  }

  function resetMemberForm() {
    setEditingMemberId(null)
    setEditingMemberGroupId('')
    setMemberForm({ groupId: groups[0] ? String(groups[0].id) : '', memberType: 'vendedor', employeeName: '', aliasName: '', phone: '' })
  }

  async function saveMember() {
    if (!memberForm.groupId) return setMessage('Selecione um grupo')
    if (!memberForm.employeeName.trim() || !memberForm.phone.trim()) return setMessage('Informe usuário e telefone')
    setMessage('')
    const payload = {
      groupId: memberForm.groupId,
      memberType: memberForm.memberType,
      memberKey: memberForm.employeeName.trim(),
      memberLabel: memberForm.aliasName.trim() || memberForm.employeeName.trim(),
      channel: 'webhook',
      destination: toWebhookPhone(memberForm.phone),
    }
    const baseGroupId = editingMemberGroupId || memberForm.groupId
    const url = editingMemberId ? `/api/groups/${baseGroupId}/members/${editingMemberId}` : `/api/groups/${memberForm.groupId}/members`
    const method = editingMemberId ? 'PUT' : 'POST'
    const response = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
    const json = await response.json()
    if (!response.ok) return setMessage(json.message || 'Erro ao salvar usuário')
    resetMemberForm()
    await loadMembers()
    await loadGroups()
    setMessage(editingMemberId ? 'Usuário atualizado com sucesso' : 'Usuário adicionado com sucesso')
  }

  function handleEditMember(member: GroupMember) {
    setEditingMemberId(member.id)
    setEditingMemberGroupId(String(member.group_id))
    setMemberForm({
      groupId: String(member.group_id),
      memberType: member.member_type,
      employeeName: member.member_key,
      aliasName: member.member_label === member.member_key ? '' : member.member_label,
      phone: formatPhoneDisplay(member.destination || ''),
    })
    setMessage(`Editando usuário ${member.member_label}`)
  }

  async function handleDeleteMember(member: GroupMember) {
    const response = await fetch(`/api/groups/${member.group_id}/members/${member.id}`, { method: 'DELETE' })
    const json = await response.json()
    if (!response.ok) return setMessage(json.message || 'Erro ao excluir usuário')
    if (editingMemberId === member.id) resetMemberForm()
    await loadMembers()
    await loadGroups()
    setMessage('Usuário removido com sucesso')
  }

  useEffect(() => { loadGroups().catch(() => undefined); loadMembers().catch(() => undefined); loadPeople().catch(() => undefined) }, [])

  const memberOptions = memberForm.memberType === 'vendedor'
    ? people.vendedores
    : memberForm.memberType === 'supervisor'
      ? people.supervisores
      : memberForm.memberType === 'gerente'
        ? people.gerentes
        : people.funcionarios

  return <section className="screen-block"><div className="title-area"><h1>Usuários</h1><p>Cadastro, edição e vínculo dos usuários com grupos.</p></div>{message ? <div className="panel-shell"><p className="success-text no-margin">{message}</p></div> : null}<div className="bottom-grid refined-bottom"><div className="panel-shell"><div className="panel-head compact-head"><div><h2>{editingMemberId ? 'Editar usuário' : 'Novo usuário'}</h2><p className="panel-subtitle">Cadastre o usuário e defina o grupo aqui.</p></div></div><div className="toolbar-grid refined-schedule group-member-grid"><select value={memberForm.groupId} onChange={(e) => setMemberForm({ ...memberForm, groupId: e.target.value })}><option value="">Selecione o grupo</option>{groups.map((group) => <option key={group.id} value={String(group.id)}>{group.name}</option>)}</select><select value={memberForm.memberType} onChange={(e) => setMemberForm({ ...memberForm, memberType: e.target.value, employeeName: '' })}><option value="vendedor">vendedor</option><option value="supervisor">supervisor</option><option value="gerente">gerente</option><option value="contato">contato</option></select><select value={memberForm.employeeName} onChange={(e) => setMemberForm({ ...memberForm, employeeName: e.target.value })}><option value="">Selecione o usuário</option>{memberOptions.map((employee) => <option key={employee} value={employee}>{employee}</option>)}</select><input value={memberForm.aliasName} onChange={(e) => setMemberForm({ ...memberForm, aliasName: e.target.value })} placeholder="Nome de exibição (opcional)" /><input value={memberForm.phone} onChange={(e) => setMemberForm({ ...memberForm, phone: formatPhoneDisplay(e.target.value) })} placeholder="Telefone" /><div className="member-actions"><button className="primary-btn" onClick={saveMember}>{editingMemberId ? 'Salvar usuário' : 'Adicionar usuário'}</button>{editingMemberId ? <button className="outline-btn" onClick={resetMemberForm}>Cancelar</button> : null}</div></div></div><div className="panel-shell"><div className="panel-head compact-head"><div><h2>Usuários cadastrados</h2><p className="panel-subtitle">Veja em qual grupo cada usuário está.</p></div></div><div className="table-wrap refined-wrap"><table className="modern-table refined-table"><thead><tr><th>Nome no grupo</th><th>Funcionário base</th><th>Grupo</th><th>Tipo</th><th>Telefone</th><th>Ações</th></tr></thead><tbody>{members.map((member) => <tr key={member.id}><td>{member.member_label}</td><td>{member.member_key}</td><td>{member.group_name || member.group_id}</td><td>{member.member_type}</td><td>{member.destination ? formatPhoneDisplay(member.destination) : '-'}</td><td><div className="row-actions"><button className="outline-btn small-btn" onClick={() => handleEditMember(member)}>Editar</button><button className="outline-btn small-btn danger-btn" onClick={() => handleDeleteMember(member)}>Excluir</button></div></td></tr>)}</tbody></table></div></div></div></section>
}
function TopNav({ user, onLogout }: { user: User | null; onLogout: () => void }) { return <header className="top-nav"><div className="brand-area"><strong>Painel RW</strong><nav><NavLink to="/dashboard">Home</NavLink><NavLink to="/relatorios">Carteira</NavLink><NavLink to="/campanhas">Campanhas</NavLink><NavLink to="/grupos">Grupos</NavLink><NavLink to="/historico">Histórico</NavLink><NavLink to="/usuarios">Usuários</NavLink></nav></div><div className="user-area"><span>{user?.email}</span><button className="icon-btn" onClick={onLogout}>↪</button></div></header> }
function ProtectedRoute({ isAuthenticated, children }: { isAuthenticated: boolean; children: any }) { return !isAuthenticated ? <Navigate to="/" replace /> : children }
function ShellLayout({ user, onLogout }: { user: User | null; onLogout: () => void }) { return <div className="light-shell"><TopNav user={user} onLogout={onLogout} /><main className="page-container"><Routes><Route path="/dashboard" element={<DashboardPage />} /><Route path="/relatorios" element={<ReportsPage />} /><Route path="/campanhas" element={<CampaignsPage />} /><Route path="/grupos" element={<GroupsPage />} /><Route path="/historico" element={<HistoryPage />} /><Route path="/usuarios" element={<UsersPage />} /><Route path="*" element={<Navigate to="/dashboard" replace />} /></Routes></main></div> }
function App() { const [user, setUser] = useState<User | null>(null); useEffect(() => { const saved = localStorage.getItem(AUTH_STORAGE_KEY); if (saved) setUser(JSON.parse(saved) as User) }, []); const isAuthenticated = useMemo(() => Boolean(user), [user]); function handleLogin(nextUser: User) { setUser(nextUser); localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(nextUser)) } function handleLogout() { setUser(null); localStorage.removeItem(AUTH_STORAGE_KEY) } return <BrowserRouter><Routes><Route path="/" element={isAuthenticated ? <Navigate to="/dashboard" replace /> : <LoginPage onLogin={handleLogin} />} /><Route path="/*" element={<ProtectedRoute isAuthenticated={isAuthenticated}><ShellLayout user={user} onLogout={handleLogout} /></ProtectedRoute>} /></Routes></BrowserRouter> }
export default App
