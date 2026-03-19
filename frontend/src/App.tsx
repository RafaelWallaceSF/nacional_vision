import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { BrowserRouter, Navigate, NavLink, Route, Routes, useNavigate } from 'react-router-dom'
import './App.css'

type StatCardProps = {
  label: string
  value: string
  delta: string
}

type User = {
  id: number
  name: string
  email: string
  role: string
}

type ManagedUser = {
  id: number
  name: string
  email: string
  role: string
  active: boolean
  created_at?: string
  updated_at?: string
}

const AUTH_STORAGE_KEY = 'ops-core-auth'

function StatCard({ label, value, delta }: StatCardProps) {
  return (
    <div className="stat-card">
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{delta}</small>
    </div>
  )
}

function LoginPage({ onLogin }: { onLogin: (user: User) => void }) {
  const navigate = useNavigate()
  const [email, setEmail] = useState('admin@teste.local')
  const [password, setPassword] = useState('Admin@123')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setLoading(true)
    setError('')

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })

      const data = await response.json()
      if (!response.ok) throw new Error(data.message || 'Falha no login')
      onLogin(data.user)
      navigate('/dashboard')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha no login')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-shell">
      <div className="auth-panel">
        <div>
          <p className="eyebrow">Fase 1</p>
          <h1>Entrar no sistema</h1>
          <p className="muted">Admin de teste liberado para acelerar a construção do sistema.</p>
        </div>
        <div className="test-user-box">
          <strong>Usuário admin de teste</strong>
          <span>E-mail: admin@teste.local</span>
          <span>Senha: Admin@123</span>
        </div>
        <form className="auth-form" onSubmit={handleSubmit}>
          <label>E-mail<input value={email} onChange={(e) => setEmail(e.target.value)} type="email" /></label>
          <label>Senha<input value={password} onChange={(e) => setPassword(e.target.value)} type="password" /></label>
          {error ? <p className="error-text">{error}</p> : null}
          <button type="submit" disabled={loading}>{loading ? 'Entrando...' : 'Acessar painel'}</button>
        </form>
      </div>
    </div>
  )
}

function DashboardPage() {
  const [kpis, setKpis] = useState({ users: 0, reports: 0, schedules: 0, historyItems: 0 })

  useEffect(() => {
    fetch('/api/kpis').then((r) => r.json()).then(setKpis).catch(() => undefined)
  }, [])

  return (
    <section className="page">
      <div className="page-header"><div><p className="eyebrow">Visão geral</p><h2>Dashboard</h2></div><button className="ghost-btn">Exportar resumo</button></div>
      <div className="stats-grid">
        <StatCard label="Usuários ativos" value={String(kpis.users)} delta="persistidos no banco" />
        <StatCard label="Relatórios gerados" value={String(kpis.reports)} delta="módulo em evolução" />
        <StatCard label="Agendamentos" value={String(kpis.schedules)} delta="base pronta" />
        <StatCard label="Eventos no histórico" value={String(kpis.historyItems)} delta="mock inicial" />
      </div>
      <div className="content-grid">
        <div className="panel large">
          <h3>Pipeline operacional</h3>
          <div className="bars">
            <div><span>Captura</span><strong style={{ width: '84%' }} /></div>
            <div><span>Processamento</span><strong style={{ width: '62%' }} /></div>
            <div><span>Envio</span><strong style={{ width: '91%' }} /></div>
            <div><span>Validação</span><strong style={{ width: '73%' }} /></div>
          </div>
        </div>
        <div className="panel"><h3>Próximas ações</h3><ul className="list"><li>JWT real</li><li>Permissões por perfil</li><li>CRUD dos outros módulos</li></ul></div>
      </div>
    </section>
  )
}

function ReportsPage() {
  return <section className="page"><div className="page-header"><div><p className="eyebrow">Módulo</p><h2>Relatórios</h2></div><button className="ghost-btn">Novo relatório</button></div><div className="panel table-panel"><table><thead><tr><th>Nome</th><th>Status</th><th>Atualizado em</th></tr></thead><tbody><tr><td>Relatório Comercial</td><td>Pronto</td><td>19/03 18:30</td></tr><tr><td>Relatório Financeiro</td><td>Processando</td><td>19/03 18:45</td></tr><tr><td>Relatório Operacional</td><td>Pronto</td><td>19/03 19:00</td></tr></tbody></table></div></section>
}

function SchedulesPage() {
  return <section className="page"><div className="page-header"><div><p className="eyebrow">Módulo</p><h2>Agendamentos</h2></div><button className="ghost-btn">Criar rotina</button></div><div className="cards-row"><div className="panel"><h3>Envio diário</h3><p>Todo dia às 08:00</p><span className="tag success">Ativo</span></div><div className="panel"><h3>Fechamento semanal</h3><p>Sexta às 18:00</p><span className="tag success">Ativo</span></div><div className="panel"><h3>Backup mensal</h3><p>Dia 1 às 02:00</p><span className="tag warning">Pausado</span></div></div></section>
}

function HistoryPage() {
  return <section className="page"><div className="page-header"><div><p className="eyebrow">Auditoria</p><h2>Histórico</h2></div><button className="ghost-btn">Filtrar eventos</button></div><div className="timeline panel"><div className="timeline-item"><strong>19:06</strong><span>Agendamento atualizado pelo admin</span></div><div className="timeline-item"><strong>18:32</strong><span>Relatório gerado automaticamente</span></div><div className="timeline-item"><strong>17:58</strong><span>Login realizado com sucesso</span></div></div></section>
}

