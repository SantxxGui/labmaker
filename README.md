# LabMaker

Gestão do **espaço maker** da faculdade. O **Líder do espaço** — OED (Orientador Educacional Digital) ou Estagiário EMK — cuida de tudo: cadastra as máquinas (impressoras 3D, cortadoras a laser, plotters de recorte), as áreas e os notebooks, empresta notebooks, acompanha cada máquina e cada computador ao vivo, gerencia contas e senhas e lê a trilha de auditoria. O **aluno** cria a própria conta e reserva o que o Líder cadastrou, na hora.

A aplicação **nasce zerada**: nenhuma máquina, área, notebook ou reserva — só a conta do Líder.

| | |
|---|---|
| **Frontend** | Next.js 16 (App Router) · React 19 · TypeScript estrito · Tailwind CSS 4 · Radix UI · framer-motion |
| **Backend** | API REST (71 operações) em Route Handlers · **MVC** · validação Zod · OpenAPI 3.1 gerada dos próprios validadores |
| **Banco** | PostgreSQL · Prisma 7 · 18 tabelas · 8 migrations · regras críticas garantidas no banco (trava, índice único parcial, gatilho) |
| **Segurança** | JWT em cookie httpOnly · bcrypt · revogação imediata de sessão · limite de tentativas de login · CSP e cabeçalhos · RBAC com 3 perfis · auditoria imutável no banco |
| **Máquinas** | Telemetria, alarmes, câmera e comandos seguros via gateway (simulado; mesmo formato do real) |
| **Notebooks e celulares** | **Agente real** (`agente/agente.mjs`, Node sem dependências): métricas, avisos nativos, bloqueio e **suporte remoto com a tela ao vivo** (com autorização e aviso fixo na tela) · inicia com o computador · **agente pelo navegador** para celulares (QR code, instalável como app, notificação push) · empréstimo com prazo |
| **Atendimento** | Aluno toca em **Pedir ajuda** (notebook ou celular) → fila do Líder com **chat** e tela pré-autorizada · lembrete de devolução 15 min antes e aviso de atraso automáticos · espaço **trava sozinho às 20h** e destrava às 8h |
| **Qualidade** | 91 testes unitários · 105 verificações ponta a ponta · teste de concorrência (50 pedidos simultâneos → 1 reserva) · CI no GitHub Actions · Docker |

## Como rodar

Pré-requisitos: Node.js 20+ e um PostgreSQL (Supabase gratuito, local ou Docker).

```bash
npm install
cp .env.example .env     # preencha DATABASE_URL e AUTH_SECRET
npm run db:check         # testa a conexão e explica o erro, se houver
npm run db:reset         # cria as tabelas e o espaço ZERADO (só o Líder)
npm run dev              # http://localhost:3000
```

Entre com **`lider@labmaker.dev` / `labmaker123`** (troque com `LIDER_EMAIL` / `LIDER_SENHA` no `.env`). Alunos criam a conta em `/cadastro`.

Quer o espaço cheio para demonstrar? `npm run db:demo` carrega 8 máquinas, 15 aparelhos, reservas, alarmes e empréstimos de exemplo (contas `lider@`, `gestor@`, `usuario@labmaker.dev`, senha `labmaker123`).

**Com Docker:** `docker compose up --build` sobe PostgreSQL + aplicação em `http://localhost:3000` (o serviço `setup` prepara o banco só se estiver vazio).

**DATABASE_URL (Supabase):** *Connect → Connection String → Session pooler*; troque `[YOUR-PASSWORD]` pela senha, sem colchetes.

## Perfis

| Perfil | O que faz |
|---|---|
| **Líder** (OED / Estagiário EMK) | **Tudo.** Cadastra máquinas, áreas e notebooks; empresta e recebe notebooks; registra calibração e manutenção; comanda máquinas; envia avisos e ações aos notebooks; edita políticas; gerencia contas, perfis e **senhas**; lê e exporta a auditoria. |
| Professor(a) | Acompanha painel, máquinas, notebooks e agenda; reserva para a turma; pausa máquinas e envia avisos. Não cadastra. |
| Aluno(a) | Consulta as máquinas e reserva horários. Vê o notebook que está com ele e o prazo. |

## Agente nos notebooks (real)

Em **Notebooks → Adicionar aparelho → Computador / VM**, o Líder gera um código (vale 2 h). No computador:

```bash
curl -o agente.mjs http://IP-DO-SERVIDOR:3000/api/agente/script
node agente.mjs --servidor http://IP-DO-SERVIDOR:3000 --inscricao <CÓDIGO>
```

Em segundos o computador aparece com o selo **real**: CPU, memória, disco e app em uso medidos de verdade; avisos chegam como notificação nativa (Windows, macOS, Linux). Com **Suporte remoto**, o usuário autoriza numa janela e o Líder vê a **tela ao vivo** (só visualização, até 10 min); enquanto isso, uma janela fixa avisa "sua tela está sendo vista" com o botão **Parar de compartilhar**.

Depois, `node agente.mjs --instalar-servico` faz o agente **iniciar sozinho** com o computador e cria o atalho **"Pedir ajuda ao Líder"** na área de trabalho: o aluno descreve o problema, diz se autoriza ver a tela, e o pedido cai na tela **Atendimento** do Líder, com chat.

