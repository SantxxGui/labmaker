# Colocar o LabMaker na internet (Render + Supabase)

Com o LabMaker online, a apresentação não depende de notebook nem de VM: **qualquer PC com Chrome** abre o sistema, o "computador do aluno" é outro PC da sala com o agente pelo navegador, e o celular recebe **notificações push** (o endereço já é HTTPS e não muda).

Tudo é grátis. Tempo: ~40 min na primeira vez (a maior parte é esperar o build).

```
PC da apresentação (Chrome) ──┐
PC do aluno (Chrome, /agente) ─┼──HTTPS──▶ Render (LabMaker, Docker) ──▶ Supabase (PostgreSQL)
Celular do amigo (app/PWA) ────┘
```

---

## 1. Supabase — o banco

1. Entre em **supabase.com** e abra o seu projeto (ou crie um: região **South America (São Paulo)**).
2. **Connect → Connection string → Session pooler**. Copie a URL e troque `[YOUR-PASSWORD]` pela senha do banco (sem os colchetes).
3. **Se o banco já tiver tabelas de versões antigas do LabMaker**, zere uma vez pelo seu PC (apaga tudo e cria as 18 tabelas):

```bash
# no .env do seu PC, DATABASE_URL = a URL do passo 2
npm install
npm run db:reset
```

Banco vazio não precisa disso: o servidor prepara sozinho no primeiro start.

## 2. GitHub — o código

1. Instale o **Git** e crie um repositório **privado** em github.com (ex.: `labmaker`).
2. Na pasta do projeto:

```bash
git init
git add .
git commit -m "LabMaker v8"
git branch -M main
git remote add origin https://github.com/SEU-USUARIO/labmaker.git
git push -u origin main
```

O `.gitignore` já deixa o `.env` de fora — **nunca suba a senha do banco**.

## 3. Render — o servidor

1. Entre em **render.com** com a conta do GitHub.
2. **New → Blueprint** → escolha o repositório `labmaker`. O Render lê o `render.yaml` da raiz.
3. Preencha o que ele pedir:
   - `DATABASE_URL` → a URL do Supabase (passo 1)
   - `LIDER_SENHA` → a senha do Líder (vale só se o banco estiver vazio no primeiro start)
   - `AUTH_SECRET` → gerado sozinho
4. **Apply**. O primeiro build leva uns 5–10 minutos. No log aparece `✔ Banco já preparado` ou `→ Banco vazio: aplicando migrations…`.
5. Abra `https://labmaker-xxxx.onrender.com` (o endereço aparece no topo do serviço) e entre como Líder.
6. **Diagnóstico** (estetoscópio): banco, HTTPS e endereço em verde.

A cada `git push`, o Render publica a versão nova sozinho.

## 4. O que muda com o servidor na nuvem

| Antes (notebook) | Agora (Render) |
|---|---|
| `http://192.168…:3000`, muda com a rede | `https://labmaker-xxxx.onrender.com`, fixo |
| Túnel da Cloudflare para ter HTTPS | HTTPS automático |
| Reinscrever o celular quando o endereço muda | Inscreve uma vez só |
| VM no notebook | Outro PC da sala com o agente pelo navegador (`docs/DEMO-VM-CELULAR.md`, seção "Sem VM") |

## 5. Cuidados do plano grátis

- **O Render dorme** depois de 15 minutos sem acesso e leva cerca de 1 minuto para acordar. Abra o site **5 minutos antes** de apresentar. Durante a apresentação ele não dorme: os aparelhos fazem check-in o tempo todo.
- **O Supabase pausa** projetos grátis sem atividade por 7 dias. Use nos ensaios e confira o painel na véspera.
- A tela ao vivo e o agendador ficam na memória do servidor: se o Render reiniciar (deploy novo), uma sessão de tela aberta termina — é só pedir de novo.
- Primeiro acesso depois de um deploy: o servidor gera as chaves do push e grava no banco. Não precisa configurar nada.

## Problemas comuns

| Sintoma | Causa provável |
|---|---|
| Build falha em `prisma generate` | Rode `npm install` no seu PC e confira se o `package-lock.json` foi para o GitHub |
| Deploy fica em "Timed out" na health check | `DATABASE_URL` errada: confira a senha e se é o **Session pooler** (porta 5432) |
| Login volta para a tela de entrada | Abra pelo endereço `https://` (o cookie de sessão é seguro em HTTPS) |
| Página "Application loading" por 1 minuto | O serviço grátis estava dormindo — normal, espere |
