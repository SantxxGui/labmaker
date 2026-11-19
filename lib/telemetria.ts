/**
 * Telemetria e comandos remotos — camada de "driver" da máquina.
 *
 * Em produção, um gateway na rede industrial (OT) conversa com cada máquina no
 * protocolo dela (OPC UA, MTConnect, Modbus TCP, MQTT, SCPI) e publica as leituras
 * para o LabMaker. O navegador nunca acessa o IP da máquina diretamente.
 *
 * Aqui fica o SIMULADOR desse gateway: gera leituras determinísticas (mesmo
 * instante → mesmo valor) a partir do tipo e do estado de cada máquina, e aplica
 * as regras de segurança dos comandos. Trocar o simulador por um driver real não
 * muda controllers, models nem telas — só esta camada.
 *
 * Funções puras, cobertas por testes em tests/telemetria.test.ts.
 */
import type {
  EstadoMaquina, MetricaDTO, SeveridadeAlarme, StatusEquipamento, TelemetriaDTO, TipoComando, TipoEquipamento,
} from "@/lib/types";

// ─────────────────────────────── perfis por tipo de máquina ───────────────────────────────

type PerfilMetrica = {
  chave: string;
  rotulo: string;
  unidade: string;
  /** valor típico em ciclo / parado */
  operando: number;
  ocioso: number;
  /** amplitude da oscilação natural */
  amp: number;
  min: number;
  max: number;
  casas: number;
};
type Perfil = {
  metricas: PerfilMetrica[];
  /** métrica que sai da faixa quando há alarme AVISO/CRÍTICO, e para que lado */
  falha: { indice: number; lado: "alto" | "baixo" };
  programas: string[];
  /** duração do ciclo em minutos */
  ciclo: number;
};

const M = (chave: string, rotulo: string, unidade: string, operando: number, ocioso: number, amp: number, min: number, max: number, casas = 0): PerfilMetrica =>
  ({ chave, rotulo, unidade, operando, ocioso, amp, min, max, casas });

