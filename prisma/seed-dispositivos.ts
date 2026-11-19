/**
 * Dados de demonstração dos dispositivos do espaço maker (gerador PURO, datas relativas a `agora`).
 * Notebooks de empréstimo para alunos, estações ligadas às máquinas, notebook da equipe e tablets.
 */
import type { ModoDownload, SeveridadeAlarme, SistemaOperacional, StatusAcao, TipoAcaoDispositivo, TipoDispositivo } from "../lib/types";

const MIN = 60_000;
const HORA = 60 * MIN;
const DIA = 24 * HORA;

export function gerarDispositivos(agora: Date) {
  const atras = (ms: number) => new Date(agora.getTime() - ms);

  const politicas = [
    {
      id: "pol_alunos", nome: "Notebooks de empréstimo (alunos)", descricao: "Pendrive liberado para levar os arquivos do projeto, mas sem instaladores, jogos e apostas.",
      bloquearUsb: false, modoDownload: "BLOQUEAR_EXECUTAVEIS" as ModoDownload, sitesBloqueados: ["jogos", "torrent", "apostas", "streaming"],
      appsBloqueados: ["Steam", "Epic Games", "uTorrent"], exigirCriptografia: true, bloqueioTelaMinutos: 5, bloquearForaHorario: false,
    },
    {
      id: "pol_estacoes", nome: "Estações das máquinas", descricao: "Computadores ligados às impressoras, laser e plotter: só os programas das máquinas; arquivos chegam pela rede.",
      bloquearUsb: true, modoDownload: "SOMENTE_APROVADOS" as ModoDownload,
      sitesBloqueados: ["jogos", "torrent", "streaming", "redes_sociais", "apostas", "armazenamento_pessoal"],
      appsBloqueados: ["Steam", "uTorrent"], exigirCriptografia: false, bloqueioTelaMinutos: 15, bloquearForaHorario: true,
    },
    {
      id: "pol_equipe", nome: "Equipe e professores", descricao: "Técnicos, estagiários e professores: mais liberdade, com criptografia obrigatória.",
      bloquearUsb: false, modoDownload: "LIVRE" as ModoDownload, sitesBloqueados: ["torrent", "apostas"],
      appsBloqueados: ["uTorrent"], exigirCriptografia: true, bloqueioTelaMinutos: 10, bloquearForaHorario: false,
    },
    {
      id: "pol_quiosque", nome: "Tablets (quiosque)", descricao: "Modo quiosque para check-in, empréstimo de notebooks e acompanhamento das impressões.",
      bloquearUsb: true, modoDownload: "SOMENTE_APROVADOS" as ModoDownload,
      sitesBloqueados: ["jogos", "torrent", "streaming", "redes_sociais", "apostas", "armazenamento_pessoal", "ia_publica"],
      appsBloqueados: ["WhatsApp", "Instagram", "YouTube", "TikTok"], exigirCriptografia: true, bloqueioTelaMinutos: 2, bloquearForaHorario: false,
    },
  ];

  type D = {
    id: string; hostname: string; tipo: TipoDispositivo; so: SistemaOperacional; versaoSo: string; fabricante: string; modelo: string;
    ip: string; resp: string | null; lab: string | null; pol: string; apps: string[]; contato: number; gb: number;
    cripto?: boolean; av?: boolean; fw?: boolean; upd?: number; agente?: string; bloqueado?: boolean;
  };
  const ALUNO = ["Google Chrome", "Microsoft 365", "Fusion 360", "PrusaSlicer 2.9", "Inkscape 1.4", "Arduino IDE 2"];
  const W11 = "Windows 11 Education 24H2";
  const DS: D[] = [
    // notebooks de empréstimo — "resp" = aluno que está com o notebook agora
    { id: "dv_nb01", hostname: "LM-NB-01", tipo: "NOTEBOOK", so: "WINDOWS", versaoSo: W11, fabricante: "Dell", modelo: "Inspiron 15 3530", ip: "10.20.31.101", resp: "usr_usuario", lab: "lab_ele", pol: "pol_alunos", apps: ALUNO, contato: 1 * MIN, gb: 512, av: false },
    { id: "dv_nb02", hostname: "LM-NB-02", tipo: "NOTEBOOK", so: "WINDOWS", versaoSo: W11, fabricante: "Dell", modelo: "Inspiron 15 3530", ip: "10.20.31.102", resp: "usr_diego", lab: "lab_ele", pol: "pol_alunos", apps: [...ALUNO, "KiCad 8", "Visual Studio Code"], contato: 2 * MIN, gb: 512 },
    { id: "dv_nb03", hostname: "LM-NB-03", tipo: "NOTEBOOK", so: "WINDOWS", versaoSo: W11, fabricante: "Lenovo", modelo: "IdeaPad Slim 3", ip: "10.20.31.103", resp: "usr_carla", lab: "lab_ele", pol: "pol_alunos", apps: [...ALUNO, "Blender 4.2"], contato: 3 * MIN, gb: 512 },
    { id: "dv_nb04", hostname: "LM-NB-04", tipo: "NOTEBOOK", so: "WINDOWS", versaoSo: W11, fabricante: "Lenovo", modelo: "IdeaPad Slim 3", ip: "10.20.31.104", resp: "usr_fernanda", lab: "lab_ele", pol: "pol_alunos", apps: [...ALUNO, "Bambu Studio"], contato: 1 * MIN, gb: 512 },
    { id: "dv_nb05", hostname: "LM-NB-05", tipo: "NOTEBOOK", so: "WINDOWS", versaoSo: "Windows 10 Education 22H2", fabricante: "Acer", modelo: "Aspire 5", ip: "10.20.31.105", resp: null, lab: "lab_ele", pol: "pol_alunos", apps: ALUNO, contato: 4 * MIN, gb: 256, upd: 6, agente: "4.3" },
    { id: "dv_nb06", hostname: "LM-NB-06", tipo: "NOTEBOOK", so: "WINDOWS", versaoSo: W11, fabricante: "Acer", modelo: "Aspire 5", ip: "10.20.31.106", resp: null, lab: "lab_ele", pol: "pol_alunos", apps: ALUNO, contato: 7 * MIN, gb: 256 },
    { id: "dv_nb07", hostname: "LM-NB-07", tipo: "NOTEBOOK", so: "WINDOWS", versaoSo: W11, fabricante: "Dell", modelo: "Inspiron 15 3530", ip: "10.20.31.107", resp: "usr_inativo", lab: "lab_ele", pol: "pol_alunos", apps: ALUNO, contato: 3 * DIA + 5 * HORA, gb: 512, bloqueado: true },
    { id: "dv_nb08", hostname: "LM-NB-08", tipo: "NOTEBOOK", so: "CHROMEOS", versaoSo: "ChromeOS 130", fabricante: "Acer", modelo: "Chromebook Plus 515", ip: "10.20.31.108", resp: "usr_bruno", lab: "lab_ele", pol: "pol_alunos", apps: ["Google Chrome", "Microsoft 365"], contato: 2 * MIN, gb: 128 },
    // estações das máquinas
    { id: "dv_dt_3d", hostname: "LM-DT-IMP3D", tipo: "DESKTOP", so: "WINDOWS", versaoSo: W11, fabricante: "Dell", modelo: "OptiPlex 7020", ip: "10.20.31.11", resp: null, lab: "lab_fab", pol: "pol_estacoes", apps: ["PrusaSlicer 2.9", "Bambu Studio", "UltiMaker Cura 5.8", "Google Chrome"], contato: 1 * MIN, gb: 512 },
    { id: "dv_dt_laser", hostname: "LM-DT-LASER", tipo: "DESKTOP", so: "WINDOWS", versaoSo: W11, fabricante: "HP", modelo: "Pro Mini 400 G9", ip: "10.20.31.21", resp: null, lab: "lab_cor", pol: "pol_estacoes", apps: ["LightBurn 1.7", "Inkscape 1.4", "Google Chrome"], contato: 2 * MIN, gb: 256 },
    { id: "dv_dt_vinil", hostname: "LM-DT-VINIL", tipo: "DESKTOP", so: "WINDOWS", versaoSo: "Windows 10 Education 21H2", fabricante: "Lenovo", modelo: "ThinkCentre M70q", ip: "10.20.31.31", resp: null, lab: "lab_cor", pol: "pol_estacoes", apps: ["Silhouette Studio 5", "Inkscape 1.4"], contato: 9 * DIA + 3 * HORA, gb: 256, upd: 14, agente: "4.1", cripto: false },
    // equipe
    { id: "dv_tec", hostname: "LM-NB-TEC", tipo: "NOTEBOOK", so: "WINDOWS", versaoSo: "Windows 11 Pro 24H2", fabricante: "Lenovo", modelo: "ThinkPad E14 Gen 6", ip: "10.20.31.200", resp: "usr_tecnico", lab: null, pol: "pol_equipe", apps: ["Google Chrome", "Microsoft 365", "Microsoft Teams", "LightBurn 1.7", "PrusaSlicer 2.9", "7-Zip"], contato: 1 * MIN, gb: 512 },
    { id: "dv_prof", hostname: "LM-NB-PROF", tipo: "NOTEBOOK", so: "MACOS", versaoSo: "macOS 15.1 Sequoia", fabricante: "Apple", modelo: "MacBook Air 13\" M3", ip: "10.20.31.201", resp: "usr_gestor", lab: null, pol: "pol_equipe", apps: ["Google Chrome", "Microsoft Teams", "Fusion 360"], contato: 5 * MIN, gb: 256, upd: 3 },
    // tablets
    { id: "dv_tb01", hostname: "LM-TB-BALCAO", tipo: "TABLET", so: "ANDROID", versaoSo: "Android 14 (Enterprise)", fabricante: "Samsung", modelo: "Galaxy Tab A9+", ip: "10.20.31.80", resp: null, lab: null, pol: "pol_quiosque", apps: ["LabMaker Mobile", "Leitor de QR Code"], contato: 1 * MIN, gb: 64 },
    { id: "dv_tb02", hostname: "LM-TB-IMP3D", tipo: "TABLET", so: "IOS", versaoSo: "iPadOS 18.1", fabricante: "Apple", modelo: "iPad (10ª geração)", ip: "10.20.31.81", resp: null, lab: "lab_fab", pol: "pol_quiosque", apps: ["LabMaker Mobile"], contato: 4 * DIA + 2 * HORA, gb: 64 },
  ];

  const mac = (i: number) => `3C:52:82:${(16 + i).toString(16).toUpperCase().padStart(2, "0")}:${((i * 37) % 255).toString(16).toUpperCase().padStart(2, "0")}:${((i * 91) % 255).toString(16).toUpperCase().padStart(2, "0")}`;
  const dispositivos = DS.map((d, i) => ({
    id: d.id, hostname: d.hostname, tipo: d.tipo, so: d.so, versaoSo: d.versaoSo, fabricante: d.fabricante, modelo: d.modelo,
    numeroSerie: `${d.fabricante.slice(0, 2).toUpperCase()}${(7341 + i * 389).toString(36).toUpperCase()}${100 + i}`,
    enderecoIp: d.ip, enderecoMac: d.tipo === "TABLET" || d.tipo === "SMARTPHONE" ? null : mac(i),
    agenteVersao: d.agente ?? "4.6", criptografado: d.cripto ?? true, antivirusAtivo: d.av ?? true, firewallAtivo: d.fw ?? true,
    atualizacoesPendentes: d.upd ?? 0, armazenamentoGb: d.gb, bloqueado: d.bloqueado ?? false,
    appsInstalados: ["Agente LabMaker", ...d.apps], ultimoContatoEm: atras(d.contato), ativo: true,
    criadoEm: atras((120 + i * 17) * DIA), responsavelId: d.resp, laboratorioId: d.lab, politicaId: d.pol,
  }));

  type Acao = {
    id: string; tipo: TipoAcaoDispositivo; status: StatusAcao; lote: string | null; titulo: string | null; mensagem: string | null;
    prioridade: SeveridadeAlarme | null; parametro: string | null; justificativa: string | null; motivo: string | null;
    criadoEm: Date; concluidoEm: Date | null; dispositivoId: string; usuarioId: string;
  };
  let n = 0;
  const acao = (o: Partial<Acao> & Pick<Acao, "tipo" | "dispositivoId" | "usuarioId" | "criadoEm">): Acao => ({
    id: `ad_${String(++n).padStart(3, "0")}`, status: "PENDENTE", lote: null, titulo: null, mensagem: null, prioridade: null,
    parametro: null, justificativa: null, motivo: null, concluidoEm: null, ...o,
  });
  const computadores = dispositivos.filter((d) => d.tipo === "NOTEBOOK" || d.tipo === "DESKTOP");
  const acoes: Acao[] = [
    ...computadores.map((d) => acao({
      tipo: "ALERTA", lote: "lt_fechamento", prioridade: "AVISO", titulo: "O espaço maker fecha em 15 minutos",
      mensagem: "Salve seus arquivos, retire suas peças das impressoras e devolva o notebook no balcão.",
      dispositivoId: d.id, usuarioId: "usr_tecnico", criadoEm: atras(20 * HORA),
    })),
    ...dispositivos.map((d) => acao({
      tipo: "ALERTA", lote: "lt_phishing", prioridade: "CRITICO", titulo: "Golpe de phishing em circulação",
      mensagem: "Não abra e-mails com o assunto \"Bolsa aprovada — confirme seus dados\". Em caso de dúvida, fale com o técnico no balcão.",
      dispositivoId: d.id, usuarioId: "usr_tecnico", criadoEm: atras(2 * DIA + 3 * HORA),
    })),
    acao({ tipo: "BLOQUEAR", status: "EXECUTADA", dispositivoId: "dv_nb07", usuarioId: "usr_tecnico", criadoEm: atras(3 * DIA + 6 * HORA), concluidoEm: atras(3 * DIA + 6 * HORA - 40_000), justificativa: "Notebook não devolvido — aluno formado" }),
    acao({ tipo: "REMOVER_APP", status: "EXECUTADA", parametro: "Steam", dispositivoId: "dv_nb03", usuarioId: "usr_tecnico2", criadoEm: atras(23 * HORA), concluidoEm: atras(23 * HORA - 70_000) }),
    acao({ tipo: "INSTALAR_APP", status: "EXECUTADA", parametro: "Bambu Studio", dispositivoId: "dv_nb04", usuarioId: "usr_tecnico", criadoEm: atras(2 * DIA), concluidoEm: atras(2 * DIA - 300_000) }),
    acao({ tipo: "SESSAO_REMOTA", status: "EXECUTADA", justificativa: "Aluna sem conseguir exportar STL do Fusion 360", dispositivoId: "dv_nb01", usuarioId: "usr_tecnico", criadoEm: atras(5 * HORA), concluidoEm: atras(5 * HORA - 25_000) }),
    acao({ tipo: "SESSAO_REMOTA", status: "RECUSADA", motivo: "O aluno recusou o acesso remoto", justificativa: "Notebook lento", dispositivoId: "dv_nb08", usuarioId: "usr_tecnico2", criadoEm: atras(7 * HORA), concluidoEm: atras(7 * HORA - 20_000) }),
    acao({ tipo: "SINCRONIZAR", dispositivoId: "dv_dt_vinil", usuarioId: "usr_tecnico", criadoEm: atras(2 * DIA + 5 * HORA) }),
    acao({ tipo: "REINICIAR", dispositivoId: "dv_tb02", usuarioId: "usr_tecnico2", criadoEm: atras(3 * DIA) }),
  ];

  let e = 0;
  const ev = (minAtras: number, dispositivoId: string, tipo: string, severidade: SeveridadeAlarme, descricao: string) =>
    ({ id: `ed_${String(++e).padStart(3, "0")}`, criadoEm: atras(minAtras * MIN), dispositivoId, tipo, severidade, descricao });
  const eventos = [
    ev(6, "dv_nb02", "SITE_BLOQUEADO", "INFO", "Acesso bloqueado: site de jogos online (Jogos)"),
    ev(27, "dv_nb01", "DOWNLOAD_BLOQUEADO", "AVISO", "Download bloqueado: MinecraftInstaller.exe — arquivos .exe bloqueados pela política"),
    ev(48, "dv_dt_laser", "USB_BLOQUEADO", "AVISO", "Pendrive bloqueado na estação do laser — envie o arquivo pela pasta da rede"),
    ev(95, "dv_nb08", "SITE_BLOQUEADO", "AVISO", "Acesso bloqueado: site de apostas (Apostas)"),
    ev(180, "dv_nb01", "CONFORMIDADE", "CRITICO", "Antivírus em tempo real desativado pelo usuário"),
    ev(260, "dv_dt_3d", "DOWNLOAD_BLOQUEADO", "AVISO", "Download bloqueado: cura_plugin_setup.msi — instaladores só pelo catálogo"),
    ev(400, "dv_nb05", "CONFORMIDADE", "AVISO", "6 atualizações de segurança pendentes (Windows 10 22H2)"),
    ev(22 * 60, "dv_nb03", "APP_BLOQUEADO", "AVISO", "Execução bloqueada: Steam (aplicativo proibido)"),
    ev(23 * 60, "dv_nb03", "APP_REMOVIDO", "INFO", "Steam removido remotamente pelo técnico"),
    ev(31 * 60, "dv_prof", "LOGIN", "INFO", "Login fora do horário do espaço (23:40)"),
    ev(2 * 1440, "dv_dt_vinil", "AGENTE", "AVISO", "Sem check-in há 7 dias — verificar se a estação do plotter está ligada"),
    ev(3 * 1440 + 360, "dv_nb07", "BLOQUEIO", "CRITICO", "Notebook bloqueado pelo técnico: não devolvido"),
    ev(4 * 1440, "dv_tb02", "AGENTE", "AVISO", "Tablet da ilha de impressão perdeu a conexão Wi-Fi"),
  ];

  const auditoria: [number, string, string, string, string, string][] = [
    [20 * 60, "usr_tecnico", "dispositivo.alerta", "dispositivo", "lt_fechamento", `Alerta "O espaço maker fecha em 15 minutos" enviado a ${computadores.length} computadores`],
    [5 * 60, "usr_tecnico", "dispositivo.acao", "dispositivo", "dv_nb01", "Suporte remoto → LM-NB-01 (exportar STL do Fusion 360)"],
    [7 * 60, "usr_tecnico2", "dispositivo.acao", "dispositivo", "dv_nb08", "Suporte remoto → LM-NB-08 (recusado pelo aluno)"],
    [23 * 60, "usr_tecnico2", "dispositivo.acao", "dispositivo", "dv_nb03", "Remover Steam → LM-NB-03"],
    [2 * 1440, "usr_tecnico", "dispositivo.acao", "dispositivo", "dv_nb04", "Instalar Bambu Studio → LM-NB-04"],
    [2 * 1440 + 180, "usr_tecnico", "dispositivo.alerta", "dispositivo", "lt_phishing", `Alerta crítico "Golpe de phishing em circulação" enviado a ${dispositivos.length} dispositivos`],
    [3 * 1440 + 360, "usr_tecnico", "dispositivo.acao", "dispositivo", "dv_nb07", "Bloquear → LM-NB-07 (notebook não devolvido)"],
    [130, "usr_tecnico", "emprestimo.criado", "emprestimo", "em_001", "Emprestou LM-NB-01 para Ana Ribeiro até o fechamento"],
    [24 * 60 + 60, "usr_tecnico", "emprestimo.devolvido", "emprestimo", "em_007", "Recebeu LM-NB-05 de Diego Souza (bateria em 12%)"],
    [4 * 1440 + 100, "usr_tecnico", "politica.atualizada", "politica", "pol_estacoes", "Política Estações das máquinas: USB bloqueado"],
  ];

  // ── Empréstimos: abertos para quem está com um notebook agora + histórico de devoluções ──
  const hojeSP = new Date(agora.getTime() - 3 * HORA).toISOString().slice(0, 10);
  const fechamento = new Date(`${hojeSP}T22:00:00-03:00`);
  const prazoHoje = fechamento.getTime() - agora.getTime() > HORA ? fechamento : new Date(agora.getTime() + 2 * HORA);
  const E = (id: string, disp: string, aluno: string, tecnico: string, retiradoHa: number, prazo: Date, devolvidoHa: number | null, obs: string | null = null) => ({
    id, dispositivoId: disp, usuarioId: aluno, tecnicoId: tecnico, retiradoEm: atras(retiradoHa), prazoEm: prazo,
    devolvidoEm: devolvidoHa === null ? null : atras(devolvidoHa), recebidoPorId: devolvidoHa === null ? null : tecnico, observacao: obs,
  });
  const emprestimos = [
    E("em_001", "dv_nb01", "usr_usuario", "usr_tecnico", 2 * HORA + 10 * MIN, prazoHoje, null),
    E("em_002", "dv_nb02", "usr_diego", "usr_tecnico2", 3 * HORA, prazoHoje, null),
    E("em_003", "dv_nb03", "usr_carla", "usr_tecnico", 1 * HORA + 25 * MIN, prazoHoje, null),
    E("em_004", "dv_nb04", "usr_fernanda", "usr_tecnico2", 40 * MIN, prazoHoje, null),
    E("em_005", "dv_nb08", "usr_bruno", "usr_tecnico", 4 * HORA, prazoHoje, null),
    E("em_006", "dv_nb07", "usr_inativo", "usr_tecnico", 4 * DIA, atras(3 * DIA + 8 * HORA), null),
    E("em_007", "dv_nb05", "usr_diego", "usr_tecnico", 1 * DIA + 6 * HORA, atras(1 * DIA - 2 * HORA), 1 * DIA + 1 * HORA, "Devolvido com a bateria em 12%"),
    E("em_008", "dv_nb06", "usr_carla", "usr_tecnico2", 2 * DIA + 5 * HORA, atras(2 * DIA - 3 * HORA), 2 * DIA + 1 * HORA, null),
    E("em_009", "dv_nb01", "usr_bruno", "usr_tecnico", 3 * DIA + 4 * HORA, atras(3 * DIA - 4 * HORA), 3 * DIA, null),
  ];

  return { politicas, dispositivos, acoesDispositivo: acoes, eventosDispositivo: eventos, emprestimos, auditoriaDispositivos: auditoria };
}
