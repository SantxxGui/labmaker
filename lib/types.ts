/** Tipos serializáveis (JSON) compartilhados entre API e telas. */
import type { Role } from "@/lib/permissions";

export type TipoEquipamento =
  | "METROLOGIA" | "ENSAIO_MATERIAIS" | "ANALISE_QUIMICA" | "ELETRONICA" | "MANUFATURA_ADITIVA" | "PLOTTER_RECORTE"
  | "USINAGEM_CNC" | "CORTE_LASER" | "CAMARA_CLIMATICA" | "OUTRO";
export type StatusEquipamento = "LIVRE" | "EM_USO" | "MANUTENCAO";
export type Criticidade = "BAIXA" | "MEDIA" | "ALTA";
export type StatusAgendamento = "CONFIRMADO" | "CANCELADO" | "CONCLUIDO";
export type TipoManutencao = "CALIBRACAO" | "PREVENTIVA" | "CORRETIVA";
/** Situação da calibração, derivada de `proximaCalibracaoEm`. */
export type SituacaoCalibracao = "NAO_APLICAVEL" | "EM_DIA" | "A_VENCER" | "VENCIDA" | "PENDENTE";

export type LaboratorioDTO = {
  id: string;
  nome: string;
  codigo: string;
  descricao: string | null;
  unidade: { id: string; nome: string; sigla: string; cidade: string; uf: string };
  totalEquipamentos?: number;
};

export type EquipamentoDTO = {
  id: string;
  nome: string;
  tipo: TipoEquipamento;
  fabricante: string | null;
  modelo: string | null;
  patrimonio: string | null;
  localizacao: string | null;
  status: StatusEquipamento;
  criticidade: Criticidade;
  duracaoSlotMinutos: number;
  requerCalibracao: boolean;
  intervaloCalibracaoDias: number | null;
  proximaCalibracaoEm: string | null;
  calibracao: SituacaoCalibracao;
  laboratorio: { id: string; nome: string; codigo: string; unidadeSigla: string };
  reservasHoje?: number;
  // conectividade
  numeroSerie: string | null;
  enderecoIp: string | null;
  protocolo: ProtocoloIndustrial | null;
  firmware: string | null;
  temCamera: boolean;
  estadoMaquina: EstadoMaquina;
};

export type AgendamentoDTO = {
  id: string;
  inicio: string;
  fim: string;
  status: StatusAgendamento;
  finalidade: string | null;
  equipamento: { id: string; nome: string; tipo: TipoEquipamento; laboratorioCodigo: string };
  usuario?: { id: string; nome: string; email: string };
};

export type SlotDTO = {
  inicio: string;
  fim: string;
  label: string;
  disponivel: boolean;
  motivo: "ocupado" | "passado" | "meu" | null;
};

export type DisponibilidadeDTO = {
  data: string;
  equipamento: { id: string; nome: string; status: StatusEquipamento; duracaoSlotMinutos: number };
  bloqueado: boolean;
  motivo: string | null;
  slots: SlotDTO[];
};

export type ManutencaoDTO = {
  id: string;
  tipo: TipoManutencao;
  descricao: string;
  realizadaEm: string;
  certificado: string | null;
  validadeAte: string | null;
  equipamento: { id: string; nome: string; patrimonio: string | null };
  responsavel: { id: string; nome: string };
};

export type AuditoriaDTO = {
  id: string;
  criadoEm: string;
  acao: string;
  entidade: string;
  entidadeId: string | null;
  resumo: string;
  ip: string | null;
  usuarioNome: string;
  usuarioRole: Role | null;
};

export type UsuarioDTO = {
  id: string;
  nome: string;
  email: string;
  role: Role;
  matricula: string | null;
  cargo: string | null;
  ativo: boolean;
  criadoEm: string;
};

