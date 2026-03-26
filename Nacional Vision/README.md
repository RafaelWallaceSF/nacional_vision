# Nacional Vision

Pasta principal do projeto.

## Estrutura
- `frontend/` → app React/Vite
- `backend/` → API Express/TypeScript
- `package.json` → workspace root do projeto
- `package-lock.json` → lockfile do workspace
- `index.html` → arquivo legado do projeto
- `arquitetura.md` → mapa técnico
- `analise-completa.md` → análise geral
- `webhook-batch.md` → contrato do webhook em lote
- `.env.local` → dados locais registrados para organização

## Observação
Para evitar quebrar o ambiente atual, alguns caminhos antigos na raiz do workspace foram mantidos como atalhos simbólicos.

Projeto:
- `/root/.openclaw/workspace/frontend` → `Nacional Vision/frontend`
- `/root/.openclaw/workspace/backend` → `Nacional Vision/backend`
- `/root/.openclaw/workspace/package.json` → `Nacional Vision/package.json`
- `/root/.openclaw/workspace/package-lock.json` → `Nacional Vision/package-lock.json`
- `/root/.openclaw/workspace/README.md` → `Nacional Vision/README.md`
- `/root/.openclaw/workspace/index.html` → `Nacional Vision/index.html`

Arquivos globais do OpenClaw continuam na raiz do workspace porque pertencem ao agente e não ao produto:
- `AGENTS.md`
- `SOUL.md`
- `USER.md`
- `TOOLS.md`
- `HEARTBEAT.md`
- `IDENTITY.md`
- `memory/`
- `.openclaw/`
