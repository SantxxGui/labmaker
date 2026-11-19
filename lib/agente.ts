/**
 * Gestão de dispositivos — domínio puro (sem banco, sem rede), testado em tests/agente.test.ts.
 *
 * Em produção, cada notebook/desktop/tablet tem um AGENTE instalado (ou é gerenciado via MDM:
 * Intune, Apple Business Manager, Android Enterprise). O agente faz check-in periódico com a API,
 * reporta telemetria/eventos e busca as ações pendentes.
 *
 * Aqui o agente é SIMULADO de forma determinística, com o mesmo formato de dados:
 *  - lerDispositivo()   → telemetria (CPU, memória, disco, bateria, sessão, app em uso)
 *  - avaliarConformidade() → checklist de segurança contra a política
 *  - avaliarAcao()      → regras do que o TI pode mandar fazer
 *  - statusEfetivo()    → ciclo PENDENTE → ENTREGUE → EXECUTADA conforme o agente responde
 */
import type {
  ConformidadeDTO, LeituraDispositivoDTO, ModoDownload, SistemaOperacional, StatusAcao, TipoAcaoDispositivo, TipoDispositivo,
} from "@/lib/types";

/** Sem contato há mais que isso = offline (o simulador considera vivo o agente com contato recente). */
export const LIMITE_OFFLINE_MS = 36 * 3_600_000;
/** Agente REAL: faz check-in a cada 15 s; sem notícia há 90 s = offline. */
export const LIMITE_OFFLINE_REAL_MS = 90_000;
export const INTERVALO_CHECKIN_S = 15;

/** O que um agente real envia no check-in (validado por agenteCheckinSchema). */
export type TelemetriaAgente = {
  cpu: number | null; memoria: number | null; disco: number | null; bateria: number | null; carregando: boolean;
  rede: string | null; usuarioSessao: string | null; appAtivo: string | null; uptimeH: number | null;
  /** Itens de segurança que o sistema do aparelho conseguiu informar (o resto aparece como "não informado") */
  segurancaInformada?: string[];
};
/** Versão atual do agente — abaixo disso a conformidade reprova. */
export const AGENTE_ATUAL = "4.6";

// ───────────────────────── catálogo e categorias ─────────────────────────

type Plataforma = "desktop" | "mobile";
const PLATAFORMA: Record<SistemaOperacional, Plataforma> = {
  WINDOWS: "desktop", MACOS: "desktop", LINUX: "desktop", CHROMEOS: "desktop", ANDROID: "mobile", IOS: "mobile",
};
export const plataforma = (so: SistemaOperacional) => PLATAFORMA[so];

/** Aplicativos aprovados pela equipe do espaço (o catálogo). */
export const CATALOGO: { nome: string; categoria: string; plataformas: Plataforma[] }[] = [
  { nome: "Google Chrome", categoria: "Navegador", plataformas: ["desktop", "mobile"] },
  { nome: "Microsoft 365", categoria: "Produtividade", plataformas: ["desktop", "mobile"] },
  { nome: "Microsoft Teams", categoria: "Comunicação", plataformas: ["desktop", "mobile"] },
  { nome: "Fusion 360", categoria: "Modelagem 3D", plataformas: ["desktop"] },
  { nome: "Blender 4.2", categoria: "Modelagem 3D", plataformas: ["desktop"] },
  { nome: "PrusaSlicer 2.9", categoria: "Impressão 3D", plataformas: ["desktop"] },
  { nome: "Bambu Studio", categoria: "Impressão 3D", plataformas: ["desktop"] },
  { nome: "UltiMaker Cura 5.8", categoria: "Impressão 3D", plataformas: ["desktop"] },
  { nome: "LightBurn 1.7", categoria: "Corte a laser", plataformas: ["desktop"] },
  { nome: "Inkscape 1.4", categoria: "Vetores", plataformas: ["desktop"] },
  { nome: "Silhouette Studio 5", categoria: "Plotter de recorte", plataformas: ["desktop"] },
  { nome: "Arduino IDE 2", categoria: "Eletrônica", plataformas: ["desktop"] },
  { nome: "KiCad 8", categoria: "Eletrônica", plataformas: ["desktop"] },
  { nome: "Visual Studio Code", categoria: "Programação", plataformas: ["desktop"] },
  { nome: "Python 3.13", categoria: "Programação", plataformas: ["desktop"] },
  { nome: "7-Zip", categoria: "Utilitário", plataformas: ["desktop"] },
  { nome: "Adobe Acrobat Reader", categoria: "Produtividade", plataformas: ["desktop", "mobile"] },
  { nome: "LabMaker Mobile", categoria: "Operação", plataformas: ["mobile"] },
  { nome: "Leitor de QR Code", categoria: "Operação", plataformas: ["mobile"] },
];
export const APP_AGENTE = "Agente LabMaker";
export const catalogoPara = (so: SistemaOperacional) => CATALOGO.filter((a) => a.plataformas.includes(plataforma(so)));

