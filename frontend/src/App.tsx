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

      if (!response.ok) {
        throw new Error(data.message || 'Falha no login')
      }

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
          <p className="muted">
            Admin de teste liberado para acelerar a construção do sistema.
          </p>
        </div>

        <div className="test-user-box">
          <strong>Usuário admin de teste</strong>
          <span>E-mail: admin@teste.local</span>
          <span>Senha: Admin@123</span>
        </div>

        <form className="auth-form" onSubmit={handleSubmit}>
          <label>
            E-mail
            <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="admin@teste.local" />
          </label>
          <label>
            Senha
            <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" placeholder="••••••••" />
          </label>
          {error ? <p className="error-text">{error}</p> : null}
          <button type="submit" disabled={loading}>{loading ? 'Entrando...' : 'Acessar painel'}</button>
        </form>
      </div>
    </div>
  )
}

function DashboardPage() {
  return (
    <section className="page">
      <div className="page-header">
        <div>
          <p className="eyebrow">Visão geral</p>
          <h2>Dashboard</h2>
        </div>
        <button className="ghost-btn">Exportar resumo</button>
      </div>

      <div className="stats-grid">
        <StatCard label="Usuários ativos" value="1.284" delta="+12% este mês" />
        <StatCard label="Relatórios gerados" value="87" delta="+8 hoje" />
        <StatCard label="Agendamentos" value="23" delta="18 ativos" />
        <StatCard label="Eventos no histórico" value="416" delta="+34 nas últimas 24h" />
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
        <div className="panel">
          <h3>Próximas ações</h3>
          <ul className="list">
            <li>Conectar autenticação real</li>
            <li>Persistir relatórios no backend</li>
            <li>Adicionar permissões por perfil</li>
          </ul>
        </div>
      </div>
    </section>
  )
}

function ReportsPage() {
  return (
    <section className="page">
      <div className="page-header">
        <div>
          <p className="eyebrow">Módulo</p>
          <h2>Relatórios</h2>
        </div>
        <button className="ghost-btn">Novo relatório</button>
      </div>
      <div className="panel table-panel">
        <table>
          <thead>
            <tr>
              <th>Nome</th>
              <th>Status</th>
              <th>Atualizado em</th>
            </tr>
          </thead>
          <tbody>
            <tr><td>Relatório Comercial</td><td>Pronto</td><td>19/03 18:30</td></tr>
            <tr><td>Relatório Financeiro</td><td>Processando</td><td>19/03 18:45</td></tr>
            <tr><td>Relatório Operacional</td><td>Pronto</td><td>19/03 19:00</td></tr>
          </tbody>
        </table>
      </div>
    </section>
  )
}

function SchedulesPage() {
  return (
    <section className="page">
      <div className="page-header">
        <div>
          <p className="eyebrow">Módulo</p>
          <h2>Agendamentos</h2>
        </div>
        <button className="ghost-btn">Criar rotina</button>
      </div>
      <div className="cards-row">
        <div className="panel"><h3>Envio diário</h3><p>Todo dia às 08:00</p><span className="tag success">Ativo</span></div>
        <div className="panel"><h3>Fechamento semanal</h3><p>Sexta às 18:00</p><span className="tag success">Ativo</span></div>
        <div className="panel"><h3>Backup mensal</h3><p>Dia 1 às 02:00</p><span className="tag warning">Pausado</span></div>
      </div>
    </section>
  )
}

function HistoryPage() {
  return (
    <section className="page">
      <div className="page-header">
        <div>
          <p className="eyebrow">Auditoria</p>
          <h2>Histórico</h2>
        </div>
        <button className="ghost-btn">Filtrar eventos</button>
      </div>
      <div className="timeline panel">
        <div className="timeline-item"><strong>19:06</strong><span>Agendamento atualizado pelo admin</span></div>
        <div className="timeline-item"><strong>18:32</strong><span>Relatório gerado automaticamente</span></div>
        <div className="timeline-item"><strong>17:58</strong><span>Login realizado com sucesso</span></div>
      </div>
    </section>
  )
}

function ProtectedRoute({ isAuthenticated, children }: { isAuthenticated: boolean; children: any }) {
  if (!isAuthenticated) {
    return <Navigate to="/" replace />
  }

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
          <NavLink to="/relatorios">Relatórios</NavLink>
          <NavLink to="/agendamentos">Agendamentos</NavLink>
          <NavLink to="/historico">Histórico</NavLink>
        </nav>
        <button className="ghost-btn sidebar-logout" onClick={onLogout}>Sair</button>
      </aside>
      <main className="main-content">
        <Routes>
          <Route path="/dashboard" element={<DashboardPage />} />
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
    if (saved) {
      setUser(JSON.parse(saved) as User)
    }
  }, [])

  const isAuthenticated = useMemo(() => Boolean(user), [user])

  function handleLogin(nextUser: User) {
    setUser(nextUser)
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(nextUser))
  }

  function handleLogout() {
    setUser(null)
    localStorage.removeItem(AUTH_STORAGE_KEY)
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={isAuthenticated ? <Navigate to="/dashboard" replace /> : <LoginPage onLogin={handleLogin} />} />
        <Route
          path="/*"
          element={
            <ProtectedRoute isAuthenticated={isAuthenticated}>
              <ShellLayout user={user} onLogout={handleLogout} />
            </ProtectedRoute>
          }
        />
      </Routes>
    </BrowserRouter>
  )
}

export default App
