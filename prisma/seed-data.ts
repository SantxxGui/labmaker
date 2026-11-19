/**
 * Dados de demonstração — gerador PURO (sem banco).
 * Usado por prisma/seed.ts (PostgreSQL) e pela demonstração estática.
 *
 * Todas as datas são relativas a `agora`: sempre há 14 dias de histórico,
 * reservas futuras, calibrações vencidas/a vencer e atividade recente.
 * O PRNG é determinístico, então a "história" gerada é sempre a mesma.
 */
import type { Role } from "../lib/permissions";
import type {
  Criticidade, EstadoMaquina, ProtocoloIndustrial, SeveridadeAlarme, StatusAgendamento, StatusComando, StatusEquipamento, TipoComando,
  TipoEquipamento, TipoManutencao,
} from "../lib/types";

import { gerarDispositivos } from "./seed-dispositivos";

export const SENHA_DEMO = "labmaker123";

const DIA = 86_400_000;
const HORA = 3_600_000;

function mulberry32(a: number) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function gerarDadosDemo(agora = new Date()) {
  const rand = mulberry32(20261116);
  const hojeSP = new Date(agora.getTime() - 3 * HORA).toISOString().slice(0, 10);
  const dia = (offset: number) => new Date(new Date(`${hojeSP}T12:00:00Z`).getTime() + offset * DIA).toISOString().slice(0, 10);
  const em = (data: string, minutos: number) =>
    new Date(`${data}T${String(Math.floor(minutos / 60)).padStart(2, "0")}:${String(minutos % 60).padStart(2, "0")}:00-03:00`);
  const domingo = (data: string) => new Date(`${data}T12:00:00-03:00`).getUTCDay() === 0;
  const antes = (dias: number) => new Date(agora.getTime() - dias * DIA);

  // ── Usuários (um por perfil + equipe) ──
  const U = (id: string, nome: string, email: string, role: Role, cargo: string, matricula: string, criadoHaDias: number, ativo = true) =>
    ({ id, nome, email, role, cargo, matricula, ativo, criadoEm: antes(criadoHaDias) });
  const usuarios = [
    U("usr_gestor", "Prof. Ricardo Nogueira", "gestor@labmaker.dev", "GESTOR", "Professor de Projeto Integrador", "10002", 598),
    U("usr_tecnico", "Paulo Henrique Sato", "lider@labmaker.dev", "LIDER", "Orientador Educacional Digital (OED) — Líder do espaço", "10003", 541),
    U("usr_usuario", "Ana Ribeiro", "usuario@labmaker.dev", "USUARIO", "Engenharia Mecânica · 7º semestre", "20417", 233),
    U("usr_bruno", "Bruno Tavares", "bruno.tavares@labmaker.dev", "USUARIO", "Engenharia de Controle e Automação", "20388", 310),
    U("usr_carla", "Carla Mendes", "carla.mendes@labmaker.dev", "USUARIO", "Arquitetura e Urbanismo", "20512", 187),
    U("usr_diego", "Diego Souza", "diego.souza@labmaker.dev", "USUARIO", "Ciência da Computação", "20640", 129),
    U("usr_fernanda", "Fernanda Lima", "fernanda.lima@labmaker.dev", "USUARIO", "Design de Produto", "20733", 76),
    U("usr_tecnico2", "Lucas Martins", "lucas.martins@labmaker.dev", "LIDER", "Estagiário EMK — Líder do espaço", "10058", 268),
    U("usr_inativo", "Otávio Reis", "otavio.reis@labmaker.dev", "USUARIO", "Ex-aluno (formado)", "29001", 190, false),
  ];
  const quem = (id: string) => usuarios.find((u) => u.id === id)!;
  const equipe = ["usr_usuario", "usr_bruno", "usr_carla", "usr_diego", "usr_fernanda", "usr_tecnico2"];

  // ── Unidades e laboratórios ──
  const unidades = [
    { id: "uni_ct", nome: "Campus Centro", sigla: "CEN", cidade: "Campinas", uf: "SP" },
  ];
  const laboratorios = [
    { id: "lab_fab", codigo: "FAB-01", nome: "Impressão 3D", unidadeId: "uni_ct", descricao: "Ilha de impressoras 3D FDM e resina para protótipos." },
    { id: "lab_cor", codigo: "COR-01", nome: "Corte e Gravação", unidadeId: "uni_ct", descricao: "Cortadoras a laser CO2 e plotters de recorte de vinil." },
    { id: "lab_ele", codigo: "BAN-01", nome: "Bancadas e Eletrônica", unidadeId: "uni_ct", descricao: "Bancadas de montagem, notebooks de empréstimo e estação de projeto." },
  ];

  // ── Equipamentos — cal: [intervalo em dias, dias até o vencimento (negativo = vencida)] ──
  type Eq = { id: string; lab: string; nome: string; tipo: TipoEquipamento; fab: string; modelo: string; slot: number; crit?: Criticidade; status?: StatusEquipamento; cal?: [number, number]; local: string };
  const EQ: Eq[] = [
    { id: "eq_prusa1", lab: "lab_fab", nome: "Impressora 3D Prusa #1", tipo: "MANUFATURA_ADITIVA", fab: "Prusa Research", modelo: "MK4S", slot: 120, cal: [30, 18], local: "Ilha de impressão · baia 1" },
    { id: "eq_prusa2", lab: "lab_fab", nome: "Impressora 3D Prusa #2", tipo: "MANUFATURA_ADITIVA", fab: "Prusa Research", modelo: "MK4S", slot: 120, cal: [30, 9], local: "Ilha de impressão · baia 2" },
    { id: "eq_bambu", lab: "lab_fab", nome: "Impressora 3D Bambu X1C", tipo: "MANUFATURA_ADITIVA", fab: "Bambu Lab", modelo: "X1 Carbon + AMS", slot: 120, crit: "ALTA", cal: [30, 24], local: "Ilha de impressão · baia 3" },
    { id: "eq_resina", lab: "lab_fab", nome: "Impressora 3D de Resina", tipo: "MANUFATURA_ADITIVA", fab: "Elegoo", modelo: "Saturn 4 Ultra", slot: 120, crit: "BAIXA", local: "Sala de cura (exaustão)" },
    { id: "eq_laser1", lab: "lab_cor", nome: "Cortadora a Laser CO2 #1", tipo: "CORTE_LASER", fab: "Gweike", modelo: "Cloud Pro 60 W", slot: 60, crit: "ALTA", cal: [60, 33], local: "Sala de corte" },
    { id: "eq_laser2", lab: "lab_cor", nome: "Cortadora a Laser CO2 #2", tipo: "CORTE_LASER", fab: "Glowforge", modelo: "Pro 45 W", slot: 60, status: "MANUTENCAO", cal: [60, 41], local: "Sala de corte" },
    { id: "eq_cameo", lab: "lab_cor", nome: "Plotter de Recorte Cameo", tipo: "PLOTTER_RECORTE", fab: "Silhouette", modelo: "Cameo 5", slot: 60, crit: "BAIXA", cal: [90, -4], local: "Bancada de vinil" },
    { id: "eq_roland", lab: "lab_cor", nome: "Plotter de Recorte Roland", tipo: "PLOTTER_RECORTE", fab: "Roland DG", modelo: "CAMM-1 GS2-24", slot: 60, cal: [90, 57], local: "Bancada de vinil" },
  ];
  // ── Conectividade: IP na rede do espaço, protocolo do gateway (Raspberry Pi), firmware, câmera e estado ──
  const REDE: Record<string, { ip: string; proto: ProtocoloIndustrial; fw: string; cam?: string; estado: EstadoMaquina }> = {
    eq_prusa1: { ip: "10.20.30.11", proto: "MQTT", fw: "Prusa Firmware 6.2.1", cam: "10.20.39.11", estado: "OPERANDO" },
    eq_prusa2: { ip: "10.20.30.12", proto: "MQTT", fw: "Prusa Firmware 6.2.1", cam: "10.20.39.12", estado: "OCIOSO" },
    eq_bambu: { ip: "10.20.30.13", proto: "MQTT", fw: "X1C 01.08.02", cam: "10.20.39.13", estado: "OPERANDO" },
    eq_resina: { ip: "10.20.30.14", proto: "MQTT", fw: "Saturn fw 1.4.2", estado: "OFFLINE" },
    eq_laser1: { ip: "10.20.30.21", proto: "OPC_UA", fw: "Ruida RDC6445 · LightBurn bridge", cam: "10.20.39.21", estado: "OPERANDO" },
    eq_laser2: { ip: "10.20.30.22", proto: "MQTT", fw: "Glowforge OS 2026.3", cam: "10.20.39.22", estado: "ALARME" },
    eq_cameo: { ip: "10.20.30.31", proto: "MQTT", fw: "Cameo 5 fw 1.12", estado: "OCIOSO" },
    eq_roland: { ip: "10.20.30.32", proto: "MODBUS_TCP", fw: "GS2-24 fw 2.40", cam: "10.20.39.32", estado: "OPERANDO" },
  };

  const equipamentos = EQ.map((e, i) => ({
    id: e.id, laboratorioId: e.lab, nome: e.nome, tipo: e.tipo, fabricante: e.fab, modelo: e.modelo,
    patrimonio: `PAT-${String(4100 + i * 37).padStart(6, "0")}`,
    numeroSerie: `SN${(rand() * 1e8).toFixed(0).padStart(8, "0")}`,
    localizacao: e.local, duracaoSlotMinutos: e.slot, criticidade: e.crit ?? ("MEDIA" as Criticidade),
    status: e.status ?? ("LIVRE" as StatusEquipamento), requerCalibracao: !!e.cal,
    intervaloCalibracaoDias: e.cal?.[0] ?? null,
    proximaCalibracaoEm: e.cal ? new Date(agora.getTime() + e.cal[1] * DIA) : null,
    criadoEm: antes(420 - i * 11),
    enderecoIp: REDE[e.id].ip,
    protocolo: REDE[e.id].proto,
    firmware: REDE[e.id].fw,
    cameraUrl: REDE[e.id].cam ? `rtsp://${REDE[e.id].cam}:554/stream1` : null,
    estadoMaquina: REDE[e.id].estado,
    ultimoContatoEm: REDE[e.id].estado === "OFFLINE" ? new Date(agora.getTime() - 3 * HORA - 12 * 60_000) : agora,
  }));

  // ── Alarmes: códigos e mensagens no padrão dos fabricantes ──
  type Al = { id: string; equipamentoId: string; codigo: string; mensagem: string; severidade: SeveridadeAlarme; ativoDesde: Date; encerradoEm: Date | null; reconhecidoEm: Date | null; reconhecidoPorId: string | null };
  const min = (m: number) => new Date(agora.getTime() - m * 60_000);
  const AL = (id: string, eq: string, codigo: string, mensagem: string, sev: SeveridadeAlarme, haMin: number, duracaoMin: number | null, ack: [string, number] | null): Al => ({
    id, equipamentoId: eq, codigo, mensagem, severidade: sev, ativoDesde: min(haMin),
    encerradoEm: duracaoMin === null ? null : min(haMin - duracaoMin),
    reconhecidoEm: ack ? min(haMin - ack[1]) : null, reconhecidoPorId: ack?.[0] ?? null,
  });
  const alarmes: Al[] = [
    // ativos
    AL("al_001", "eq_laser2", "W-201", "Temperatura da água do chiller acima de 28 °C — tubo laser em risco", "CRITICO", 95, null, ["usr_tecnico", 6]),
    AL("al_002", "eq_laser1", "D-03", "Tampa aberta durante o corte — feixe interrompido pelo intertravamento", "AVISO", 14, null, null),
    AL("al_003", "eq_bambu", "AMS-07", "Filamento PLA preto abaixo de 10% no AMS", "INFO", 46, null, null),
    AL("al_004", "eq_resina", "NET-01", "Sem resposta da impressora há mais de 5 minutos (heartbeat)", "CRITICO", 192, null, null),
    // histórico
    AL("al_005", "eq_prusa1", "E-112", "Bico entupido: fluxo de filamento caiu para 40%", "AVISO", 2 * 1440 + 210, 35, ["usr_tecnico2", 4]),
    AL("al_006", "eq_prusa2", "T-01", "Falha no termistor da mesa aquecida", "CRITICO", 4 * 1440 + 95, 120, ["usr_tecnico", 2]),
    AL("al_007", "eq_laser1", "F-12", "Exaustão abaixo de 60% — filtro saturado", "AVISO", 3 * 1440 + 400, 50, ["usr_tecnico", 9]),
    AL("al_008", "eq_roland", "M-04", "Mídia desalinhada: erro de registro acima de 0,5 mm", "AVISO", 5 * 1440 + 60, 12, ["usr_tecnico2", 3]),
    AL("al_009", "eq_bambu", "HMS-0300", "Peça descolou da mesa (detecção por câmera)", "AVISO", 6 * 1440 + 300, 8, ["usr_tecnico2", 3]),
    AL("al_010", "eq_laser1", "L-201", "Lente e espelhos requerem limpeza", "INFO", 8 * 1440 + 30, 240, ["usr_tecnico", 60]),
    AL("al_011", "eq_cameo", "B-02", "Lâmina com desgaste — trocar após 3 km de corte", "INFO", 10 * 1440 + 15, 30, null),
    AL("al_012", "eq_laser2", "W-110", "Fluxo de água do chiller baixo", "AVISO", 120, 20, ["usr_tecnico", 10]),
  ];

  // ── Comandos remotos já executados ──
  type Cm = { id: string; equipamentoId: string; usuarioId: string; tipo: TipoComando; status: StatusComando; motivo: string | null; justificativa: string | null; criadoEm: Date };
  const comandos: Cm[] = [
    { id: "cm_001", equipamentoId: "eq_prusa1", usuarioId: "usr_tecnico2", tipo: "PARAR_CICLO", status: "EXECUTADO", motivo: null, justificativa: "Bico entupido — impressão cancelada para limpeza", criadoEm: min(2 * 1440 + 208) },
    { id: "cm_002", equipamentoId: "eq_prusa1", usuarioId: "usr_tecnico2", tipo: "RECONHECER_ALARMES", status: "EXECUTADO", motivo: null, justificativa: null, criadoEm: min(2 * 1440 + 206) },
    { id: "cm_003", equipamentoId: "eq_laser2", usuarioId: "usr_tecnico", tipo: "PARAR_CICLO", status: "EXECUTADO", motivo: null, justificativa: "Água do chiller quente — corte interrompido para proteger o tubo", criadoEm: min(93) },
    { id: "cm_004", equipamentoId: "eq_resina", usuarioId: "usr_tecnico", tipo: "PAUSAR", status: "REJEITADO", motivo: "Máquina sem comunicação — comando não entregue.", justificativa: null, criadoEm: min(150) },
    { id: "cm_005", equipamentoId: "eq_bambu", usuarioId: "usr_tecnico2", tipo: "PAUSAR", status: "EXECUTADO", motivo: null, justificativa: "Troca de filamento", criadoEm: min(3 * 1440 + 30) },
    { id: "cm_006", equipamentoId: "eq_bambu", usuarioId: "usr_tecnico2", tipo: "RETOMAR", status: "EXECUTADO", motivo: null, justificativa: null, criadoEm: min(3 * 1440 + 18) },
  ];

  // ── Calibrações e manutenções executadas ──
  type Mt = { id: string; equipamentoId: string; tipo: TipoManutencao; responsavelId: string; descricao: string; realizadaEm: Date; certificado: string | null; validadeAte: Date | null };
  const manutencoes: Mt[] = EQ.filter((e) => e.cal).map((e, i) => {
    const validade = new Date(agora.getTime() + e.cal![1] * DIA);
    return {
      id: `mt_cal_${String(i + 1).padStart(2, "0")}`, equipamentoId: e.id, tipo: "CALIBRACAO", responsavelId: i % 2 ? "usr_tecnico" : "usr_tecnico2",
      descricao: e.tipo === "MANUFATURA_ADITIVA" ? "Nivelamento da mesa, calibração de fluxo e teste de primeira camada."
        : e.tipo === "CORTE_LASER" ? "Alinhamento dos espelhos, foco e teste de potência em grade de corte."
        : "Ajuste de profundidade da lâmina e teste de registro (marcas óticas).",
      realizadaEm: new Date(validade.getTime() - e.cal![0] * DIA), validadeAte: validade,
      certificado: `CHK-${validade.getUTCFullYear()}-${String(120 + i * 13).padStart(4, "0")}`,
    };
  });
  manutencoes.push(
    { id: "mt_cor_01", equipamentoId: "eq_laser2", tipo: "CORRETIVA", responsavelId: "usr_tecnico", realizadaEm: antes(0), certificado: null, validadeAte: null, descricao: "Chiller sem circulação adequada: limpeza da bomba e troca da água destilada em andamento." },
    { id: "mt_pre_01", equipamentoId: "eq_prusa1", tipo: "PREVENTIVA", responsavelId: "usr_tecnico2", realizadaEm: antes(2), certificado: null, validadeAte: null, descricao: "Limpeza a frio do bico (cold pull) e troca do bico 0,4 mm." },
    { id: "mt_pre_02", equipamentoId: "eq_laser1", tipo: "PREVENTIVA", responsavelId: "usr_tecnico", realizadaEm: antes(8), certificado: null, validadeAte: null, descricao: "Limpeza de lente e espelhos, troca do filtro da exaustão." },
    { id: "mt_pre_03", equipamentoId: "eq_resina", tipo: "PREVENTIVA", responsavelId: "usr_tecnico2", realizadaEm: antes(15), certificado: null, validadeAte: null, descricao: "Troca do filme FEP e filtragem da resina." },
  );

  // ── Reservas: 13 dias de histórico + hoje + próximos 6 dias ──
  const FINALIDADES = ["TCC — protótipo do braço robótico", "Projeto Integrador — Rover", "Maquete de Arquitetura", "Clube de Robótica", "Extensão — kits para escolas", "Equipe Baja — peças de teste", "Hackathon — troféus", null];
  type Ag = { id: string; usuarioId: string; equipamentoId: string; inicio: Date; fim: Date; status: StatusAgendamento; finalidade: string | null };
  const agendamentos: Ag[] = [];
  const futurasPorUsuario = new Map<string, number>();
  const ocupadoUsuario = new Set<string>();

  for (let off = -13; off <= 6; off++) {
    const data = dia(off);
    if (domingo(data)) continue;
    for (const e of EQ) {
      if (e.id === "eq_cameo" && off >= 0) continue; // ajuste de lâmina vencido: sem reservas futuras
      if (e.status === "MANUTENCAO" && off >= 0 && off !== 2) continue; // 1 reserva futura vira "conflito"
      const totalSlots = Math.floor((12 * 60) / e.slot);
      const ocupacao = off < 0 ? 0.28 + rand() * 0.38 : off === 0 ? 0.45 : 0.22;
      for (let s = 0; s < totalSlots; s++) {
        if (rand() > ocupacao) continue;
        const inicio = em(data, 8 * 60 + s * e.slot);
        const fim = new Date(inicio.getTime() + e.slot * 60_000);
        const futura = fim > agora;
        let u = equipe[Math.floor(rand() * equipe.length)];
        if (futura) {
          // A conta "usuario@" fica com folga para reservar ao vivo; ninguém tem 2 reservas no mesmo horário.
          if (u === "usr_usuario" && (futurasPorUsuario.get(u) ?? 0) >= 2) u = equipe[1 + Math.floor(rand() * (equipe.length - 1))];
          const chave = `${u}|${inicio.toISOString()}`;
          if (ocupadoUsuario.has(chave)) continue;
          futurasPorUsuario.set(u, (futurasPorUsuario.get(u) ?? 0) + 1);
          ocupadoUsuario.add(chave);
        }
        agendamentos.push({
          id: `ag_${String(agendamentos.length + 1).padStart(4, "0")}`, usuarioId: u, equipamentoId: e.id, inicio, fim,
          status: futura ? "CONFIRMADO" : "CONCLUIDO",
          finalidade: FINALIDADES[Math.floor(rand() * FINALIDADES.length)],
        });
      }
    }
  }

  // ── Trilha de auditoria (últimos dias) ──
  let n = 0;
  /** autorId null = evento gerado pelo sistema (gateway industrial), sem usuário humano */
  const A = (minAtras: number, autorId: string | null, acao: string, entidade: string, entidadeId: string | null, resumo: string) => {
    const autor = autorId ? quem(autorId) : null;
    return {
      id: `au_${String(++n).padStart(3, "0")}`, criadoEm: new Date(agora.getTime() - minAtras * 60_000),
      usuarioId: autor?.id ?? null, usuarioNome: autor?.nome ?? "Gateway do espaço", usuarioRole: (autor?.role ?? null) as Role | null,
      acao, entidade, entidadeId, resumo, ip: `10.20.${Math.floor(rand() * 8)}.${10 + Math.floor(rand() * 200)}`,
    };
  };
  const auditoria = [
    A(14, null, "maquina.alarme", "equipamento", "eq_laser1", "Cortadora a Laser CO2 #1 disparou D-03: tampa aberta durante o corte"),
    A(93, "usr_tecnico", "maquina.comando", "equipamento", "eq_laser2", "Parar ciclo → Cortadora a Laser CO2 #2 (água do chiller quente)"),
    A(150, "usr_tecnico", "maquina.comando_rejeitado", "equipamento", "eq_resina", "Pausar → Impressora 3D de Resina: máquina sem comunicação"),
    A(18, "usr_tecnico", "auth.login", "usuario", "usr_tecnico", "Paulo Henrique Sato entrou no sistema"),
    A(42, "usr_tecnico2", "equipamento.status_alterado", "equipamento", "eq_bambu", "Impressora 3D Bambu X1C: Disponível → Em uso"),
    A(65, "usr_usuario", "reserva.criada", "agendamento", null, "Reservou Cortadora a Laser CO2 #1"),
    A(140, "usr_gestor", "auth.login", "usuario", "usr_gestor", "Prof. Ricardo Nogueira entrou no sistema"),
    A(310, "usr_bruno", "reserva.cancelada", "agendamento", null, "Cancelou a reserva de Impressora 3D Prusa #2"),
    A(1 * 1440 + 30, "usr_tecnico", "manutencao.registrada", "equipamento", "eq_laser2", "Corretiva registrada em Cortadora a Laser CO2 #2"),
    A(1 * 1440 + 200, "usr_carla", "reserva.criada", "agendamento", null, "Reservou Plotter de Recorte Roland"),
    A(2 * 1440 + 15, "usr_tecnico", "usuario.atualizado", "usuario", "usr_inativo", "Otávio Reis: conta desativada (formado)"),
    A(3 * 1440 + 40, "usr_tecnico", "usuario.atualizado", "usuario", "usr_tecnico2", "Lucas Martins: perfil Aluno → Líder (Estagiário EMK)"),
    A(3 * 1440 + 260, "usr_diego", "reserva.criada", "agendamento", null, "Reservou Impressora 3D Bambu X1C"),
    A(4 * 1440 + 20, "usr_tecnico", "equipamento.criado", "equipamento", "eq_roland", "Cadastrou Plotter de Recorte Roland em COR-01"),
    A(5 * 1440 + 75, "usr_tecnico2", "calibracao.registrada", "equipamento", "eq_prusa2", "Calibração registrada em Impressora 3D Prusa #2 (nivelamento CHK-2026-0133)"),
    A(9 * 1440 + 55, "usr_tecnico", "manutencao.registrada", "equipamento", "eq_laser1", "Preventiva registrada em Cortadora a Laser CO2 #1"),
  ];

  // ── Dispositivos de TI (notebooks, desktops, tablets, celulares) ──
  const disp = gerarDispositivos(agora);
  for (const [minAtras, autor, acao, entidade, entidadeId, resumo] of disp.auditoriaDispositivos) {
    auditoria.push(A(minAtras, autor, acao, entidade, entidadeId, resumo));
  }
  auditoria.sort((a, b) => b.criadoEm.getTime() - a.criadoEm.getTime());

  return {
    usuarios, unidades, laboratorios, equipamentos, manutencoes, agendamentos, auditoria, alarmes, comandos,
    politicas: disp.politicas, dispositivos: disp.dispositivos, acoesDispositivo: disp.acoesDispositivo, eventosDispositivo: disp.eventosDispositivo, emprestimos: disp.emprestimos,
  };
}

