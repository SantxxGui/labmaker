# Agente LabMaker (notebooks e computadores)

Dois agentes, o mesmo protocolo:

- **`agente/agente.mjs`** — um único arquivo, Node.js 18+ **sem dependências**, para computadores (Windows, macOS, Linux — inclusive uma VM). Baixe direto do servidor: `curl -o agente.mjs http://SERVIDOR:3000/api/agente/script`.
- **Página `/agente`** — o navegador vira o agente, para **celulares e tablets** (inscrição por QR code). Ver [`DEMO-VM-CELULAR.md`](DEMO-VM-CELULAR.md).

## Como instalar

1. O Líder abre **Notebooks → Adicionar aparelho → Com agente**, escolhe a política e a área e clica em *Gerar código* (vale 2 h).
2. No computador, com Node instalado e a pasta `agente/` copiada:

```bash
node agente/agente.mjs --servidor http://IP-DO-SERVIDOR:3000 --inscricao <CÓDIGO>
```

3. Pronto: o token fica em `~/.labmaker-agente.json` (permissão 600). Das próximas vezes basta `node agente/agente.mjs`.

| Opção | Efeito |
|---|---|
| `--nome LM-NB-01` | Usa este nome — **assume o aparelho que o Líder já cadastrou à mão** (mesmo registro, mesmo histórico de empréstimos) |
| `--permitir-bloqueio` | "Bloquear tela" trava a sessão de verdade **até o Líder liberar**: se o aluno destravar com a senha dele, o agente trava de novo em até 5 s (sem a opção, só registra) |
| `--aplicar-politica` | Executáveis baixados em `~/Downloads` vão para a quarentena (sem isso, só reporta) |
| `--tipo DESKTOP` | Estação fixa (não entra na lista de empréstimos) |
| `--uma-vez` | Um check-in e sai (testes) |
| `--testar-captura` | Tira uma foto da tela e salva `teste-captura.jpg` — confere se o suporte remoto vai funcionar |
| `--instalar-servico` | O agente passa a **iniciar sozinho** com o computador e cria o atalho **"Pedir ajuda ao Líder"** na área de trabalho. Guarda junto `--permitir-bloqueio` / `--aplicar-politica` se vierem na mesma linha |
| `--remover-servico` | Desfaz o anterior |
| `--pedir-ajuda` | Abre o formulário de pedido de ajuda (é o que o atalho da área de trabalho executa) |
| `--mensagem "texto"` | Responde no chat do pedido aberto, pelo terminal |

### Iniciar com o computador

| Sistema | O que o `--instalar-servico` cria |
|---|---|
| Linux (Mint, Ubuntu) | `~/.config/autostart/labmaker-agente.desktop` (abre num terminal, se houver) + `Pedir ajuda` na área de trabalho, marcado como confiável (`gio set … metadata::trusted`) |
| Windows | `LabMaker Agente.cmd` na pasta **Inicializar** do usuário + `Pedir ajuda ao Líder.cmd` na área de trabalho |
| macOS | LaunchAgent `~/Library/LaunchAgents/dev.labmaker.agente.plist` (`RunAtLoad`, `KeepAlive`) + `Pedir ajuda ao Líder.command` |

Tudo no nível do **usuário** — não pede administrador.

## O protocolo

```
Líder ── POST /api/dispositivos/inscricao ──▶ código (JWT 2 h, fim "inscricao-agente")
Agente ─ POST /api/agente/inscrever {código, hostname, SO, série, MAC…} ──▶ token lmk_… (banco guarda só SHA-256)
Agente ─ POST /api/agente/checkin (Bearer lmk_…) a cada 15 s
          ↑ telemetria (CPU, memória, disco, bateria, rede, usuário, app em uso, uptime)
          ↑ segurança (antivírus, firewall, criptografia — quando o SO permite ler sem admin)
          ↑ eventos (ex.: download bloqueado)
          ↑ resultados das ações do check-in anterior (EXECUTADA / RECUSADA + motivo)
          ↓ política (USB, downloads, sites, apps) · bloqueado? · ações pendentes
          ↓ chamado aberto (número, status, quem atende) · mensagens novas do Líder · intervaloSeg
```