/** Categorias de site que o filtro do agente sabe bloquear. */
export const CATEGORIAS_SITE: Record<string, string> = {
  jogos: "Jogos",
  torrent: "Torrent e P2P",
  streaming: "Streaming de vídeo",
  redes_sociais: "Redes sociais",
  apostas: "Apostas",
  armazenamento_pessoal: "Armazenamento pessoal (Drive, Dropbox)",
  ia_publica: "IA pública sem contrato",
};

/** Extensões barradas quando o modo é BLOQUEAR_EXECUTAVEIS. */
export const EXTENSOES_EXECUTAVEIS = [".exe", ".msi", ".bat", ".cmd", ".ps1", ".dmg", ".pkg", ".apk", ".jar", ".vbs"];

/** O download seria permitido pela política? (usado pelo agente e nos testes) */
export function downloadPermitido(arquivo: string, modo: ModoDownload): { ok: boolean; motivo?: string } {
  const ext = arquivo.toLowerCase().match(/\.[a-z0-9]+$/)?.[0] ?? "";
  if (modo === "LIVRE") return { ok: true };
  if (EXTENSOES_EXECUTAVEIS.includes(ext))
    return { ok: false, motivo: modo === "SOMENTE_APROVADOS" ? "instaladores só pelo catálogo do espaço" : `arquivos ${ext} bloqueados pela política` };
  return { ok: true };
}

// ───────────────────────── utilitários determinísticos ─────────────────────────

function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  // mistura final (avalanche) para ids parecidos ("ad_001", "ad_002") darem valores bem diferentes
  h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967295;
}
/** Ruído suave em [-1, 1] que varia com o tempo. */
function onda(id: string, t: number, periodoS: number) {
  const f = hash(id) * Math.PI * 2;
  const x = t / 1000 / periodoS;
  return 0.6 * Math.sin(x * 2 * Math.PI + f) + 0.4 * Math.sin(x * 5.3 + f * 2.1);
}
const limitar = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

// ───────────────────────── telemetria ─────────────────────────

export type DispositivoParaLeitura = {
  id: string;
  tipo: TipoDispositivo;
  so: SistemaOperacional;
  bloqueado: boolean;
  appsInstalados: string[];
  ultimoContatoEm: Date | string | null;
  responsavelNome: string | null;
  /** agente real inscrito: a leitura vem do último check-in, não do simulador */
  agenteReal?: boolean;
  telemetria?: TelemetriaAgente | null;
};

export function estaOnline(ultimoContatoEm: Date | string | null, agora = new Date(), real = false) {
  if (!ultimoContatoEm) return false;
  return agora.getTime() - new Date(ultimoContatoEm).getTime() < (real ? LIMITE_OFFLINE_REAL_MS : LIMITE_OFFLINE_MS);
}

