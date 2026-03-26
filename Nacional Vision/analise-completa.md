# Nacional Vision — Análise completa do projeto

## Resumo executivo
O projeto hoje é um **painel comercial/operacional full-stack** voltado a análise de carteira, geração de relatórios, organização de grupos e disparo de campanhas via webhook.

Ele está **funcionando** e já possui:
- frontend navegável
- backend respondendo
- banco PostgreSQL conectado
- geração de relatórios e PDFs
- rotinas de campanha e histórico

Ao mesmo tempo, o projeto ainda carrega sinais claros de **fase inicial / MVP acelerado**, com riscos importantes em:
- autenticação
- exposição de credenciais
- organização de código
- acoplamento entre regra de negócio, SQL e camada HTTP
- operação do ambiente

---

## 1. Estrutura do projeto

### Diretórios principais
- `frontend/` → aplicação React/Vite
- `backend/` → API Express/TypeScript
- `Nacional Vision/` → pasta de organização e documentação

### Workspace root
O repositório root usa **npm workspaces** com dois pacotes:
- `frontend`
- `backend`

Scripts no root:
- `dev:frontend`
- `dev:backend`
- `build:frontend`
- `build:backend`

### Leitura geral
A estrutura é simples e funcional, mas ainda pouco modular.
Hoje o projeto depende fortemente de poucos arquivos centrais, especialmente:
- `frontend/src/App.tsx`
- `backend/src/server.ts`
- `backend/src/initDb.ts`

Isso facilita começo rápido, mas piora manutenção conforme cresce.

---

## 2. Stack técnica

### Frontend
- React 19
- Vite 8
- React Router DOM 7
- TypeScript

### Backend
- Node.js
- Express 5
- TypeScript
- pg
- bcryptjs
- cors
- dotenv

### Banco
- PostgreSQL 16

### Infra observada
- frontend servido em `:5173`
- backend servido em `:4000`
- PostgreSQL local em `127.0.0.1:5432`
- nginx presente no host

---

## 3. Estado operacional atual

### Serviços respondendo
- `GET /api/health` → ok
- `GET /api/kpis` → ok

### KPIs atuais do sistema
No momento da análise:
- usuários ativos: `2`
- relatórios: `1`
- schedules: `1`
- histórico: `8`
- grupos: `3`

### Problema operacional encontrado
Existem **múltiplos processos duplicados** do backend em modo watch (`tsx watch src/server.ts`).

Isso indica uma destas situações:
- inicializações repetidas sem limpeza
- processo supervisor mal controlado
- ambiente dev sendo usado como produção

Impacto possível:
- consumo desnecessário de memória/CPU
- confusão de logs
- risco de comportamento inconsistente

---

## 4. Frontend — análise

### Organização
O frontend está praticamente concentrado em **um único arquivo grande**:
- `frontend/src/App.tsx`

Ele contém junto:
- tipos
- helpers
- autenticação
- páginas
- navegação
- fetches
- estado da aplicação

### Ponto positivo
- entrega rápida
- fácil de localizar tudo no início
- bom para protótipo e validação

### Problemas
- arquivo monolítico
- alta dificuldade de manutenção
- baixa reutilização
- aumento de risco a cada nova feature
- difícil testar isoladamente

### Fluxo funcional identificado
O frontend possui páginas para:
- login
- dashboard
- relatórios
- grupos
- campanhas
- histórico
- usuários

### Integração com backend
Usa chamadas `fetch('/api/...')` e o Vite faz proxy para `http://127.0.0.1:4000`.

Isso é bom no desenvolvimento, mas precisa confirmação no deploy final para garantir que o tráfego em produção também esteja consistente.

### Problemas críticos no frontend
1. **Credencial hardcoded e exibida na interface**
   - e-mail: `admin@teste.local`
   - senha: `Admin@123`

2. **Autenticação fraca no cliente**
   - o usuário autenticado é salvo em `localStorage`
   - não existe token real nem validação contínua no frontend

3. **Proteção de rotas apenas visual**
   - a checagem de auth no frontend é basicamente presença de usuário local
   - isso não equivale a segurança real

### Conclusão do frontend
O frontend é funcional e já entrega valor, mas está em perfil de **MVP com acoplamento alto e segurança baixa**.

