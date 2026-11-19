/** Schemas Zod — toda entrada da API passa por aqui antes de chegar às regras. */
import { z } from "zod";
import { ROLES } from "@/lib/permissions";

const opcional = (max: number) => z.string().trim().max(max).optional().or(z.literal(""));

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email("Informe um e-mail válido."),
  senha: z.string().min(1, "Informe sua senha."),
});

export const cadastroSchema = z.object({
  nome: z.string().trim().min(3, "Nome muito curto."),
  email: z.string().trim().toLowerCase().email("Informe um e-mail válido."),
  matricula: opcional(30),
  senha: z.string().min(8, "A senha precisa de pelo menos 8 caracteres."),
});

export const tipoEquipamento = z.enum(
  ["METROLOGIA", "ENSAIO_MATERIAIS", "ANALISE_QUIMICA", "ELETRONICA", "MANUFATURA_ADITIVA", "USINAGEM_CNC", "CORTE_LASER", "CAMARA_CLIMATICA", "PLOTTER_RECORTE", "OUTRO"],
  { message: "Tipo de equipamento inválido." },
);
export const statusEquipamento = z.enum(["LIVRE", "EM_USO", "MANUTENCAO"], {
  message: "Status inválido. Use LIVRE, EM_USO ou MANUTENCAO.",
});
const criticidade = z.enum(["BAIXA", "MEDIA", "ALTA"], { message: "Criticidade inválida." });

export const equipamentoCreateSchema = z.object({
  nome: z.string().trim().min(2, "Informe o nome do equipamento."),
  tipo: tipoEquipamento,
  laboratorioId: z.string().min(1, "Selecione o laboratório."),
  fabricante: opcional(80),
  modelo: opcional(80),
  patrimonio: opcional(40),
  localizacao: opcional(80),
  criticidade: criticidade.default("MEDIA"),
  duracaoSlotMinutos: z.coerce
    .number()
    .int()
    .refine((v) => [30, 60, 90, 120].includes(v), "Duração deve ser 30, 60, 90 ou 120 min."),
  requerCalibracao: z.boolean().default(false),
  intervaloCalibracaoDias: z.coerce.number().int().min(30).max(1825).optional(),
  enderecoIp: z.union([z.ipv4({ message: "Endereço IP inválido (ex.: 10.40.1.15)." }), z.literal("")]).optional(),
});

export const equipamentoPatchSchema = z
  .object({
    nome: z.string().trim().min(2).optional(),
    status: statusEquipamento.optional(),
    criticidade: criticidade.optional(),
    localizacao: z.string().trim().max(80).nullable().optional(),
  })
  .refine((d) => Object.keys(d).length > 0, "Nada para atualizar.");

export const agendamentoCreateSchema = z.object({
  equipamentoId: z.string().min(1, "Selecione um equipamento."),
  inicio: z.iso.datetime({ offset: true, message: "Horário inválido." }),
  finalidade: z.string().trim().max(120, "Finalidade: no máximo 120 caracteres.").optional(),
});

export const manutencaoCreateSchema = z
  .object({
    equipamentoId: z.string().min(1, "Selecione o equipamento."),
    tipo: z.enum(["CALIBRACAO", "PREVENTIVA", "CORRETIVA"], { message: "Tipo de manutenção inválido." }),
    descricao: z.string().trim().min(5, "Descreva o serviço realizado.").max(300),
    realizadaEm: z.iso.date("Data de realização inválida."),
    certificado: opcional(60),
    validadeAte: z.iso.date("Validade inválida.").optional().or(z.literal("")),
    /** Ao concluir, devolve o equipamento para "Disponível" */
    liberarEquipamento: z.boolean().default(false),
  })
  .refine((d) => d.realizadaEm <= new Date().toISOString().slice(0, 10), "A data de realização não pode ser futura.")
  .refine((d) => !d.validadeAte || d.validadeAte > d.realizadaEm, "A validade deve ser posterior à realização.");

export const laboratorioCreateSchema = z.object({
  nome: z.string().trim().min(3, "Informe o nome do laboratório."),
  codigo: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9-]{3,12}$/, "Código: 3 a 12 caracteres (letras, números e hífen)."),
  unidadeId: z.string().min(1, "Selecione a unidade."),
  descricao: opcional(200),
});

const nomePessoa = z.string().trim().min(3, "Nome muito curto.").max(80, "Nome muito longo (até 80 caracteres).");

export const usuarioPatchSchema = z
  .object({
    nome: nomePessoa.optional(),
    role: z.enum(ROLES, { message: "Perfil inválido." }).optional(),
    ativo: z.boolean().optional(),
  })
  .refine((d) => Object.keys(d).length > 0, "Nada para atualizar.");

/** PATCH /api/auth/perfil — o próprio usuário muda o nome */
export const perfilSchema = z.object({ nome: nomePessoa });