export function lerDispositivo(d: DispositivoParaLeitura, agora = new Date()): LeituraDispositivoDTO {
  const online = estaOnline(d.ultimoContatoEm, agora, d.agenteReal);
  const t = agora.getTime();
  const base = { dispositivoId: d.id, lidoEm: agora.toISOString() };
  if (d.agenteReal) {
    // Leitura REAL: exatamente o que o agente mandou no último check-in
    const r = d.telemetria;
    return {
      ...base, online, cpu: online ? r?.cpu ?? null : null, memoria: online ? r?.memoria ?? null : null, disco: r?.disco ?? null,
      bateria: online ? r?.bateria ?? null : null, carregando: !!r?.carregando, rede: online ? r?.rede ?? null : null,
      usuarioSessao: online && !d.bloqueado ? r?.usuarioSessao ?? null : null, appAtivo: online && !d.bloqueado ? r?.appAtivo ?? null : null,
      uptimeH: online ? r?.uptimeH ?? null : null,
      ultimoContatoEm: d.ultimoContatoEm ? new Date(d.ultimoContatoEm).toISOString() : null,
    };
  }
  if (!online) {
    return {
      ...base, online: false, cpu: null, memoria: null, disco: Math.round(40 + hash(d.id + "d") * 45), bateria: null, carregando: false,
      rede: null, usuarioSessao: null, appAtivo: null, uptimeH: null,
      ultimoContatoEm: d.ultimoContatoEm ? new Date(d.ultimoContatoEm).toISOString() : null,
    };
  }
  const h = hash(d.id);
  const pesado = d.appsInstalados.some((a) => /Fusion|Blender|Bambu|Prusa|Cura|LightBurn|KiCad/.test(a));
  const cpuBase = d.bloqueado ? 3 : pesado ? 38 : 14;
  const cpu = Math.round(limitar(cpuBase + h * 18 + onda(d.id, t, 9) * (pesado ? 24 : 10), 1, 99));
  const memoria = Math.round(limitar(42 + h * 30 + onda(d.id + "m", t, 60) * 8, 8, 97));
  const disco = Math.round(40 + hash(d.id + "d") * 45);
  const temBateria = d.tipo !== "DESKTOP";
  const carregando = temBateria && hash(d.id + "c") > 0.55;
  const bateria = temBateria ? Math.round(limitar(25 + hash(d.id + "b") * 70 + (carregando ? 1 : -1) * ((t / 60000) % 20) * 0.3, 5, 100)) : null;
  const rede = d.tipo === "DESKTOP" ? "Ethernet" : d.tipo === "SMARTPHONE" && h > 0.5 ? "4G" : "Wi-Fi";

  // app em primeiro plano troca a cada ~40 s entre os apps de trabalho instalados
  const apps = d.appsInstalados.filter((a) => a !== APP_AGENTE);
  const janela = Math.floor(t / 40_000 + h * 10);
  const appAtivo = d.bloqueado ? null : apps.length ? apps[janela % apps.length] : null;

  return {
    ...base, online: true, cpu, memoria, disco, bateria, carregando, rede,
    usuarioSessao: d.bloqueado ? null : d.tipo === "TABLET" ? "Quiosque" : d.responsavelNome,
    appAtivo,
    uptimeH: Math.round(2 + h * 120),
    // o agente faz check-in a cada ~30 s
    ultimoContatoEm: new Date(t - Math.floor(((t / 1000 + h * 30) % 30) * 1000)).toISOString(),
  };
}

// ───────────────────────── conformidade ─────────────────────────

export type DispositivoParaConformidade = {
  so: SistemaOperacional;
  criptografado: boolean;
  antivirusAtivo: boolean;
  firewallAtivo: boolean;
  atualizacoesPendentes: number;
  agenteVersao: string;
  ultimoContatoEm: Date | string | null;
  politica: { nome: string; exigirCriptografia: boolean } | null;
  /** Agente real: só vale o que o sistema informou. Simulado/demonstração: undefined (confia nos campos). */
  agenteReal?: boolean;
  telemetria?: unknown;
};