export const PERFIS: Record<TipoEquipamento, Perfil> = {
  USINAGEM_CNC: {
    metricas: [M("rpm", "Rotação do fuso", "rpm", 8200, 0, 450, 0, 12000), M("carga", "Carga do fuso", "%", 46, 0, 9, 0, 85), M("temp", "Temp. do fuso", "°C", 41, 27, 1.5, 15, 60, 1), M("avanco", "Avanço", "mm/min", 1450, 0, 180, 0, 4000)],
    falha: { indice: 1, lado: "alto" }, programas: ["O1042 · Suporte do eixo rev. C", "O2210 · Flange F-220", "O0871 · Molde de inserto"], ciclo: 48,
  },
  CORTE_LASER: {
    metricas: [M("potencia", "Potência do laser", "%", 65, 0, 6, 0, 100), M("agua", "Temp. da água (chiller)", "°C", 21.5, 20, 0.4, 15, 28, 1), M("exaustao", "Exaustão", "%", 85, 85, 2, 60, 100), M("velocidade", "Velocidade", "mm/s", 120, 0, 14, 0, 500)],
    falha: { indice: 1, lado: "alto" }, programas: ["Caixa em MDF 3 mm · Projeto Rover", "Gravação em acrílico · troféu do hackathon", "Engrenagens em MDF 6 mm · TCC"], ciclo: 25,
  },
  MANUFATURA_ADITIVA: {
    metricas: [M("bico", "Temp. do bico", "°C", 215, 28, 1.5, 0, 280), M("mesa", "Temp. da mesa", "°C", 60, 25, 0.6, 0, 110), M("ventoinha", "Ventoinha da peça", "%", 100, 0, 2, 0, 100), M("fluxo", "Fluxo de filamento", "%", 100, 0, 3, 0, 120)],
    falha: { indice: 3, lado: "baixo" }, programas: ["Suporte do braço robótico · PLA · 412 camadas", "Engrenagem planetária · PETG · 288 camadas", "Case do Arduino · PLA · 160 camadas"], ciclo: 180,
  },
  PLOTTER_RECORTE: {
    metricas: [M("forca", "Força da lâmina", "g", 120, 0, 6, 0, 250), M("velocidade", "Velocidade", "cm/s", 30, 0, 2, 0, 60), M("midia", "Mídia restante", "m", 6.2, 6.2, 0.05, 0.5, 25, 1), M("registro", "Erro de registro", "mm", 0.08, 0.05, 0.02, 0, 0.5, 2)],
    falha: { indice: 3, lado: "alto" }, programas: ["Adesivos do evento · vinil fosco", "Máscara de pintura · Projeto Rover", "Logo da atlética · vinil termocolante"], ciclo: 15,
  },
  METROLOGIA: {
    metricas: [M("sala", "Temp. da sala", "°C", 20.05, 20.0, 0.12, 19, 21, 2), M("umidade", "Umidade relativa", "%", 48, 47, 1.2, 40, 60), M("vibracao", "Vibração", "µm/s", 3.1, 1.2, 0.6, 0, 8, 1), M("pontos", "Pontos medidos/min", "pts", 42, 0, 6, 0, 120)],
    falha: { indice: 0, lado: "alto" }, programas: ["Plano de medição · Flange F-220", "Inspeção de 1ª peça · Lote 2611"], ciclo: 35,
  },
  ENSAIO_MATERIAIS: {
    metricas: [M("forca", "Força aplicada", "kN", 118, 0, 22, 0, 250, 1), M("deslocamento", "Deslocamento", "mm", 6.4, 0, 1.6, 0, 50, 2), M("temp", "Temp. da célula", "°C", 23.2, 22.8, 0.3, 15, 35, 1), M("taxa", "Taxa de ensaio", "mm/min", 5, 0, 0.1, 0, 20, 1)],
    falha: { indice: 0, lado: "alto" }, programas: ["ASTM E8 · Tração aço 1020", "ISO 6892 · Corpo de prova CP-14"], ciclo: 12,
  },
  CAMARA_CLIMATICA: {
    metricas: [M("temp", "Temperatura", "°C", 85, 23, 2.5, -45, 90, 1), M("umidade", "Umidade relativa", "%", 62, 45, 3, 10, 95), M("pressao", "Pressão do compressor", "bar", 17, 6, 0.8, 4, 22, 1), M("setpoint", "Setpoint", "°C", 85, 23, 0, -45, 90)],
    falha: { indice: 2, lado: "alto" }, programas: ["Ciclo térmico −40 / +85 °C · 96 h"], ciclo: 5760,
  },
  ELETRONICA: {
    metricas: [M("temp", "Temp. interna", "°C", 44, 33, 1.2, 10, 60, 1), M("cpu", "Uso do processador", "%", 38, 6, 8, 0, 95), M("aquisicoes", "Aquisições/s", "acq/s", 1250, 0, 140, 0, 5000), M("ventilacao", "Ventilação", "rpm", 3100, 2200, 120, 1500, 5000)],
    falha: { indice: 0, lado: "alto" }, programas: ["Captura · Barramento CAN", "Varredura EMC · 30 MHz–6 GHz"], ciclo: 25,
  },
  ANALISE_QUIMICA: {
    metricas: [M("pressao", "Pressão do sistema", "bar", 245, 0, 6, 0, 400), M("fluxo", "Fluxo", "mL/min", 1.0, 0, 0.01, 0, 5, 2), M("coluna", "Temp. da coluna", "°C", 40, 25, 0.1, 15, 80, 1), M("amostra", "Amostras na fila", "un", 14, 0, 0, 0, 120)],
    falha: { indice: 0, lado: "alto" }, programas: ["Método QC-17 · Lote 2611", "Varredura FTIR · Polímero PA66"], ciclo: 30,
  },
  OUTRO: {
    metricas: [M("temp", "Temperatura", "°C", 35, 25, 1, 0, 80, 1), M("uso", "Uso", "%", 60, 0, 8, 0, 100)],
    falha: { indice: 0, lado: "alto" }, programas: ["Ciclo padrão"], ciclo: 20,
  },
};

// ─────────────────────────────── utilitários determinísticos ───────────────────────────────

function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0) / 4294967295;
}
/** Ruído suave em [-1, 1], estável por segundo. */
function ruido(seed: string, t: number) {
  const s = Math.floor(t / 1000);
  const a = hash(`${seed}:${s}`) * 2 - 1;
  const b = hash(`${seed}:${s + 1}`) * 2 - 1;
  const f = (t % 1000) / 1000;
  return a + (b - a) * f;
}
const arred = (v: number, casas: number) => Math.round(v * 10 ** casas) / 10 ** casas;

