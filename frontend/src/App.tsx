import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { BrowserRouter, Navigate, NavLink, Route, Routes, useNavigate } from 'react-router-dom'
import './App.css'

type User = { id: number; name: string; email: string; role: string }
type ReportItem = { cod_cliente: number; cliente: string; cidade: string; rca: string; supervisor: string; telefone: string; mes_passado: number; mes_atual: number; perda_valor: number; perda_percentual: number; projecao_mes: number; tendencia: string }
type ReportResponse = { referenceDate: string; periods: { current_start: string; current_end: string; current_days: number; previous_start: string; previous_end: string; previous_days: number }; filters: { vendedor: string; supervisor: string; top: number }; summary: { clientesEmQueda: number; perdaAcumulada: number; vendaMesAtual: number; vendaMesPassado: number }; items: ReportItem[] }
type Schedule = { id: number; rule_name: string; report_type_code: string; target_type: string; target_id: string; send_time: string; frequency: string; channel: string; active: boolean; recipients_json?: any[] }
type HistoryItem = { id: number; rule_name: string; report_type_code: string; target_type: string; target_id: string; status: string; created_at: string; webhook_status?: number; webhook_error?: string | null }
type Group = { id: number; name: string; group_type: string; delivery_mode: string; description?: string; active: boolean; members_count: number }
type GroupMember = { id: number; group_id: number; member_type: string; member_key: string; member_label: string; channel?: string; destination?: string; active: boolean }
type WebhookInfo = { configured: boolean; webhookUrl: string | null }
type WebhookTestLog = { id: number; employee_name: string; alias_name: string; phone: string; webhook_url?: string | null; response_status?: number | null; success: boolean; response_text?: string | null; error_message?: string | null; created_at: string }

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
    source: 'staging."FATO_PEDIDO"',
    description: 'Usa somente o campo raw_data->>\'VENDEDOR\'.',
  },
  supervisores: {
    label: 'Supervisores',
    source: 'staging."DIM_FUNCIONARIOS"',
    description: 'Usa a seleção a partir do campo raw_data->>\'NOME\'.',
  },
  gerentes: {
    label: 'Gerentes',
    source: 'staging."DIM_FUNCIONARIOS"',
    description: 'Usa somente o campo raw_data->>\'NOMEGERENTE\'.',
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
  const [filters, setFilters] = useState<{ vendedores: string[]; supervisores: string[] }>({ vendedores: [], supervisores: [] })
  const [groups, setGroups] = useState<Group[]>([])
  const [people, setPeople] = useState<PeopleOptions>({ funcionarios: [], vendedores: [], supervisores: [], gerentes: [] })
  const [loading, setLoading] = useState(false)
  const [scheduleMessage, setScheduleMessage] = useState('')
  const [scheduleForm, setScheduleForm] = useState({ ruleName: 'Maiores quedas diário', targetType: 'vendedor', targetId: '', sendTime: '08:00', channel: 'webhook' })
  async function loadReport(date = referenceDate, nextVendedor = vendedor, nextSupervisor = supervisor, nextTop = top) {
    setLoading(true)
    try {
      const query = new URLSearchParams({ referenceDate: date, top: String(nextTop) })
      if (nextVendedor) query.set('vendedor', nextVendedor)
      if (nextSupervisor) query.set('supervisor', nextSupervisor)
      const [reportResponse, previewResponse] = await Promise.all([fetch(`/api/reports/maiores-quedas?${query.toString()}`), fetch(`/api/reports/maiores-quedas/preview?${query.toString()}`)])
      setData(await reportResponse.json())
      setPreview((await previewResponse.json()).caption || '')
    } finally { setLoading(false) }
  }
  async function loadFilters() { const response = await fetch('/api/reports/filters'); setFilters(await response.json()) }
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
  async function createSchedule() { setScheduleMessage(''); const payload = { ...scheduleForm, vendedor, supervisor, top, targetId: scheduleForm.targetType === 'all_vendedores' ? '' : scheduleForm.targetId }; const response = await fetch('/api/schedules/maiores-quedas', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }); const json = await response.json(); setScheduleMessage(response.ok ? `Agendamento criado #${json.id}` : (json.message || 'Erro ao criar agendamento')) }
  useEffect(() => { loadFilters().catch(() => undefined); loadGroups().catch(() => undefined); loadPeople().catch(() => undefined); loadReport(today, '', '', 5).catch(() => undefined) }, [])
  const filteredItems = (data?.items || []).filter((item) => { const q = search.trim().toLowerCase(); if (!q) return true; return [item.cliente, item.rca, item.supervisor, item.cidade, String(item.cod_cliente)].some((v) => String(v).toLowerCase().includes(q)) })
  const campaignTargetOptions = scheduleForm.targetType === 'group'
    ? groups.map((group) => ({ value: String(group.id), label: group.name }))
    : ['vendedor', 'supervisor', 'gerente'].includes(scheduleForm.targetType)
      ? people.funcionarios.map((name) => ({ value: name, label: name }))
      : []
  const campaignTargetPlaceholder = scheduleForm.targetType === 'group' ? 'Selecione um grupo' : scheduleForm.targetType === 'supervisor' ? 'Selecione um supervisor' : scheduleForm.targetType === 'gerente' ? 'Selecione um gerente' : 'Selecione um vendedor'
  const campaignTargetHint = ['vendedor', 'supervisor', 'gerente'].includes(scheduleForm.targetType)
    ? peopleSourceMeta.funcionarios
    : null
  return <section className="screen-block"><div className="hero-row"><div className="title-area"><h1>Inteligência de Carteira</h1><p>Última atualização da base: {new Date(referenceDate).toLocaleDateString('pt-BR')}</p></div><div className="hero-actions"><button className="outline-btn">Exportar PDF</button><button className="primary-btn">Compartilhar ranking</button></div></div><div className="tab-strip"><button className="tab active">Carteira</button><button className="tab">Estratégicos</button></div><div className="summary-grid"><SummaryTile label="Clientes em queda" value={String(data?.summary.clientesEmQueda ?? 0)} note="ranking atual" tone="danger" /><SummaryTile label="Perda acumulada" value={brl.format(data?.summary.perdaAcumulada ?? 0)} note="top retornado" tone="danger" /><SummaryTile label="Mês atual" value={brl.format(data?.summary.vendaMesAtual ?? 0)} note="pedidos posição F" /><SummaryTile label="Mês passado" value={brl.format(data?.summary.vendaMesPassado ?? 0)} note="recorte equivalente" /><SummaryTile label="Top analisado" value={String(top)} note="clientes no ranking" tone="warning" /><SummaryTile label="Filtro" value={vendedor || supervisor || 'Geral'} note="escopo atual" /></div><div className="panel-shell main-panel"><div className="panel-head"><div><h2>Top Oportunidades</h2><p className="panel-subtitle">Leitura operacional dos clientes com maior retração no período equivalente.</p></div><div className="head-badges"><span className="soft-badge">Pasta: Carteira</span><span className="soft-badge active">Atualizado</span></div></div><div className="toolbar-grid refined"><input className="search-input" placeholder="Buscar cliente, RCA, cidade ou código" value={search} onChange={(e) => setSearch(e.target.value)} /><select value={vendedor} onChange={(e) => setVendedor(e.target.value)}><option value="">Todos os vendedores ({peopleSourceMeta.vendedores.source})</option>{filters.vendedores.map((item) => <option key={item} value={item}>{item}</option>)}</select><select value={supervisor} onChange={(e) => setSupervisor(e.target.value)}><option value="">Todos os supervisores ({peopleSourceMeta.supervisores.source})</option>{filters.supervisores.map((item) => <option key={item} value={item}>{item}</option>)}</select><input type="date" value={referenceDate} onChange={(e) => setReferenceDate(e.target.value)} /><select value={String(top)} onChange={(e) => setTop(Number(e.target.value))}><option value="5">Top 5</option><option value="10">Top 10</option><option value="20">Top 20</option></select><button className="primary-btn" onClick={() => loadReport()}>{loading ? 'Atualizando...' : 'Atualizar'}</button></div><div className="source-hint-grid"><SourceHint meta={peopleSourceMeta.funcionarios} count={people.funcionarios.length} /><SourceHint meta={peopleSourceMeta.vendedores} count={people.vendedores.length} /></div><div className="table-wrap refined-wrap"><table className="modern-table refined-table"><thead><tr><th>RCA</th><th>Cód. Cliente</th><th>Razão Social</th><th>Cidade</th><th>Mês passado</th><th>Mês atual</th><th>Perda</th><th>Queda %</th><th>Status</th></tr></thead><tbody>{filteredItems.map((item) => <tr key={`${item.cod_cliente}-${item.rca}`}><td><div className="cell-title">{item.rca}</div><div className="cell-sub">{item.supervisor}</div></td><td>{item.cod_cliente}</td><td><div className="cell-title">{item.cliente}</div><div className="cell-sub">{item.telefone || '-'}</div></td><td>{item.cidade}</td><td>{brl.format(item.mes_passado)}</td><td>{brl.format(item.mes_atual)}</td><td className="negative strong">{brl.format(item.perda_valor)}</td><td className="negative strong">{item.perda_percentual}%</td><td><span className="status-pill lost">PERDIDO</span></td></tr>)}</tbody></table></div></div><div className="bottom-grid refined-bottom"><div className="panel-shell"><div className="panel-head compact-head"><div><h2>Agendar envio diário</h2><p className="panel-subtitle">Escolha o relatório, o alvo e a agenda da campanha.</p></div></div><div className="toolbar-grid schedule-grid refined-schedule"><input value={scheduleForm.ruleName} onChange={(e) => setScheduleForm({ ...scheduleForm, ruleName: e.target.value })} placeholder="Nome da campanha" /><select value={scheduleForm.targetType} onChange={(e) => setScheduleForm({ ...scheduleForm, targetType: e.target.value, targetId: '' })}><option value="vendedor">Vendedor</option><option value="supervisor">Supervisor</option><option value="gerente">Gerente</option><option value="group">Grupo</option><option value="all_vendedores">Todos os vendedores</option></select>{scheduleForm.targetType === 'all_vendedores' ? <div className="input-like disabled">Todos os vendedores ativos da base {peopleSourceMeta.vendedores.source}</div> : <select value={scheduleForm.targetId} onChange={(e) => setScheduleForm({ ...scheduleForm, targetId: e.target.value })}><option value="">{campaignTargetPlaceholder}</option>{campaignTargetOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select>}<input type="time" value={scheduleForm.sendTime} onChange={(e) => setScheduleForm({ ...scheduleForm, sendTime: e.target.value })} /><select value={scheduleForm.channel} onChange={(e) => setScheduleForm({ ...scheduleForm, channel: e.target.value })}><option value="webhook">webhook</option></select><button className="primary-btn" onClick={createSchedule}>Criar campanha</button></div>{campaignTargetHint ? <SourceHint meta={campaignTargetHint} count={scheduleForm.targetType === 'vendedor' ? people.vendedores.length : scheduleForm.targetType === 'supervisor' ? people.supervisores.length : people.gerentes.length} /> : null}{scheduleMessage ? <p className="success-text">{scheduleMessage}</p> : null}</div><div className="panel-shell preview-shell"><div className="panel-head compact-head"><div><h2>Preview da mensagem</h2><p className="panel-subtitle">Formato que será usado no disparo automático.</p></div></div><pre className="message-preview light refined-preview">{preview || 'Sem preview'}</pre></div></div></section>
}