const versaoMenor = (a: string, b: string) => {
  const [x, y] = [a.split(".").map(Number), b.split(".").map(Number)];
  for (let i = 0; i < Math.max(x.length, y.length); i++) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) < (y[i] ?? 0);
  return false;
};

/** Marca de aparelho cadastrado à mão pelo Líder: ainda sem agente, logo sem telemetria nem checklist. */
export const SEM_AGENTE = "—";

export function avaliarConformidade(d: DispositivoParaConformidade, agora = new Date()): ConformidadeDTO {
  if (d.agenteVersao === SEM_AGENTE) {
    return { semAgente: true, conforme: true, pontuacao: 0, itens: [{ chave: "agente", rotulo: "Agente LabMaker instalado", ok: false, detalhe: "Cadastrado manualmente — instale o agente para monitorar" }] };
  }
  const mobile = plataforma(d.so) === "mobile";
  const diasSemContato = d.ultimoContatoEm ? (agora.getTime() - new Date(d.ultimoContatoEm).getTime()) / 86_400_000 : Infinity;
  const exige = d.politica?.exigirCriptografia ?? true;
  const itens = [
    {
      chave: "politica", rotulo: "Política de segurança aplicada", ok: !!d.politica,
      detalhe: d.politica ? d.politica.nome : "Nenhuma política atribuída",
    },
    {
      chave: "criptografia", rotulo: mobile ? "Armazenamento criptografado" : d.so === "MACOS" ? "FileVault ativo" : d.so === "WINDOWS" ? "BitLocker ativo" : "Disco criptografado",
      ok: d.criptografado || !exige, detalhe: d.criptografado ? "Ativo" : exige ? "Desativado — exigido pela política" : "Desativado (não exigido)",
    },
    {
      chave: "antivirus", rotulo: mobile ? "Proteção contra ameaças" : "Antivírus em tempo real", ok: d.antivirusAtivo,
      detalhe: d.antivirusAtivo ? "Ativo e atualizado" : "Desativado pelo usuário",
    },
    {
      chave: "firewall", rotulo: "Firewall", ok: mobile || d.firewallAtivo,
      detalhe: mobile ? "Gerenciado pelo sistema" : d.firewallAtivo ? "Ativo" : "Desativado",
    },
    {
      chave: "atualizacoes", rotulo: "Atualizações do sistema", ok: d.atualizacoesPendentes <= 2,
      detalhe: d.atualizacoesPendentes === 0 ? "Em dia" : `${d.atualizacoesPendentes} pendente${d.atualizacoesPendentes > 1 ? "s" : ""}`,
    },
    {
      chave: "agente", rotulo: "Agente LabMaker atualizado", ok: d.agenteVersao.startsWith("web") || !versaoMenor(d.agenteVersao, AGENTE_ATUAL),
      // pelo navegador a página sempre vem do servidor: está sempre na versão atual
      detalhe: d.agenteVersao.startsWith("web") ? "Pelo navegador (sempre atual)" : `v${d.agenteVersao}${versaoMenor(d.agenteVersao, AGENTE_ATUAL) ? ` (atual: v${AGENTE_ATUAL})` : ""}`,
    },
    {
      chave: "contato", rotulo: "Check-in nos últimos 7 dias", ok: diasSemContato <= 7,
      detalhe: Number.isFinite(diasSemContato) ? (diasSemContato < 1 ? "Hoje" : `Há ${Math.floor(diasSemContato)} dia(s)`) : "Nunca",
    },
  ];
  // Agente real: o que o sistema não deixou ler fica "não informado" — nem aprova nem reprova
  const informados = d.agenteReal ? ((d.telemetria as TelemetriaAgente | null)?.segurancaInformada ?? []) : null;
  const campo: Record<string, string> = { criptografia: "criptografado", antivirus: "antivirusAtivo", firewall: "firewallAtivo", atualizacoes: "atualizacoesPendentes" };
  const finais = itens.map((i) =>
    informados && campo[i.chave] && !informados.includes(campo[i.chave]) && !(i.chave === "firewall" && mobile)
      ? { ...i, ok: true, neutro: true, detalhe: "Não informado pelo sistema" }
      : i,
  );
  const avaliados = finais.filter((i) => !("neutro" in i));
  const ok = avaliados.filter((i) => i.ok).length;
  return { conforme: ok === avaliados.length, pontuacao: avaliados.length ? Math.round((ok / avaliados.length) * 100) : 0, itens: finais };
}

