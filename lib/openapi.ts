/**
 * Especificação OpenAPI 3.1 da API do LabMaker.
 * Os corpos de requisição são gerados dos MESMOS schemas Zod que validam a API (lib/validators.ts),
 * então a documentação não tem como divergir do que o servidor aceita.
 */
import { z } from "zod";
import * as v from "@/lib/validators";

type Metodo = "get" | "post" | "patch" | "delete";
type Op = {
  tag: string; resumo: string; perm?: string; publico?: boolean; agente?: boolean;
  corpo?: z.ZodType; query?: Record<string, string>; respostas?: Record<number, string>;
};

const esquema = (s: z.ZodType) => z.toJSONSchema(s, { io: "input", unrepresentable: "any" }) as Record<string, unknown>;

/** [método, caminho, operação] — a mesma lista vira a página /api-docs. */
export const ROTAS: [Metodo, string, Op][] = [
  // Autenticação
  ["post", "/api/auth/login", { tag: "Autenticação", resumo: "Entrar (gera cookie de sessão httpOnly)", publico: true, corpo: v.loginSchema, respostas: { 200: "Sessão aberta", 401: "Credenciais inválidas", 429: "Muitas tentativas (limite por e-mail e por IP)" } }],
  ["post", "/api/auth/cadastro", { tag: "Autenticação", resumo: "Criar conta de aluno", publico: true, corpo: v.cadastroSchema, respostas: { 201: "Conta criada", 409: "E-mail já cadastrado" } }],
  ["post", "/api/auth/logout", { tag: "Autenticação", resumo: "Sair (apaga o cookie)" }],
  ["get", "/api/auth/me", { tag: "Autenticação", resumo: "Usuário da sessão atual" }],
  ["get", "/api/auth/perfil", { tag: "Autenticação", resumo: "Meu perfil: dados da própria conta" }],
  ["patch", "/api/auth/perfil", { tag: "Autenticação", resumo: "Mudar o próprio nome (aparece na hora, sem novo login)", corpo: v.perfilSchema }],
  ["post", "/api/auth/senha", { tag: "Autenticação", resumo: "Trocar a própria senha: pede a atual, conta erro no limite do login, derruba as outras sessões", corpo: v.trocarSenhaSchema, respostas: { 200: "Senha trocada; sessão renovada", 400: "Senha atual incorreta", 429: "Muitas tentativas" } }],

  // Máquinas e reservas
  ["get", "/api/equipamentos", { tag: "Máquinas", resumo: "Listar máquinas", perm: "equipamento:ver" }],
  ["post", "/api/equipamentos", { tag: "Máquinas", resumo: "Cadastrar máquina", perm: "equipamento:gerenciar", corpo: v.equipamentoCreateSchema, respostas: { 201: "Cadastrada — já aparece para reserva", 409: "Patrimônio ou IP repetido" } }],
  ["patch", "/api/equipamentos/{id}", { tag: "Máquinas", resumo: "Alterar máquina / status", perm: "equipamento:gerenciar", corpo: v.equipamentoPatchSchema }],
  ["delete", "/api/equipamentos/{id}", { tag: "Máquinas", resumo: "Desativar máquina (soft delete)", perm: "equipamento:gerenciar" }],
  ["get", "/api/equipamentos/{id}/disponibilidade", { tag: "Reservas", resumo: "Horários livres de um dia", query: { data: "AAAA-MM-DD" } }],
  ["get", "/api/equipamentos/{id}/telemetria", { tag: "Máquinas", resumo: "Leitura ao vivo de uma máquina" }],
  ["get", "/api/equipamentos/{id}/alarmes", { tag: "Máquinas", resumo: "Alarmes da máquina" }],
  ["get", "/api/equipamentos/{id}/comandos", { tag: "Máquinas", resumo: "Histórico de comandos remotos" }],
  ["post", "/api/equipamentos/{id}/comandos", { tag: "Máquinas", resumo: "Pausar / retomar / parar ciclo / reconhecer alarmes", perm: "maquina:comandar", corpo: v.comandoSchema }],
  ["get", "/api/maquinas/telemetria", { tag: "Máquinas", resumo: "Leitura de todas as máquinas (chão do espaço)" }],
  ["get", "/api/alarmes", { tag: "Máquinas", resumo: "Alarmes ativos" }],
  ["get", "/api/agendamentos", { tag: "Reservas", resumo: "Reservas (minhas, ou todas para a equipe)" }],
  ["post", "/api/agendamentos", { tag: "Reservas", resumo: "Reservar horário (trava consultiva no PostgreSQL contra reserva dupla)", perm: "reserva:criar", corpo: v.agendamentoCreateSchema, respostas: { 201: "Reservado", 409: "Horário acabou de ser ocupado / conflito", 422: "Fora da janela, horário inválido ou máquina indisponível" } }],
  ["delete", "/api/agendamentos/{id}", { tag: "Reservas", resumo: "Cancelar reserva" }],
  ["get", "/api/manutencoes", { tag: "Máquinas", resumo: "Manutenções e calibrações" }],
  ["post", "/api/manutencoes", { tag: "Máquinas", resumo: "Registrar manutenção/calibração", perm: "manutencao:registrar", corpo: v.manutencaoCreateSchema }],
  ["get", "/api/laboratorios", { tag: "Espaço", resumo: "Áreas do espaço maker" }],
  ["post", "/api/laboratorios", { tag: "Espaço", resumo: "Criar área", perm: "laboratorio:gerenciar", corpo: v.laboratorioCreateSchema }],

  // Notebooks
  ["get", "/api/dispositivos", { tag: "Notebooks", resumo: "Notebooks, estações e tablets com leitura ao vivo", perm: "dispositivo:ver" }],
  ["post", "/api/dispositivos", { tag: "Notebooks", resumo: "Cadastrar aparelho manualmente (sem agente)", perm: "dispositivo:cadastrar", corpo: v.dispositivoCreateSchema, respostas: { 201: "Cadastrado", 409: "Hostname ou número de série já existe" } }],
  ["get", "/api/dispositivos/{id}", { tag: "Notebooks", resumo: "Detalhe, ações e eventos de um aparelho", perm: "dispositivo:ver" }],
  ["delete", "/api/dispositivos/{id}", { tag: "Notebooks", resumo: "Remover aparelho do LabMaker (digitar o nome para confirmar; o agente deixa de valer)", perm: "dispositivo:cadastrar", corpo: v.removerDispositivoSchema, respostas: { 200: "Removido", 422: "Nome não confere ou aparelho emprestado" } }],
  ["post", "/api/dispositivos/{id}/acoes", { tag: "Notebooks", resumo: "Enviar ação remota (fila → entregue → executada)", perm: "dispositivo:comandar", corpo: v.acaoDispositivoSchema }],
  ["get", "/api/dispositivos/alertas", { tag: "Notebooks", resumo: "Alertas em massa e confirmações de leitura", perm: "dispositivo:ver" }],
  ["post", "/api/dispositivos/alertas", { tag: "Notebooks", resumo: "Enviar alerta para todos / uma área / selecionados", perm: "dispositivo:comandar", corpo: v.alertaSchema }],
  ["get", "/api/dispositivos/eventos", { tag: "Notebooks", resumo: "Eventos recentes reportados pelos agentes", perm: "dispositivo:ver" }],
  ["get", "/api/dispositivos/{id}/tela", { tag: "Notebooks", resumo: "Suporte remoto: último pedido e sessão de tela ao vivo", perm: "dispositivo:comandar" }],
  ["get", "/api/dispositivos/{id}/tela/imagem", { tag: "Notebooks", resumo: "Último quadro da tela compartilhada (JPEG/PNG)", perm: "dispositivo:comandar", respostas: { 200: "Imagem", 404: "Nenhuma tela sendo compartilhada" } }],
  ["post", "/api/dispositivos/{id}/tela/encerrar", { tag: "Notebooks", resumo: "Encerrar o compartilhamento de tela", perm: "dispositivo:comandar" }],
  ["post", "/api/dispositivos/{id}/tela/controle", { tag: "Notebooks", resumo: "Controle remoto (mouse e teclado): pedir, devolver ou mandar eventos — só depois que o usuário permitir", perm: "dispositivo:comandar", corpo: v.telaControleSchema, respostas: { 200: "Ok", 409: "Sem tela ao vivo ou controle não permitido" } }],
  ["get", "/api/dispositivos/{id}/tela/eventos", { tag: "Notebooks", resumo: "Tela ao vivo por Server-Sent Events (estado, quadro, início, fim; pulso a cada 15 s)", perm: "dispositivo:comandar", respostas: { 200: "text/event-stream" } }],
  ["post", "/api/dispositivos/{id}/atendimento", { tag: "Atendimento", resumo: "Líder inicia uma conversa com o aparelho (abre um chamado já em atendimento)", perm: "dispositivo:comandar", respostas: { 201: "Chamado criado", 200: "Já havia um chamado aberto" } }],
  ["post", "/api/dispositivos/inscricao", { tag: "Agente", resumo: "Gerar código de inscrição de 6 letras (válido 2, 12 ou 24 h) e o comando de instalação", perm: "dispositivo:cadastrar", corpo: v.inscricaoSchema }],
  ["get", "/api/politicas", { tag: "Notebooks", resumo: "Políticas de uso", perm: "dispositivo:ver" }],
  ["patch", "/api/politicas/{id}", { tag: "Notebooks", resumo: "Alterar política (downloads, USB, sites, apps)", perm: "dispositivo:politicas", corpo: v.politicaPatchSchema }],

  // Empréstimos
  ["get", "/api/emprestimos", { tag: "Empréstimos", resumo: "Empréstimos abertos (ou todos)", perm: "dispositivo:ver", query: { situacao: "abertos | todos" } }],
  ["post", "/api/emprestimos", { tag: "Empréstimos", resumo: "Emprestar notebook a um aluno", perm: "emprestimo:gerenciar", corpo: v.emprestimoSchema, respostas: { 201: "Emprestado", 409: "Aparelho já emprestado / aluno já tem um / regra violada" } }],
  ["post", "/api/emprestimos/{id}/devolver", { tag: "Empréstimos", resumo: "Registrar devolução", perm: "emprestimo:gerenciar", corpo: v.devolucaoSchema }],
  ["get", "/api/emprestimos/meus", { tag: "Empréstimos", resumo: "O aparelho que está com o usuário logado" }],

  // Agente
  ["post", "/api/agente/inscrever", { tag: "Agente", resumo: "Agente troca o código por um token próprio (lmk_…)", publico: true, corpo: v.agenteInscreverSchema, respostas: { 201: "Inscrito", 401: "Código inválido ou expirado" } }],
  ["post", "/api/agente/checkin", { tag: "Agente", resumo: "Check-in a cada 15 s: envia telemetria/eventos/resultados, recebe ações", agente: true, corpo: v.agenteCheckinSchema, respostas: { 200: "Política e ações pendentes", 401: "Token inválido" } }],

  ["get", "/api/agente/script", { tag: "Agente", resumo: "Baixar o agente (agente.mjs) para instalar num computador ou VM", publico: true }],
  ["post", "/api/agente/chamados", { tag: "Agente", resumo: "Pedir ajuda ao Líder (abre um chamado; um por aparelho)", agente: true, corpo: v.agenteChamadoSchema, respostas: { 201: "Chamado aberto", 200: "{ jaExistia: true } — já havia um pedido aberto" } }],
  ["post", "/api/agente/chamados/mensagem", { tag: "Agente", resumo: "Responder no chat do chamado aberto", agente: true, corpo: v.agenteMensagemSchema, respostas: { 201: "Mensagem enviada", 404: "Nenhum chamado aberto" } }],
  ["post", "/api/agente/chamados/cancelar", { tag: "Agente", resumo: "Cancelar o próprio pedido de ajuda (resolveu sozinho)", agente: true }],
  ["get", "/api/agente/push", { tag: "Agente", resumo: "Chave pública VAPID para a inscrição Web Push", publico: true }],
  ["post", "/api/agente/push", { tag: "Agente", resumo: "Salvar (ou apagar com null) a inscrição Web Push do aparelho", agente: true, corpo: v.agentePushSchema }],
  ["post", "/api/agente/chamados/janela", { tag: "Agente", resumo: "Endereço da janelinha de chat do 'Pedir ajuda' (chave de 12 h só para o chat daquele aparelho)", agente: true, respostas: { 200: "{ janela }", 401: "Token inválido" } }],
  ["post", "/api/agente/chamados/estado", { tag: "Agente", resumo: "A janelinha lê a conversa, avisa que está aberta e liga/desliga 'o Líder pode ver minha tela'", agente: true, corpo: v.agenteJanelaEstadoSchema, respostas: { 200: "{ hostname, chamado }", 401: "Chave vencida" } }],
  ["post", "/api/agente/tela/controle", { tag: "Agente", resumo: "O agente busca os eventos de mouse/teclado do Líder (espera longa de até 20 s)", agente: true, corpo: v.agenteControleSchema, respostas: { 200: "{ continuar, eventos }", 401: "Token inválido" } }],
  ["post", "/api/agente/tela", { tag: "Agente", resumo: "Envia um quadro da tela depois que o usuário autorizou o suporte remoto (ou fim: true)", agente: true, corpo: v.telaQuadroSchema, respostas: { 200: "{ continuar } — se o agente segue transmitindo", 401: "Token inválido", 413: "Quadro maior que 3 MB" } }],

  // Atendimento
  ["get", "/api/chamados", { tag: "Atendimento", resumo: "Fila de pedidos de ajuda (abertos primeiro, depois os últimos encerrados)", perm: "dispositivo:comandar" }],
  ["get", "/api/chamados/contagem", { tag: "Atendimento", resumo: "Quantos pedidos esperam atendimento (selo do menu)", perm: "dispositivo:comandar" }],
  ["get", "/api/chamados/{id}", { tag: "Atendimento", resumo: "Chamado com a conversa completa", perm: "dispositivo:comandar" }],
  ["post", "/api/chamados/{id}/atender", { tag: "Atendimento", resumo: "Assumir o atendimento", perm: "dispositivo:comandar", respostas: { 200: "Em atendimento", 409: "Chamado já encerrado" } }],
  ["post", "/api/chamados/{id}/resolver", { tag: "Atendimento", resumo: "Encerrar o atendimento", perm: "dispositivo:comandar" }],
  ["post", "/api/chamados/{id}/mensagens", { tag: "Atendimento", resumo: "Mandar mensagem ao aparelho (chega no próximo check-in e por push)", perm: "dispositivo:comandar", corpo: v.chamadoMensagemSchema }],
  ["post", "/api/chamados/{id}/tela", { tag: "Atendimento", resumo: "Ver a tela do aluno — sem nova pergunta se ele autorizou ao pedir ajuda", perm: "dispositivo:comandar", respostas: { 201: "Pedido de tela criado", 422: "Aparelho sem agente real, celular ou offline" } }],

  // Sistema
  ["get", "/api/tv", { tag: "Sistema", resumo: "Modo TV: estado do espaço para o monitor da recepção (máquinas, reservas, aparelhos, atendimento) — sem e-mails, aluno como \"Bruna S.\"", perm: "painel:ver" }],
  ["get", "/api/sistema/enderecos", { tag: "Sistema", resumo: "IPs desta máquina na rede (atalhos para o QR e o comando do agente)", perm: "dispositivo:cadastrar" }],
  ["get", "/api/sistema/diagnostico", { tag: "Sistema", resumo: "Checklist da pré-apresentação: banco, conexão, espaço, agentes, atendimento, push", perm: "dispositivo:cadastrar" }],
  ["post", "/api/sistema/fechamento", { tag: "Sistema", resumo: "Testar agora o fechamento (fechar) ou a abertura (abrir) automática do espaço", perm: "dispositivo:politicas", respostas: { 200: "{ aparelhos } — hostnames afetados", 422: "acao inválida" } }],

  // Administração
  ["get", "/api/usuarios", { tag: "Administração", resumo: "Listar usuários", perm: "usuario:gerenciar" }],
  ["patch", "/api/usuarios/{id}", { tag: "Administração", resumo: "Mudar perfil / bloquear conta (derruba as sessões abertas)", perm: "usuario:gerenciar", corpo: v.usuarioPatchSchema }],
  ["post", "/api/usuarios/{id}/senha", { tag: "Administração", resumo: "Redefinir senha (gera senha temporária e encerra as sessões)", perm: "usuario:gerenciar" }],
  ["get", "/api/painel", { tag: "Administração", resumo: "Indicadores do painel", perm: "painel:ver" }],
  ["get", "/api/auditoria", { tag: "Administração", resumo: "Trilha de auditoria paginada", perm: "auditoria:ver", query: { entidade: "texto", busca: "texto", pagina: "número" } }],
  ["get", "/api/auditoria/exportar", { tag: "Administração", resumo: "Exportar auditoria em CSV", perm: "auditoria:ver" }],
  ["get", "/api/health", { tag: "Administração", resumo: "Saúde da aplicação e do banco", publico: true }],
];