function GroupsPage() {
  const [groups, setGroups] = useState<Group[]>([])
  const [selectedGroupId, setSelectedGroupId] = useState<string>('')
  const [members, setMembers] = useState<GroupMember[]>([])
  const [message, setMessage] = useState('')
  const [groupForm, setGroupForm] = useState({ name: '', groupType: 'vendedor', deliveryMode: 'individual', description: '' })
  const [memberForm, setMemberForm] = useState<GroupMemberForm>({ memberType: 'vendedor', employeeName: '', aliasName: '', phone: '' })
  const [people, setPeople] = useState<PeopleOptions>({ funcionarios: [], vendedores: [], supervisores: [], gerentes: [] })
  const [editingMemberId, setEditingMemberId] = useState<number | null>(null)
  const [webhookTestMessage, setWebhookTestMessage] = useState('')
  const [webhookInfo, setWebhookInfo] = useState<WebhookInfo>({ configured: false, webhookUrl: null })
  const [webhookTests, setWebhookTests] = useState<WebhookTestLog[]>([])

  async function loadGroups() {
    const response = await fetch('/api/groups')
    const data = await response.json()
    setGroups(data)
    if (!selectedGroupId && data[0]) setSelectedGroupId(String(data[0].id))
  }

  async function loadMembers(groupId: string) {
    if (!groupId) return setMembers([])
    const response = await fetch(`/api/groups/${groupId}/members`)
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

  async function loadWebhookInfo() {
    const response = await fetch('/api/webhook/info')
    setWebhookInfo(await response.json())
  }

  async function loadWebhookTests() {
    const response = await fetch('/api/webhook/tests')
    setWebhookTests(await response.json())
  }

  async function createGroup() {
    setMessage('')
    const response = await fetch('/api/groups', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(groupForm) })
    const json = await response.json()
    if (!response.ok) return setMessage(json.message || 'Erro ao criar grupo')
    setGroupForm({ name: '', groupType: 'vendedor', deliveryMode: 'individual', description: '' })
    setSelectedGroupId(String(json.id))
    await loadGroups()
    setMessage(`Grupo criado #${json.id}`)
  }

  function resetMemberForm() {
    setEditingMemberId(null)
    setMemberForm({ memberType: 'vendedor', employeeName: '', aliasName: '', phone: '' })
  }

  async function addMember() {
    if (!selectedGroupId) return setMessage('Selecione um grupo')
    if (!memberForm.employeeName.trim() || !memberForm.phone.trim()) return setMessage('Informe funcionário e telefone')
    setMessage('')
    const payload = {
      memberType: memberForm.memberType,
      memberKey: memberForm.employeeName.trim(),
      memberLabel: memberForm.aliasName.trim() || memberForm.employeeName.trim(),
      channel: 'webhook',
      destination: toWebhookPhone(memberForm.phone),
    }
    const url = editingMemberId ? `/api/groups/${selectedGroupId}/members/${editingMemberId}` : `/api/groups/${selectedGroupId}/members`
    const method = editingMemberId ? 'PUT' : 'POST'
    const response = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
    const json = await response.json()
    if (!response.ok) return setMessage(json.message || 'Erro ao salvar membro')
    resetMemberForm()
    await loadMembers(selectedGroupId)
    await loadGroups()
    setMessage(editingMemberId ? `Membro atualizado #${json.id}` : `Membro adicionado #${json.id}`)
  }

  function handleEditMember(member: GroupMember) {
    setEditingMemberId(member.id)
    setMemberForm({
      memberType: member.member_type,
      employeeName: member.member_key,
      aliasName: member.member_label === member.member_key ? '' : member.member_label,
      phone: formatPhoneDisplay(member.destination || ''),
    })
    setMessage('Editando membro selecionado')
  }

  async function handleDeleteMember(memberId: number) {
    if (!selectedGroupId) return
    setMessage('')
    const response = await fetch(`/api/groups/${selectedGroupId}/members/${memberId}`, { method: 'DELETE' })
    const json = await response.json()
    if (!response.ok) return setMessage(json.message || 'Erro ao excluir membro')
    if (editingMemberId === memberId) resetMemberForm()
    await loadMembers(selectedGroupId)
    await loadGroups()
    setMessage('Membro removido com sucesso')
  }

  async function testWebhook() {
    if (!memberForm.employeeName.trim() || !memberForm.phone.trim()) {
      return setWebhookTestMessage('Informe funcionário e telefone para testar')
    }
    setWebhookTestMessage('Testando webhook...')
    const response = await fetch('/api/webhook/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        employeeName: memberForm.employeeName.trim(),
        aliasName: memberForm.aliasName.trim() || memberForm.employeeName.trim(),
        phone: toWebhookPhone(memberForm.phone),
      }),
    })
    const json = await response.json()
    if (!response.ok) {
      await loadWebhookTests().catch(() => undefined)
      return setWebhookTestMessage(json.message || `Falha no teste (${json.status || response.status})`)
    }
    setWebhookTestMessage(`Webhook OK (${json.status})`)
    await loadWebhookTests().catch(() => undefined)
  }

  useEffect(() => { loadGroups().catch(() => undefined); loadPeople().catch(() => undefined); loadWebhookInfo().catch(() => undefined); loadWebhookTests().catch(() => undefined) }, [])
  useEffect(() => { loadMembers(selectedGroupId).catch(() => undefined) }, [selectedGroupId])

  const memberOptions = ['vendedor', 'supervisor', 'gerente', 'contato'].includes(memberForm.memberType)
    ? people.funcionarios
    : people.funcionarios
  const memberPlaceholder = memberForm.memberType === 'vendedor' ? 'Selecione o vendedor' : memberForm.memberType === 'supervisor' ? 'Selecione o supervisor' : memberForm.memberType === 'gerente' ? 'Selecione o gerente' : 'Selecione o funcionário'
  const memberSourceMeta = peopleSourceMeta.funcionarios

  return <section className="screen-block"><div className="hero-row"><div className="title-area"><h1>Grupos operacionais</h1><p>Organize vendedores, supervisores e destinos para campanhas.</p></div></div><div className="panel-shell"><div className="panel-head compact-head"><div><h2>Webhook padrão</h2><p className="panel-subtitle">Destino fixo usado nos testes e disparos via webhook.</p></div></div><div className="webhook-info-row"><span className={`soft-badge ${webhookInfo.configured ? 'active' : ''}`}>{webhookInfo.configured ? 'Configurado' : 'Não configurado'}</span><code className="webhook-url">{webhookInfo.webhookUrl || 'Webhook padrão não configurado'}</code></div></div><div className="bottom-grid refined-bottom"><div className="panel-shell"><div className="panel-head compact-head"><div><h2>Novo grupo</h2><p className="panel-subtitle">Base para campanhas por lote.</p></div></div><div className="toolbar-grid refined-schedule"><input value={groupForm.name} onChange={(e) => setGroupForm({ ...groupForm, name: e.target.value })} placeholder="Nome do grupo" /><select value={groupForm.groupType} onChange={(e) => setGroupForm({ ...groupForm, groupType: e.target.value })}><option value="vendedor">vendedor</option><option value="supervisor">supervisor</option><option value="gerente">gerente</option><option value="contato">contato</option></select><select value={groupForm.deliveryMode} onChange={(e) => setGroupForm({ ...groupForm, deliveryMode: e.target.value })}><option value="individual">individual</option><option value="consolidado">consolidado</option></select><input value={groupForm.description} onChange={(e) => setGroupForm({ ...groupForm, description: e.target.value })} placeholder="Descrição" /><button className="primary-btn" onClick={createGroup}>Criar grupo</button></div><div className="table-wrap refined-wrap"><table className="modern-table refined-table"><thead><tr><th>Grupo</th><th>Tipo</th><th>Modo</th><th>Membros</th></tr></thead><tbody>{groups.map((group) => <tr key={group.id} className={String(group.id) === selectedGroupId ? 'selected-row' : ''} onClick={() => setSelectedGroupId(String(group.id))}><td>{group.name}</td><td>{group.group_type}</td><td>{group.delivery_mode}</td><td>{group.members_count}</td></tr>)}</tbody></table></div></div><div className="panel-shell"><div className="panel-head compact-head"><div><h2>Membros do grupo</h2><p className="panel-subtitle">Grupo selecionado: {selectedGroupId || 'nenhum'}</p></div></div><div className="toolbar-grid refined-schedule group-member-grid"><select value={memberForm.memberType} onChange={(e) => setMemberForm({ ...memberForm, memberType: e.target.value, employeeName: '' })}><option value="vendedor">vendedor</option><option value="supervisor">supervisor</option><option value="gerente">gerente</option><option value="contato">contato</option></select><select value={memberForm.employeeName} onChange={(e) => setMemberForm({ ...memberForm, employeeName: e.target.value })}><option value="">{memberPlaceholder} ({memberSourceMeta.source})</option>{memberOptions.map((employee) => <option key={employee} value={employee}>{employee}</option>)}</select><input value={memberForm.aliasName} onChange={(e) => setMemberForm({ ...memberForm, aliasName: e.target.value })} placeholder="Nome de exibição (opcional)" /><input value={memberForm.phone} onChange={(e) => setMemberForm({ ...memberForm, phone: formatPhoneDisplay(e.target.value) })} placeholder="Telefone" /><div className="input-like disabled">webhook fixo</div><div className="member-actions"><button className="primary-btn" onClick={addMember}>{editingMemberId ? 'Salvar alteração' : 'Adicionar'}</button><button className="outline-btn" onClick={testWebhook}>Testar webhook</button>{editingMemberId ? <button className="outline-btn" onClick={resetMemberForm}>Cancelar</button> : null}</div></div><SourceHint meta={memberSourceMeta} count={memberOptions.length} />{message ? <p className="success-text">{message}</p> : null}{webhookTestMessage ? <p className="plain-text no-margin">{webhookTestMessage}</p> : null}<div className="table-wrap refined-wrap"><table className="modern-table refined-table"><thead><tr><th>Nome no grupo</th><th>Funcionário base</th><th>Tipo</th><th>Canal</th><th>Telefone</th><th>Ações</th></tr></thead><tbody>{members.map((member) => <tr key={member.id}><td>{member.member_label}</td><td>{member.member_key}</td><td>{member.member_type}</td><td>{member.channel || 'webhook'}</td><td>{member.destination ? formatPhoneDisplay(member.destination) : '-'}</td><td><div className="row-actions"><button className="outline-btn small-btn" onClick={() => handleEditMember(member)}>Editar</button><button className="outline-btn small-btn danger-btn" onClick={() => handleDeleteMember(member.id)}>Excluir</button></div></td></tr>)}</tbody></table></div></div></div><div className="panel-shell"><div className="panel-head compact-head"><div><h2>Histórico de testes</h2><p className="panel-subtitle">Últimos testes enviados para o webhook padrão.</p></div></div><div className="table-wrap refined-wrap"><table className="modern-table refined-table"><thead><tr><th>Quando</th><th>Nome</th><th>Telefone</th><th>Status</th><th>Resposta</th></tr></thead><tbody>{webhookTests.map((item) => <tr key={item.id}><td>{new Date(item.created_at).toLocaleString('pt-BR')}</td><td><div className="cell-title">{item.alias_name}</div><div className="cell-sub">{item.employee_name}</div></td><td>{formatPhoneDisplay(item.phone)}</td><td><span className={`status-pill ${item.success ? 'ok' : 'lost'}`}>{item.success ? `OK ${item.response_status || ''}`.trim() : `ERRO ${item.response_status || ''}`.trim()}</span></td><td>{item.error_message || item.response_text || '-'}</td></tr>)}</tbody></table></div></div></section>
}