// ───────────────────────── ações ─────────────────────────

export type ContextoAcao = {
  tipo: TipoAcaoDispositivo;
  hostname: string;
  so: SistemaOperacional;
  online: boolean;
  bloqueado: boolean;
  appsInstalados: string[];
  appsBloqueadosPolitica: string[];
  parametro?: string | null;
  justificativa?: string | null;
  confirmacao?: string | null;
};

export type ResultadoAcao = { ok: true; enfileirada: boolean } | { ok: false; motivo: string };

/**
 * Decide se o TI pode enviar a ação. Ações para dispositivos offline ficam na fila
 * e são entregues no próximo check-in — exceto sessão remota, que exige o usuário presente.
 */
export function avaliarAcao(c: ContextoAcao): ResultadoAcao {
  const fila = { ok: true as const, enfileirada: !c.online };
  switch (c.tipo) {
    case "ALERTA":
    case "SINCRONIZAR":
    case "REINICIAR":
      return fila;
    case "BLOQUEAR":
      return c.bloqueado ? { ok: false, motivo: "O dispositivo já está bloqueado." } : fila;
    case "DESBLOQUEAR":
      return c.bloqueado ? fila : { ok: false, motivo: "O dispositivo não está bloqueado." };
    case "INSTALAR_APP": {
      const app = c.parametro?.trim();
      if (!app) return { ok: false, motivo: "Informe o aplicativo." };
      if (c.appsBloqueadosPolitica.includes(app)) return { ok: false, motivo: `${app} é proibido pela política deste dispositivo.` };
      if (!catalogoPara(c.so).some((a) => a.nome === app)) return { ok: false, motivo: `${app} não está no catálogo aprovado para este sistema.` };
      if (c.appsInstalados.includes(app)) return { ok: false, motivo: `${app} já está instalado.` };
      return fila;
    }
    case "REMOVER_APP": {
      const app = c.parametro?.trim();
      if (!app) return { ok: false, motivo: "Informe o aplicativo." };
      if (app === APP_AGENTE) return { ok: false, motivo: "O agente de gerenciamento não pode ser removido remotamente." };
      if (!c.appsInstalados.includes(app)) return { ok: false, motivo: `${app} não está instalado.` };
      return fila;
    }
    case "SESSAO_REMOTA":
      if (!c.online) return { ok: false, motivo: "Suporte remoto exige o dispositivo online e o usuário presente para autorizar." };
      if (c.bloqueado) return { ok: false, motivo: "Desbloqueie o dispositivo antes de iniciar o suporte remoto." };
      if ((c.justificativa?.trim().length ?? 0) < 5) return { ok: false, motivo: "Informe o chamado ou o motivo do acesso." };
      return fila;
    case "APAGAR_DADOS":
      if ((c.justificativa?.trim().length ?? 0) < 10) return { ok: false, motivo: "Apagar dados exige justificativa (mín. 10 caracteres)." };
      if (c.confirmacao?.trim() !== c.hostname) return { ok: false, motivo: `Para confirmar, digite exatamente o nome do dispositivo (${c.hostname}).` };
      return fila;
  }
}

