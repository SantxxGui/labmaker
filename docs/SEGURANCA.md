# Segurança

## Autenticação

- Senhas com **bcrypt** (custo 10). O banco guarda só o hash: **ninguém consegue ler a senha de ninguém — nem o Líder**. Quando um aluno esquece, o Líder **redefine**: o sistema gera uma senha temporária (ex.: `mk7-qx4-tr9`, sem caracteres ambíguos), mostra uma única vez e encerra as sessões abertas daquela conta.
- Sessão em **JWT HS256** assinado com `AUTH_SECRET`, em cookie `httpOnly` e `SameSite=Lax`. O atributo `Secure` acompanha a conexão: ligado sempre que a requisição é HTTPS (inclusive atrás de proxy/túnel, via `X-Forwarded-Proto`) ou com `COOKIE_SECURE=true`; desligado em `http://IP:3000` na rede local, onde o navegador recusaria o cookie. Validade de 8 h. Em produção o app recusa iniciar sem um `AUTH_SECRET` de 32+ caracteres.
- **Revogação imediata:** o JWT carrega a versão da sessão (`v`). A cada requisição o servidor confere no banco se a conta está ativa e se a versão bate (`usuarios.sessao_versao`). Bloquear a conta, trocar o perfil ou redefinir a senha incrementa a versão — quem estava logado cai **na próxima requisição**, não em 8 h. O perfil usado nas permissões vem do banco, não do token.
- **Limite de tentativas** (`lib/limite-login.ts`, tabela `tentativas_login`): 5 falhas para o mesmo e-mail **ou** 20 falhas do mesmo IP em 15 min → `429` com o tempo de espera. Vale mesmo com a senha certa durante o bloqueio. Como a contagem fica no banco, funciona com várias instâncias do servidor.
- Login com tempo de resposta uniforme (compara contra um hash fixo quando o e-mail não existe) e mensagem única para e-mail ou senha errados — não revela quais e-mails existem.

## Autorização (RBAC) — três perfis

Matriz em `lib/permissions.ts` (a mesma que a API, as páginas e o menu consultam):

| Permissão | Líder (OED / Estagiário EMK) | Professor(a) | Aluno(a) |
|---|:-:|:-:|:-:|
| `painel:ver` | ● | ● | |
| `reserva:criar` | ● | ● | ● |
| `reserva:ver_todas` · `reserva:cancelar_qualquer` | ● | ● | |
| `equipamento:ver` | ● | ● | ● |
| `equipamento:gerenciar` · `equipamento:alterar_status` | ● | | |
| `manutencao:ver` | ● | ● | |
| `manutencao:registrar` | ● | | |
| `maquina:monitorar` · `maquina:comandar` | ● | ● | |
| `dispositivo:ver` · `dispositivo:comandar` | ● | ● | |
| `dispositivo:cadastrar` · `dispositivo:politicas` · `dispositivo:apagar` | ● | | |
| `emprestimo:gerenciar` | ● | | |
| `laboratorio:gerenciar` | ● | | |
| `usuario:gerenciar` (contas, perfis, senhas) | ● | | |
| `auditoria:ver` (e exportar CSV) | ● | | |

Verificação em três níveis: `proxy.ts` (navegação), `requirePageSession` (cada página) e `autorizar` (cada rota da API). A interface só reflete as permissões — esconder um botão nunca é a proteção.

**Quem fiscaliza o Líder?** A trilha de auditoria é **imutável no próprio PostgreSQL** (abaixo): o Líder lê tudo, mas não consegue apagar nem alterar o que fez. E o sistema nunca fica sem Líder: desativar ou rebaixar o último Líder ativo é recusado.

## Auditoria imutável

- Login, cadastro, bloqueio por tentativas, reservas, cancelamentos, cadastros de máquina/área/aparelho, calibrações, comandos às máquinas, ações nos notebooks, empréstimos, devoluções, alterações de usuário, redefinição de senha e exportação da própria auditoria geram registro com autor, perfil, data/hora, entidade, resumo e IP.
- Migration 0005: função `auditoria_imutavel()` + gatilho `BEFORE UPDATE OR DELETE` → o banco recusa qualquer alteração, **mesmo vinda da aplicação ou de alguém com acesso direto ao SQL pelo usuário da aplicação**. Única exceção: a transação do seed liga uma chave de manutenção local (`set_config('labmaker.manutencao','on', true)`) para recriar o banco de demonstração.
- Exportação CSV (UTF-8 com BOM, `;`) com proteção contra **injeção de fórmula** no Excel (células que começam com `= + - @` recebem `'`).