export type DadosDemo = ReturnType<typeof gerarDadosDemo>;

// ───────────────────────── Espaço zerado (npm run db:reset) ─────────────────────────

/** Configuração mínima para o espaço funcionar sem nenhum dado de exemplo. */
export function gerarDadosIniciais(env: Record<string, string | undefined> = {}) {
  return {
    usuarios: [
      { id: "usr_lider", nome: env.LIDER_NOME ?? "Líder do Espaço Maker", email: (env.LIDER_EMAIL ?? "lider@labmaker.dev").toLowerCase(), role: "LIDER" as const, cargo: "Orientador Educacional Digital (OED)" },
    ],
    unidade: { id: "uni_emk", nome: env.LABMAKER_UNIDADE ?? "Espaço Maker", sigla: env.LABMAKER_SIGLA ?? "EMK", cidade: env.LABMAKER_CIDADE ?? "Campus", uf: (env.LABMAKER_UF ?? "SP").slice(0, 2) },
    // Modelos editáveis pelo Líder em Notebooks → Políticas (o agente precisa de uma política para aplicar)
    politicas: [
      { id: "pol_alunos", nome: "Notebooks de empréstimo (alunos)", descricao: "Pendrive liberado para os arquivos do projeto; sem instaladores, jogos e apostas.", bloquearUsb: false, modoDownload: "BLOQUEAR_EXECUTAVEIS" as const, sitesBloqueados: ["jogos", "torrent", "apostas"], appsBloqueados: ["Steam", "uTorrent"], exigirCriptografia: false, bloqueioTelaMinutos: 10, bloquearForaHorario: false },
      { id: "pol_estacoes", nome: "Estações das máquinas", descricao: "Computadores ligados às máquinas: só os programas das máquinas.", bloquearUsb: true, modoDownload: "SOMENTE_APROVADOS" as const, sitesBloqueados: ["jogos", "torrent", "streaming", "redes_sociais", "apostas"], appsBloqueados: ["Steam", "uTorrent"], exigirCriptografia: false, bloqueioTelaMinutos: 15, bloquearForaHorario: true },
    ],
  };
}