// ─────────────────────────────── leitura ───────────────────────────────

export type MaquinaParaLeitura = {
  id: string;
  tipo: TipoEquipamento;
  status: StatusEquipamento;
  estadoMaquina: EstadoMaquina;
  ultimoContatoEm: Date | null;
  alarmeAtivo: { codigo: string; mensagem: string; severidade: SeveridadeAlarme } | null;
};

/** Estado exibido: manutenção (decisão humana) tem prioridade sobre o estado físico. */
export function estadoEfetivo(m: Pick<MaquinaParaLeitura, "status" | "estadoMaquina">): EstadoMaquina | "MANUTENCAO" {
  if (m.estadoMaquina === "OFFLINE") return "OFFLINE";
  return m.status === "MANUTENCAO" ? "MANUTENCAO" : m.estadoMaquina;
}

function valorMetrica(m: MaquinaParaLeitura, p: Perfil, i: number, t: number): number {
  const pm = p.metricas[i];
  const fase = hash(`${m.id}:${pm.chave}`) * Math.PI * 2;
  const emCiclo = m.estadoMaquina === "OPERANDO";
  const parado = m.estadoMaquina === "PAUSADO" || m.estadoMaquina === "ALARME";
  // Pausado/alarme: grandezas térmicas decaem devagar, as de movimento vão a zero
  const base = emCiclo ? pm.operando : parado ? pm.ocioso + (pm.operando - pm.ocioso) * (pm.ocioso === 0 ? 0 : 0.6) : pm.ocioso;
  // Grandeza parada (base zero) fica exatamente em zero; as demais oscilam pouco fora de ciclo
  const amp = emCiclo ? pm.amp : base === 0 ? 0 : pm.amp * 0.15;
  let v = base + amp * (0.6 * Math.sin(t / 9000 + fase) + 0.4 * ruido(`${m.id}:${pm.chave}`, t));
  v = Math.min(pm.max, Math.max(pm.min, v)); // fora de falha, o valor físico respeita a faixa

  const sev = m.alarmeAtivo?.severidade;
  if (i === p.falha.indice && (sev === "AVISO" || sev === "CRITICO")) {
    const fora = (pm.max - pm.min) * (sev === "CRITICO" ? 0.06 : 0.03);
    v = p.falha.lado === "alto" ? pm.max + fora + Math.abs(amp) * 0.3 * ruido(m.id, t) : pm.min - fora;
  }
  return arred(v, pm.casas);
}

/**
 * Leitura de uma máquina no instante `agora`.
 * Por ser determinística, a mesma função reconstrói a série recente (ver serieRecente).
 */
export function lerTelemetria(m: MaquinaParaLeitura, agora = new Date()): TelemetriaDTO {
  const t = agora.getTime();
  const p = PERFIS[m.tipo];
  const estado = estadoEfetivo(m);
  const online = m.estadoMaquina !== "OFFLINE";

  if (!online) {
    return {
      equipamentoId: m.id, online: false, estado, lidoEm: agora.toISOString(),
      ultimoContatoEm: m.ultimoContatoEm?.toISOString() ?? null, latenciaMs: null,
      programa: null, progresso: null, restanteMin: null, oee: null,
      metricas: p.metricas.map((pm) => ({ chave: pm.chave, rotulo: pm.rotulo, unidade: pm.unidade, valor: null, min: pm.min, max: pm.max, casas: pm.casas, alerta: false })),
      alarmeAtivo: m.alarmeAtivo,
    };
  }

  const metricas: MetricaDTO[] = p.metricas.map((pm, i) => {
    const valor = valorMetrica(m, p, i, t);
    return { chave: pm.chave, rotulo: pm.rotulo, unidade: pm.unidade, valor, min: pm.min, max: pm.max, casas: pm.casas, alerta: valor < pm.min || valor > pm.max };
  });

  // Programa em execução e progresso do ciclo
  const emCiclo = m.estadoMaquina === "OPERANDO" || m.estadoMaquina === "PAUSADO" || m.estadoMaquina === "ALARME";
  const cicloMs = p.ciclo * 60_000;
  const deslocamento = hash(`${m.id}:ciclo`) * cicloMs;
  // Pausado/alarme: o progresso "congela" no ponto em que parou (aproximado por um valor fixo da máquina)
  const progresso = !emCiclo ? null : m.estadoMaquina === "OPERANDO" ? ((t + deslocamento) % cicloMs) / cicloMs : 0.2 + hash(`${m.id}:parado`) * 0.6;
  const nCiclo = Math.floor((t + deslocamento) / cicloMs);
  const programa = emCiclo ? p.programas[nCiclo % p.programas.length] : null;

  // OEE simulado: estável por máquina, menor quando parada
  const oeeBase = 0.68 + hash(`${m.id}:oee`) * 0.2;
  const oee = arred(m.estadoMaquina === "OPERANDO" ? oeeBase : m.estadoMaquina === "OCIOSO" ? oeeBase * 0.82 : oeeBase * 0.6, 3);

  return {
    equipamentoId: m.id, online: true, estado, lidoEm: agora.toISOString(), ultimoContatoEm: agora.toISOString(),
    latenciaMs: Math.round(3 + hash(`${m.id}:lat`) * 14 + Math.abs(ruido(`${m.id}:lat`, t)) * 4),
    programa, progresso: progresso === null ? null : arred(progresso, 4),
    restanteMin: progresso === null ? null : Math.max(1, Math.round((1 - progresso) * p.ciclo)),
    oee, metricas, alarmeAtivo: m.alarmeAtivo,
  };
}