export type PainelDTO = {
  equipamentos: { total: number; livres: number; emUso: number; manutencao: number; bloqueadosCalibracao: number };
  utilizacao7d: number; // 0–1
  utilizacao7dAnterior: number;
  reservasHoje: number;
  reservasProximos7d: number;
  calibracao: { vencidas: number; aVencer30d: number };
  reservasPorDia: { dia: string; horas: number; reservas: number }[];
  porLaboratorio: { id: string; codigo: string; nome: string; equipamentos: number; horas: number; utilizacao: number }[];
  topEquipamentos: { id: string; nome: string; laboratorioCodigo: string; horas: number }[];
  alertasCalibracao: { id: string; nome: string; patrimonio: string | null; laboratorioCodigo: string; proximaCalibracaoEm: string | null; situacao: SituacaoCalibracao }[];
  proximasReservas: AgendamentoDTO[];
  atividade: AuditoriaDTO[];
};

// ── Conectividade industrial ──
export type EstadoMaquina = "OPERANDO" | "OCIOSO" | "PAUSADO" | "ALARME" | "OFFLINE";
export type ProtocoloIndustrial = "OPC_UA" | "MTCONNECT" | "MODBUS_TCP" | "MQTT" | "SCPI";
export type SeveridadeAlarme = "INFO" | "AVISO" | "CRITICO";
export type TipoComando = "PAUSAR" | "RETOMAR" | "PARAR_CICLO" | "RECONHECER_ALARMES";
export type StatusComando = "EXECUTADO" | "REJEITADO";

export type MetricaDTO = {
  chave: string;
  rotulo: string;
  unidade: string;
  valor: number | null;
  min: number;
  max: number;
  casas: number;
  /** fora da faixa operacional */
  alerta: boolean;
};

export type TelemetriaDTO = {
  equipamentoId: string;
  online: boolean;
  /** estado físico; MANUTENCAO quando o equipamento foi tirado de operação */
  estado: EstadoMaquina | "MANUTENCAO";
  lidoEm: string;
  ultimoContatoEm: string | null;
  latenciaMs: number | null;
  programa: string | null;
  progresso: number | null;
  restanteMin: number | null;
  oee: number | null;
  metricas: MetricaDTO[];
  alarmeAtivo: { codigo: string; mensagem: string; severidade: SeveridadeAlarme } | null;
};

export type AlarmeDTO = {
  id: string;
  codigo: string;
  mensagem: string;
  severidade: SeveridadeAlarme;
  ativoDesde: string;
  encerradoEm: string | null;
  reconhecidoEm: string | null;
  reconhecidoPor: string | null;
  equipamento: { id: string; nome: string; laboratorioCodigo: string };
};

export type ComandoDTO = {
  id: string;
  tipo: TipoComando;
  status: StatusComando;
  motivo: string | null;
  justificativa: string | null;
  criadoEm: string;
  usuario: { id: string; nome: string };
};

// ───────────────────────── Dispositivos (gestão de endpoints) ─────────────────────────

export type TipoDispositivo = "NOTEBOOK" | "DESKTOP" | "TABLET" | "SMARTPHONE";
export type SistemaOperacional = "WINDOWS" | "MACOS" | "LINUX" | "ANDROID" | "IOS" | "CHROMEOS";
export type ModoDownload = "LIVRE" | "BLOQUEAR_EXECUTAVEIS" | "SOMENTE_APROVADOS";
export type TipoAcaoDispositivo =
  | "ALERTA" | "BLOQUEAR" | "DESBLOQUEAR" | "REINICIAR" | "INSTALAR_APP" | "REMOVER_APP" | "SESSAO_REMOTA" | "SINCRONIZAR" | "APAGAR_DADOS";
export type StatusAcao = "PENDENTE" | "ENTREGUE" | "EXECUTADA" | "RECUSADA";

export type DispositivoDTO = {
  id: string;
  hostname: string;
  tipo: TipoDispositivo;
  so: SistemaOperacional;
  versaoSo: string;
  fabricante: string;
  modelo: string;
  numeroSerie: string;
  enderecoIp: string | null;
  enderecoMac: string | null;
  agenteVersao: string;
  criptografado: boolean;
  antivirusAtivo: boolean;
  firewallAtivo: boolean;
  atualizacoesPendentes: number;
  armazenamentoGb: number;
  bloqueado: boolean;
  appsInstalados: string[];
  ultimoContatoEm: string | null;
  /** true = agente real inscrito (dados do check-in); false = simulado na demonstração */
  agenteReal: boolean;
  responsavel: { id: string; nome: string } | null;
  laboratorio: { id: string; codigo: string; nome: string; unidadeSigla: string } | null;
  politica: { id: string; nome: string; exigirCriptografia: boolean; appsBloqueados: string[] } | null;
};