## Cabeçalhos HTTP (next.config.ts)

`Content-Security-Policy` (só recursos do próprio domínio; `unsafe-eval` só em desenvolvimento) · `X-Frame-Options: DENY` e `frame-ancestors 'none'` (clickjacking) · `X-Content-Type-Options: nosniff` · `Referrer-Policy` · `Permissions-Policy` (sem câmera, microfone, localização) · `Cross-Origin-Opener-Policy` · `Strict-Transport-Security` em produção · sem `X-Powered-By`.

## Agente dos notebooks

- Inscrição por **código de uso único na prática** (JWT de 2 h com finalidade `inscricao-agente` — não serve para logar).
- Cada computador recebe um token próprio `lmk_…`; o banco guarda **só o SHA-256** do token. Vazou o banco? Os tokens não vazam.
- O agente de demonstração **nunca reinicia nem apaga** o computador; bloqueio real só com `--permitir-bloqueio`.
- `--instalar-servico` instala **no nível do usuário** (autostart / pasta Inicializar / LaunchAgent): não pede administrador e se desfaz com `--remover-servico`.
- Pedidos de ajuda e mensagens são autenticados pelo token do próprio aparelho: um aparelho só lê e escreve no **seu** chamado. Descrição e mensagens têm limite de tamanho no Zod **e** no banco (`CHECK`).
- Web Push: o servidor guarda só a inscrição (endpoint + chaves públicas do navegador); o conteúdo da notificação é cifrado ponta a ponta pelo protocolo (RFC 8291). Chave privada VAPID fica no banco ou no `.env`, nunca no navegador.

## Máquinas e rede industrial

- O navegador nunca fala com o IP de uma máquina; tudo passa pela API e, em produção, por um gateway na rede das máquinas ([`CONECTIVIDADE.md`](CONECTIVIDADE.md)).
- A URL da câmera não sai do servidor: o DTO expõe apenas `temCamera`.
- Comandos são revalidados no servidor contra o estado real (`avaliarComando`). Partida de ciclo e parada de emergência não existem como comando remoto (NR-12). Máquina sem IP do gateway aparece como *sem conexão* — o sistema não inventa telemetria.

## Notebooks e privacidade (LGPD)

- O sistema **não liga webcam nem microfone**. A tela só é vista no **suporte remoto**: exige motivo registrado, **autorização do usuário numa janela no próprio computador** (ou dada por ele mesmo ao pedir ajuda, valendo só para aquele atendimento), mostra uma **janela fixa com o botão "Parar de compartilhar"** durante toda a sessão, é **só visualização** (sem mouse/teclado), dura no máximo 10 min, pode ser encerrada pelos dois lados, e os quadros ficam só na memória do servidor — nunca no banco. Início e fim vão para a auditoria.
- O agente reporta metadados (nome do arquivo bloqueado, categoria do site), nunca conteúdo.
- O espaço deve ter um **termo de uso** dos notebooks informando o que é monitorado.

## Validação de entrada

Todo corpo de requisição passa por um schema Zod (`lib/validators.ts`) → `422` com a mensagem em português. Banco via Prisma, consultas parametrizadas.

## Automações

- Ações automáticas (lembrete, atraso, trava às 20h) são registradas como **Sistema LabMaker** — com `usuario_id` nulo e linha na auditoria —, então nunca parecem ter sido feitas por uma pessoa.
- A abertura das 8h destrava **só o que a automação travou**: um bloqueio manual do Líder continua valendo.
- Celular nunca é travado pela automação, nem aparelho emprestado (o aluno pode estar usando fora do espaço).

## Limitações conhecidas (e o próximo passo)

- A senha temporária não obriga a troca no primeiro acesso (próximo passo: flag `deve_trocar_senha`).
- Não há recuperação de senha por e-mail — por decisão: no espaço maker o Líder está no balcão e redefine na hora.
- Segundo fator (TOTP) para o Líder seria o próximo reforço, já que a conta dele concentra todos os poderes.
- A sessão de tela e o agendador vivem na memória de **um** servidor. Com várias instâncias, a tela passaria por Redis/WebRTC e o agendador por um job único (fila ou cron do banco) — o índice único das automações já impede duplicidade.