- Com um **pedido de ajuda aberto**, o servidor devolve `intervaloSeg: 3` — o chat fica quase instantâneo — e volta a 15 s quando o atendimento termina.
- **Alarme de devolução:** prazo 10:00 → às 10:01 o aparelho emprestado começa a apitar (celular: tela vermelha, sirene e vibração; computador: bipe a cada 3 s) e só para quando o Líder registra a devolução. O check-in traz `devolucao` com a hora do servidor e fica a cada 5 s perto do alarme. Com a página do celular fechada, o agendador insiste por notificação (a cada minuto nos primeiros 15 min, depois a cada 5).
- O próprio check-in é o **relógio das automações**: lembrete de devolução 15 min antes do prazo, aviso de atraso, trava às 20h (e no domingo) e destrava às 8h. Ver *Automações* abaixo.

- **Pull, não push:** o servidor nunca abre conexão com o notebook; funciona atrás de NAT e firewall de rede de faculdade.
- Ação enviada a um computador desligado fica **PENDENTE** e é entregue no próximo check-in (**ENTREGUE**); o efeito (ex.: marcar como bloqueado) só é aplicado quando o agente **confirma** (**EXECUTADA**). Se o agente recusa, o motivo aparece na tela do Líder.
- Agente real é considerado **offline após 90 s** sem check-in (o simulador usa 36 h, para os dados de exemplo).

## Ações

| Ação | No agente |
|---|---|
| Alerta | Notificação nativa (balão do Windows, Central de Notificações do macOS, `notify-send` no Linux) + caixa no terminal |
| Bloquear / Desbloquear | Notifica; com `--permitir-bloqueio` trava a sessão (`LockWorkStation`, `pmset`, `loginctl`) e continua travando a cada 5 s até chegar o Desbloquear |
| Suporte remoto | Abre uma janela nativa **Permitir / Recusar** (PowerShell, `osascript`, `zenity`; sem interface, pergunta no terminal) — **exceto** quando o próprio usuário já autorizou ao pedir ajuda. Durante o compartilhamento, uma **janela fixa** avisa "sua tela está sendo vista" com o botão **Parar de compartilhar**. Captura 1 quadro por segundo (JPEG ~1280 px) e **só envia a imagem quando a tela mudou** (senão manda `{ mesmo: true }`), até o Líder encerrar, o usuário parar ou passarem 10 min |
| Mensagem do Líder (chat) | Notificação + janela com campo de resposta (`zenity --entry`, `InputBox`, `display dialog`). A resposta vai para `POST /api/agente/chamados/mensagem` |
| Instalar / remover app | Simulado (em produção: winget / Intune) |
| Reiniciar / Apagar dados | **Sempre recusado** no agente de demonstração |

## Suporte remoto (tela)

```
Líder: ação SESSAO_REMOTA (com motivo) ──▶ fila
Agente: check-in → recebe → janela "Permitir / Recusar" no computador
   Permitir → POST /api/agente/tela { acaoId, imagem } a cada ~1 s → { continuar: true }
Líder: GET /api/dispositivos/:id/tela (estado) · /tela/imagem (último quadro) · POST /tela/encerrar
Fim: Líder encerra · usuário aperta ENTER · 10 min · pedido recusado → { continuar: false }
```

- Regras puras em `lib/tela-remota.ts` (testadas): só com pedido **autorizado** daquele aparelho; pedido vale 30 min; sessão dura no máximo 10 min.
- **Só visualização**: não existe controle de mouse ou teclado, de propósito (LGPD e segurança).
- Os quadros ficam **só na memória do servidor** (o último de cada aparelho) e são descartados ao encerrar — nunca vão para o banco. Em produção com vários servidores, o caminho é WebRTC ou Redis.
- Início e fim vão para a auditoria (`dispositivo.tela_iniciada`, `dispositivo.tela_encerrada`).
- Ver a tela exige `dispositivo:comandar` (Líder e Professor). Aluno recebe 403.
- Celular pelo navegador **não** compartilha tela (o navegador do celular não permite); no computador, a página `/agente` compartilha via `getDisplayMedia` quando aberta em HTTPS.