/** Efeito da ação no estado do dispositivo, aplicado quando o agente a recebe. */
export function efeitoAcao(tipo: TipoAcaoDispositivo, d: { bloqueado: boolean; appsInstalados: string[] }, parametro?: string | null) {
  switch (tipo) {
    case "BLOQUEAR": return { bloqueado: true };
    case "DESBLOQUEAR": return { bloqueado: false };
    case "INSTALAR_APP": return { appsInstalados: [...d.appsInstalados, parametro!] };
    case "REMOVER_APP": return { appsInstalados: d.appsInstalados.filter((a) => a !== parametro) };
    case "APAGAR_DADOS": return { bloqueado: true, appsInstalados: [APP_AGENTE] };
    default: return {};
  }
}

/**
 * Status visto pelo TI. O banco guarda PENDENTE; o simulador do agente "responde"
 * depois de alguns segundos. Alertas: EXECUTADA = usuário confirmou a leitura
 * (parte dos usuários nunca confirma, como na vida real).
 */
export function statusEfetivo(
  a: { id: string; tipo: TipoAcaoDispositivo; status: StatusAcao; criadoEm: Date | string; concluidoEm?: Date | string | null },
  online: boolean,
  agora = new Date(),
  real = false,
): { status: StatusAcao; concluidoEm: string | null } {
  const criado = new Date(a.criadoEm).getTime();
  // Agente real: o status é o que ele mesmo gravou (entregue no check-in, executada/recusada no resultado)
  if (real || a.status === "EXECUTADA" || a.status === "RECUSADA") return { status: a.status, concluidoEm: a.concluidoEm ? new Date(a.concluidoEm).toISOString() : null };
  if (!online) return { status: "PENDENTE", concluidoEm: null };
  const idade = agora.getTime() - criado;
  const h = hash(a.id);
  const entrega = 800 + h * 1400;
  if (idade < entrega) return { status: "PENDENTE", concluidoEm: null };
  if (a.tipo === "ALERTA" && h < 0.18) return { status: "ENTREGUE", concluidoEm: null }; // nunca leu
  const execucao = a.tipo === "ALERTA" ? 3500 + h * 22_000 : a.tipo === "SESSAO_REMOTA" ? 4500 : a.tipo === "REINICIAR" ? 9000 : 2600 + h * 2000;
  if (idade < execucao) return { status: "ENTREGUE", concluidoEm: null };
  return { status: "EXECUTADA", concluidoEm: new Date(criado + execucao).toISOString() };
}

/** Evento que o agente registra quando executa uma ação (aparece no feed da equipe). */
export function eventoDaAcao(tipo: TipoAcaoDispositivo, parametro?: string | null): { tipo: string; descricao: string; severidade: "INFO" | "AVISO" | "CRITICO" } | null {
  switch (tipo) {
    case "BLOQUEAR": return { tipo: "BLOQUEIO", descricao: "Tela bloqueada remotamente pela equipe do espaço", severidade: "AVISO" };
    case "DESBLOQUEAR": return { tipo: "BLOQUEIO", descricao: "Dispositivo desbloqueado pela equipe do espaço", severidade: "INFO" };
    case "INSTALAR_APP": return { tipo: "APP_INSTALADO", descricao: `${parametro} instalado remotamente pela equipe`, severidade: "INFO" };
    case "REMOVER_APP": return { tipo: "APP_REMOVIDO", descricao: `${parametro} removido remotamente pela equipe`, severidade: "INFO" };
    case "APAGAR_DADOS": return { tipo: "APAGAMENTO", descricao: "Dados apagados remotamente e dispositivo bloqueado", severidade: "CRITICO" };
    case "SESSAO_REMOTA": return { tipo: "SESSAO_REMOTA", descricao: "Suporte remoto iniciado com autorização do usuário", severidade: "INFO" };
    default: return null;
  }
}
