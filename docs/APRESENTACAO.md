# Roteiro da apresentação (≈ 12 minutos)

**Antes:** o LabMaker online ([`DEPLOY.md`](DEPLOY.md)) com o espaço já montado — **não zere o banco**. Na seção 2, mostre o que já foi cadastrado e crie **ao vivo só uma máquina nova**; na seção 3 o aluno reserva justamente ela. O "computador do aluno" é outro PC da sala com o agente pelo navegador (ou um notebook com o agente instalado). Sem internet: a demonstração em HTML tem as mesmas telas e regras (botão **Zerado / Com exemplos** embaixo).

**Slides de apoio** (7 telas, no Claude): abra com a capa e o problema, mostre a solução e vá para o sistema ao vivo; volte para arquitetura, números, decisões e o fechamento. **Enquanto você fala do problema, deixe o Modo TV (`/tv`) aberto** no projetor: o espaço "respirando" ao vivo chama atenção logo de cara.

## 1. O problema (40 s) — landing page
Reserva das impressoras e do laser em planilha; ninguém sabe se a impressão travou sem ir até a máquina; notebooks de empréstimo voltam com jogo instalado — ou não voltam. **Uma pessoa** (OED ou estagiário) cuida de tudo isso sozinha.

## 2. O Líder monta o espaço (3 min) — entrar como **Líder**
- Mostre o painel com o espaço já montado. Frase: *"o sistema não vem com dado inventado; tudo isso foi o Líder que cadastrou"*.
- **Ao vivo, só uma coisa nova:** **Máquinas → Inventário e cadastro → Novo equipamento** → ex.: Bambu Lab A1, slot de 60 min. Sem IP do gateway ela aparece *sem conexão* — não inventamos telemetria.
- (Se sobrar tempo) **Notebooks → Adicionar aparelho → Cadastro manual:** um notebook novo, com patrimônio. Já pode ser emprestado.

## 3. O aluno usa na hora (1,5 min) — outra aba anônima
- **Criar conta** → **Reservar** → a máquina que acabou de ser cadastrada já tem horários → confirmar.
- Volte ao Líder: **Notebooks → Empréstimos → Emprestar** `LM-NB-01` para o aluno até as 20h. Na aba do aluno, aparece o aviso *"Você está com o notebook LM-NB-01 — devolva até…"*.

## 4. PC do aluno e celular (3,5 min) — o momento "uau"
Preparo em [`DEMO-VM-CELULAR.md`](DEMO-VM-CELULAR.md) (seção "Sem notebook e sem VM"). 10 min antes, abra **Diagnóstico** e deixe tudo verde. O "PC do aluno" é outro PC da sala com o agente aberto no Chrome em **tela cheia (F11)**; o colega fica com o celular.
- **O aluno pede ajuda:** no PC do aluno, **Pedir ajuda ao Líder** → descreve. No LabMaker o menu **Atendimento** ganha um selo e aparece um aviso. **Atender** → chat → a resposta chega na hora no PC do aluno.
- **Ver tela** → o Chrome do aluno pergunta o que compartilhar → **Tela inteira** → a tela aparece **ao vivo** no LabMaker, e o PC do aluno mostra "Sua tela está sendo vista". Mexa no PC do aluno. **Encerrar.** Frase: *"sem autorização do aluno, ninguém vê nada — e fica registrado na auditoria"*.
- **Bloquear** o PC do aluno → a tela de bloqueio cobre tudo em 1 segundo. *"Pelo navegador eu travo a página; no agente instalado (`agente.mjs --permitir-bloqueio`) trava o computador de verdade, e se o aluno destravar com a senha dele, trava de novo até eu liberar."*
- **Alerta** para o celular → vibra (ou chega como notificação com o app fechado) → o colega toca **Entendi** → no LabMaker: *Lido pelo usuário*.
- **O celular pede ajuda** → conversem pelo Atendimento.
- **Fechamento automático** (só se a banca for entre 8h e 20h e o PC do aluno estiver numa política com *Travar fora do horário*): Diagnóstico → **Simular 20h** → o PC do aluno trava sozinho, registrado como *Sistema LabMaker*.

- **Modo TV** (`/tv`, tecla **F** para tela cheia): mostre como ficaria no monitor da recepção — o pedido de ajuda do celular aparece em "Atendimento" na hora. Frase: *"é uma tela pública, então o aluno aparece só como primeiro nome e inicial, e nenhum e-mail chega nela"*.

## 5. Contas, senhas e auditoria (1,5 min)
- **Usuários:** o aluno esqueceu a senha → **Redefinir senha** → senha temporária `xxx-xxx-xxx`. Na aba do aluno, a sessão cai na próxima ação.
- Frase: *"senha é hash bcrypt — nem eu, Líder, consigo ler; só redefinir"*.
- **Auditoria:** tudo o que foi feito nesta apresentação, com autor e horário. **Exportar CSV**.
- *"E quem fiscaliza o Líder?"* → o banco recusa `UPDATE`/`DELETE` na auditoria (gatilho da migration 0005). Nem ele apaga o rastro.

