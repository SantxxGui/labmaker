# Notebooks e computadores do espaço

Como o Líder do espaço maker (OED ou Estagiário EMK) acompanha e controla os **notebooks de empréstimo**, as **estações ligadas às máquinas** e os **tablets** do espaço: avisos na tela, bloqueio, controle de downloads/USB/sites, aplicativos, suporte remoto e conformidade.

> **Estado atual:** banco, API, regras, permissões, auditoria e telas estão prontos. O **agente** que roda em cada aparelho é **simulado** (`lib/agente.ts`) com o mesmo formato de dados que um agente real ou um MDM entregaria. Trocar o simulador pela integração real não muda controllers, rotas nem telas.

## 1. Dá para fazer isso de verdade?

Sim — é o que fazem as ferramentas de **gestão de dispositivos / MDM** (Microsoft Intune, Google Admin, Jamf, Android Enterprise), que muitas faculdades já usam. O caminho é sempre o mesmo: **um agente instalado (ou um perfil de gerenciamento) em cada aparelho do espaço**, que conversa com o servidor.

```
 Notebook / estação / tablet do espaço             Servidor LabMaker
┌─────────────────────────────────────┐   HTTPS    ┌──────────────────────────────┐
│ Agente LabMaker (serviço do sistema)  │──────────▶│ check-in a cada ~30 s        │
│  · reporta CPU, memória, disco,     │  (saída)   │ API → controllers → RBAC     │
│    bateria, app em uso, segurança   │◀──────────│ fila de ações por aparelho   │
│  · aplica a política (USB, sites,   │  ações     │ auditoria de tudo            │
│    downloads, apps proibidos)       │  pendentes │ PostgreSQL                   │
│  · mostra alertas, bloqueia a tela  │            └──────────────────────────────┘
└─────────────────────────────────────┘                        ▲
                                                                │ painel do Líder (navegador)  
```

- **Quem inicia a conexão é o agente** (saída HTTPS). Não é preciso abrir porta nem saber o IP do aparelho: funciona no Wi-Fi da faculdade ou fora dela, se o aluno levar o notebook.
- O IP aparece no painel só como informação de inventário.
- Ações para aparelhos **offline ficam na fila** (`PENDENTE`) e são entregues no próximo check-in.

### Por sistema operacional

| Sistema | Como é gerenciado na prática | O que dá para fazer |
|---|---|---|
| Windows | Agente próprio (serviço) ou Intune / MDM CSP | Tudo: alertas, bloqueio, apps, USB, downloads, sites, BitLocker, suporte remoto |
| macOS | Perfil MDM (Apple Business Manager) + agente | Alertas, bloqueio, apps, FileVault, restrições; suporte remoto com permissão de gravação de tela |
| Linux | Agente próprio | Alertas, apps (apt/dnf), USB (udev), firewall, suporte remoto |
| Android | Android Enterprise (perfil de trabalho ou dispositivo dedicado/quiosque) | Alertas, bloqueio, apps, quiosque, apagar dados corporativos |
| iOS / iPadOS | MDM Apple (dispositivo supervisionado) | Bloqueio, apps, restrições, apagar; alertas via app corporativo |

## 2. O que o módulo faz

| Recurso | Onde | Regras |
|---|---|---|
| Inventário e estado ao vivo | `/dispositivos` | CPU, memória, disco, bateria, rede, usuário na sessão, app em primeiro plano |
| **Aviso em massa** | botão *Enviar alerta* | Para todos, uma área ou selecionados (ex.: "o espaço fecha em 15 minutos"); prioridade informativa/importante/crítica; **confirmação de leitura** volta para o Líder |
| Bloquear / desbloquear | página do dispositivo | Tela travada com mensagem da equipe (notebook não devolvido, perdido, uso indevido) |
| Controle de downloads | `/dispositivos/politicas` | Livre · bloquear executáveis (`.exe`, `.msi`, `.dmg`, `.apk`…) · somente catálogo aprovado |
| Pendrive (USB) | políticas | Bloqueado ou liberado por grupo |
| Sites | políticas | Categorias: jogos, torrent, streaming, redes sociais, apostas, armazenamento pessoal, IA pública sem contrato |
| Aplicativos | página do dispositivo + políticas | Instala só do **catálogo aprovado** (PrusaSlicer, Bambu Studio, LightBurn, Inkscape, Silhouette Studio, Fusion 360, Arduino IDE…); remove; apps proibidos (Steam, jogos) não executam nem instalam |
| Suporte remoto | página do dispositivo | Exige aparelho online, **chamado/motivo** e **autorização do usuário**; faixa visível durante a sessão |
| Apagar dados | página do dispositivo (só Administrador) | Justificativa ≥ 10 caracteres e digitar o nome exato do aparelho |
| Conformidade | lista e página | Política aplicada, criptografia, antivírus, firewall, atualizações (≤ 2 pendentes), agente atualizado, check-in em 7 dias |
| Eventos | lista e página | Download/USB/site/app bloqueados, conformidade, bloqueios — reportados pelo agente |

## 3. Privacidade e LGPD — o que o sistema **não** faz, de propósito