---

## 5. Backend — análise

### Organização
O backend principal está concentrado em:
- `src/server.ts`
- `src/initDb.ts`
- `src/db.ts`

### Ponto positivo
- simples de rodar
- simples de entender o fluxo inicial
- API cobre os módulos necessários do painel

### Problemas estruturais
O arquivo `server.ts` está acumulando junto:
- bootstrap da aplicação
- helpers utilitários
- regras de negócio
- geração de PDF
- consultas SQL grandes
- rotas HTTP
- integração webhook
- execução de campanhas

Isso gera:
- alta complexidade
- manutenção cara
- risco maior de regressão
- difícil separar domínio, aplicação e infraestrutura

### Rotas existentes
Principais grupos:
- health e auth
- grupos e membros
- webhook info/teste
- consultas de funcionários/vendedores/supervisores
- relatórios (`maiores-quedas`, `sem-compras`)
- geração de PDF
- campanhas / schedules
- histórico
- KPIs

### Ponto positivo do backend
As queries estão parametrizadas com `$1`, `$2`, etc., o que ajuda contra SQL injection.

### Problemas críticos do backend
1. **Token de login falso / mock**
   - o login retorna `token: 'mock-admin-token'`
   - isso mostra que a autenticação ainda não foi implementada de verdade

2. **Sem camada real de autorização**
   - não foi observado middleware protegendo rotas
   - endpoints parecem acessíveis sem sessão/JWT real

3. **Sem separação por módulos**
   - relatórios, grupos, auth, campanhas e webhook estão todos misturados

4. **Geração manual de PDF dentro do servidor**
   - funciona, mas tende a ficar frágil e difícil de evoluir

5. **Acoplamento direto com estrutura do banco staging**
   - a lógica depende diretamente de campos JSON em tabelas staging
   - isso acelera entrega, mas aumenta fragilidade a mudanças de origem

---

## 6. Banco de dados — análise

### Banco principal observado
- database: `nacional_vision`
- usuário: `nacional_user`

### Tabelas em `public`
- `app_users`
- `contact_group_members`
- `contact_groups`
- `contacts`
- `daily_report_executions`
- `daily_report_rules`
- `report_group_members`
- `report_groups`
- `report_types`
- `webhook_test_logs`

### Tabelas em `staging`
- dimensões e fatos comerciais como:
  - `DIM_CLIENTES`
  - `DIM_FUNCIONARIOS`
  - `FATO_PEDIDO`
  - `FATO_VENDAS`
  - `FATO_FINANCEIRO`
  - etc.

### Leitura do desenho de dados
O sistema parece operar com dois mundos:
1. **mundo transacional do app** em `public`
2. **mundo analítico/importado** em `staging`

Esse desenho faz sentido.

### Risco identificado
Há dependência forte de campos `raw_data->>'...'` em JSON dentro das tabelas staging.

Impactos:
- consultas longas
- performance potencialmente pior
- mais fragilidade sem validação de schema
- manutenção mais difícil

### Bootstrap do banco
O `initDb.ts` cria/ajusta parte das tabelas e injeta usuário admin de teste.

Ponto bom:
- facilita bootstrapping

Ponto ruim:
- mistura migração, seed e regra de ambiente num fluxo só
- não substitui sistema formal de migration

---

## 7. Segurança — análise

## Nível atual: baixo a médio-baixo

### Achados críticos
1. **Credenciais expostas no frontend**
2. **Usuário de teste criado automaticamente no backend**
3. **Senha padrão conhecida**
4. **Token mock**
5. **Ausência de autenticação real**
6. **Possível exposição pública de ambiente em porta 5173**
7. **Webhook padrão salvo em `.env`**
8. **Dados sensíveis em arquivo local sem política clara**

### Consequência prática
Hoje o sistema está adequado para:
- ambiente controlado
- protótipo interno
- validação rápida

Hoje ele **não está adequado** para produção séria exposta sem endurecimento.

### Prioridades de segurança
1. remover credenciais visíveis da UI
2. remover senha padrão hardcoded
3. implementar autenticação real (JWT ou sessão)
4. proteger rotas de API
5. revisar exposição pública de portas
6. separar segredos de config de desenvolvimento
7. adicionar rate limiting e logs de autenticação

