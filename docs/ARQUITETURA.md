# Arquitetura

## Visão geral

O LabMaker é um monólito modular em Next.js, organizado em **MVC**. O mesmo projeto serve as telas e a API REST, mas as camadas são isoladas por pasta e por regra de dependência:

```
View ──▶ Rota ──▶ Controller ──▶ Model ──▶ Banco
```

Uma camada só conhece a camada imediatamente abaixo. Telas nunca importam Prisma; models nunca conhecem HTTP.

| Camada | Pasta | Responsabilidade | Não faz |
|---|---|---|---|
| **View** | `views/`, `app/**/page.tsx`, `components/` | Renderizar telas e capturar interações | Regra de negócio, SQL |
| **Rota** | `app/api/**/route.ts` | Mapear URL + verbo HTTP para uma action | Lógica (1 linha por verbo) |
| **Controller** | `controllers/` | Autorizar, validar entrada, aplicar regras, auditar, responder | Acessar o banco diretamente |
| **Model** | `models/` | Consultas, transações, conversão para DTO | Conhecer HTTP, sessão ou permissões |
| **Domínio** | `lib/slots.ts`, `lib/permissions.ts`, `lib/telemetria.ts`, `lib/agente.ts` | Regras puras (horários, calibração, RBAC, máquinas, notebooks), testadas | Efeitos colaterais |

## Fluxo de uma requisição

Exemplo: o Líder desliga o switch de um equipamento.

1. **View** — `views/equipamentos/equipamentos-view.tsx` atualiza a tela na hora (UI otimista) e faz `fetch("PATCH /api/equipamentos/:id")`.
2. **Proxy** — `proxy.ts` é a primeira barreira nas páginas (redireciona quem não tem sessão ou permissão).
3. **Rota** — `app/api/equipamentos/[id]/route.ts`: `export const PATCH = EquipamentoController.atualizar`.
4. **Controller** — `EquipamentoController.atualizar`:
   - valida o corpo com Zod (`equipamentoPatchSchema`);
   - decide a permissão: só `status` → `equipamento:alterar_status`; outros campos → `equipamento:gerenciar`;
   - chama o model e registra o evento na auditoria.
5. **Model** — `EquipamentoModel.atualizar` executa o `UPDATE` e devolve um DTO.
6. **View** — confirma com a resposta; se a API recusar, desfaz a mudança e mostra o erro.

### Segundo exemplo: comando remoto

O Líder clica em **Pausar ciclo** na página da máquina.

1. **View** — `views/maquinas/maquina-detalhe-view.tsx` pede confirmação e faz `POST /api/equipamentos/:id/comandos`.
2. **Controller** — `MaquinaController.comandar` exige `maquina:comandar`, valida o corpo e busca o estado atual da máquina.
3. **Domínio** — `avaliarComando()` decide se o comando é seguro (máquina online, estado compatível, sem alarme crítico para retomar).
4. **Model** — registra o comando em `comandos_remotos` (aceito ou recusado), atualiza o estado e grava a auditoria.
5. **Gateway** (produção) — entrega ao CNC/CLP e confirma. Na demo, o simulador aplica o efeito.

## Decisões técnicas

**Reserva sem duplicidade.** A verificação "horário livre?" seguida de "inserir" tem uma janela de corrida. `AgendamentoModel.criarSemConflito` roda numa transação que começa com `pg_advisory_xact_lock(hashtext(equipamentoId))`: pedidos simultâneos para o mesmo equipamento são enfileirados pelo próprio PostgreSQL. No teste, 5 pedidos simultâneos geram 1 reserva e 4 respostas `409`. Equipamentos diferentes não se bloqueiam.

**Calibração como regra de sistema.** A situação (`EM_DIA`, `A_VENCER`, `VENCIDA`, `PENDENTE`) não é uma coluna: é calculada de `proxima_calibracao_em` por `situacaoCalibracao()`. Assim o equipamento "vence" sozinho, sem job agendado, e a API recusa reservas no mesmo instante.

**Permissões em um só lugar.** `lib/permissions.ts` define a matriz perfil × permissão. API (`autorizar`), páginas (`requirePageSession`), menu e a própria tela "Matriz de permissões" leem dessa fonte. Esconder um botão é conveniência; quem garante é a API.

**Auditoria no controller.** Toda action que altera dados chama `AuditoriaModel.registrar` com autor (snapshot do nome e perfil), ação, entidade, resumo e IP. O model só expõe inserção e leitura.

**Datas.** O banco guarda instantes em UTC (`timestamptz`). O horário comercial do laboratório é calculado no fuso de São Paulo em `lib/slots.ts`. A migration fixa o fuso do banco em UTC para evitar deslocamento em instalações locais.

**Renderização.** Páginas são Server Components: buscam dados pelos models e já chegam prontas. Interações (reservar, alterar status, registrar calibração) usam `fetch` na API, sem recarregar. A landing page não depende de JavaScript para aparecer.

**Erros.** `handler()` em `lib/api.ts` envolve toda action: `ApiError` vira o status correspondente, erro do Zod vira `422`, JSON malformado `400`, e o inesperado vira `500` com log — sempre no formato `{ "error": "mensagem" }`.

### Decisões desta versão

