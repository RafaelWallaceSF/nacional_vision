# OPS CORE — fase 1

Estrutura inicial para sair de site estático e virar sistema.

## Stack
- Frontend: React + Vite + TypeScript
- Backend: Node.js + Express + TypeScript

## Módulos criados
- Login
- Dashboard
- Menu lateral
- Relatórios
- Agendamentos
- Histórico

## Portas
- Frontend: `5173`
- Backend: `4000`

## Rodar localmente

### Frontend
```bash
cd frontend
npm install
npm run dev -- --host 0.0.0.0 --port 5173
```

### Backend
```bash
cd backend
npm install
npm run dev
```

## URLs
- Frontend: `http://74.1.21.111:5173`
- Backend health: `http://74.1.21.111:4000/api/health`

## Próxima fase sugerida
1. Autenticação real (JWT/session)
2. Banco de dados
3. CRUD de relatórios/agendamentos
4. Histórico persistente
5. Permissões por perfil