---

## 8. Qualidade de código e manutenção

### Pontos positivos
- stack moderna e pragmática
- TypeScript nos dois lados
- queries parametrizadas
- fluxo funcional já entrega resultado real
- MVP com valor de negócio claro

### Pontos fracos
- monólito no frontend
- monólito no backend
- pouca separação por domínio
- ausência de testes observáveis
- ausência de migrations formais
- ausência de camada de serviços/repositórios
- pouca padronização de erro/response

### Diagnóstico honesto
O projeto está num estágio clássico de:
**“funciona e já gera valor, mas precisa de refatoração antes de escalar direito.”**

---

## 9. Produto e regra de negócio

### O que o sistema já demonstra saber fazer
- autenticar usuário administrativo
- consultar base comercial
- gerar ranking de maiores quedas
- listar clientes sem compra
- montar preview de mensagem
- gerar PDF
- organizar grupos de envio
- programar campanhas
- executar campanhas via webhook
- manter histórico de execuções

### Valor de negócio percebido
Esse painel não é só CRUD; ele já está orientado a **operação comercial e ativação de carteira**.

Ou seja, existe um núcleo de produto claro:
- inteligência comercial
- priorização de ação
- automação de disparos
- acompanhamento histórico

Isso é bom. O projeto tem propósito concreto.

---

## 10. Riscos principais

### Risco 1 — segurança
Muito alto.
Porque afeta acesso ao sistema e dados comerciais.

### Risco 2 — crescimento do código
Alto.
Porque os arquivos centrais já estão grandes e misturam tudo.

### Risco 3 — operação do ambiente
Médio/alto.
Porque há sinais de processos duplicados e ambiente de execução pouco padronizado.

### Risco 4 — banco acoplado ao staging
Médio.
Porque facilita agora, mas pode travar evolução e performance depois.

### Risco 5 — manutenção futura
Alto.
Porque novas features vão encarecer rápido sem modularização.

---

## 11. Prioridades recomendadas

## Prioridade 1 — segurança mínima viável
- remover credenciais da UI
- trocar senha padrão
- parar de criar usuário default inseguro em produção
- implementar autenticação real
- proteger endpoints

## Prioridade 2 — saneamento operacional
- eliminar múltiplos watchers do backend
- definir processo correto de execução
- separar ambiente dev vs prod
- revisar nginx/reverse proxy

## Prioridade 3 — refatoração estrutural
### frontend
Separar em:
- `pages/`
- `components/`
- `services/api.ts`
- `hooks/`
- `types/`

### backend
Separar em:
- `routes/`
- `controllers/`
- `services/`
- `repositories/`
- `modules/reports/`
- `modules/groups/`
- `modules/auth/`

## Prioridade 4 — banco e dados
- adotar migrations formais
- separar seed de migration
- revisar indexes das queries críticas
- considerar views/materialização para relatórios

## Prioridade 5 — qualidade
- testes de API nos fluxos críticos
- validação de payload
- padronização de erros
- logging estruturado

---

## 12. Veredito final

## Estado atual
**Projeto funcional, com valor real, mas ainda com cara de MVP acelerado.**

## Maturidade
- produto: **boa direção**
- engenharia: **média para baixa**
- segurança: **baixa**
- operação: **média para baixa**
- potencial: **alto**

## Minha leitura direta
O projeto **não está bagunçado a ponto de estar perdido**.
Ele está numa fase muito comum: já resolveu o mais difícil do negócio, mas agora precisa parar de só “empilhar feature” e entrar numa fase de:
- endurecimento
- organização
- profissionalização

Se fizer isso agora, vira um sistema sólido.
Se continuar crescendo do jeito atual, a manutenção vai ficar cara rápido.

---

## 13. Recomendação prática imediata
Se eu fosse tocar isso agora, a ordem seria:

1. **corrigir segurança básica**
2. **limpar operação/runtime**
3. **modularizar backend**
4. **modularizar frontend**
5. **formalizar banco/migrations**

---

## 14. Conclusão em uma frase
O Nacional Vision já tem utilidade de negócio de verdade, mas precisa sair do modo protótipo urgente para não virar uma dívida técnica cara e insegura.
