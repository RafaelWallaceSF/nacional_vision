# Nacional Vision — Mapeamento técnico

## Identificação
- Nome observado na UI: **Painel RW**
- URL pública atual: `http://74.1.21.111:5173/`
- Tela de login usa:
  - e-mail: `admin@teste.local`
  - senha: armazenada localmente em `.env.local`

## Estrutura encontrada
- Frontend: `/root/.openclaw/workspace/frontend`
- Backend: `/root/.openclaw/workspace/backend`
- Pasta de organização: `/root/.openclaw/workspace/Nacional Vision`

## Stack
### Frontend
- Vite
- React 19
- React Router DOM 7
- TypeScript

Scripts principais:
- `npm run dev`
- `npm run build`
- `npm run preview`

### Backend
- Node.js
- Express
- TypeScript
- pg (PostgreSQL)
- bcryptjs
- cors
- dotenv

Scripts principais:
- `npm run dev`
- `npm run build`
- `npm start`

## Serviços em execução
- Frontend ouvindo em `0.0.0.0:5173`
- Backend ouvindo em `0.0.0.0:4000`
- PostgreSQL local em `127.0.0.1:5432`

## Banco de dados
Arquivo de configuração encontrado:
- `/root/.openclaw/workspace/backend/.env`

Banco configurado:
- Database: `nacional_vision`
- User: `nacional_user`
- Host: `127.0.0.1`
- Port: `5432`

## Principais rotas de API
- `GET /api/health`
- `POST /api/auth/login`
- `GET/POST /api/groups`
- `GET/POST/PUT/DELETE /api/groups/:id/members`
- `GET /api/webhook/info`
- `GET /api/webhook/tests`
- `POST /api/webhook/test`
- `GET /api/funcionarios`
- `GET /api/vendedores`
- `GET /api/supervisores`
- `GET /api/gerentes`
- `GET /api/reports/filters`
- `GET /api/reports/maiores-quedas`
- `GET /api/reports/maiores-quedas/preview`
- `GET /api/reports/maiores-quedas/pdf`
- `GET /api/reports/sem-compras`
- `GET /api/reports/sem-compras/pdf`
- `GET /api/report-types`
- `GET/POST /api/schedules`
- `POST /api/schedules/:id/run`
- `DELETE /api/schedules/:id`
- `GET /api/history`
- `GET /api/kpis`

## Funcionalidades observadas
- login administrativo
- dashboard comercial
- relatórios de carteira
- campanhas/agendamentos
- grupos operacionais
- histórico de execuções
- geração de PDF
- disparo via webhook

## Observações importantes
- O frontend contém credenciais de teste visíveis na tela de login.
- O backend também cria automaticamente o usuário `admin@teste.local` com senha de teste no bootstrap do banco.
- Existe webhook padrão configurado no backend via `.env`.
- O código aparenta ser um painel comercial/operacional em cima de dados no schema `staging` do PostgreSQL.

## Próximos passos recomendados
1. Renomear/documentar oficialmente se `Painel RW` = `Nacional Vision`.
2. Remover credenciais hardcoded da UI.
3. Revisar os múltiplos processos `tsx watch` antigos e deixar só o necessário.
4. Confirmar como o frontend chega no backend (proxy/reverse proxy/nginx).
5. Centralizar documentação, acessos e rotinas nesta pasta `Nacional Vision`.
