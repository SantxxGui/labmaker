# API REST

> Gerado por `npm run docs:api` a partir de `lib/openapi.ts`. Versão navegável e testável em **`/api-docs`**; especificação OpenAPI 3.1 em **`/api/openapi.json`**.

**72 operações.** JSON em UTF-8. Erros sempre como `{ "error": "mensagem em português" }`.

| Código | Quando |
|---|---|
| 401 | Sem sessão (ou sessão revogada: conta bloqueada, perfil ou senha alterados) |
| 403 | Perfil sem a permissão |
| 404 | Registro não encontrado |
| 409 | Conflito: horário ocupado, aparelho já emprestado, duplicidade |
| 422 | Dados inválidos (Zod) ou regra de negócio violada |
| 429 | Muitas tentativas de login |

Autenticação: cookie `labops_session` (JWT httpOnly) obtido em `POST /api/auth/login`. O agente usa `Authorization: Bearer lmk_…`.

## Autenticação

| Método | Rota | O que faz | Acesso |
|---|---|---|---|
| `POST` | `/api/auth/login` | Entrar (gera cookie de sessão httpOnly) | público |
| `POST` | `/api/auth/cadastro` | Criar conta de aluno | público |
| `POST` | `/api/auth/logout` | Sair (apaga o cookie) | logado |
| `GET` | `/api/auth/me` | Usuário da sessão atual | logado |
| `GET` | `/api/auth/perfil` | Meu perfil: dados da própria conta | logado |
| `PATCH` | `/api/auth/perfil` | Mudar o próprio nome (aparece na hora, sem novo login) | logado |
| `POST` | `/api/auth/senha` | Trocar a própria senha: pede a atual, conta erro no limite do login, derruba as outras sessões | logado |

## Reservas

| Método | Rota | O que faz | Acesso |
|---|---|---|---|
| `GET` | `/api/equipamentos/{id}/disponibilidade` | Horários livres de um dia | logado |
| `GET` | `/api/agendamentos` | Reservas (minhas, ou todas para a equipe) | logado |
| `POST` | `/api/agendamentos` | Reservar horário (trava consultiva no PostgreSQL contra reserva dupla) | `reserva:criar` |
| `DELETE` | `/api/agendamentos/{id}` | Cancelar reserva | logado |

## Máquinas

| Método | Rota | O que faz | Acesso |
|---|---|---|---|
| `GET` | `/api/equipamentos` | Listar máquinas | `equipamento:ver` |
| `POST` | `/api/equipamentos` | Cadastrar máquina | `equipamento:gerenciar` |
| `PATCH` | `/api/equipamentos/{id}` | Alterar máquina / status | `equipamento:gerenciar` |
| `DELETE` | `/api/equipamentos/{id}` | Desativar máquina (soft delete) | `equipamento:gerenciar` |
| `GET` | `/api/equipamentos/{id}/telemetria` | Leitura ao vivo de uma máquina | logado |
| `GET` | `/api/equipamentos/{id}/alarmes` | Alarmes da máquina | logado |
| `GET` | `/api/equipamentos/{id}/comandos` | Histórico de comandos remotos | logado |
| `POST` | `/api/equipamentos/{id}/comandos` | Pausar / retomar / parar ciclo / reconhecer alarmes | `maquina:comandar` |
| `GET` | `/api/maquinas/telemetria` | Leitura de todas as máquinas (chão do espaço) | logado |
| `GET` | `/api/alarmes` | Alarmes ativos | logado |
| `GET` | `/api/manutencoes` | Manutenções e calibrações | logado |
| `POST` | `/api/manutencoes` | Registrar manutenção/calibração | `manutencao:registrar` |

## Espaço

| Método | Rota | O que faz | Acesso |
|---|---|---|---|
| `GET` | `/api/laboratorios` | Áreas do espaço maker | logado |
| `POST` | `/api/laboratorios` | Criar área | `laboratorio:gerenciar` |

## Notebooks

| Método | Rota | O que faz | Acesso |
|---|---|---|---|
| `GET` | `/api/dispositivos` | Notebooks, estações e tablets com leitura ao vivo | `dispositivo:ver` |
| `POST` | `/api/dispositivos` | Cadastrar aparelho manualmente (sem agente) | `dispositivo:cadastrar` |
| `GET` | `/api/dispositivos/{id}` | Detalhe, ações e eventos de um aparelho | `dispositivo:ver` |
| `DELETE` | `/api/dispositivos/{id}` | Remover aparelho do LabMaker (digitar o nome para confirmar; o agente deixa de valer) | `dispositivo:cadastrar` |
| `POST` | `/api/dispositivos/{id}/acoes` | Enviar ação remota (fila → entregue → executada) | `dispositivo:comandar` |
| `GET` | `/api/dispositivos/alertas` | Alertas em massa e confirmações de leitura | `dispositivo:ver` |
| `POST` | `/api/dispositivos/alertas` | Enviar alerta para todos / uma área / selecionados | `dispositivo:comandar` |
| `GET` | `/api/dispositivos/eventos` | Eventos recentes reportados pelos agentes | `dispositivo:ver` |
| `GET` | `/api/dispositivos/{id}/tela` | Suporte remoto: último pedido e sessão de tela ao vivo | `dispositivo:comandar` |
| `GET` | `/api/dispositivos/{id}/tela/imagem` | Último quadro da tela compartilhada (JPEG/PNG) | `dispositivo:comandar` |
| `POST` | `/api/dispositivos/{id}/tela/encerrar` | Encerrar o compartilhamento de tela | `dispositivo:comandar` |
| `GET` | `/api/dispositivos/{id}/tela/eventos` | Tela ao vivo por Server-Sent Events (estado, quadro, início, fim; pulso a cada 15 s) | `dispositivo:comandar` |
| `GET` | `/api/politicas` | Políticas de uso | `dispositivo:ver` |
| `PATCH` | `/api/politicas/{id}` | Alterar política (downloads, USB, sites, apps) | `dispositivo:politicas` |