function SchedulesPage() {
  const [items, setItems] = useState<Schedule[]>([])
  const [groups, setGroups] = useState<Group[]>([])
  const [runMessage, setRunMessage] = useState('')
  async function load() { const response = await fetch('/api/schedules'); setItems(await response.json()) }
  async function loadGroups() { const response = await fetch('/api/groups'); setGroups(await response.json()) }
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
  async function runNow(id: number) {
    setRunMessage('')
    const response = await fetch(`/api/schedules/${id}/run`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) })
    const json = await response.json()
    setRunMessage(response.ok ? `Regra ${id} executada. Membros processados: ${json.membersProcessed}` : (json.message || 'Erro ao executar regra'))
  }
  useEffect(() => { load().catch(() => undefined); loadGroups().catch(() => undefined) }, [])
  return <section className="screen-block"><div className="title-area"><h1>Regras de envio</h1><p>Agendamentos ativos do sistema.</p></div>{runMessage ? <div className="panel-shell"><p className="success-text no-margin">{runMessage}</p></div> : null}<div className="panel-shell"><div className="table-wrap refined-wrap"><table className="modern-table refined-table"><thead><tr><th>Regra</th><th>Relatório</th><th>Alvo</th><th>Hora</th><th>Canal</th><th>Ação</th></tr></thead><tbody>{items.map((item) => <tr key={item.id}><td>{item.rule_name}</td><td>{item.report_type_code}</td><td>{formatTarget(item)}</td><td>{String(item.send_time).slice(0, 5)}</td><td>{item.channel}</td><td><button className="outline-btn small-btn" onClick={() => runNow(item.id)}>Executar agora</button></td></tr>)}</tbody></table></div></div></section>
}