## 6. Por dentro (2,5 min) — tudo pelo navegador
No PC da faculdade não precisa de Node nem de VS Code: o código e os testes estão no **GitHub**.
- Aba **Actions** do repositório → a última execução do **CI** verde: tipos, 95 testes unitários, banco criado do zero, build, **115 verificações ponta a ponta** e **concorrência: 50 pedidos simultâneos no mesmo horário → 1 reserva, 49 recusas**. Frase: *"cada envio de código roda tudo isso sozinho contra um PostgreSQL de verdade"*.
- No código (GitHub): `app/api/emprestimos/route.ts` (3 linhas) → `controllers/emprestimo.controller.ts` → `lib/emprestimo.ts` (regra pura, testada) → `models/emprestimo.model.ts`. Isso é o MVC.
- `models/agendamento.model.ts` → `pg_advisory_xact_lock`: a trava que garante 1 reserva por horário.
- `/api-docs` no próprio LabMaker online → a API documentada e testável, gerada dos mesmos schemas Zod que validam as requisições.
- `render.yaml` + `Dockerfile`: o deploy. *"Cada push no GitHub publica a versão nova sozinho."*
- **Não rode `test:api` nem `test:concorrencia` contra o banco da apresentação**: eles criam usuários e reservas de teste no meio dos dados reais. O CI roda com um banco próprio.

## Perguntas prováveis

| Pergunta | Resposta curta |
|---|---|
| Por que só um perfil administra? | É a realidade do espaço: o OED ou estagiário é quem opera. O controle sobre ele é a auditoria imutável no banco, não um segundo administrador que ninguém usaria. |
| E se dois alunos reservarem ao mesmo tempo? | Transação com trava consultiva por máquina no PostgreSQL. O teste dispara 50 pedidos juntos: 1 passa, 49 recebem 409. |
| E se dois Líderes emprestarem o mesmo notebook juntos? | Índice único parcial no banco (`um empréstimo aberto por aparelho`): o segundo recebe 409, mesmo que a aplicação falhe. |
| Desativei um aluno, ele continua logado por 8 h? | Não. Versão da sessão no banco: cai na próxima requisição (está no teste automatizado). |
| E força bruta no login? | 5 falhas por e-mail ou 20 por IP em 15 min → 429. Contagem no banco, vale com vários servidores. |
| O agente é seguro? | Token próprio por computador, banco guarda só o hash, código de inscrição expira em 2 h, servidor nunca conecta no notebook (pull). |
| Consegue ver a webcam do aluno? | Não, de propósito (LGPD). Só a tela, no suporte remoto: o aluno autoriza numa janela, é só visualização, no máximo 10 min, e os quadros não são gravados. |
| E o celular, vocês controlam? | Pelo navegador: avisos com confirmação de leitura e bloqueio da página. Ver a tela ou controlar o celular inteiro exige MDM (Android Enterprise / Apple) — fora do escopo, de propósito. |
| Como o chat é em tempo real sem WebSocket? | O aparelho já faz check-in; com pedido aberto o servidor reduz o intervalo para 3 s e as mensagens viajam na resposta. A tela ao vivo usa Server-Sent Events. Nenhuma porta aberta no notebook do aluno. |
| E se o check-in e o agendador criarem o mesmo lembrete juntos? | Índice único parcial no banco (`acoes_automaticas_unicas`): o segundo recebe erro de unicidade e é ignorado. Está no teste ponta a ponta. |
| E se o aluno não devolver? | 1 minuto depois do prazo o aparelho começa a apitar (tela vermelha, sirene e vibração no celular; bipe no notebook) e só para quando eu registro a devolução no balcão. |
| E se um aparelho for trocado ou vendido? | Em **Notebooks → aparelho → Remover**: digito o nome para confirmar, ele sai da lista, o agente deixa de funcionar e o histórico continua na auditoria. |
| O celular recebe aviso com o app fechado? | Sim, com HTTPS: o agente vira app (PWA) e usa Web Push padrão (VAPID), sem serviço pago. O agendador do servidor manda o lembrete de devolução mesmo sem check-in. |
| A trava das 20h não atrapalha quem está com o notebook emprestado? | Não: a automação nunca trava aparelho emprestado nem celular, e às 8h destrava só o que ela mesma travou. |
| As máquinas são reais? | O agente dos notebooks é real. As máquinas usam um simulador com o mesmo formato do gateway real (`docs/CONECTIVIDADE.md`) — trocar o simulador não muda API nem telas. |
| Como vai para produção? | `docker compose up` (PostgreSQL + app, usuário sem privilégio, healthcheck) ou Vercel + Supabase. O CI roda tipos, testes, build e os testes ponta a ponta a cada push. |
| Por que Next.js para API? | Route Handlers + controllers próprios: a API é REST pura (o agente e o `/api-docs` a usam sem o front). Dá para extrair para outro servidor sem reescrever regras, que vivem em `lib/` e `controllers/`. |