function UsersPage() {
  const emptyForm = { name: '', email: '', password: '', role: 'user', active: true }
  const [users, setUsers] = useState<ManagedUser[]>([])
  const [form, setForm] = useState(emptyForm)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)

  async function loadUsers() {
    const response = await fetch('/api/users')
    const data = await response.json()
    setUsers(data)
  }

  useEffect(() => {
    loadUsers().catch(() => setMessage('Erro ao carregar usuários'))
  }, [])

  function resetForm() {
    setForm(emptyForm)
    setEditingId(null)
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setLoading(true)
    setMessage('')
    try {
      const payload = { ...form, active: Boolean(form.active) }
      const response = await fetch(editingId ? `/api/users/${editingId}` : '/api/users', {
        method: editingId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.message || 'Falha ao salvar usuário')
      await loadUsers()
      setMessage(editingId ? 'Usuário atualizado' : 'Usuário criado')
      resetForm()
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Erro ao salvar usuário')
    } finally {
      setLoading(false)
    }
  }

  async function handleDelete(id: number) {
    if (!confirm('Remover este usuário?')) return
    const response = await fetch(`/api/users/${id}`, { method: 'DELETE' })
    const data = await response.json()
    if (!response.ok) {
      setMessage(data.message || 'Erro ao remover usuário')
      return
    }
    await loadUsers()
    setMessage('Usuário removido')
    if (editingId === id) resetForm()
  }

  function startEdit(user: ManagedUser) {
    setEditingId(user.id)
    setForm({ name: user.name, email: user.email, password: '', role: user.role, active: user.active })
  }

  return (
    <section className="page">
      <div className="page-header"><div><p className="eyebrow">Administração</p><h2>Usuários</h2></div><button className="ghost-btn" onClick={resetForm}>Novo usuário</button></div>
      <div className="content-grid users-grid">
        <div className="panel">
          <h3>{editingId ? 'Editar usuário' : 'Criar usuário'}</h3>
          <form className="auth-form" onSubmit={handleSubmit}>
            <label>Nome<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
            <label>E-mail<input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} type="email" /></label>
            <label>Senha<input value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} type="password" placeholder={editingId ? 'deixe em branco para manter' : ''} /></label>
            <label>Perfil<select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}><option value="user">user</option><option value="admin">admin</option></select></label>
            <label className="checkbox-row"><input checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} type="checkbox" />Ativo</label>
            {message ? <p className="info-text">{message}</p> : null}
            <div className="actions-row"><button type="submit" disabled={loading}>{loading ? 'Salvando...' : editingId ? 'Atualizar' : 'Criar'}</button>{editingId ? <button type="button" className="ghost-btn" onClick={resetForm}>Cancelar</button> : null}</div>
          </form>
        </div>
        <div className="panel table-panel">
          <h3>Usuários cadastrados</h3>
          <table>
            <thead><tr><th>Nome</th><th>E-mail</th><th>Perfil</th><th>Status</th><th>Ações</th></tr></thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id}>
                  <td>{user.name}</td>
                  <td>{user.email}</td>
                  <td>{user.role}</td>
                  <td><span className={`tag ${user.active ? 'success' : 'warning'}`}>{user.active ? 'Ativo' : 'Inativo'}</span></td>
                  <td><div className="row-buttons"><button className="mini-btn" onClick={() => startEdit(user)}>Editar</button><button className="mini-btn danger" onClick={() => handleDelete(user.id)}>Excluir</button></div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  )
}

function ProtectedRoute({ isAuthenticated, children }: { isAuthenticated: boolean; children: any }) {
  if (!isAuthenticated) return <Navigate to="/" replace />
  return children
}

function ShellLayout({ user, onLogout }: { user: User | null; onLogout: () => void }) {
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div>
          <p className="brand-mark">⚡ OPS CORE</p>
          <h3>Sistema interno</h3>
          <p className="sidebar-user">{user?.name}<br />{user?.email}</p>
        </div>
        <nav className="menu">
          <NavLink to="/dashboard">Dashboard</NavLink>
          <NavLink to="/usuarios">Usuários</NavLink>
          <NavLink to="/relatorios">Relatórios</NavLink>
          <NavLink to="/agendamentos">Agendamentos</NavLink>
          <NavLink to="/historico">Histórico</NavLink>
        </nav>
        <button className="ghost-btn sidebar-logout" onClick={onLogout}>Sair</button>
      </aside>
      <main className="main-content">
        <Routes>
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/usuarios" element={<UsersPage />} />
          <Route path="/relatorios" element={<ReportsPage />} />
          <Route path="/agendamentos" element={<SchedulesPage />} />
          <Route path="/historico" element={<HistoryPage />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </main>
    </div>
  )
}

function App() {
  const [user, setUser] = useState<User | null>(null)
  useEffect(() => {
    const saved = localStorage.getItem(AUTH_STORAGE_KEY)
    if (saved) setUser(JSON.parse(saved) as User)
  }, [])
  const isAuthenticated = useMemo(() => Boolean(user), [user])
  function handleLogin(nextUser: User) { setUser(nextUser); localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(nextUser)) }
  function handleLogout() { setUser(null); localStorage.removeItem(AUTH_STORAGE_KEY) }
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={isAuthenticated ? <Navigate to="/dashboard" replace /> : <LoginPage onLogin={handleLogin} />} />
        <Route path="/*" element={<ProtectedRoute isAuthenticated={isAuthenticated}><ShellLayout user={user} onLogout={handleLogout} /></ProtectedRoute>} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