## Empréstimos

| Método | Rota | O que faz | Acesso |
|---|---|---|---|
| `GET` | `/api/emprestimos` | Empréstimos abertos (ou todos) | `dispositivo:ver` |
| `POST` | `/api/emprestimos` | Emprestar notebook a um aluno | `emprestimo:gerenciar` |
| `POST` | `/api/emprestimos/{id}/devolver` | Registrar devolução | `emprestimo:gerenciar` |
| `GET` | `/api/emprestimos/meus` | O aparelho que está com o usuário logado | logado |

## Agente

| Método | Rota | O que faz | Acesso |
|---|---|---|---|
| `POST` | `/api/dispositivos/inscricao` | Gerar código de inscrição (válido 2 h) | `dispositivo:cadastrar` |
| `POST` | `/api/agente/inscrever` | Agente troca o código por um token próprio (lmk_…) | público |
| `POST` | `/api/agente/checkin` | Check-in a cada 15 s: envia telemetria/eventos/resultados, recebe ações | token do agente |
| `GET` | `/api/agente/script` | Baixar o agente (agente.mjs) para instalar num computador ou VM | público |
| `GET` | `/i/{codigo}` | Instalação em um comando: script PowerShell (`irm … \| iex`) ou sh (`curl … \| sh`) conforme quem pede; 5 códigos errados por IP → 15 min de espera | público |
| `POST` | `/api/agente/chamados` | Pedir ajuda ao Líder (abre um chamado; um por aparelho) | token do agente |
| `POST` | `/api/agente/chamados/mensagem` | Responder no chat do chamado aberto | token do agente |
| `POST` | `/api/agente/chamados/cancelar` | Cancelar o próprio pedido de ajuda (resolveu sozinho) | token do agente |
| `GET` | `/api/agente/push` | Chave pública VAPID para a inscrição Web Push | público |
| `POST` | `/api/agente/push` | Salvar (ou apagar com null) a inscrição Web Push do aparelho | token do agente |
| `POST` | `/api/agente/tela` | Envia um quadro da tela depois que o usuário autorizou o suporte remoto (ou fim: true) | token do agente |

## Atendimento

| Método | Rota | O que faz | Acesso |
|---|---|---|---|
| `POST` | `/api/dispositivos/{id}/atendimento` | Líder inicia uma conversa com o aparelho (abre um chamado já em atendimento) | `dispositivo:comandar` |
| `GET` | `/api/chamados` | Fila de pedidos de ajuda (abertos primeiro, depois os últimos encerrados) | `dispositivo:comandar` |
| `GET` | `/api/chamados/contagem` | Quantos pedidos esperam atendimento (selo do menu) | `dispositivo:comandar` |
| `GET` | `/api/chamados/{id}` | Chamado com a conversa completa | `dispositivo:comandar` |
| `POST` | `/api/chamados/{id}/atender` | Assumir o atendimento | `dispositivo:comandar` |
| `POST` | `/api/chamados/{id}/resolver` | Encerrar o atendimento | `dispositivo:comandar` |
| `POST` | `/api/chamados/{id}/mensagens` | Mandar mensagem ao aparelho (chega no próximo check-in e por push) | `dispositivo:comandar` |
| `POST` | `/api/chamados/{id}/tela` | Ver a tela do aluno — sem nova pergunta se ele autorizou ao pedir ajuda | `dispositivo:comandar` |

## Sistema

| Método | Rota | O que faz | Acesso |
|---|---|---|---|
| `GET` | `/api/tv` | Modo TV: estado do espaço para o monitor da recepção (máquinas, reservas, aparelhos, atendimento) — sem e-mails, aluno como "Bruna S." | `painel:ver` |
| `GET` | `/api/sistema/enderecos` | IPs desta máquina na rede (atalhos para o QR e o comando do agente) | `dispositivo:cadastrar` |
| `GET` | `/api/sistema/diagnostico` | Checklist da pré-apresentação: banco, conexão, espaço, agentes, atendimento, push | `dispositivo:cadastrar` |
| `POST` | `/api/sistema/fechamento` | Testar agora o fechamento (fechar) ou a abertura (abrir) automática do espaço | `dispositivo:politicas` |

## Administração

| Método | Rota | O que faz | Acesso |
|---|---|---|---|
| `GET` | `/api/usuarios` | Listar usuários | `usuario:gerenciar` |
| `PATCH` | `/api/usuarios/{id}` | Mudar perfil / bloquear conta (derruba as sessões abertas) | `usuario:gerenciar` |
| `POST` | `/api/usuarios/{id}/senha` | Redefinir senha (gera senha temporária e encerra as sessões) | `usuario:gerenciar` |
| `GET` | `/api/painel` | Indicadores do painel | `painel:ver` |
| `GET` | `/api/auditoria` | Trilha de auditoria paginada | `auditoria:ver` |
| `GET` | `/api/auditoria/exportar` | Exportar auditoria em CSV | `auditoria:ver` |
| `GET` | `/api/health` | Saúde da aplicação e do banco | público |

## Testando pelo terminal

```bash
B=http://localhost:3000
curl -c c.txt -X POST $B/api/auth/login -H 'Content-Type: application/json' -d '{"email":"lider@labmaker.dev","senha":"labmaker123"}'
curl -b c.txt $B/api/equipamentos
npm run test:api           # 125 verificações ponta a ponta
npm run test:concorrencia  # 50 pedidos simultâneos → 1 reserva
```