/** POST /api/auth/senha — o próprio usuário troca a senha (pede a atual) */
export const trocarSenhaSchema = z
  .object({
    senhaAtual: z.string().min(1, "Informe a senha atual."),
    novaSenha: z.string().min(8, "A nova senha precisa de pelo menos 8 caracteres.").max(200),
  })
  .refine((d) => d.senhaAtual !== d.novaSenha, { message: "A nova senha precisa ser diferente da atual.", path: ["novaSenha"] });

export const comandoSchema = z
  .object({
    tipo: z.enum(["PAUSAR", "RETOMAR", "PARAR_CICLO", "RECONHECER_ALARMES"], { message: "Comando inválido." }),
    justificativa: z.string().trim().max(200).optional(),
  })
  .refine((d) => d.tipo !== "PARAR_CICLO" || (d.justificativa?.length ?? 0) >= 5, {
    message: "Informe o motivo da parada (mínimo 5 caracteres).",
  });

// ───────────────────────── Dispositivos ─────────────────────────

const prioridade = z.enum(["INFO", "AVISO", "CRITICO"], { message: "Prioridade inválida." });

export const alertaSchema = z
  .object({
    titulo: z.string().trim().min(3, "Título muito curto.").max(80, "Título com no máximo 80 caracteres."),
    mensagem: z.string().trim().min(5, "Escreva a mensagem.").max(400, "Mensagem com no máximo 400 caracteres."),
    prioridade: prioridade.default("INFO"),
    destino: z.enum(["todos", "laboratorio", "selecionados"], { message: "Destino inválido." }),
    laboratorioId: z.string().optional(),
    ids: z.array(z.string()).max(500).optional(),
  })
  .refine((d) => d.destino !== "laboratorio" || !!d.laboratorioId, { message: "Selecione o laboratório.", path: ["laboratorioId"] })
  .refine((d) => d.destino !== "selecionados" || (d.ids?.length ?? 0) > 0, { message: "Selecione ao menos um dispositivo.", path: ["ids"] });

export const acaoDispositivoSchema = z.object({
  tipo: z.enum(["ALERTA", "BLOQUEAR", "DESBLOQUEAR", "REINICIAR", "INSTALAR_APP", "REMOVER_APP", "SESSAO_REMOTA", "SINCRONIZAR", "APAGAR_DADOS"], {
    message: "Ação inválida.",
  }),
  parametro: z.string().trim().max(80).optional(),
  justificativa: z.string().trim().max(300).optional(),
  confirmacao: z.string().trim().max(80).optional(),
  titulo: z.string().trim().max(80).optional(),
  mensagem: z.string().trim().max(400).optional(),
  prioridade: prioridade.optional(),
}).refine((d) => d.tipo !== "ALERTA" || ((d.titulo?.length ?? 0) >= 3 && (d.mensagem?.length ?? 0) >= 5), {
  message: "Alerta precisa de título e mensagem.",
});

export const politicaPatchSchema = z
  .object({
    bloquearUsb: z.boolean(),
    modoDownload: z.enum(["LIVRE", "BLOQUEAR_EXECUTAVEIS", "SOMENTE_APROVADOS"]),
    sitesBloqueados: z.array(z.string().max(40)).max(20),
    appsBloqueados: z.array(z.string().trim().min(1).max(60)).max(40),
    exigirCriptografia: z.boolean(),
    bloqueioTelaMinutos: z.coerce.number().int().min(1, "Mínimo 1 minuto.").max(120, "Máximo 120 minutos."),
    bloquearForaHorario: z.boolean(),
  })
  .partial()
  .refine((d) => Object.keys(d).length > 0, { message: "Nada para atualizar." });

// ───────────────────────── Agente real ─────────────────────────

const pct = z.number().min(0).max(100).nullable();
const so = z.enum(["WINDOWS", "MACOS", "LINUX", "ANDROID", "IOS", "CHROMEOS"]);

export const inscricaoSchema = z.object({
  politicaId: z.string().nullable().optional(),
  laboratorioId: z.string().nullable().optional(),
});

export const agenteInscreverSchema = z.object({
  codigo: z.string().min(20, "Código de inscrição inválido."),
  hostname: z.string().trim().min(1).max(63).regex(/^[A-Za-z0-9._-]+$/, "Hostname inválido."),
  tipo: z.enum(["NOTEBOOK", "DESKTOP", "TABLET", "SMARTPHONE"]).default("NOTEBOOK"),
  so,
  versaoSo: z.string().trim().max(80),
  fabricante: z.string().trim().max(60).default("Desconhecido"),
  modelo: z.string().trim().max(80).default("Desconhecido"),
  numeroSerie: z.string().trim().min(1).max(60),
  enderecoMac: z.string().trim().max(17).nullable().optional(),
  agenteVersao: z.string().trim().max(20),
  armazenamentoGb: z.number().int().min(0).max(100_000).default(0),
});

