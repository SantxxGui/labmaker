/**
 * Conversão de linhas do banco (Date, relações aninhadas) para DTOs JSON.
 * Funções puras: usadas pelos models e pela demonstração estática.
 */
import { situacaoCalibracao } from "@/lib/slots";
import type {
  AgendamentoDTO, Criticidade, EquipamentoDTO, EstadoMaquina, ProtocoloIndustrial, StatusAgendamento, StatusEquipamento, TipoEquipamento,
} from "@/lib/types";

export type EquipamentoRow = {
  id: string; nome: string; tipo: TipoEquipamento; fabricante: string | null; modelo: string | null;
  patrimonio: string | null; localizacao: string | null; status: StatusEquipamento; criticidade: Criticidade;
  duracaoSlotMinutos: number; requerCalibracao: boolean; intervaloCalibracaoDias: number | null;
  proximaCalibracaoEm: Date | null;
  numeroSerie: string | null;
  enderecoIp: string | null;
  protocolo: ProtocoloIndustrial | null;
  firmware: string | null;
  cameraUrl: string | null;
  estadoMaquina: EstadoMaquina;
  laboratorio: { id: string; nome: string; codigo: string; unidade: { sigla: string } };
};

export function toEquipamentoDTO(e: EquipamentoRow, reservasHoje?: number): EquipamentoDTO {
  return {
    id: e.id, nome: e.nome, tipo: e.tipo, fabricante: e.fabricante, modelo: e.modelo,
    patrimonio: e.patrimonio, localizacao: e.localizacao, status: e.status, criticidade: e.criticidade,
    duracaoSlotMinutos: e.duracaoSlotMinutos, requerCalibracao: e.requerCalibracao,
    intervaloCalibracaoDias: e.intervaloCalibracaoDias,
    proximaCalibracaoEm: e.proximaCalibracaoEm?.toISOString() ?? null,
    calibracao: situacaoCalibracao(e),
    laboratorio: {
      id: e.laboratorio.id, nome: e.laboratorio.nome, codigo: e.laboratorio.codigo,
      unidadeSigla: e.laboratorio.unidade.sigla,
    },
    ...(reservasHoje !== undefined ? { reservasHoje } : {}),
    numeroSerie: e.numeroSerie,
    enderecoIp: e.enderecoIp,
    protocolo: e.protocolo,
    firmware: e.firmware,
    // A URL da câmera (com IP interno) nunca vai para o navegador
    temCamera: !!e.cameraUrl,
    estadoMaquina: e.estadoMaquina,
  };
}

export type AgendamentoRow = {
  id: string; inicio: Date; fim: Date; status: StatusAgendamento; finalidade: string | null;
  equipamento: { id: string; nome: string; tipo: TipoEquipamento; laboratorio: { codigo: string } };
  usuario?: { id: string; nome: string; email: string };
};

export function toAgendamentoDTO(a: AgendamentoRow): AgendamentoDTO {
  return {
    id: a.id, inicio: a.inicio.toISOString(), fim: a.fim.toISOString(), status: a.status,
    finalidade: a.finalidade,
    equipamento: {
      id: a.equipamento.id, nome: a.equipamento.nome, tipo: a.equipamento.tipo,
      laboratorioCodigo: a.equipamento.laboratorio.codigo,
    },
    ...(a.usuario ? { usuario: a.usuario } : {}),
  };
}