/** Série recente de cada métrica (pontos a cada `passoMs`, do mais antigo ao atual). */
export function serieRecente(m: MaquinaParaLeitura, agora = new Date(), pontos = 40, passoMs = 3000): Record<string, (number | null)[]> {
  const p = PERFIS[m.tipo];
  const out: Record<string, (number | null)[]> = Object.fromEntries(p.metricas.map((pm) => [pm.chave, []]));
  for (let k = pontos - 1; k >= 0; k--) {
    const t = agora.getTime() - k * passoMs;
    p.metricas.forEach((pm, i) => out[pm.chave].push(m.estadoMaquina === "OFFLINE" ? null : valorMetrica(m, p, i, t)));
  }
  return out;
}

// ─────────────────────────────── comandos remotos ───────────────────────────────

export type AvaliacaoComando =
  | { ok: true; novoEstado: EstadoMaquina; reconhecerAlarmes: boolean }
  | { ok: false; motivo: string };

/**
 * Regras de segurança dos comandos remotos.
 * Princípio: remotamente só se PARA ou se SUSPENDE movimento com facilidade;
 * colocar a máquina em movimento exige condições seguras. Parada de emergência
 * não existe aqui: ela é sempre física e local (NR-12).
 */
export function avaliarComando(p: {
  tipo: TipoComando;
  status: StatusEquipamento;
  estado: EstadoMaquina;
  alarmes: { severidade: SeveridadeAlarme; reconhecido: boolean }[];
}): AvaliacaoComando {
  const { tipo, status, estado, alarmes } = p;
  if (estado === "OFFLINE") return { ok: false, motivo: "Máquina sem comunicação — comando não entregue." };

  if (tipo === "RECONHECER_ALARMES") {
    return alarmes.some((a) => !a.reconhecido)
      ? { ok: true, novoEstado: estado, reconhecerAlarmes: true }
      : { ok: false, motivo: "Nenhum alarme pendente de reconhecimento." };
  }
  if (status === "MANUTENCAO" && tipo !== "PARAR_CICLO") {
    return { ok: false, motivo: "Equipamento em manutenção — comandos de operação bloqueados." };
  }
  switch (tipo) {
    case "PAUSAR":
      return estado === "OPERANDO" ? { ok: true, novoEstado: "PAUSADO", reconhecerAlarmes: false } : { ok: false, motivo: "A máquina não está executando um ciclo." };
    case "RETOMAR":
      if (estado !== "PAUSADO") return { ok: false, motivo: "Só é possível retomar um ciclo pausado." };
      if (alarmes.some((a) => a.severidade === "CRITICO")) {
        return { ok: false, motivo: "Há alarme crítico ativo — a retomada exige inspeção no local (NR-12)." };
      }
      return { ok: true, novoEstado: "OPERANDO", reconhecerAlarmes: false };
    case "PARAR_CICLO":
      return estado === "OPERANDO" || estado === "PAUSADO" || estado === "ALARME"
        ? { ok: true, novoEstado: "OCIOSO", reconhecerAlarmes: false }
        : { ok: false, motivo: "Não há ciclo em andamento para parar." };
  }
}