Para **celulares**: **Adicionar aparelho → Celular (QR code)** — a pessoa escaneia e o navegador vira o agente (avisos com confirmação de leitura, bloqueio, **Pedir ajuda** com chat). Com HTTPS, dá para **instalar como app** e receber **notificações push** com o app fechado.

**Modo TV** (ícone de TV no topo, ou `/tv`): tela cheia para o monitor da recepção — máquinas ao vivo (livre, em uso, operando com progresso, alarme), próximas reservas, aparelhos, pedidos de ajuda e o que acabou de acontecer. Atualiza sozinha a cada 5 s e se ajusta a TV 1080p ou projetor 1366×768. Por ser tela pública, aluno aparece só como "Bruna S." e nenhum e-mail chega nela.

Antes de apresentar, abra **Diagnóstico** (ícone de estetoscópio no topo): confere banco, endereço/HTTPS, VM, celular, fechamento automático e push, e testa o fechamento das 20h na hora.

Passo a passo da demonstração com **VM e celular**: [`docs/DEMO-VM-CELULAR.md`](docs/DEMO-VM-CELULAR.md). Detalhes do agente: [`docs/AGENTE.md`](docs/AGENTE.md).

## Scripts

| Comando | O que faz |
|---|---|
| `npm run dev` / `build` / `start` | Desenvolvimento / build de produção / servidor de produção |
| `npm run db:check` | Diagnóstico da conexão com o banco |
| `npm run db:reset` | Apaga, recria (migrations) e cria o espaço **zerado** |
| `npm run db:demo` | Igual, mas com o espaço de **exemplo** |
| `npm run db:setup` | Prepara o banco **só se estiver vazio** (deploy/Docker) |
| `npm test` | 91 testes unitários das regras de negócio |
| `npm run test:api` | 105 verificações ponta a ponta contra o servidor rodando |
| `npm run test:concorrencia` | 5 alunos × 10 pedidos simultâneos no mesmo horário → exatamente 1 reserva |
| `npm run typecheck` | Checagem de tipos |
| `npm run agente -- --servidor … --inscricao …` | Roda o agente neste computador |

## Arquitetura (MVC)

```
Navegador ──▶ proxy.ts ──▶ app/api/**/route.ts ──▶ controllers/ ──▶ models/ ──▶ PostgreSQL
 (views/)    (sessão)      (URL + verbo)           (regras)        (Prisma)
Agente ─────────────────▶ /api/agente/*  (token lmk_… próprio de cada computador)
```

```
app/(app)/          Páginas autenticadas (painel, máquinas, notebooks, atendimento, diagnóstico, reservas, agenda, calibração, auditoria, usuários)
app/api/            Rotas REST — cada arquivo só liga um verbo HTTP a um controller
app/api-docs/       Documentação navegável da API com "Testar"
controllers/        Autorização, validação, regras de negócio, auditoria
models/             Único ponto de acesso ao banco (Prisma), transações
views/              Telas (React) por módulo
lib/                Regras puras e testadas: permissions · slots · telemetria · agente · emprestimo · automacao · chamados · tela-remota · limite-login · openapi
                    + agendador (a cada minuto) · push (Web Push/VAPID) · rede (IPs da máquina)
instrumentation.ts  Liga o agendador quando o servidor sobe
public/             manifest.webmanifest · sw.js (service worker do celular) · ícones
agente/             Agente para os notebooks (Node, sem dependências)
prisma/             schema.prisma · migrations/0001…0008 · seed
scripts/            db-check · db-reset · db-setup · teste-api · teste-concorrencia
tests/              Testes unitários (Vitest)
docs/               Documentação detalhada
```

## Documentação

- [`docs/ARQUITETURA.md`](docs/ARQUITETURA.md) — camadas, fluxo de uma requisição, decisões técnicas
- [`docs/API.md`](docs/API.md) — as 67 operações (também em `/api-docs` e `/api/openapi.json`)
- [`docs/BANCO.md`](docs/BANCO.md) — modelo de dados, migrations, garantias no banco
- [`docs/SEGURANCA.md`](docs/SEGURANCA.md) — autenticação, sessões, RBAC, auditoria, LGPD
- [`docs/AGENTE.md`](docs/AGENTE.md) — agente real e agente pelo navegador: inscrição, check-in, ações, suporte remoto
- [`docs/DEMO-VM-CELULAR.md`](docs/DEMO-VM-CELULAR.md) — montar o espaço do zero, VM, celular e o roteiro da demonstração
- [`docs/DISPOSITIVOS.md`](docs/DISPOSITIVOS.md) — notebooks: avisos, bloqueio, políticas, empréstimos
- [`docs/DEPLOY.md`](docs/DEPLOY.md) — colocar online grátis (Render + Supabase), HTTPS e endereço fixo
- [`docs/CONECTIVIDADE.md`](docs/CONECTIVIDADE.md) — máquinas: gateway, câmeras, alarmes, comandos
- [`docs/APRESENTACAO.md`](docs/APRESENTACAO.md) — roteiro da apresentação e perguntas prováveis