- **Não liga a webcam nem o microfone** dos notebooks. Acessar a câmera de alguém sem conhecimento é invasão de privacidade (LGPD) e pode configurar crime (Lei 12.737/2012). As câmeras do sistema são só as **câmeras apontadas para as máquinas** (ver `CONECTIVIDADE.md`).
- **Não transmite a tela em segredo.** A tela só é vista numa sessão de suporte remoto **autorizada pelo usuário**, com aviso permanente e botão para encerrar.
- **Não lê conteúdo** de arquivos, e-mails ou mensagens: o agente reporta metadados de segurança (nome do arquivo bloqueado, categoria do site), não o conteúdo.
- Notebook pessoal do aluno **não** é gerenciado: o sistema cobre só os aparelhos do espaço.
- O empréstimo deve ter um **termo de uso** informando o que é monitorado. Toda ação da equipe fica na auditoria com autor, horário e justificativa.

## 4. Fila de ações (como a confirmação funciona)

```
PENDENTE ──(agente faz check-in)──▶ ENTREGUE ──(executa / usuário confirma leitura)──▶ EXECUTADA
    │                                                                         │
    └── aparelho offline: continua na fila                     usuário recusa suporte remoto ──▶ RECUSADA
```

No simulador (`statusEfetivo()`), a entrega leva ~1–2 s e a execução alguns segundos; parte dos usuários nunca confirma a leitura de um alerta, como na vida real.

## 5. API

| Método | Rota | Permissão |
|---|---|---|
| GET | `/api/dispositivos` | `dispositivo:ver` |
| GET | `/api/dispositivos/:id` | `dispositivo:ver` |
| POST | `/api/dispositivos/:id/acoes` | `dispositivo:comandar` (apagar: `dispositivo:apagar`) |
| GET / POST | `/api/dispositivos/alertas` | ver / `dispositivo:comandar` |
| GET | `/api/dispositivos/eventos` | `dispositivo:ver` |
| GET | `/api/politicas` | `dispositivo:ver` |
| PATCH | `/api/politicas/:id` | `dispositivo:politicas` |

Perfis: o **Líder (OED / Estagiário EMK)** faz tudo — cadastra aparelhos, edita políticas, empresta, envia ações e apaga dados; **Professor(a)** vê e envia avisos e ações; **Aluno(a)** não acessa (vê só o notebook que está com ele, na tela de reservas).

## 5.1 Cadastro dos aparelhos

O sistema nasce sem aparelhos. O Líder adiciona cada um de dois jeitos (**Notebooks → Adicionar aparelho**):

- **Cadastro manual** (nome/etiqueta, patrimônio, fabricante, modelo, política, área): o aparelho entra na hora na lista de empréstimos, marcado como *sem agente* — não conta como "fora da política", porque não há dado para avaliar.
- **Com agente**: gera um código e o computador se inscreve sozinho ([`AGENTE.md`](AGENTE.md)). Com `--nome LM-NB-01`, o agente **assume o cadastro manual** já existente.

## 5.2 Empréstimos

| Regra (`lib/emprestimo.ts`, testada) | |
|---|---|
| Um aparelho por aluno, com conta ativa | Senão `409` |
| Estação fixa (desktop), aparelho bloqueado ou desativado não sai | `409` com o motivo |
| Prazo entre 15 min e 7 dias | Padrão no diálogo: fechamento do espaço (20h) ou 4 h |
| Um empréstimo aberto por aparelho | Também garantido no banco (índice único parcial) |

Emprestar marca o aluno como responsável pelo aparelho (aparece no painel); devolver limpa. Atrasados ficam em vermelho no cartão de empréstimos e no aviso do aluno. Tudo vai para a auditoria (`emprestimo.criado`, `emprestimo.devolvido`, *com atraso* quando for o caso).

## 6. Do simulador para a integração real

1. **Agente próprio — já existe:** `agente/agente.mjs` faz `POST /api/agente/checkin` a cada 15 s com token próprio, envia telemetria e eventos e recebe as ações pendentes ([`AGENTE.md`](AGENTE.md)). Próximo passo: empacotar como serviço do Windows (para rodar sem terminal aberto) e autenticar por certificado.
2. **Ou integrar o MDM da faculdade:** se o TI já usa Intune ou Google Admin, o LabMaker chama a API dele (Microsoft Graph, Admin SDK) em vez de falar com um agente próprio — os controllers continuam iguais.
3. Filtro de sites: DNS da faculdade (categorias no firewall/proxy) ou extensão de navegador gerenciada.
4. Suporte remoto: componente de acesso remoto com consentimento (ex.: Quick Assist, RustDesk self-hosted) acionado pela ação `SESSAO_REMOTA`.

## 7. Onde está no código

| Camada | Arquivo |
|---|---|
| Regras, simulador do agente, conformidade, fila | `lib/agente.ts` · `lib/dispositivo-dto.ts` |
| Banco | `prisma/schema.prisma` (`Dispositivo`, `PoliticaDispositivo`, `AcaoDispositivo`, `EventoDispositivo`) · `prisma/migrations/0003_dispositivos` |
| Model | `models/dispositivo.model.ts` · `models/agente.model.ts` · `models/emprestimo.model.ts` |
| Controller | `controllers/dispositivo.controller.ts` · `controllers/agente.controller.ts` · `controllers/emprestimo.controller.ts` |
| Rotas | `app/api/dispositivos/**` · `app/api/politicas/**` · `app/api/agente/**` · `app/api/emprestimos/**` |
| Telas | `views/dispositivos/*` |
| Testes | `tests/agente.test.ts` · `tests/emprestimo.test.ts` · `scripts/teste-api.ts` |