export type LeituraDispositivoDTO = {
  dispositivoId: string;
  online: boolean;
  cpu: number | null;
  memoria: number | null;
  disco: number | null;
  bateria: number | null;
  carregando: boolean;
  rede: string | null;
  usuarioSessao: string | null;
  appAtivo: string | null;
  uptimeH: number | null;
  ultimoContatoEm: string | null;
  lidoEm: string;
};

export type ConformidadeDTO = {
  /** true = cadastrado manualmente, sem agente: não há dados para avaliar (não conta como risco) */
  semAgente?: boolean;
  conforme: boolean;
  pontuacao: number;
  /** neutro = o sistema do aparelho não informa este item (agente real sem permissão de leitura): não conta na nota */
  itens: { chave: string; rotulo: string; ok: boolean; detalhe: string; neutro?: boolean }[];
};

/** Dispositivo + leitura + conformidade: o que a central de TI exibe por linha. */
export type DispositivoPainelDTO = DispositivoDTO & { leitura: LeituraDispositivoDTO; conformidade: ConformidadeDTO };

export type AcaoDispositivoDTO = {
  id: string;
  tipo: TipoAcaoDispositivo;
  status: StatusAcao;
  lote: string | null;
  titulo: string | null;
  mensagem: string | null;
  prioridade: SeveridadeAlarme | null;
  parametro: string | null;
  justificativa: string | null;
  motivo: string | null;
  criadoEm: string;
  concluidoEm: string | null;
  usuario: { id: string; nome: string };
  dispositivo: { id: string; hostname: string; tipo: TipoDispositivo };
};

export type EventoDispositivoDTO = {
  id: string;
  tipo: string;
  descricao: string;
  severidade: SeveridadeAlarme;
  criadoEm: string;
  dispositivo: { id: string; hostname: string; tipo: TipoDispositivo };
};

export type PoliticaDTO = {
  id: string;
  nome: string;
  descricao: string | null;
  bloquearUsb: boolean;
  modoDownload: ModoDownload;
  sitesBloqueados: string[];
  appsBloqueados: string[];
  exigirCriptografia: boolean;
  bloqueioTelaMinutos: number;
  /** trava sozinho os aparelhos do espaço depois das 20h e aos domingos */
  bloquearForaHorario: boolean;
  atualizadoEm: string;
  totalDispositivos: number;
};

/** Resumo de um alerta enviado em massa (todas as ações do mesmo lote). */
export type LoteAlertaDTO = {
  lote: string;
  titulo: string;
  mensagem: string;
  prioridade: SeveridadeAlarme;
  criadoEm: string;
  autor: string;
  total: number;
  pendentes: number;
  entregues: number;
  lidos: number;
};

export type EmprestimoDTO = {
  id: string;
  retiradoEm: string;
  prazoEm: string;
  devolvidoEm: string | null;
  observacao: string | null;
  situacao: "ABERTO" | "ATRASADO" | "DEVOLVIDO";
  dispositivo: { id: string; hostname: string; tipo: TipoDispositivo };
  usuario: { id: string; nome: string; matricula: string | null };
  tecnico: { nome: string };
  recebidoPor: { nome: string } | null;
};

export type StatusChamado = "ABERTO" | "EM_ATENDIMENTO" | "RESOLVIDO" | "CANCELADO";
export type MensagemDTO = { id: string; autor: "LIDER" | "USUARIO" | "SISTEMA"; autorNome: string | null; texto: string; criadoEm: string; entregueEm: string | null };
export type ChamadoDTO = {
  id: string;
  numero: number;
  descricao: string;
  nomeSolicitante: string | null;
  autorizaTela: boolean;
  status: StatusChamado;
  criadoEm: string;
  atendidoEm: string | null;
  resolvidoEm: string | null;
  atendidoPor: { nome: string } | null;
  dispositivo: { id: string; hostname: string; tipo: TipoDispositivo; so: SistemaOperacional; agenteReal: boolean; online: boolean };
  ultimaMensagem: MensagemDTO | null;
  mensagens?: MensagemDTO[];
};
