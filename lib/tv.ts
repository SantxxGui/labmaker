/**
 * Modo TV — o que aparece no monitor da recepção do espaço.
 * Cálculo puro (sem banco): o model busca, esta função decide o que mostrar e o que esconder.
 *
 * Privacidade: a TV fica num lugar público. Aluno aparece só como "Bruna S." (primeiro nome + inicial),
 * nenhum e-mail chega à tela e eventos de login/contas ficam de fora.
 */
import { espacoAberto } from "@/lib/automacao";
import { LAB } from "@/lib/slots";
import type { StatusEquipamento, TelemetriaDTO } from "@/lib/types";

export type SituacaoTv = "LIVRE" | "RESERVADA" | "OPERANDO" | "ALARME" | "MANUTENCAO";

export type TvDTO = {
  geradoEm: string;
  espaco: { aberto: boolean; abertura: number; fechamento: number };
  resumo: { maquinas: number; livres: number; emUso: number; manutencao: number; alarmes: number };
  maquinas: {
    id: string; nome: string; laboratorio: string; situacao: SituacaoTv; online: boolean;
    progresso: number | null; restanteMin: number | null; alarme: string | null;
    agora: { usuario: string; fim: string } | null;
    proxima: { usuario: string; inicio: string } | null;
  }[];
  proximas: { id: string; inicio: string; fim: string; maquina: string; laboratorio: string; usuario: string }[];
  aparelhos: { total: number; online: number; emprestados: number; atrasados: number; bloqueados: number };
  atendimento: { esperando: number; emAtendimento: number; fila: { numero: number; aparelho: string; status: "ABERTO" | "EM_ATENDIMENTO"; desde: string }[] };
  atividade: { id: string; quando: string; texto: string }[];
};

export type EntradaTv = {
  agora: Date;
  maquinas: { id: string; nome: string; laboratorio: string; status: StatusEquipamento; leitura: TelemetriaDTO }[];
  reservas: { id: string; inicio: Date; fim: Date; equipamentoId: string; usuarioNome: string }[]; // de hoje, confirmadas
  aparelhos: { ativo: boolean; online: boolean; bloqueado: boolean; emprestimo: { prazoEm: Date } | null }[];
  chamados: { numero: number; aparelho: string; status: "ABERTO" | "EM_ATENDIMENTO"; criadoEm: Date }[];
  atividade: { id: string; criadoEm: string; acao: string; resumo: string }[];
};

/** "Bruna Souza Lima" → "Bruna S."; "Rafael" → "Rafael" */
export function nomePublico(nome: string) {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return "Aluno";
  return partes.length === 1 ? partes[0] : `${partes[0]} ${partes[partes.length - 1][0].toUpperCase()}.`;
}

/** Eventos que não vão para a TV: contas, logins, senhas e exportações. */
const PRIVADOS = /^(auth|usuario|sessao|auditoria)\./;
const EMAIL = /[\w.+-]+@[\w-]+(\.[\w-]+)+/g;

export function montarTv(e: EntradaTv): TvDTO {
  const t = e.agora.getTime();

  const maquinas = e.maquinas
    .map((m) => {
      const minhas = e.reservas.filter((r) => r.equipamentoId === m.id).sort((a, b) => a.inicio.getTime() - b.inicio.getTime());
      const atual = minhas.find((r) => r.inicio.getTime() <= t && r.fim.getTime() > t) ?? null;
      const prox = minhas.find((r) => r.inicio.getTime() > t) ?? null;
      const l = m.leitura;
      const situacao: SituacaoTv =
        m.status === "MANUTENCAO" || l.estado === "MANUTENCAO" ? "MANUTENCAO"
        : l.alarmeAtivo ? "ALARME"
        : l.estado === "OPERANDO" ? "OPERANDO"
        : atual || m.status === "EM_USO" ? "RESERVADA"
        : "LIVRE";
      return {
        id: m.id, nome: m.nome, laboratorio: m.laboratorio, situacao, online: l.online,
        progresso: situacao === "OPERANDO" ? l.progresso : null,
        restanteMin: situacao === "OPERANDO" ? l.restanteMin : null,
        alarme: l.alarmeAtivo?.mensagem ?? null,
        agora: atual ? { usuario: nomePublico(atual.usuarioNome), fim: atual.fim.toISOString() } : null,
        proxima: prox ? { usuario: nomePublico(prox.usuarioNome), inicio: prox.inicio.toISOString() } : null,
      };
    })
    .sort((a, b) => a.laboratorio.localeCompare(b.laboratorio) || a.nome.localeCompare(b.nome));

  const porId = new Map(e.maquinas.map((m) => [m.id, m]));
  const proximas = e.reservas
    .filter((r) => r.fim.getTime() > t)
    .sort((a, b) => a.inicio.getTime() - b.inicio.getTime())
    .slice(0, 6)
    .map((r) => ({
      id: r.id, inicio: r.inicio.toISOString(), fim: r.fim.toISOString(),
      maquina: porId.get(r.equipamentoId)?.nome ?? "—", laboratorio: porId.get(r.equipamentoId)?.laboratorio ?? "",
      usuario: nomePublico(r.usuarioNome),
    }));

  const ativos = e.aparelhos.filter((a) => a.ativo);
  const emprestados = ativos.filter((a) => a.emprestimo);

  return {
    geradoEm: e.agora.toISOString(),
    espaco: { aberto: espacoAberto(e.agora), abertura: LAB.abertura, fechamento: LAB.fechamento },
    resumo: {
      maquinas: maquinas.length,
      livres: maquinas.filter((m) => m.situacao === "LIVRE").length,
      emUso: maquinas.filter((m) => m.situacao === "RESERVADA" || m.situacao === "OPERANDO").length,
      manutencao: maquinas.filter((m) => m.situacao === "MANUTENCAO").length,
      alarmes: maquinas.filter((m) => m.situacao === "ALARME").length,
    },
    maquinas,
    proximas,
    aparelhos: {
      total: ativos.length,
      online: ativos.filter((a) => a.online).length,
      emprestados: emprestados.length,
      atrasados: emprestados.filter((a) => a.emprestimo!.prazoEm.getTime() < t).length,
      bloqueados: ativos.filter((a) => a.bloqueado).length,
    },
    atendimento: {
      esperando: e.chamados.filter((c) => c.status === "ABERTO").length,
      emAtendimento: e.chamados.filter((c) => c.status === "EM_ATENDIMENTO").length,
      fila: [...e.chamados]
        .sort((a, b) => a.criadoEm.getTime() - b.criadoEm.getTime())
        .slice(0, 4)
        .map((c) => ({ numero: c.numero, aparelho: c.aparelho, status: c.status, desde: c.criadoEm.toISOString() })),
    },
    atividade: e.atividade
      .filter((a) => !PRIVADOS.test(a.acao))
      .slice(0, 8)
      .map((a) => ({ id: a.id, quando: a.criadoEm, texto: a.resumo.replace(EMAIL, "…") })),
  };
}
