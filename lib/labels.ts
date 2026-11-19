import type {
  Criticidade, EstadoMaquina, ModoDownload, ProtocoloIndustrial, SeveridadeAlarme, SistemaOperacional, SituacaoCalibracao, StatusAcao,
  StatusEquipamento, TipoAcaoDispositivo, TipoComando, TipoDispositivo, TipoEquipamento, TipoManutencao,
} from "@/lib/types";

export const TIPO_LABEL: Record<TipoEquipamento, string> = {
  METROLOGIA: "Metrologia",
  ENSAIO_MATERIAIS: "Ensaio de materiais",
  ANALISE_QUIMICA: "Análise química",
  ELETRONICA: "Eletrônica",
  MANUFATURA_ADITIVA: "Impressão 3D",
  PLOTTER_RECORTE: "Plotter de recorte",
  USINAGEM_CNC: "Usinagem CNC",
  CORTE_LASER: "Corte a laser",
  CAMARA_CLIMATICA: "Câmara climática",
  OUTRO: "Outro",
};

export const STATUS_LABEL: Record<StatusEquipamento, string> = {
  LIVRE: "Disponível",
  EM_USO: "Em uso",
  MANUTENCAO: "Manutenção",
};

export const CRITICIDADE_LABEL: Record<Criticidade, string> = { BAIXA: "Baixa", MEDIA: "Média", ALTA: "Alta" };

export const MANUTENCAO_LABEL: Record<TipoManutencao, string> = {
  CALIBRACAO: "Calibração",
  PREVENTIVA: "Preventiva",
  CORRETIVA: "Corretiva",
};

export const CALIBRACAO_LABEL: Record<SituacaoCalibracao, string> = {
  NAO_APLICAVEL: "Não se aplica",
  EM_DIA: "Em dia",
  A_VENCER: "A vencer",
  VENCIDA: "Vencida",
  PENDENTE: "Pendente",
};

/** Rótulos legíveis das ações gravadas na trilha de auditoria. */
export const ACAO_LABEL: Record<string, string> = {
  "auth.login": "Login",
  "auth.cadastro": "Cadastro",
  "equipamento.criado": "Equipamento criado",
  "equipamento.atualizado": "Equipamento atualizado",
  "equipamento.status_alterado": "Status alterado",
  "equipamento.removido": "Equipamento removido",
  "reserva.criada": "Reserva criada",
  "reserva.cancelada": "Reserva cancelada",
  "manutencao.registrada": "Manutenção registrada",
  "calibracao.registrada": "Calibração registrada",
  "laboratorio.criado": "Laboratório criado",
  "usuario.atualizado": "Usuário atualizado",
  "maquina.comando": "Comando remoto",
  "maquina.comando_rejeitado": "Comando recusado",
  "maquina.alarme": "Alarme da máquina",
  "maquina.alarmes_reconhecidos": "Alarmes reconhecidos",
  "dispositivo.alerta": "Alerta enviado",
  "dispositivo.acao": "Ação em dispositivo",
  "dispositivo.acao_recusada": "Ação recusada",
  "politica.atualizada": "Política alterada",
  "emprestimo.criado": "Empréstimo",
  "auditoria.exportada": "Exportação",
  "emprestimo.devolvido": "Devolução",
  "dispositivo.inscrito": "Agente inscrito",
  "dispositivo.cadastrado": "Aparelho cadastrado",
  "dispositivo.tela_iniciada": "Tela compartilhada",
  "dispositivo.tela_encerrada": "Tela encerrada",
  "usuario.senha_redefinida": "Senha redefinida",
  "sistema.inicializado": "Instalação",
  "dispositivo.inscricao_gerada": "Código de inscrição",
  "auth.bloqueio_tentativas": "Login bloqueado",
};

export const ESTADO_LABEL: Record<EstadoMaquina | "MANUTENCAO", string> = {
  OPERANDO: "Operando",
  OCIOSO: "Ociosa",
  PAUSADO: "Pausada",
  ALARME: "Em alarme",
  OFFLINE: "Offline",
  MANUTENCAO: "Manutenção",
};

export const PROTOCOLO_LABEL: Record<ProtocoloIndustrial, string> = {
  OPC_UA: "OPC UA",
  MTCONNECT: "MTConnect",
  MODBUS_TCP: "Modbus TCP",
  MQTT: "MQTT",
  SCPI: "SCPI (LXI)",
};

export const SEVERIDADE_LABEL: Record<SeveridadeAlarme, string> = { INFO: "Informativo", AVISO: "Aviso", CRITICO: "Crítico" };

export const COMANDO_LABEL: Record<TipoComando, string> = {
  PAUSAR: "Pausar ciclo",
  RETOMAR: "Retomar ciclo",
  PARAR_CICLO: "Parar ciclo",
  RECONHECER_ALARMES: "Reconhecer alarmes",
};

// ───────────────────────── Dispositivos ─────────────────────────

export const TIPO_DISPOSITIVO_LABEL: Record<TipoDispositivo, string> = {
  NOTEBOOK: "Notebook", DESKTOP: "Desktop", TABLET: "Tablet", SMARTPHONE: "Celular",
};
export const SO_LABEL: Record<SistemaOperacional, string> = {
  WINDOWS: "Windows", MACOS: "macOS", LINUX: "Linux", ANDROID: "Android", IOS: "iOS / iPadOS", CHROMEOS: "ChromeOS",
};
export const ACAO_DISPOSITIVO_LABEL: Record<TipoAcaoDispositivo, string> = {
  ALERTA: "Alerta", BLOQUEAR: "Bloquear tela", DESBLOQUEAR: "Desbloquear", REINICIAR: "Reiniciar", INSTALAR_APP: "Instalar aplicativo",
  REMOVER_APP: "Remover aplicativo", SESSAO_REMOTA: "Suporte remoto", SINCRONIZAR: "Sincronizar política", APAGAR_DADOS: "Apagar dados",
};
export const STATUS_ACAO_LABEL: Record<StatusAcao, string> = {
  PENDENTE: "Na fila", ENTREGUE: "Entregue", EXECUTADA: "Concluída", RECUSADA: "Recusada",
};
export const MODO_DOWNLOAD_LABEL: Record<ModoDownload, string> = {
  LIVRE: "Livre", BLOQUEAR_EXECUTAVEIS: "Bloquear executáveis", SOMENTE_APROVADOS: "Somente catálogo aprovado",
};
