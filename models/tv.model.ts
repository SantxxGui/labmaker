/**
 * MODEL — Modo TV: junta, numa ida ao banco, o que a tela da recepção precisa.
 * O que mostrar (e o que esconder) fica em lib/tv.ts.
 */
import "server-only";
import { prisma } from "@/lib/prisma";
import { estaOnline } from "@/lib/agente";
import { horarioLocal, hojeNoLab } from "@/lib/slots";
import { lerTelemetria } from "@/lib/telemetria";
import { montarTv } from "@/lib/tv";
import { AuditoriaModel } from "@/models/auditoria.model";
import { EquipamentoModel } from "@/models/equipamento.model";

export const TvModel = {
  async estado(agora = new Date()) {
    const hoje = hojeNoLab(agora);
    const [equipamentos, leituras, reservas, dispositivos, chamados, atividade] = await Promise.all([
      prisma.equipamento.findMany({ where: { ativo: true }, select: { id: true, nome: true, status: true, laboratorio: { select: { codigo: true } } } }),
      EquipamentoModel.paraTelemetria(),
      prisma.agendamento.findMany({
        where: { status: "CONFIRMADO", inicio: { lt: horarioLocal(hoje, 24 * 60) }, fim: { gt: horarioLocal(hoje, 0) } },
        select: { id: true, inicio: true, fim: true, equipamentoId: true, usuario: { select: { nome: true } } },
      }),
      prisma.dispositivo.findMany({
        where: { ativo: true },
        select: { ativo: true, bloqueado: true, agenteReal: true, ultimoContatoEm: true, emprestimos: { where: { devolvidoEm: null }, select: { prazoEm: true }, take: 1 } },
      }),
      prisma.chamado.findMany({
        where: { status: { in: ["ABERTO", "EM_ATENDIMENTO"] } },
        select: { numero: true, status: true, criadoEm: true, dispositivo: { select: { hostname: true } } },
      }),
      AuditoriaModel.recentes(20),
    ]);
    const leituraDe = new Map(leituras.map((m) => [m.id, lerTelemetria(m, agora)]));
    return montarTv({
      agora,
      maquinas: equipamentos.flatMap((e) => {
        const leitura = leituraDe.get(e.id);
        return leitura ? [{ id: e.id, nome: e.nome, laboratorio: e.laboratorio.codigo, status: e.status, leitura }] : [];
      }),
      reservas: reservas.map((r) => ({ id: r.id, inicio: r.inicio, fim: r.fim, equipamentoId: r.equipamentoId, usuarioNome: r.usuario.nome })),
      aparelhos: dispositivos.map((d) => ({
        ativo: d.ativo, bloqueado: d.bloqueado, online: estaOnline(d.ultimoContatoEm, agora, d.agenteReal),
        emprestimo: d.emprestimos[0] ?? null,
      })),
      chamados: chamados.map((c) => ({ numero: c.numero, aparelho: c.dispositivo.hostname, status: c.status as "ABERTO" | "EM_ATENDIMENTO", criadoEm: c.criadoEm })),
      atividade: atividade.map((a) => ({ id: a.id, criadoEm: a.criadoEm, acao: a.acao, resumo: a.resumo })),
    });
  },
};