export const agenteCheckinSchema = z.object({
  agenteVersao: z.string().max(20).optional(),
  versaoSo: z.string().max(80).optional(),
  // Cada sistema reporta o que consegue ler: todo campo é opcional (ausente = "não medido")
  telemetria: z.object({
    cpu: pct.nullish(), memoria: pct.nullish(), disco: pct.nullish(), bateria: pct.nullish(), carregando: z.boolean().default(false),
    rede: z.string().max(30).nullish(), usuarioSessao: z.string().max(80).nullish(), appAtivo: z.string().max(120).nullish(),
    uptimeH: z.number().min(0).max(100_000).nullish(),
  }, { message: "Envie a telemetria do agente." }),
  seguranca: z.object({
    criptografado: z.boolean().optional(), antivirusAtivo: z.boolean().optional(), firewallAtivo: z.boolean().optional(),
    atualizacoesPendentes: z.number().int().min(0).max(999).optional(),
  }).optional(),
  eventos: z.array(z.object({
    tipo: z.string().max(40), descricao: z.string().max(300), severidade: z.enum(["INFO", "AVISO", "CRITICO"]).default("INFO"),
  })).max(50).default([]),
  resultados: z.array(z.object({
    id: z.string().max(40), status: z.enum(["EXECUTADA", "RECUSADA"]), motivo: z.string().max(200).nullable().optional(),
  })).max(50).default([]),
});

// ───────────────────────── Empréstimos ─────────────────────────

export const removerDispositivoSchema = z.object({ confirmacao: z.string().trim().max(80) });

export const emprestimoSchema = z.object({
  dispositivoId: z.string().min(1, "Escolha o aparelho."),
  usuarioId: z.string().min(1, "Escolha o aluno."),
  prazoEm: z.coerce.date({ message: "Prazo inválido." }),
  observacao: z.string().trim().max(200).optional(),
});

export const devolucaoSchema = z.object({
  observacao: z.string().trim().max(200).optional(),
});

// ───────────────────────── Cadastro manual de aparelho ─────────────────────────

export const dispositivoCreateSchema = z.object({
  hostname: z.string().trim().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{1,62}$/, "Nome do aparelho: letras, números, ponto, hífen (ex.: LM-NB-01)."),
  tipo: z.enum(["NOTEBOOK", "DESKTOP", "TABLET", "SMARTPHONE"], { message: "Tipo inválido." }),
  so: z.enum(["WINDOWS", "MACOS", "LINUX", "ANDROID", "IOS", "CHROMEOS"], { message: "Sistema inválido." }),
  fabricante: z.string().trim().min(1, "Informe o fabricante.").max(60),
  modelo: z.string().trim().min(1, "Informe o modelo.").max(80),
  numeroSerie: z.string().trim().min(3, "Informe o número de série / patrimônio.").max(60),
  laboratorioId: z.string().nullable().optional(),
  politicaId: z.string().nullable().optional(),
});

// ───────────────────────── Tela remota ─────────────────────────

/** Quadro da tela enviado pelo agente (base64), ou o aviso de que o usuário encerrou. */
export const telaQuadroSchema = z.object({
  acaoId: z.string().min(1).max(40),
  fim: z.boolean().optional(),
  /** a tela não mudou desde o último quadro: só mantém a sessão viva */
  mesmo: z.boolean().optional(),
  imagem: z.string().max(4_300_000, "Quadro grande demais (máx. 3 MB).").regex(/^[A-Za-z0-9+/=]+$/, "Imagem em base64 inválida.").optional(),
  tipo: z.enum(["image/jpeg", "image/png"]).default("image/jpeg"),
}).refine((d) => d.fim || d.mesmo || !!d.imagem, { message: "Envie a imagem, mesmo: true ou fim: true." });

// ───────────────────────── Atendimento e push (agente) ─────────────────────────

export const agenteChamadoSchema = z.object({
  descricao: z.string().trim().min(3, "Descreva o problema em poucas palavras.").max(500),
  nome: z.string().trim().max(60).optional(),
  autorizaTela: z.boolean().default(false),
});

export const agenteMensagemSchema = z.object({
  texto: z.string().trim().min(1, "Mensagem vazia.").max(1000),
  nome: z.string().trim().max(60).optional(),
});

export const agentePushSchema = z.object({
  inscricao: z.object({
    endpoint: z.string().url().max(1000),
    expirationTime: z.number().nullable().optional(),
    keys: z.object({ p256dh: z.string().max(200), auth: z.string().max(100) }),
  }).nullable(),
});

export const chamadoMensagemSchema = z.object({ texto: z.string().trim().min(1, "Mensagem vazia.").max(1000) });