function HistoryPage() {
  const [items, setItems] = useState<HistoryItem[]>([])
  useEffect(() => { fetch('/api/history').then((r) => r.json()).then(setItems).catch(() => undefined) }, [])
  return <section className="screen-block"><div className="title-area"><h1>Histórico</h1><p>Execuções e auditoria.</p></div><div className="panel-shell"><div className="table-wrap refined-wrap"><table className="modern-table refined-table"><thead><tr><th>ID</th><th>Regra</th><th>Alvo</th><th>Status</th><th>Webhook</th><th>Erro</th></tr></thead><tbody>{items.map((item) => <tr key={item.id}><td>{item.id}</td><td>{item.rule_name}</td><td>{item.target_type}: {item.target_id}</td><td>{item.status}</td><td>{item.webhook_status || '-'}</td><td>{item.webhook_error || '-'}</td></tr>)}</tbody></table></div></div></section>
}

function UsersPage() { return <section className="screen-block"><div className="title-area"><h1>Usuários</h1><p>Módulo mantido para evolução posterior.</p></div><div className="panel-shell"><p className="plain-text">CRUD de usuários segue disponível na API e voltamos aqui quando quiser refinar permissões.</p></div></section> }
function TopNav({ user, onLogout }: { user: User | null; onLogout: () => void }) { return <header className="top-nav"><div className="brand-area"><strong>Painel RW</strong><nav><NavLink to="/dashboard">Home</NavLink><NavLink to="/relatorios">Carteira</NavLink><NavLink to="/grupos">Grupos</NavLink><NavLink to="/agendamentos">Regras</NavLink><NavLink to="/historico">Histórico</NavLink><NavLink to="/usuarios">Usuários</NavLink></nav></div><div className="user-area"><span>{user?.email}</span><button className="icon-btn" onClick={onLogout}>↪</button></div></header> }
function ProtectedRoute({ isAuthenticated, children }: { isAuthenticated: boolean; children: any }) { return !isAuthenticated ? <Navigate to="/" replace /> : children }
function ShellLayout({ user, onLogout }: { user: User | null; onLogout: () => void }) { return <div className="light-shell"><TopNav user={user} onLogout={onLogout} /><main className="page-container"><Routes><Route path="/dashboard" element={<DashboardPage />} /><Route path="/relatorios" element={<ReportsPage />} /><Route path="/grupos" element={<GroupsPage />} /><Route path="/agendamentos" element={<SchedulesPage />} /><Route path="/historico" element={<HistoryPage />} /><Route path="/usuarios" element={<UsersPage />} /><Route path="*" element={<Navigate to="/dashboard" replace />} /></Routes></main></div> }
function App() { const [user, setUser] = useState<User | null>(null); useEffect(() => { const saved = localStorage.getItem(AUTH_STORAGE_KEY); if (saved) setUser(JSON.parse(saved) as User) }, []); const isAuthenticated = useMemo(() => Boolean(user), [user]); function handleLogin(nextUser: User) { setUser(nextUser); localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(nextUser)) } function handleLogout() { setUser(null); localStorage.removeItem(AUTH_STORAGE_KEY) } return <BrowserRouter><Routes><Route path="/" element={isAuthenticated ? <Navigate to="/dashboard" replace /> : <LoginPage onLogin={handleLogin} />} /><Route path="/*" element={<ProtectedRoute isAuthenticated={isAuthenticated}><ShellLayout user={user} onLogout={handleLogout} /></ProtectedRoute>} /></Routes></BrowserRouter> }
export default App
