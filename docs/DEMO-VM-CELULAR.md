# Demonstração com VM e celular — passo a passo

Objetivo no dia: mostrar, ao vivo, o Líder **vendo a tela de um computador** (uma máquina virtual no seu notebook) e mandando **avisos e bloqueio para o celular** de um colega.

Tempo de preparo: **~1 hora uma vez** (quase tudo é download e instalação). Depois, 2 minutos antes de cada ensaio.

```
 Seu notebook (o "servidor")                       Celular do colega
 ┌────────────────────────────────────────┐        ┌───────────────┐
 │  LabMaker  ← npm start (porta 3000)    │◀──Wi-Fi─│  /agente      │
 │     ▲                                  │        │  (navegador)  │
 │     │ 10.0.2.2:3000                    │        └───────────────┘
 │  ┌──┴───────────────────────────┐      │
 │  │ VM Linux Mint (VirtualBox)   │      │
 │  │  node agente.mjs  → tela,    │      │
 │  │  avisos, bloqueio            │      │
 │  └──────────────────────────────┘      │
 └────────────────────────────────────────┘
```

---

## 1. Seu notebook: o servidor

```bash
npm run db:reset          # espaço zerado (só o Líder)
npm run build
npm start                 # http://localhost:3000
```

Descubra o **IP do notebook na rede** (o celular vai usar):

- Windows: `ipconfig` → "Endereço IPv4" do Wi-Fi (ex.: `192.168.0.12`)
- macOS / Linux: `ipconfig getifaddr en0` / `hostname -I`

Na primeira vez, o Windows pergunta se o **Node.js** pode usar a rede: marque **Redes privadas** e permita.

> Login pela rede em `http://IP:3000` funciona: o cookie de sessão só exige HTTPS quando a conexão é HTTPS.

## 2. Montar o espaço (entre como Líder)

`lider@labmaker.dev` / `labmaker123`

1. **Laboratórios → Novo laboratório** — crie as áreas:
   `IMP-01 · Impressão 3D`, `COR-01 · Corte e Gravação`, `BAN-01 · Bancadas e Eletrônica`.
2. **Máquinas → Inventário e cadastro → Novo equipamento** — por exemplo:

   | Nome | Tipo | Área | Slot |
   |---|---|---|---|
   | Prusa MK4 #1 | Manufatura aditiva | IMP-01 | 60 min |
   | Bambu Lab X1 | Manufatura aditiva | IMP-01 | 60 min |
   | Laser CO₂ 60 W | Corte a laser | COR-01 | 30 min |
   | Silhouette Cameo 5 | Plotter de recorte | COR-01 | 30 min |

   - Sem **IP do gateway**, a máquina aparece como *sem conexão* (honesto: não há de onde ler). Com um IP preenchido (ex.: `10.40.1.21`), a central mostra a **telemetria simulada** do gateway — diga isso na banca.
   - Deixe "requer calibração" desligado, ou registre a calibração em **Calibração** logo depois (sem ela a máquina não aceita reserva).
3. **Notebooks → Adicionar aparelho → Cadastro manual** — 2 notebooks de empréstimo (`LM-NB-01`, `LM-NB-02`, com patrimônio).
4. **Contas:** em uma aba anônima, crie a conta de um aluno em `/cadastro`. Para um professor, crie a conta do mesmo jeito e, como Líder, mude o perfil em **Usuários**.
5. Teste: o aluno já consegue **reservar** a Prusa.

## Sem notebook e sem VM (servidor na nuvem)

Se você vai apresentar num **PC da faculdade**, onde não dá para instalar VirtualBox, faça assim:

1. Coloque o LabMaker online (Render + Supabase): [`DEPLOY.md`](DEPLOY.md). Ele ganha um endereço `https://…onrender.com`.
2. **PC da apresentação:** Chrome nesse endereço, entrando como Líder.
3. **PC do aluno = outro PC da sala**, só com o Chrome:
   - Líder: **Notebooks → Adicionar aparelho → Celular (QR code)** → copie o **link** (não precisa escanear).
   - No outro PC, abra o link, digite um nome (ex.: `Sala 07`, vira `PC-SALA-07`) → **Conectar**.
   - Escolha a política **Notebooks de empréstimo (alunos)** ao gerar o código se a banca for **antes das 8h ou depois das 20h** — a política das estações trava o aparelho sozinha fora do horário.
4. **O que funciona pelo navegador no computador:** pedir ajuda + chat, **ver a tela** (o Chrome pergunta qual tela compartilhar — escolha **Tela inteira**), avisos com confirmação de leitura e bloqueio (tela cheia por cima da página).
5. **Diferenças para o agente instalado:** o Chrome pergunta toda vez antes de compartilhar a tela; o bloqueio cobre só a página do agente — deixe o Chrome em **tela cheia (F11)** para ficar convincente; e ele não inicia sozinho com o computador. Diga isso na banca: *"pelo navegador, o sistema operacional não deixa travar o computador inteiro — por isso existe o agente instalado"*.
6. **Celular do amigo:** mesmo endereço HTTPS → app na tela inicial e push funcionando. Inscreve uma vez só.