export function gerarOpenApi() {
  const paths: Record<string, Record<string, unknown>> = {};
  for (const [metodo, caminho, op] of ROTAS) {
    const params = [...caminho.matchAll(/\{(\w+)\}/g)].map((m) => ({ name: m[1], in: "path", required: true, schema: { type: "string" } }));
    const query = Object.entries(op.query ?? {}).map(([name, d]) => ({ name, in: "query", required: false, description: d, schema: { type: "string" } }));
    const respostas = { ...(op.respostas ?? { 200: "OK" }) } as Record<number, string>;
    if (!op.publico) respostas[401] ??= "Sem sessão";
    if (op.perm) respostas[403] ??= `Exige a permissão ${op.perm}`;
    if (op.corpo) respostas[422] ??= "Dados inválidos ou regra de negócio violada (mensagem em português)";
    (paths[caminho] ??= {})[metodo] = {
      tags: [op.tag],
      summary: op.resumo,
      ...(op.perm ? { description: `Permissão: \`${op.perm}\``, "x-permissao": op.perm } : {}),
      security: op.publico ? [] : op.agente ? [{ tokenAgente: [] }] : [{ sessao: [] }],
      ...(params.length || query.length ? { parameters: [...params, ...query] } : {}),
      ...(op.corpo ? { requestBody: { required: true, content: { "application/json": { schema: esquema(op.corpo) } } } } : {}),
      responses: Object.fromEntries(Object.entries(respostas).map(([c, d]) => [c, { description: d }])),
    };
  }
  return {
    openapi: "3.1.0",
    info: {
      title: "LabMaker API",
      version: "5.0.0",
      description: 'API REST do LabMaker — reservas, máquinas, notebooks, empréstimos e agente. Erros sempre no formato { "error": "mensagem" }.',
    },
    servers: [{ url: "/" }],
    tags: ["Autenticação", "Reservas", "Máquinas", "Espaço", "Notebooks", "Empréstimos", "Agente", "Atendimento", "Sistema", "Administração"].map((name) => ({ name })),
    components: {
      securitySchemes: {
        sessao: { type: "apiKey", in: "cookie", name: "labops_session", description: "JWT HS256 em cookie httpOnly, SameSite=Lax, 8 h" },
        tokenAgente: { type: "http", scheme: "bearer", description: "Token lmk_… do agente; o banco guarda só o SHA-256" },
      },
    },
    paths,
  };
}
