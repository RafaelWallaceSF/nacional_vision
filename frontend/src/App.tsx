import { BrowserRouter, NavLink, Route, Routes } from 'react-router-dom'
import './App.css'

type StatCardProps = {
  label: string
  value: string
  delta: string
}

function StatCard({ label, value, delta }: StatCardProps) {
  return (
    <div className="stat-card">
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{delta}</small>
    </div>
  )
}

function LoginPage() {
  return (
    <div className="auth-shell">
      <div className="auth-panel">
        <div>
          <p className="eyebrow">Fase 1</p>
          <h1>Entrar no sistema</h1>
          <p className="muted">
            Base inicial pronta para autenticação, navegação interna e evolução do produto.
          </p>
        </div>

        <form className="auth-form">
          <label>
            E-mail
            <input type="email" placeholder="admin@empresa.com" />
          </label>
          <label>
            Senha
            <input type="password" placeholder="••••••••" />
          </label>
          <button type="button">Acessar painel</button>
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

function ShellLayout() {
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div>
          <p className="brand-mark">⚡ OPS CORE</p>
          <h3>Sistema interno</h3>
        </div>
        <nav className="menu">
          <NavLink to="/dashboard">Dashboard</NavLink>
          <NavLink to="/relatorios">Relatórios</NavLink>
          <NavLink to="/agendamentos">Agendamentos</NavLink>
          <NavLink to="/historico">Histórico</NavLink>
        </nav>
      </aside>
      <main className="main-content">
        <Routes>
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/relatorios" element={<ReportsPage />} />
          <Route path="/agendamentos" element={<SchedulesPage />} />
          <Route path="/historico" element={<HistoryPage />} />
        </Routes>
      </main>
    </div>
  )
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LoginPage />} />
        <Route path="/*" element={<ShellLayout />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