- **Aplicação zerada + um único administrador (Líder).** Reflete a operação real do espaço. O contrapeso é técnico, não organizacional: auditoria imutável no banco e proteção contra ficar sem Líder.
- **Regras críticas também no banco** (trava consultiva, índice único parcial, CHECK, gatilho): a aplicação valida para dar boa mensagem; o banco garante mesmo sob corrida ou bug.
- **Sessão com versão no banco** em vez de lista negra de tokens: 1 consulta indexada por requisição, revogação instantânea.
- **OpenAPI gerada dos schemas Zod** (`z.toJSONSchema`): a documentação e a validação são a mesma fonte.
- **Agente por *pull*** (check-in a cada 15 s): funciona atrás de NAT/firewall e com o notebook desligado (a ação espera na fila).

### Atendimento, automações e tempo real

- **Chat sem WebSocket.** O aparelho já conversa com o servidor pelo check-in; com um pedido de ajuda aberto, o servidor responde `intervaloSeg: 3`, e as mensagens do Líder viajam na resposta do check-in (marcadas como **entregues** ao sair). Nenhuma porta nova, nenhuma conexão aberta no notebook do aluno. O Líder consulta a conversa a cada 2 s.
- **Tela ao vivo por Server-Sent Events.** `GET /api/dispositivos/:id/tela/eventos` mantém uma conexão HTTP aberta e empurra `estado`, `quadro`, `inicio`, `fim` (pulso a cada 15 s). O navegador do Líder busca a imagem só quando chega um quadro novo; o agente só envia a imagem quando a tela mudou. Sem suporte a SSE, cai para polling.
- **O check-in é o relógio.** Lembrete de devolução, atraso, trava às 20h e destrava às 8h são calculados por uma função pura (`lib/automacao.ts`, testada) a cada check-in — sem cron externo. Para celulares com o app fechado, um **agendador** dentro do servidor (`lib/agendador.ts`, ligado em `instrumentation.ts`) roda a cada minuto e manda **Web Push**. Os dois caminhos podem disparar ao mesmo tempo; quem decide é o **índice único parcial** `acoes_automaticas_unicas` — o segundo recebe P2002 e é ignorado.
- **Push sem serviço pago.** Web Push padrão (VAPID, biblioteca `web-push`): o próprio servidor gera as chaves e fala com o serviço de push do navegador (FCM/Mozilla/Apple). Falha de push nunca derruba a requisição que a disparou.

## Design system

Tema escuro de sala de controle, com tokens em `app/globals.css` (cores, bordas, vidro, listras de advertência, LEDs); os componentes usam apenas os tokens. Sem degradês em texto: branco como cor principal, âmbar como sinal e verde/âmbar/vermelho reservados para estado de máquina. Tipografia Geist, números em fonte monoespaçada. O fundo animado (`components/industrial/`) é desenhado em canvas, pausa fora da tela e respeita *reduzir movimento*.

## Testes

Três camadas, todas automatizadas e rodando no CI (`.github/workflows/ci.yml`) contra um PostgreSQL real:

| Camada | Comando | O que prova |
|---|---|---|
| Unitários (105) | `npm test` | Regras puras: horários, fuso, calibração, permissões, telemetria, agente, empréstimo, limite de login, tela remota, chamados, automações (lembrete, atraso, fechamento, abertura), agendador, modo TV (situação das máquinas e privacidade), alarme de devolução, remoção de aparelho |
| Ponta a ponta (133) | `npm run test:api` | Perfis e 403, o Líder cuida de tudo, aluno reserva o que acabou de ser cadastrado, empréstimo, agente (inscrição, token, check-in), suporte remoto (autorização, quadros, encerramento, 403 do aluno), SSE da tela, **pedido de ajuda → chat → tela pré-autorizada → encerramento**, lembrete automático sem repetição, **alarme de devolução 1 min após o prazo e desligado na devolução**, **remoção de aparelho (403, confirmação, emprestado bloqueia, agente desconectado)**, índice anti-duplicidade, diagnóstico, modo TV sem e-mail, teste de fechamento, push, celular pelo navegador, cookie Secure em HTTPS, redefinição de senha, Meu perfil (nome e troca de senha derrubando os outros aparelhos), revogação de sessão, força bruta → 429, cabeçalhos, CSV |
| Concorrência (4) | `npm run test:concorrencia` | 50 pedidos simultâneos no mesmo horário → 1 reserva, 49 × 409, nenhum 500 |

## Evolução prevista

- Gateway real (Raspberry Pi: MQTT da Bambu/Prusa, ponte do laser) e vídeo WebRTC no lugar do simulador — ver `CONECTIVIDADE.md`
- Agente como serviço de sistema assinado (hoje inicia no login do usuário) e autenticação por certificado — ver `AGENTE.md`
- Telemetria das máquinas por Server-Sent Events também (a tela remota já usa)
- Aviso ao aluno quando a impressão dele terminar (e-mail/WhatsApp) e notificação de alarme crítico ao Líder
- Login com a conta institucional (SSO) no lugar de usuário e senha
- Empréstimo de notebook pelo tablet do balcão (QR code)
- Troca obrigatória da senha temporária no primeiro acesso e segundo fator (TOTP) para o Líder
- Anexo do certificado de calibração (PDF)