## Pedir ajuda e atendimento

```
Aluno: atalho "Pedir ajuda ao Líder" (ou botão no celular)
   → janela: "O que está acontecendo?" + "Autoriza o Líder a ver sua tela?"
   → POST /api/agente/chamados { descricao, nome, autorizaTela }          (1 aberto por aparelho)
Líder: menu Atendimento (selo com o número de pedidos esperando)
   → Atender · escreve no chat (POST /api/chamados/:id/mensagens) · Ver tela · Encerrar
Agente: check-in a cada 3 s → recebe as mensagens → janela para responder
Ver tela: POST /api/chamados/:id/tela → ação SESSAO_REMOTA com parâmetro "chamado:<id>:pre-autorizado"
   → o agente não pergunta de novo, mas mostra a janela fixa com "Parar de compartilhar"
```

- A autorização vale **só para aquele atendimento**; num próximo pedido, pergunta-se de novo.
- O Líder também pode **iniciar** a conversa pelo detalhe do aparelho (**Conversar**).
- Mensagens guardam quando foram **entregues** no aparelho ("enviando…" → "entregue" na tela do Líder).
- Tudo vai para a auditoria: `chamado.aberto`, `chamado.atendido`, `chamado.resolvido`, `chamado.cancelado`.

## Automações

| Quando | O quê | Marcador (evita repetir) |
|---|---|---|
| 15 min antes do prazo do empréstimo | Aviso "Devolução em N min" | `auto:lembrete:<empréstimo>` |
| Prazo vencido | Aviso **crítico** de atraso | `auto:atraso:<empréstimo>` |
| 20h ou domingo (espaço fechado) | **Bloquear** aparelhos livres cuja política tem *Travar fora do horário* (nunca celular, nunca aparelho emprestado) | `auto:fechamento:<data>` |
| 8h | **Desbloquear** — só o que a automação travou (bloqueio manual do Líder continua) | `auto:abertura:<data>` |

- As ações automáticas aparecem como **Sistema LabMaker** no histórico e na auditoria (`dispositivo.automacao`).
- Celular com o app fechado não faz check-in: para ele, o **agendador do servidor** (`lib/agendador.ts`, a cada minuto, ligado pelo `instrumentation.ts`) cria o lembrete/atraso e manda **Web Push**. Um índice único parcial no banco garante que check-in e agendador nunca criem o mesmo aviso duas vezes. `AGENDADOR=off` desliga.
- Para testar sem esperar as 20h: **Diagnóstico → Simular 20h / Simular 8h** (`POST /api/sistema/fechamento`).

## Celular: app instalável e notificações (PWA)

- `/agente` tem `manifest.webmanifest` e service worker (`public/sw.js`): em HTTPS, o navegador oferece **Adicionar à tela inicial** e abre direto no agente, em tela cheia.
- **Receber avisos com o app fechado:** a página pede permissão, assina o Web Push com a chave pública VAPID (`GET /api/agente/push`) e guarda a inscrição no aparelho (`POST /api/agente/push`). O servidor gera o par de chaves VAPID na primeira vez e guarda em `config_sistema` (ou use `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY`).
- Recebem push: avisos do Líder, mensagens do chat, "seu pedido está em atendimento", lembrete e atraso. Inscrição expirada (404/410 do serviço de push) é apagada sozinha.
- Exige **HTTPS** (túnel do `docs/CONECTIVIDADE.md`). Em HTTP o celular funciona igual, mas só com a página aberta.

## Segurança

- Token por computador, armazenado só como hash; token inválido → `401` e o agente para.
- Código de inscrição não serve para login e expira em 2 h.
- Comandos de sistema rodam com `execFile` e argumentos separados (sem shell), timeout curto e textos saneados.
- Itens de segurança que o sistema não deixa ler (ex.: antivírus no Linux) aparecem como **“não informado”** e não entram na nota de conformidade — o painel nunca afirma o que não mediu.
