"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AlarmClock, BatteryMedium, Bell, BellRing, LifeBuoy, Lock, MonitorUp, Send, Smartphone, Sun, Unplug, Wifi, X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Agente pelo navegador — para celulares, tablets ou qualquer computador sem Node.
 * Faz o mesmo protocolo do agente/agente.mjs (inscrição + check-in a cada 15 s), com o que um
 * navegador permite: avisos com confirmação de leitura, bloqueio desta página, bateria e rede.
 * Ver a tela: só em navegador de computador com HTTPS (getDisplayMedia); celulares não permitem.
 */

const CHAVE = "labmaker-agente-web";
const VERSAO = "web-1.1";
type Config = { token: string; dispositivoId: string; hostname: string; nomeUsuario: string };
type Acao = { id: string; tipo: string; titulo?: string | null; mensagem?: string | null; prioridade?: string | null; parametro?: string | null; justificativa?: string | null };
type Resultado = { id: string; status: "EXECUTADA" | "RECUSADA"; motivo: string };
type Chamado = { id: string; numero: number; status: "ABERTO" | "EM_ATENDIMENTO"; descricao: string; atendente: string | null };
type Msg = { id: string; autor: "LIDER" | "USUARIO" | "SISTEMA"; autorNome: string | null; texto: string; criadoEm: string };