Se só houver **um PC**, ele pode ser o Líder e o aluno ao mesmo tempo: abra o agente numa janela anônima e, ao compartilhar, escolha **uma janela** (ex.: o Paint) em vez da tela inteira, para a imagem não ficar se repetindo dentro dela mesma.

## 3. A VM (VirtualBox + Linux Mint)

Por que Linux Mint: é gratuito, leve, parece o Windows e usa X11 — a captura de tela funciona sem configurar nada.

1. Instale o **VirtualBox** (virtualbox.org) e baixe a ISO do **Linux Mint 22 Cinnamon** (linuxmint.com, ~3 GB).
2. VirtualBox → **Novo**: tipo Linux / Ubuntu (64-bit), **4 GB de RAM** (mínimo 3), **2 CPUs**, disco de **25 GB**. Desmarque a "instalação desassistida". Aponte para a ISO.
3. Inicie a VM e use **Instalar Linux Mint** (≈ 15 min). Usuário sugerido: `aluno`.
4. Rede: deixe em **NAT** (padrão). De dentro da VM, o seu notebook é o endereço **`10.0.2.2`**.
5. Na VM, abra o **Terminal** e rode:

```bash
sudo apt update && sudo apt install -y nodejs imagemagick zenity libnotify-bin
node -v                                    # precisa ser 18.15 ou mais
curl -o agente.mjs http://10.0.2.2:3000/api/agente/script
node agente.mjs --testar-captura           # deve dizer "✔ Captura funcionando"
```

6. No navegador do **seu notebook** (como Líder): **Notebooks → Adicionar aparelho → Computador / VM** → toque no atalho **VM do VirtualBox (10.0.2.2)** → **Gerar código** → copie o comando.
7. No terminal da VM, cole o comando e acrescente o nome e o bloqueio real:

```bash
node agente.mjs --servidor http://10.0.2.2:3000 --inscricao <CÓDIGO> --nome VM-MINT-01 --permitir-bloqueio
```

Em segundos `VM-MINT-01` aparece em Notebooks com o selo **real**, CPU e memória de verdade.

8. Faça o agente **iniciar sozinho** e ganhar o atalho de ajuda:

```bash
node agente.mjs --instalar-servico --permitir-bloqueio
```

Reinicie a VM: o agente abre sozinho num terminal, e na área de trabalho aparece **"Pedir ajuda ao Líder"**. (Se o Mint perguntar se confia no atalho, escolha **Confiar e executar**.) Para desfazer: `node agente.mjs --remover-servico`.

9. Quando tudo estiver funcionando: VirtualBox → **Máquina → Tirar snapshot** ("pronta para a banca"). Se algo der errado no dia, volte para ele.

> Windows na VM também funciona (o agente usa PowerShell para a tela e uma janela "Sim/Não" nativa), mas pede mais memória e disco.

## 4. O celular do colega

**Jeito simples (mesmo Wi-Fi):**

1. Celular e notebook na **mesma rede Wi-Fi** (no celular, desligue os dados móveis para não confundir).
2. Líder: **Notebooks → Adicionar aparelho → Celular (QR code)** → toque no atalho **Wi-Fi · 192.168…** (o LabMaker lista os IPs do seu notebook e já troca o `localhost` sozinho) → **Gerar QR code**.
3. O colega aponta a câmera, abre o link, digita o nome e toca em **Conectar**. Pronto: `CEL-NOME` aparece na lista.
4. Peça para ele deixar a página aberta.

Sem HTTPS, o celular recebe os avisos **na página** (tela cheia, vibração e som), mas não recebe notificação do sistema com a tela apagada.

**Jeito completo (HTTPS — notificação do sistema, funciona até no 4G):** um túnel gratuito da Cloudflare, sem cadastro:

```bash
# Windows
winget install --id Cloudflare.cloudflared
cloudflared tunnel --url http://localhost:3000
```

Ele mostra um endereço `https://xxxx.trycloudflare.com`. **Abra o LabMaker por esse endereço** (o login funciona normalmente) e gere o QR a partir dele — o QR já sai com o endereço HTTPS. No celular, toque em **Receber avisos com o app fechado** e, no menu do navegador, em **Adicionar à tela inicial**: o LabMaker vira um app com ícone, e avisos, lembrete de devolução e respostas do chat chegam como **notificação push** mesmo com o app fechado. O endereço muda toda vez que o túnel é reiniciado e depende de internet; feche o túnel depois da apresentação.

**O que o celular faz e o que não faz — diga isso na banca:**

