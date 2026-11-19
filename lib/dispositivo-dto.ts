/**
 * Conversão linha → DTO do módulo de dispositivos. Puro (sem banco):
 * usado pelos models reais e pelos models em memória da demonstração.
 */
import { avaliarConformidade, estaOnline, lerDispositivo, statusEfetivo, type TelemetriaAgente } from "@/lib/agente";
import type {
  AcaoDispositivoDTO, DispositivoDTO, DispositivoPainelDTO, EventoDispositivoDTO, LoteAlertaDTO, ModoDownload, PoliticaDTO, SeveridadeAlarme,
  SistemaOperacional, StatusAcao, TipoAcaoDispositivo, TipoDispositivo,
} from "@/lib/types";

export type DispositivoRow = {
  id: string; hostname: string; tipo: TipoDispositivo; so: SistemaOperacional; versaoSo: string; fabricante: string; modelo: string;
  numeroSerie: string; enderecoIp: string | null; enderecoMac: string | null; agenteVersao: string; criptografado: boolean;
  antivirusAtivo: boolean; firewallAtivo: boolean; atualizacoesPendentes: number; armazenamentoGb: number; bloqueado: boolean;
  appsInstalados: string[]; ultimoContatoEm: Date | null;
  agenteReal: boolean; telemetria: unknown;
  responsavel: { id: string; nome: string } | null;
  laboratorio: { id: string; codigo: string; nome: string; unidade: { sigla: string } } | null;
  politica: { id: string; nome: string; exigirCriptografia: boolean; appsBloqueados: string[] } | null;
};

export function toDispositivoDTO(d: DispositivoRow): DispositivoDTO {
  return {
    id: d.id, hostname: d.hostname, tipo: d.tipo, so: d.so, versaoSo: d.versaoSo, fabricante: d.fabricante, modelo: d.modelo,
    numeroSerie: d.numeroSerie, enderecoIp: d.enderecoIp, enderecoMac: d.enderecoMac, agenteVersao: d.agenteVersao,
    criptografado: d.criptografado, antivirusAtivo: d.antivirusAtivo, firewallAtivo: d.firewallAtivo,
    atualizacoesPendentes: d.atualizacoesPendentes, armazenamentoGb: d.armazenamentoGb, bloqueado: d.bloqueado,
    appsInstalados: d.appsInstalados, ultimoContatoEm: d.ultimoContatoEm?.toISOString() ?? null,
    agenteReal: d.agenteReal,
    responsavel: d.responsavel,
    laboratorio: d.laboratorio ? { id: d.laboratorio.id, codigo: d.laboratorio.codigo, nome: d.laboratorio.nome, unidadeSigla: d.laboratorio.unidade.sigla } : null,
    politica: d.politica,
  };
}

/** Dispositivo + telemetria do agente + checklist de conformidade. */
export function toPainelDTO(d: DispositivoRow, agora = new Date()): DispositivoPainelDTO {
  const dto = toDispositivoDTO(d);
  return {
    ...dto,
    leitura: lerDispositivo({ ...d, responsavelNome: d.responsavel?.nome ?? null, telemetria: (d.telemetria as TelemetriaAgente | null) ?? null }, agora),
    conformidade: avaliarConformidade(d, agora),
  };
}

export type AcaoRow = {
  id: string; tipo: TipoAcaoDispositivo; status: StatusAcao; lote: string | null; titulo: string | null; mensagem: string | null;
  prioridade: SeveridadeAlarme | null; parametro: string | null; justificativa: string | null; motivo: string | null;
  criadoEm: Date; concluidoEm: Date | null;
  /** null = ação do sistema (automação) */
  usuario: { id: string; nome: string } | null;
  dispositivo: { id: string; hostname: string; tipo: TipoDispositivo; ultimoContatoEm: Date | null; agenteReal?: boolean };
};

/** Autor exibido nas ações feitas pela automação (lembrete de devolução, fechamento do espaço). */
export const SISTEMA = { id: "sistema", nome: "Sistema LabMaker" };

export function toAcaoDTO(a: AcaoRow, agora = new Date()): AcaoDispositivoDTO {
  const real = !!a.dispositivo.agenteReal;
  const ef = statusEfetivo(a, estaOnline(a.dispositivo.ultimoContatoEm, agora, real), agora, real);
  return {
    id: a.id, tipo: a.tipo, status: ef.status, lote: a.lote, titulo: a.titulo, mensagem: a.mensagem, prioridade: a.prioridade,
    parametro: a.parametro, justificativa: a.justificativa, motivo: a.motivo, criadoEm: a.criadoEm.toISOString(), concluidoEm: ef.concluidoEm,
    usuario: a.usuario ?? SISTEMA, dispositivo: { id: a.dispositivo.id, hostname: a.dispositivo.hostname, tipo: a.dispositivo.tipo },
  };
}

export type EventoRow = {
  id: string; tipo: string; descricao: string; severidade: SeveridadeAlarme; criadoEm: Date;
  dispositivo: { id: string; hostname: string; tipo: TipoDispositivo };
};
export const toEventoDTO = (e: EventoRow): EventoDispositivoDTO => ({ ...e, criadoEm: e.criadoEm.toISOString() });

export type PoliticaRow = {
  id: string; nome: string; descricao: string | null; bloquearUsb: boolean; modoDownload: ModoDownload; sitesBloqueados: string[];
  appsBloqueados: string[]; exigirCriptografia: boolean; bloqueioTelaMinutos: number; bloquearForaHorario: boolean; atualizadoEm: Date; totalDispositivos: number;
};
export const toPoliticaDTO = (p: PoliticaRow): PoliticaDTO => ({ ...p, atualizadoEm: p.atualizadoEm.toISOString() });

/** Agrupa as ações de alerta por lote: quantos receberam e quantos confirmaram a leitura. */
export function resumirLotes(acoes: AcaoDispositivoDTO[]): LoteAlertaDTO[] {
  const mapa = new Map<string, LoteAlertaDTO>();
  for (const a of acoes) {
    if (a.tipo !== "ALERTA" || !a.lote) continue;
    const l = mapa.get(a.lote) ?? {
      lote: a.lote, titulo: a.titulo ?? "", mensagem: a.mensagem ?? "", prioridade: a.prioridade ?? "INFO", criadoEm: a.criadoEm,
      autor: a.usuario.nome, total: 0, pendentes: 0, entregues: 0, lidos: 0,
    };
    l.total++;
    if (a.status === "PENDENTE") l.pendentes++;
    else if (a.status === "ENTREGUE") l.entregues++;
    else if (a.status === "EXECUTADA") l.lidos++;
    mapa.set(a.lote, l);
  }
  return [...mapa.values()].sort((a, b) => b.criadoEm.localeCompare(a.criadoEm));
}