/** Chave VAPID (base64url) → bytes, formato que o pushManager.subscribe exige */
function chaveParaBytes(b64: string) {
  const s = atob((b64 + "=".repeat((4 - (b64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
}

type NavegadorExtra = Navigator & {
  getBattery?: () => Promise<{ level: number; charging: boolean }>;
  connection?: { type?: string; effectiveType?: string };
  userAgentData?: { getHighEntropyValues: (h: string[]) => Promise<{ model?: string; platformVersion?: string }> };
  wakeLock?: { request: (t: "screen") => Promise<{ release: () => Promise<void> }> };
};

const lerConfig = (): Config | null => { try { return JSON.parse(localStorage.getItem(CHAVE) ?? "null"); } catch { return null; } };
const aleatorio = () => Array.from({ length: 10 }, () => "abcdefghjkmnpqrstuvwxyz23456789"[Math.floor(Math.random() * 31)]).join("");

async function detectarAparelho() {
  const nav = navigator as NavegadorExtra;
  const ua = nav.userAgent;
  const ios = /iphone|ipad|ipod/i.test(ua) || (/macintosh/i.test(ua) && nav.maxTouchPoints > 1);
  const so = /android/i.test(ua) ? "ANDROID" : ios ? "IOS" : /windows/i.test(ua) ? "WINDOWS" : /cros/i.test(ua) ? "CHROMEOS" : /mac os/i.test(ua) ? "MACOS" : "LINUX";
  const movel = so === "ANDROID" || so === "IOS";
  const tablet = /ipad|tablet/i.test(ua) || (so === "ANDROID" && !/mobile/i.test(ua));
  let modelo = so === "IOS" ? (/ipad/i.test(ua) ? "iPad" : "iPhone") : /Android [\d.]+; ([^;)]+?)(?: Build|\))/.exec(ua)?.[1] ?? "";
  let versao = so === "ANDROID" ? `Android ${/Android ([\d.]+)/.exec(ua)?.[1] ?? ""}` : so === "IOS" ? `iOS ${(/OS (\d+)_(\d+)/.exec(ua) ?? []).slice(1, 3).join(".")}` : nav.platform || so;
  try {
    const h = await nav.userAgentData?.getHighEntropyValues(["model", "platformVersion"]);
    if (h?.model) modelo = h.model;
    if (so === "ANDROID" && h?.platformVersion) versao = `Android ${h.platformVersion.split(".")[0]}`;
  } catch { /* navegador não informa */ }
  const fabricante = so === "IOS" ? "Apple" : /^SM-|galaxy/i.test(modelo) ? "Samsung" : /moto/i.test(modelo) ? "Motorola" : /redmi|poco|^M2\d|xiaomi/i.test(modelo) ? "Xiaomi" : /pixel/i.test(modelo) ? "Google" : movel ? "Android" : "Navegador";
  return { so, tipo: movel ? (tablet ? "TABLET" : "SMARTPHONE") : "NOTEBOOK", versaoSo: versao.trim().slice(0, 80) || so, fabricante, modelo: (modelo && modelo !== "K" ? modelo : movel ? "Celular" : "Navegador").slice(0, 80) };
}

/** Bipe curto pela Web Audio (o contexto nasce no clique em "Conectar", que libera o som). */
let audio: AudioContext | null = null;
function bipe() {
  try {
    if (!audio) return;
    const o = audio.createOscillator(); const g = audio.createGain();
    o.frequency.value = 880; g.gain.value = 0.08; o.connect(g).connect(audio.destination);
    o.start(); o.stop(audio.currentTime + 0.25);
  } catch { /* sem som */ }
}

/** Alarme de devolução: sirene de dois tons, alto, enquanto o aparelho estiver atrasado. */
function sirene() {
  try {
    if (!audio) return;
    if (audio.state === "suspended") void audio.resume();
    const t = audio.currentTime;
    [0, 0.35].forEach((d, i) => {
      const o = audio!.createOscillator(); const g = audio!.createGain();
      o.type = "square"; o.frequency.value = i ? 1046 : 1568; g.gain.value = 0.35;
      o.connect(g).connect(audio!.destination); o.start(t + d); o.stop(t + d + 0.3);
    });
  } catch { /* sem som */ }
}
/** O som só pode nascer de um toque na tela: qualquer toque na página já libera o alarme. */
function liberarSom() {
  try {
    if (!audio) audio = new AudioContext();
    if (audio.state === "suspended") void audio.resume();
  } catch { /* sem Web Audio */ }
}
const horaCurta = (d: Date) => d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

const blobParaBase64 = (b: Blob) => new Promise<string>((res) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(",")[1] ?? ""); r.readAsDataURL(b); });

export function AgenteWeb({ codigoInicial }: { codigoInicial: string }) {
  const [cfg, setCfg] = useState<Config | null>(null);
  const [carregado, setCarregado] = useState(false);
  const [codigo, setCodigo] = useState(codigoInicial);
  const [nome, setNome] = useState("");
  const [aparelho, setAparelho] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [conectando, setConectando] = useState(false);
  const [online, setOnline] = useState<boolean | null>(null);
  const [ultimo, setUltimo] = useState<Date | null>(null);
  const [politica, setPolitica] = useState<string | null>(null);
  const [bloqueado, setBloqueado] = useState(false);
  const [alertas, setAlertas] = useState<Acao[]>([]);
  const [pedidoTela, setPedidoTela] = useState<Acao | null>(null);
  const [compartilhando, setCompartilhando] = useState(false);
  const [notif, setNotif] = useState<NotificationPermission | "indisponivel">("indisponivel");
  const [telaLigada, setTelaLigada] = useState(false);
  const [agora, setAgora] = useState(() => Date.now());
  const [chamado, setChamado] = useState<Chamado | null>(null);
  const [chat, setChat] = useState<Msg[]>([]);
  const [naoLidas, setNaoLidas] = useState(0);
  const [chatAberto, setChatAberto] = useState(false);
  const [pedindo, setPedindo] = useState(false);
  const [descricao, setDescricao] = useState("");
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [push, setPush] = useState<"indisponivel" | "desligado" | "ligado">("indisponivel");
  /** Empréstimo aberto deste aparelho; desvio = hora do servidor − hora do celular (relógio errado não atrasa o alarme). */
  const [devolucao, setDevolucao] = useState<{ prazoEm: Date; alarmeEm: Date; desvio: number } | null>(null);
  const [somLiberado, setSomLiberado] = useState(true);
  const intervalo = useRef(15_000);
  const chatAbertoRef = useRef(false);
  chatAbertoRef.current = chatAberto;
  const rolagemChat = useRef<HTMLDivElement>(null);
  const resultados = useRef<Resultado[]>([]);
  const tratadas = useRef(new Set<string>());
  const proximo = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const agoraRef = useRef<(() => void) | undefined>(undefined); // pede um check-in já (sem duplicar o laço)
  const trava = useRef<{ release: () => Promise<void> } | null>(null);
  const seguro = typeof window !== "undefined" && window.isSecureContext;
  const telaPossivel = seguro && typeof navigator !== "undefined" && !!navigator.mediaDevices?.getDisplayMedia && !/android|iphone|ipad/i.test(navigator.userAgent);

  useEffect(() => {
    setCfg(lerConfig());
    setCarregado(true);
    if ("Notification" in window && window.isSecureContext) setNotif(Notification.permission);
    detectarAparelho().then((a) => setAparelho(`${a.fabricante} ${a.modelo}`));
    // PWA: o service worker permite instalar na tela inicial e receber push com a página fechada
    if ("serviceWorker" in navigator && window.isSecureContext) {
      navigator.serviceWorker.register("/sw.js", { scope: "/agente" })
        .then((reg) => ("PushManager" in window ? reg.pushManager.getSubscription() : null))
        .then((sub) => "PushManager" in window && setPush(sub ? "ligado" : "desligado"))
        .catch(() => {});
    }
    const t = setInterval(() => setAgora(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // Toque em qualquer lugar libera o som (regra dos navegadores) — necessário para o alarme
  useEffect(() => {
    const t = () => { liberarSom(); setSomLiberado(audio?.state === "running"); };
    window.addEventListener("pointerdown", t);
    return () => window.removeEventListener("pointerdown", t);
  }, []);

  // Alarme de devolução: começa sozinho em alarmeEm (relógio do servidor) e só para quando o
  // Líder registra a devolução (o próximo check-in deixa de trazer o empréstimo).
  const tocando = !!devolucao && agora + devolucao.desvio >= devolucao.alarmeEm.getTime();
  useEffect(() => {
    if (!tocando) return;
    const tocar = () => {
      sirene(); navigator.vibrate?.([700, 250, 700]);
      setSomLiberado(audio?.state === "running");
    };
    tocar();
    const t = setInterval(tocar, 1600);
    return () => { clearInterval(t); navigator.vibrate?.(0); };
  }, [tocando]);

  const resultado = useCallback((r: Resultado) => {
    resultados.current.push(r);
    setTimeout(() => agoraRef.current?.(), 300); // a confirmação sobe logo, o laço continua
  }, []);

  // ───────── ações recebidas ─────────
  const tratar = useCallback((a: Acao) => {
    if (tratadas.current.has(a.id)) return;
    tratadas.current.add(a.id);
    const ok = (motivo: string) => resultado({ id: a.id, status: "EXECUTADA", motivo });
    const nao = (motivo: string) => resultado({ id: a.id, status: "RECUSADA", motivo });
    switch (a.tipo) {
      case "ALERTA":
        setAlertas((l) => [...l, a]);
        navigator.vibrate?.([250, 120, 250]);
        bipe();
        if (document.visibilityState !== "visible" && "Notification" in window && Notification.permission === "granted") {
          new Notification(`LabMaker · ${a.titulo ?? "Aviso"}`, { body: a.mensagem ?? "", tag: a.id });
        }
        return; // confirma só quando a pessoa tocar em "Entendi" (confirmação de leitura de verdade)
      case "BLOQUEAR":
        setBloqueado(true); navigator.vibrate?.(400);
        return ok("Página do LabMaker bloqueada (o navegador não trava o aparelho inteiro)");
      case "DESBLOQUEAR":
        setBloqueado(false);
        return ok("Liberado");
      case "SINCRONIZAR":
        return ok("Política recebida");
      case "SESSAO_REMOTA":
        if (!telaPossivel) return nao("Este aparelho não permite compartilhar a tela pelo navegador (celulares não suportam; no computador exige HTTPS).");
        setPedidoTela(a);
        bipe();
        return;
      default:
        return nao("Pelo navegador não dá para instalar, remover, reiniciar ou apagar — isso exige gerenciamento do aparelho (MDM).");
    }
  }, [resultado, telaPossivel]);

  // ───────── check-in ─────────
  const checkinRef = useRef<() => Promise<void>>(undefined);
  const checkin = useCallback(async () => {
    const c = lerConfig();
    if (!c) return;
    const nav = navigator as NavegadorExtra;
    const bat = await nav.getBattery?.().catch(() => null) ?? null;
    const con = nav.connection;
    const enviar = resultados.current.splice(0);
    try {
      const r = await fetch("/api/agente/checkin", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${c.token}` },
        body: JSON.stringify({
          agenteVersao: VERSAO,
          versaoSo: (await detectarAparelho()).versaoSo,
          telemetria: {
            cpu: null, memoria: null, disco: null,
            bateria: bat ? Math.round(bat.level * 100) : null, carregando: bat?.charging ?? false,
            rede: con?.type === "wifi" ? "Wi-Fi" : con?.type === "cellular" ? "Dados móveis" : con?.effectiveType ? con.effectiveType.toUpperCase() : null,
            usuarioSessao: c.nomeUsuario || null,
            appAtivo: document.visibilityState === "visible" ? "LabMaker (navegador)" : "Em segundo plano",
            uptimeH: null,
          },
          seguranca: {}, eventos: [], resultados: enviar,
        }),
      });
      if (r.status === 401) {
        localStorage.removeItem(CHAVE); setCfg(null);
        setErro("Este aparelho foi desconectado no LabMaker. Peça um novo QR code ao Líder.");
        return;
      }
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      setOnline(true); setUltimo(new Date());
      setPolitica(j.politica?.nome ?? null);
      setBloqueado(!!j.bloqueado);
      setDevolucao(j.devolucao ? { prazoEm: new Date(j.devolucao.prazoEm), alarmeEm: new Date(j.devolucao.alarmeEm), desvio: j.agora ? new Date(j.agora).getTime() - Date.now() : 0 } : null);
      intervalo.current = (j.intervaloSeg ?? 15) * 1000;
      setChamado((ant) => {
        if (ant && !j.chamado) setChat([]); // atendimento encerrado: limpa a conversa
        return j.chamado ?? null;
      });
      const novas = (j.mensagens ?? []) as Msg[];
      if (novas.length) {
        setChat((l) => [...l, ...novas.filter((m) => !l.some((x) => x.id === m.id))]);
        if (novas.some((m) => m.autor === "LIDER")) {
          if (!chatAbertoRef.current) setNaoLidas((n) => n + novas.filter((m) => m.autor === "LIDER").length);
          navigator.vibrate?.([120, 80, 120]); bipe();
          const m = novas.filter((x) => x.autor === "LIDER").at(-1)!;
          if (document.visibilityState !== "visible" && "Notification" in window && Notification.permission === "granted") {
            new Notification(`LabMaker · ${m.autorNome?.split(" ")[0] ?? "Líder"}`, { body: m.texto, tag: "chat" });
          }
        }
      }
      (j.acoes as Acao[]).forEach(tratar);
    } catch {
      resultados.current.unshift(...enviar); // tenta de novo no próximo
      setOnline(false);
    }
  }, [tratar]);
  checkinRef.current = checkin;

  useEffect(() => {
    if (!cfg) return;
    let vivo = true, rodando = false, deNovo = false;
    // Um único laço de check-in: pedidos "agora" durante um check-in viram um próximo check-in logo em seguida
    const laco = async () => {
      if (rodando) { deNovo = true; return; }
      rodando = true;
      clearTimeout(proximo.current);
      await checkin();
      rodando = false;
      if (!vivo) return;
      const ms = deNovo || resultados.current.length ? 500 : intervalo.current;
      deNovo = false;
      proximo.current = setTimeout(laco, ms);
    };
    agoraRef.current = () => void laco();
    laco();
    const aoVoltar = () => { if (document.visibilityState === "visible") laco(); };
    document.addEventListener("visibilitychange", aoVoltar);
    return () => { vivo = false; agoraRef.current = undefined; clearTimeout(proximo.current); document.removeEventListener("visibilitychange", aoVoltar); };
  }, [cfg, checkin]);

  // mantém a tela ligada de novo ao voltar para a página
  useEffect(() => {
    const re = async () => {
      if (telaLigada && document.visibilityState === "visible") trava.current = await (navigator as NavegadorExtra).wakeLock?.request("screen").catch(() => null) ?? null;
    };
    document.addEventListener("visibilitychange", re);
    return () => document.removeEventListener("visibilitychange", re);
  }, [telaLigada]);

  // ───────── conectar ─────────
  async function conectar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null); setConectando(true);
    try {
      audio = audio ?? new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      const a = await detectarAparelho();
      const hostname = (aparelhoNome(nome) || `${ehMovel() ? "CEL" : "PC"}-${aleatorio().slice(0, 4)}`).toUpperCase();
      const serie = localStorage.getItem(`${CHAVE}-serie`) ?? `WEB-${aleatorio()}`;
      localStorage.setItem(`${CHAVE}-serie`, serie);
      const r = await fetch("/api/agente/inscrever", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ codigo: codigo.trim(), hostname, so: a.so, tipo: a.tipo, versaoSo: a.versaoSo, fabricante: a.fabricante, modelo: a.modelo, numeroSerie: serie, agenteVersao: VERSAO, armazenamentoGb: 0 }),
      });
      const j = await r.json();
      if (!r.ok) return setErro(j.error ?? "Não foi possível conectar.");
      const novo: Config = { token: j.token, dispositivoId: j.dispositivoId, hostname: j.hostname, nomeUsuario: nome.trim() };
      localStorage.setItem(CHAVE, JSON.stringify(novo));
      history.replaceState(null, "", "/agente"); // tira o código da barra de endereço
      setCfg(novo);
    } catch {
      setErro("Sem conexão com o servidor. O celular está na mesma rede (ou usando o endereço HTTPS do túnel)?");
    } finally { setConectando(false); }
  }

  async function pedirNotificacao() {
    if (!("Notification" in window)) return;
    setNotif(await Notification.requestPermission());
  }

  // ───────── Web Push (avisos com o app fechado) ─────────
  async function ativarPush() {
    const c = lerConfig();
    if (!c) return;
    try {
      if (Notification.permission !== "granted") {
        const p = await Notification.requestPermission();
        setNotif(p);
        if (p !== "granted") return;
      }
      const reg = await navigator.serviceWorker.ready;
      const { chavePublica } = await fetch("/api/agente/push").then((r) => r.json());
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: chaveParaBytes(chavePublica) });
      const r = await fetch("/api/agente/push", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${c.token}` }, body: JSON.stringify({ inscricao: sub.toJSON() }) });
      setPush(r.ok ? "ligado" : "desligado");
    } catch {
      setErro("Não foi possível ativar as notificações neste navegador.");
    }
  }

  // ───────── pedir ajuda + chat ─────────
  const auth = () => ({ "Content-Type": "application/json", Authorization: `Bearer ${lerConfig()?.token}` });
  async function pedirAjuda(e: React.FormEvent) {
    e.preventDefault();
    if (descricao.trim().length < 3) return;
    setEnviando(true);
    try {
      const r = await fetch("/api/agente/chamados", { method: "POST", headers: auth(), body: JSON.stringify({ descricao: descricao.trim(), nome: cfg?.nomeUsuario || undefined, autorizaTela: false }) });
      const j = await r.json();
      if (!r.ok) return setErro(j.error ?? "Não foi possível enviar o pedido.");
      setDescricao(""); setPedindo(false); setChatAberto(true);
      setChat((l) => [...l, { id: `local-${Date.now()}`, autor: "USUARIO", autorNome: cfg?.nomeUsuario ?? null, texto: descricao.trim(), criadoEm: new Date().toISOString() }]);
      agoraRef.current?.();
    } finally { setEnviando(false); }
  }
  async function enviarMensagem(e: React.FormEvent) {
    e.preventDefault();
    const t = texto.trim();
    if (!t) return;
    setTexto(""); setEnviando(true);
    try {
      const r = await fetch("/api/agente/chamados/mensagem", { method: "POST", headers: auth(), body: JSON.stringify({ texto: t, nome: cfg?.nomeUsuario || undefined }) });
      const j = await r.json();
      if (!r.ok) { setTexto(t); return setErro(j.error ?? "Mensagem não enviada."); }
      setChat((l) => [...l, j.mensagem]);
    } finally { setEnviando(false); }
  }
  async function cancelarPedido() {
    if (!confirm("Cancelar o pedido de ajuda? (use se você já resolveu)")) return;
    await fetch("/api/agente/chamados/cancelar", { method: "POST", headers: auth(), body: "{}" }).catch(() => {});
    setChamado(null); setChat([]); setChatAberto(false);
    agoraRef.current?.();
  }
  useEffect(() => { if (chatAberto) { setNaoLidas(0); rolagemChat.current?.scrollTo({ top: rolagemChat.current.scrollHeight }); } }, [chatAberto, chat.length]);

  async function alternarTelaLigada() {
    if (telaLigada) { await trava.current?.release().catch(() => {}); trava.current = null; setTelaLigada(false); return; }
    trava.current = await (navigator as NavegadorExtra).wakeLock?.request("screen").catch(() => null) ?? null;
    setTelaLigada(!!trava.current);
  }

  function lerAlerta() {
    const a = alertas[0];
    if (!a) return;
    setAlertas((l) => l.slice(1));
    resultado({ id: a.id, status: "EXECUTADA", motivo: "Lido pelo usuário" });
  }

  // ───────── tela (computador com navegador moderno, HTTPS) ─────────
  async function compartilharTela(aceitar: boolean) {
    const a = pedidoTela!;
    setPedidoTela(null);
    if (!aceitar) return resultado({ id: a.id, status: "RECUSADA", motivo: "O usuário recusou o acesso à tela" });
    let fluxo: MediaStream;
    try {
      fluxo = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
    } catch {
      return resultado({ id: a.id, status: "RECUSADA", motivo: "O usuário cancelou a escolha da tela" });
    }
    resultado({ id: a.id, status: "EXECUTADA", motivo: "Autorizado pelo usuário — compartilhando pelo navegador" });
    setCompartilhando(true);
    const video = Object.assign(document.createElement("video"), { srcObject: fluxo, muted: true });
    await video.play();
    const canvas = document.createElement("canvas");
    const c = lerConfig()!;
    let continuar = true;
    fluxo.getVideoTracks()[0].addEventListener("ended", () => { continuar = false; });
    while (continuar) {
      const t0 = Date.now();
      const w = Math.min(1280, video.videoWidth || 1280);
      canvas.width = w; canvas.height = Math.round((video.videoHeight || 720) * (w / (video.videoWidth || 1280)));
      canvas.getContext("2d")!.drawImage(video, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", 0.55));
      if (blob) {
        const r = await fetch("/api/agente/tela", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${c.token}` }, body: JSON.stringify({ acaoId: a.id, imagem: await blobParaBase64(blob), tipo: "image/jpeg" }) }).then((x) => x.json()).catch(() => ({ continuar: true }));
        if (!r.continuar) continuar = false;
      }
      await new Promise((res) => setTimeout(res, Math.max(150, 1000 - (Date.now() - t0))));
    }
    if (fluxo.getVideoTracks()[0].readyState === "ended") {
      await fetch("/api/agente/tela", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${c.token}` }, body: JSON.stringify({ acaoId: a.id, fim: true }) }).catch(() => {});
    }
    fluxo.getTracks().forEach((t) => t.stop());
    setCompartilhando(false);
  }

  function desconectar() {
    if (!confirm("Desconectar este aparelho do LabMaker? Ele continua na lista do Líder, mas para de receber avisos.")) return;
    localStorage.removeItem(CHAVE);
    setCfg(null); setOnline(null);
  }

  if (!carregado) return null;
  const segs = ultimo ? Math.round((agora - ultimo.getTime()) / 1000) : null;
  const alerta = alertas[0];

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-5 px-5 py-8">
      <header className="flex items-center gap-2.5">
        <span className="grid size-9 place-items-center rounded-xl border border-line-strong bg-surface"><Smartphone className="size-4 text-signal" /></span>
        <div>
          <p className="text-[15px] font-semibold tracking-tight">Agente LabMaker</p>
          <p className="text-[12px] text-subtle">pelo navegador · celular, tablet ou computador</p>
        </div>
      </header>

      {!seguro && (
        <p className="rounded-xl border border-warn/30 bg-warn-soft px-4 py-3 text-[12.5px] text-warn">
          Página aberta sem HTTPS: os avisos aparecem aqui, com vibração e som, mas notificações do sistema, bateria e “manter tela ligada” ficam indisponíveis.
        </p>
      )}

      {!cfg ? (
        <form onSubmit={conectar} className="glass space-y-4 rounded-2xl border border-line p-5">
          <div>
            <h1 className="text-lg font-semibold tracking-tight">Conectar este aparelho</h1>
            <p className="mt-1 text-[13px] text-muted">O Líder do espaço vai ver este aparelho na tela de Notebooks e poderá mandar avisos para ele. Ele <b className="text-fg">não</b> vê suas fotos, mensagens ou câmera.</p>
          </div>
          <label className="block space-y-1.5">
            <span className="text-[12.5px] font-medium">Código de inscrição</span>
            <input value={codigo} onChange={(e) => setCodigo(e.target.value)} required minLength={6} placeholder="Escaneie o QR code ou digite o código (ex.: K7P2QX)"
              className="h-10 w-full rounded-lg border border-line-strong bg-black/30 px-3 font-mono text-[12px] focus:border-accent focus:outline-none" />
          </label>
          <label className="block space-y-1.5">
            <span className="text-[12.5px] font-medium">Seu nome (aparece para o Líder)</span>
            <input value={nome} onChange={(e) => setNome(e.target.value)} required minLength={2} maxLength={40} placeholder="Ex.: João"
              className="h-10 w-full rounded-lg border border-line-strong bg-black/30 px-3 text-[14px] focus:border-accent focus:outline-none" />
          </label>
          <p className="text-[12px] text-subtle">Aparelho detectado: <span className="text-muted">{aparelho || "…"}</span> · nome na lista: <span className="font-mono text-muted">{aparelhoNome(nome) || (aparelho ? (ehMovel() ? "CEL-…" : "PC-…") : "…")}</span></p>
          {erro && <p className="text-[13px] text-danger">{erro}</p>}
          <button disabled={conectando} className="h-11 w-full rounded-xl bg-white text-[15px] font-medium text-zinc-950 disabled:opacity-50">{conectando ? "Conectando…" : "Conectar"}</button>
        </form>
      ) : (
        <>
          <section className="glass space-y-4 rounded-2xl border border-line p-5">
            <div className="flex items-center gap-3">
              <span className={cn("size-3 rounded-full", online ? "led-pulse bg-ok" : online === false ? "bg-danger" : "bg-subtle")} />
              <div className="min-w-0">
                <p className="font-mono text-[15px] text-fg">{cfg.hostname}</p>
                <p className="text-[12.5px] text-muted">
                  {online ? `Conectado · último contato há ${segs ?? 0}s` : online === false ? "Sem conexão com o servidor — tentando de novo" : "Conectando…"}
                </p>
              </div>
            </div>
            {devolucao && !tocando && (
              <p className="flex items-center gap-2 rounded-xl border border-signal/40 bg-signal/10 px-3 py-2 text-[13px]">
                <AlarmClock className="size-4 shrink-0 text-signal" />
                <span>Aparelho emprestado: devolva no balcão até <b>{horaCurta(devolucao.prazoEm)}</b>. Depois disso ele começa a apitar.</span>
              </p>
            )}
            <dl className="grid grid-cols-2 gap-3 text-[12.5px]">
              <div className="rounded-xl border border-line px-3 py-2"><dt className="text-subtle">Política</dt><dd className="mt-0.5 truncate text-fg">{politica ?? "—"}</dd></div>
              <div className="rounded-xl border border-line px-3 py-2"><dt className="text-subtle">Usuário</dt><dd className="mt-0.5 truncate text-fg">{cfg.nomeUsuario || "—"}</dd></div>
            </dl>
            {compartilhando && <p className="flex items-center gap-2 rounded-xl border border-danger/40 bg-danger-soft px-3 py-2 text-[13px] text-danger"><MonitorUp className="size-4" />Sua tela está sendo vista pelo Líder. Use “Parar de compartilhar” do navegador para encerrar.</p>}
          </section>

          {/* Pedir ajuda / atendimento */}
          {chamado ? (
            <button onClick={() => setChatAberto(true)} className="glass flex w-full items-center gap-3 rounded-2xl border border-signal/40 px-4 py-3.5 text-left">
              <LifeBuoy className="size-5 shrink-0 text-signal" />
              <span className="min-w-0 flex-1">
                <span className="block text-[14px] font-medium">Pedido #{chamado.numero} · {chamado.status === "EM_ATENDIMENTO" ? `${chamado.atendente?.split(" ")[0] ?? "Líder"} está atendendo` : "na fila do Líder"}</span>
                <span className="block truncate text-[12.5px] text-muted">{chamado.descricao}</span>
              </span>
              {naoLidas > 0 && <span className="grid min-w-5 place-items-center rounded-full bg-signal px-1.5 text-[11px] font-semibold leading-5 text-zinc-950">{naoLidas}</span>}
            </button>
          ) : pedindo ? (
            <form onSubmit={pedirAjuda} className="glass space-y-3 rounded-2xl border border-line p-4">
              <p className="flex items-center gap-2 text-[14px] font-medium"><LifeBuoy className="size-4 text-signal" />Pedir ajuda ao Líder</p>
              <textarea value={descricao} onChange={(e) => setDescricao(e.target.value)} autoFocus rows={3} maxLength={500} placeholder="O que está acontecendo? Ex.: a impressora 3D parou no meio"
                className="w-full resize-none rounded-lg border border-line-strong bg-black/30 px-3 py-2 text-[14px] focus:border-accent focus:outline-none" />
              <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={() => setPedindo(false)} className="h-10 rounded-xl border border-line-strong text-[13.5px]">Cancelar</button>
                <button disabled={enviando || descricao.trim().length < 3} className="h-10 rounded-xl bg-white text-[13.5px] font-medium text-zinc-950 disabled:opacity-50">Enviar pedido</button>
              </div>
            </form>
          ) : (
            <button onClick={() => setPedindo(true)} className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-white text-[15px] font-medium text-zinc-950">
              <LifeBuoy className="size-4" />Pedir ajuda ao Líder
            </button>
          )}

          <section className="space-y-2">
            {push === "desligado" && (
              <button onClick={ativarPush} className="flex w-full items-center gap-3 rounded-xl border border-line-strong px-4 py-3 text-left text-[13.5px] hover:bg-white/5">
                <BellRing className="size-4 text-signal" /><span className="flex-1">Receber avisos com o app fechado<span className="block text-[12px] text-subtle">Notificação push: lembrete de devolução, avisos e respostas do Líder</span></span>
              </button>
            )}
            {push === "ligado" && <p className="flex items-center gap-2 px-1 text-[12px] text-ok"><BellRing className="size-3.5" />Avisos chegam mesmo com o app fechado.</p>}
            {push === "indisponivel" && notif !== "indisponivel" && notif !== "granted" && (
              <button onClick={pedirNotificacao} className="flex w-full items-center gap-3 rounded-xl border border-line-strong px-4 py-3 text-left text-[13.5px] hover:bg-white/5">
                <Bell className="size-4 text-signal" /><span className="flex-1">Ativar notificações<span className="block text-[12px] text-subtle">Para ver avisos com o celular bloqueado</span></span>
              </button>
            )}
            {seguro && (navigator as NavegadorExtra).wakeLock && (
              <button onClick={alternarTelaLigada} className="flex w-full items-center gap-3 rounded-xl border border-line-strong px-4 py-3 text-left text-[13.5px] hover:bg-white/5">
                <Sun className={cn("size-4", telaLigada ? "text-ok" : "text-signal")} /><span className="flex-1">{telaLigada ? "Tela ficará ligada" : "Manter a tela ligada"}<span className="block text-[12px] text-subtle">Bom para a demonstração: a página não dorme</span></span>
              </button>
            )}
            <p className="flex items-start gap-2 px-1 pt-1 text-[12px] text-subtle"><Wifi className="mt-0.5 size-3.5 shrink-0" />{push === "ligado" ? "Pode fechar: os avisos chegam por notificação. Com a página aberta, o check-in é a cada 15 s." : "Deixe esta página aberta. O check-in acontece a cada 15 segundos."}</p>
            {seguro && <p className="px-1 text-[12px] text-subtle">Dica: no menu do navegador, toque em <span className="text-muted">“Adicionar à tela inicial”</span> para ter o LabMaker como app.</p>}
            <p className="flex items-start gap-2 px-1 text-[12px] text-subtle"><BatteryMedium className="mt-0.5 size-3.5 shrink-0" />Envia só bateria, tipo de rede e o nome que você digitou.</p>
            <button onClick={desconectar} className="flex items-center gap-2 px-1 pt-2 text-[12.5px] text-subtle hover:text-danger"><Unplug className="size-3.5" />Desconectar este aparelho</button>
          </section>
        </>
      )}

      {/* conversa com o Líder */}
      {chatAberto && chamado && (
        <div className="fixed inset-0 z-30 flex flex-col bg-bg">
          <div className="flex items-center gap-3 border-b border-line px-4 py-3">
            <LifeBuoy className="size-5 text-signal" />
            <div className="min-w-0 flex-1">
              <p className="text-[14px] font-medium">Pedido #{chamado.numero}</p>
              <p className="truncate text-[12px] text-muted">{chamado.status === "EM_ATENDIMENTO" ? `Em atendimento${chamado.atendente ? ` · ${chamado.atendente.split(" ")[0]}` : ""}` : "Esperando o Líder"}</p>
            </div>
            <button onClick={() => setChatAberto(false)} aria-label="Fechar conversa" className="grid size-9 place-items-center rounded-lg text-subtle hover:text-fg"><X className="size-5" /></button>
          </div>
          <div ref={rolagemChat} className="min-h-0 flex-1 space-y-2.5 overflow-y-auto px-4 py-4">
            {chat.length === 0 && <p className="py-8 text-center text-[13px] text-subtle">O Líder vai responder por aqui.</p>}
            {chat.map((m) =>
              m.autor === "SISTEMA" ? (
                <p key={m.id} className="text-center text-[11.5px] text-subtle">{m.texto}</p>
              ) : (
                <div key={m.id} className={cn("flex", m.autor === "USUARIO" ? "justify-end" : "justify-start")}>
                  <div className={cn("max-w-[82%] rounded-2xl px-3.5 py-2 text-[14.5px]", m.autor === "USUARIO" ? "rounded-br-md bg-white text-zinc-950" : "rounded-bl-md border border-line bg-surface")}>
                    {m.autor === "LIDER" && <p className="text-[11px] font-medium text-signal">{m.autorNome?.split(" ")[0] ?? "Líder"}</p>}
                    <p className="whitespace-pre-wrap break-words">{m.texto}</p>
                  </div>
                </div>
              ),
            )}
          </div>
          <form onSubmit={enviarMensagem} className="flex gap-2 border-t border-line p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            <input value={texto} onChange={(e) => setTexto(e.target.value)} maxLength={1000} placeholder="Escreva uma mensagem"
              className="h-11 min-w-0 flex-1 rounded-xl border border-line-strong bg-black/30 px-3 text-[15px] focus:border-accent focus:outline-none" aria-label="Mensagem" />
            <button disabled={enviando || !texto.trim()} aria-label="Enviar" className="grid size-11 place-items-center rounded-xl bg-white text-zinc-950 disabled:opacity-50"><Send className="size-4" /></button>
          </form>
          <button onClick={cancelarPedido} className="pb-3 text-[12px] text-subtle hover:text-danger">Já resolvi — cancelar pedido</button>
        </div>
      )}

      {/* aviso do Líder: fica na tela até a pessoa confirmar a leitura */}
      {alerta && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/80 p-5 backdrop-blur-sm">
          <div className={cn("w-full max-w-sm rounded-2xl border bg-surface p-6 shadow-pop", alerta.prioridade === "CRITICO" ? "border-danger/60" : "border-signal/50")}>
            <p className={cn("flex items-center gap-2 text-[12px] font-medium uppercase tracking-wide", alerta.prioridade === "CRITICO" ? "text-danger" : "text-signal")}><BellRing className="size-4" />Aviso do Líder do espaço</p>
            <h2 className="mt-3 text-xl font-semibold tracking-tight">{alerta.titulo}</h2>
            <p className="mt-2 text-[15px] text-muted">{alerta.mensagem}</p>
            <button onClick={lerAlerta} className="mt-6 h-11 w-full rounded-xl bg-white text-[15px] font-medium text-zinc-950">Entendi</button>
          </div>
        </div>
      )}

      {pedidoTela && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/80 p-5 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl border border-line-strong bg-surface p-6">
            <p className="flex items-center gap-2 text-[12px] font-medium uppercase tracking-wide text-signal"><MonitorUp className="size-4" />Pedido de suporte remoto</p>
            <h2 className="mt-3 text-lg font-semibold">O Líder quer ver sua tela</h2>
            <p className="mt-2 text-[14px] text-muted">Motivo: {pedidoTela.justificativa ?? "—"}. Só visualização, no máximo 10 minutos; você pode parar quando quiser.</p>
            <div className="mt-6 grid grid-cols-2 gap-2">
              <button onClick={() => compartilharTela(false)} className="h-11 rounded-xl border border-line-strong text-[14px]">Recusar</button>
              <button onClick={() => compartilharTela(true)} className="h-11 rounded-xl bg-white text-[14px] font-medium text-zinc-950">Compartilhar</button>
            </div>
          </div>
        </div>
      )}

      {tocando && devolucao && (
        <div className="fixed inset-0 z-[60] grid place-items-center bg-red-700 p-8 text-center text-white" role="alertdialog" aria-live="assertive">
          <div className="animate-pulse">
            <AlarmClock className="mx-auto size-16" />
            <h2 className="mt-5 text-3xl font-bold tracking-tight">Devolva este aparelho</h2>
            <p className="mt-3 text-lg">O prazo terminou às {horaCurta(devolucao.prazoEm)}.</p>
            <p className="mt-1 text-white/85">Leve o {cfg?.hostname} ao balcão do espaço maker. O alarme para quando o Líder registrar a devolução.</p>
            <p className="mt-6 font-mono text-sm text-white/80">
              atrasado há {Math.max(1, Math.floor((agora + devolucao.desvio - devolucao.prazoEm.getTime()) / 60_000))} min
            </p>
            {!somLiberado && <p className="mt-4 rounded-lg bg-white/15 px-3 py-2 text-sm">Toque na tela para ativar o som</p>}
          </div>
        </div>
      )}

      {bloqueado && (
        <div className="fixed inset-0 z-40 grid place-items-center bg-zinc-950 p-8 text-center">
          <div>
            <Lock className="mx-auto size-10 text-danger" />
            <h2 className="mt-5 text-2xl font-semibold tracking-tight">Aparelho bloqueado</h2>
            <p className="mt-2 text-muted">Procure o Líder do espaço no balcão.</p>
          </div>
        </div>
      )}
    </main>
  );
}

/** Celular ou computador, pelo navegador (decide o prefixo do nome na lista). */
const ehMovel = () => typeof navigator !== "undefined" && /android|iphone|ipad|mobile/i.test(navigator.userAgent);

/** "João" no celular → "CEL-JOAO"; "Sala 07" no computador → "PC-SALA-07"; quem já digitou o prefixo não ganha outro; vazio → "" */
function aparelhoNome(nome: string) {
  const base = nome.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toUpperCase().replace(/[^A-Z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
  if (!base) return "";
  if (/^(CEL|PC|NB|TAB)-/.test(base)) return base;
  return `${ehMovel() ? "CEL" : "PC"}-${base}`;
}