| Pelo navegador | |
|---|---|
| Avisos com **confirmação de leitura** (o Líder vê "Lido pelo usuário") | ✔ |
| Bloqueio (tela cheia "Aparelho bloqueado" na página) | ✔ |
| Bateria e tipo de rede (com HTTPS, no Android) | ✔ |
| **Pedir ajuda** e conversar com o Líder (chat) | ✔ |
| Instalar como app e receber **push** com o app fechado (com HTTPS) | ✔ |
| Ver a tela do celular, instalar ou apagar apps, bloquear o aparelho inteiro | ✖ exige MDM (Android Enterprise / Apple Business Manager) |

## 5. Antes de começar: Diagnóstico

10 minutos antes, abra **Diagnóstico** (ícone de estetoscópio no topo, à direita). Ele confere e diz o que falta:

- banco respondendo · endereço (avisa se você abriu por `localhost`) · HTTPS
- laboratórios, máquinas e alunos cadastrados
- **VM online** com agente real · **celular conectado**
- política com fechamento automático · aparelhos com push
- lista os **IPs** do notebook (com botão copiar) e tem **Simular 20h / Simular 8h** para mostrar o fechamento automático na hora

## 6. Roteiro da demonstração (≈ 4 min)

Deixe lado a lado: o navegador como **Líder** e a janela da **VM**. O colega fica com o celular na mão.

0. **Pedir ajuda (o aluno começa):** na VM, dois cliques em **Pedir ajuda ao Líder** → "O Inkscape fecha ao exportar" → **Sim** (autoriza ver a tela). No navegador, o menu **Atendimento** ganha um selo e aparece um aviso "Novo pedido de ajuda".
   - Abra o pedido → **Atender** → escreva "Já vou olhar" → na VM abre a janela com a mensagem; responda por ela.
   - **Ver tela** → como o aluno já autorizou, a tela aparece **direto**, e na VM surge a janela fixa "Sua tela está sendo vista" com **Parar de compartilhar**.
   - **Encerrar**.
1. **Aviso:** em VM-MINT-01, ação **Alerta** — "O espaço fecha em 15 min". A notificação aparece na VM.
2. **Suporte remoto:** ação **Suporte remoto** com o motivo "Chamado #12 — não abre o Inkscape" → na VM abre a janela **Permitir / Recusar** → clique em **Permitir** → a tela da VM aparece **ao vivo** no navegador. Mexa em algo na VM e mostre que acompanha (1 quadro por segundo).
   - Frase: *"Só visualização, com autorização do usuário, no máximo 10 minutos, e tudo vai para a auditoria."*
   - Clique em **Encerrar** (ou o usuário aperta ENTER no terminal da VM).
3. **Bloqueio:** **Bloquear tela** → com `--permitir-bloqueio`, a VM trava de verdade.
4. **Celular:** **Enviar alerta** para `CEL-NOME` → o celular vibra e mostra o aviso → o colega toca **Entendi** → no LabMaker a ação vira **Lido pelo usuário**. Depois **Bloquear** e **Desbloquear**.
5. **Celular pede ajuda:** o colega toca **Pedir ajuda ao Líder**, escreve, e vocês conversam pela tela Atendimento.
6. **Fechamento automático:** Diagnóstico → **Simular 20h** → a VM trava sozinha (ação de "Sistema LabMaker"); **Simular 8h** destrava.
7. **Auditoria:** mostre as linhas "Pediu ajuda", "Tela compartilhada", "Tela encerrada", "Aviso", "Testou o fechamento"…

## 7. Problemas comuns

| Sintoma | Solução |
|---|---|
| VM: `curl: (7) Failed to connect to 10.0.2.2` | O `npm start` está rodando no notebook? A VM está em **NAT**? |
| `--testar-captura` falha no Linux | Instale `imagemagick`; na tela de login escolha a sessão **Xorg/Cinnamon** (Wayland bloqueia captura) |
| Não aparece a janela "Permitir" na VM | Instale `zenity`; sem ela, a pergunta aparece no terminal (responda `s`) |
| Tela ao vivo fica "Sem sinal" | A VM está suspensa ou o agente parou — veja o terminal da VM |
| Celular não abre o link | Mesmo Wi-Fi? IP certo (não `localhost`)? Firewall do Windows liberou o Node em rede privada? Rede da faculdade às vezes isola aparelhos: use o túnel HTTPS ou o roteador do seu celular |
| Celular "sem conexão" depois de um tempo | O navegador pausa páginas em segundo plano: deixe a página aberta e use **Manter a tela ligada** |
| Login falha ao abrir o LabMaker pelo IP | Atualize o projeto (o cookie `Secure` agora segue a conexão) |
| Janela "Pedir ajuda" não abre / acentos estranhos | Instale `zenity`. O agente já força UTF-8 para os diálogos |
| Celular não mostra "Receber avisos com o app fechado" | Precisa de **HTTPS** (túnel) — em HTTP o botão não aparece |
| Lembrete de devolução não chegou | Com a página do agente aberta chega no próximo check-in; fechada, só com push ativo (o agendador roda a cada minuto) |

