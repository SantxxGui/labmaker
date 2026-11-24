#!/usr/bin/env node
/**
 * Agente LabMaker — roda em um notebook/computador do espaço maker.
 * Node 18.15+ puro, sem dependências.
 *
 *   1ª vez:   node agente/agente.mjs --servidor http://IP-DO-SERVIDOR:3000 --inscricao <CÓDIGO>
 *   depois:   node agente/agente.mjs            (usa o token salvo em ~/.labmaker-agente.json)
 *
 * Opções:
 *   --permitir-bloqueio   "Bloquear tela" trava a sessão e volta a travar até o Líder liberar (sem isso, só registra)
 *   --permitir-reinicio   "Reiniciar" reinicia o computador de verdade, com 1 minuto de aviso (sem isso, recusa)
 *   --aplicar-politica    executáveis baixados em ~/Downloads vão para a quarentena (sem isso, só são reportados)
 *   --nome LM-NB-01       usa este nome (assume o aparelho que o Líder já cadastrou manualmente)
 *   --tipo NOTEBOOK|DESKTOP
 *   --uma-vez             faz um único check-in e sai (testes)
 *   --testar-captura      tira uma foto da tela, salva em ./teste-captura.jpg e sai (confere se a captura funciona)
 *   --pedir-ajuda         abre o pedido de ajuda na hora e a janelinha de chat com o Líder, e sai
 *   --mensagem "texto"    manda uma mensagem no chat do chamado aberto e sai
 *   --instalar-servico    o agente passa a iniciar sozinho com o computador + atalho "Pedir ajuda" na área de trabalho
 *   --remover-servico     desfaz o --instalar-servico
 *
 * Por segurança, o agente só reinicia com --permitir-reinicio e NUNCA apaga dados.
 * As opções --permitir-* / --aplicar-politica ficam salvas: da próxima vez basta "node agente.mjs".
 */
import { execFile, spawn } from "node:child_process";
import { createInterface } from "node:readline";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const VERSAO = "4.9.0";
const ARQ_CONFIG = path.join(os.homedir(), ".labmaker-agente.json");
const PASTA_DOWNLOADS = path.join(os.homedir(), "Downloads");
const QUARENTENA = path.join(os.homedir(), ".labmaker-quarentena");
const EXECUTAVEIS = [".exe", ".msi", ".bat", ".cmd", ".ps1", ".dmg", ".pkg", ".apk", ".jar", ".vbs"];
const PLATAFORMA = process.platform; // win32 | darwin | linux

// ───────────────────────── argumentos e configuração ─────────────────────────

const args = process.argv.slice(2);
const opt = (nome) => { const i = args.indexOf(`--${nome}`); return i >= 0 ? args[i + 1] : undefined; };
/** Opção ligada na linha de comando OU salva no --instalar-servico (para o início automático usar as mesmas). */
const flag = (nome) => args.includes(`--${nome}`) || !!lerConfig()?.opcoes?.[nome];

const cor = { cinza: "\x1b[90m", verde: "\x1b[32m", amarelo: "\x1b[33m", vermelho: "\x1b[31m", azul: "\x1b[36m", neg: "\x1b[1m", fim: "\x1b[0m" };
const hora = () => new Date().toLocaleTimeString("pt-BR");
const log = (c, ...m) => console.log(`${cor.cinza}${hora()}${cor.fim} ${c}${m.join(" ")}${cor.fim}`);

function lerConfig() {
  try { return JSON.parse(fs.readFileSync(ARQ_CONFIG, "utf8")); } catch { return null; }
}
function salvarConfig(c) {
  fs.writeFileSync(ARQ_CONFIG, JSON.stringify(c, null, 2), { mode: 0o600 });
}

// ───────────────────────── utilidades de sistema ─────────────────────────

/** Executa um comando com timeout curto; nunca derruba o agente. */
function rodar(cmd, argv, timeout = 6000) {
  return new Promise((resolve) => {
    execFile(cmd, argv, { timeout, windowsHide: true }, (err, stdout) => resolve(err ? null : String(stdout).trim()));
  });
}
const ps = (script) => rodar("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], 8000);

/** Como rodar(), mas diz se o programa existe e devolve a saída em bytes (para imagens). */
/**
 * Ambiente com UTF-8 garantido: sem isso, o zenity recusa títulos com acento ("Líder")
 * quando o sistema está em locale C (algumas VMs e serviços de início automático).
 */
const AMBIENTE = (() => {
  const atual = process.env.LC_ALL || process.env.LC_CTYPE || process.env.LANG || "";
  return PLATAFORMA !== "win32" && !/utf-?8/i.test(atual) ? { ...process.env, LC_ALL: "C.UTF-8" } : process.env;
})();

function rodarBruto(cmd, argv, timeout = 8000) {
  return new Promise((resolve) => {
    execFile(cmd, argv, { timeout, windowsHide: true, encoding: "buffer", maxBuffer: 32 * 1024 * 1024, env: AMBIENTE }, (err, stdout) => {
      resolve({ ok: !err, faltando: err?.code === "ENOENT", saida: stdout ?? Buffer.alloc(0) });
    });
  });
}

// CPU: diferença entre duas leituras de os.cpus()
let cpuAnterior = os.cpus();
function lerCpu() {
  const atual = os.cpus();
  let ocioso = 0, total = 0;
  atual.forEach((c, i) => {
    const a = cpuAnterior[i]?.times ?? c.times;
    const d = Object.fromEntries(Object.keys(c.times).map((k) => [k, c.times[k] - a[k]]));
    ocioso += d.idle;
    total += Object.values(d).reduce((x, y) => x + y, 0);
  });
  cpuAnterior = atual;
  return total > 0 ? Math.round(100 - (ocioso / total) * 100) : null;
}

function lerDisco() {
  try {
    const raiz = PLATAFORMA === "win32" ? "C:\\" : "/";
    const s = fs.statfsSync(raiz);
    return Math.round(100 - (s.bavail / s.blocks) * 100);
  } catch { return null; }
}

function lerRede() {
  const nomes = Object.entries(os.networkInterfaces())
    .filter(([, l]) => l?.some((e) => !e.internal && e.family === "IPv4"))
    .map(([n]) => n.toLowerCase());
  if (nomes.some((n) => /wi-?fi|wlan|wl|airport/.test(n))) return "Wi-Fi";
  if (nomes.some((n) => /eth|en|ethernet/.test(n))) return "Ethernet";
  return nomes.length ? "Rede" : null;
}

function lerMac() {
  for (const lista of Object.values(os.networkInterfaces())) {
    const e = lista?.find((x) => !x.internal && x.mac && x.mac !== "00:00:00:00:00:00");
    if (e) return e.mac.toUpperCase();
  }
  return null;
}

async function lerBateria() {
  if (PLATAFORMA === "win32") {
    const r = await ps("$b = Get-CimInstance Win32_Battery; if ($b) { \"$($b.EstimatedChargeRemaining);$($b.BatteryStatus)\" }");
    if (!r) return { bateria: null, carregando: false };
    const [pct, st] = r.split(";").map(Number);
    return { bateria: Number.isFinite(pct) ? pct : null, carregando: st === 2 || st === 6 };
  }
  if (PLATAFORMA === "darwin") {
    const r = await rodar("pmset", ["-g", "batt"]);
    const m = r?.match(/(\d+)%;\s*(\w+)/);
    return m ? { bateria: Number(m[1]), carregando: m[2] !== "discharging" } : { bateria: null, carregando: false };
  }
  try {
    const cap = Number(fs.readFileSync("/sys/class/power_supply/BAT0/capacity", "utf8"));
    const st = fs.readFileSync("/sys/class/power_supply/BAT0/status", "utf8").trim();
    return { bateria: cap, carregando: st !== "Discharging" };
  } catch { return { bateria: null, carregando: false }; }
}

/** Nome do programa em primeiro plano (o que o aluno está usando agora). */
async function lerAppAtivo() {
  if (PLATAFORMA === "win32") {
    return ps(`Add-Type @"
using System; using System.Runtime.InteropServices;
public class J { [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
[DllImport("user32.dll")] public static extern int GetWindowThreadProcessId(IntPtr h, out int p); }
"@; $p = 0; [void][J]::GetWindowThreadProcessId([J]::GetForegroundWindow(), [ref]$p); (Get-Process -Id $p).MainWindowTitle`);
  }
  if (PLATAFORMA === "darwin") {
    return rodar("osascript", ["-e", 'tell application "System Events" to get name of first application process whose frontmost is true']);
  }
  return rodar("xdotool", ["getactivewindow", "getwindowname"]);
}

/** Estado de segurança, quando o sistema permite ler sem administrador. */
async function lerSeguranca() {
  const s = {};
  if (PLATAFORMA === "win32") {
    const av = await ps("(Get-MpComputerStatus).RealTimeProtectionEnabled");
    if (av === "True" || av === "False") s.antivirusAtivo = av === "True";
    const fw = await ps("(Get-NetFirewallProfile | Where-Object { $_.Enabled -eq $true }).Count");
    if (fw !== null && fw !== "") s.firewallAtivo = Number(fw) > 0;
    const bl = await ps("(Get-BitLockerVolume -MountPoint C: -ErrorAction SilentlyContinue).ProtectionStatus");
    if (bl === "On" || bl === "Off") s.criptografado = bl === "On";
  } else if (PLATAFORMA === "darwin") {
    const fv = await rodar("fdesetup", ["status"]);
    if (fv) s.criptografado = /On/.test(fv);
    const fw = await rodar("/usr/libexec/ApplicationFirewall/socketfilterfw", ["--getglobalstate"]);
    if (fw) s.firewallAtivo = /enabled/i.test(fw);
  }
  return s;
}

function infoDoSistema() {
  const so = PLATAFORMA === "win32" ? "WINDOWS" : PLATAFORMA === "darwin" ? "MACOS" : "LINUX";
  const versaoSo = PLATAFORMA === "win32" ? `Windows ${os.release()}` : PLATAFORMA === "darwin" ? `macOS ${os.release()}` : `Linux ${os.release()}`;
  return { so, versaoSo };
}

// ───────────────────────── notificações e ações ─────────────────────────

const aspas = (t) => String(t ?? "").replace(/["'`$\\]/g, " ").slice(0, 300);

/** Notificação nativa do sistema (balão do Windows, Central de Notificações do macOS, notify-send no Linux). */
async function notificar(titulo, mensagem) {
  const t = aspas(titulo), m = aspas(mensagem);
  if (PLATAFORMA === "win32") {
    return ps(`Add-Type -AssemblyName System.Windows.Forms; Add-Type -AssemblyName System.Drawing; $n = New-Object System.Windows.Forms.NotifyIcon; $n.Icon = [System.Drawing.SystemIcons]::Information; $n.BalloonTipTitle = 'LabMaker · ${t}'; $n.BalloonTipText = '${m}'; $n.Visible = $true; $n.ShowBalloonTip(10000); Start-Sleep -Seconds 8; $n.Dispose()`);
  }
  if (PLATAFORMA === "darwin") return rodar("osascript", ["-e", `display notification "${m}" with title "LabMaker" subtitle "${t}" sound name "Glass"`]);
  return rodar("notify-send", ["-u", "normal", `LabMaker · ${t}`, m]);
}

function caixa(titulo, linhas, c = cor.amarelo) {
  const largura = Math.max(titulo.length, ...linhas.map((l) => l.length)) + 4;
  console.log(`\n${c}┌${"─".repeat(largura)}┐`);
  console.log(`│  ${cor.neg}${titulo}${cor.fim}${c}${" ".repeat(largura - titulo.length - 2)}│`);
  for (const l of linhas) console.log(`│  ${l}${" ".repeat(largura - l.length - 2)}│`);
  console.log(`└${"─".repeat(largura)}┘${cor.fim}\n`);
}

function perguntar(pergunta, segundos) {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const t = setTimeout(() => { rl.close(); resolve(null); }, segundos * 1000);
    rl.question(pergunta, (r) => { clearTimeout(t); rl.close(); resolve(r.trim().toLowerCase()); });
  });
}

/** Um toque do alarme de devolução (Windows: bipe do sistema; macOS: som do sistema; Linux: som ou sino do terminal). */
async function apitar() {
  if (PLATAFORMA === "win32") return ps("[console]::beep(1568,300); [console]::beep(1046,300); [console]::beep(1568,300)");
  if (PLATAFORMA === "darwin") return rodar("afplay", ["/System/Library/Sounds/Sosumi.aiff"]);
  const som = "/usr/share/sounds/freedesktop/stereo/alarm-clock-elapsed.oga";
  if (fs.existsSync(som) && (await rodar("paplay", [som], 4000)) !== null) return;
  process.stdout.write("\x07");
}

let alarme = null; // setInterval do alarme de devolução
function alarmeDevolucao(dev, hostname) {
  if (dev?.tocando && !alarme) {
    const prazo = new Date(dev.prazoEm).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    caixa("⏰ Devolva este computador", [`O prazo terminou às ${prazo}.`, `Leve o ${hostname} ao balcão do espaço maker.`], cor.vermelho);
    void notificar(`Devolva o ${hostname}`, `O prazo terminou às ${prazo}. O alarme para quando o Líder registrar a devolução.`);
    void apitar();
    alarme = setInterval(() => void apitar(), 3000);
  } else if (!dev?.tocando && alarme) {
    clearInterval(alarme); alarme = null;
    log(cor.verde, "✔ Devolução registrada: alarme desligado.");
  }
}

/** Reinicia com 1 minuto de aviso (dá tempo de salvar e de o resultado subir para o servidor). */
async function reiniciar() {
  const msg = "O Lider do espaco pediu para reiniciar. Salve seus arquivos.";
  if (PLATAFORMA === "win32") return (await rodarBruto("shutdown", ["/r", "/t", "60", "/c", msg])).ok;
  if (PLATAFORMA === "darwin") { setTimeout(() => void rodar("osascript", ["-e", 'tell application "System Events" to restart']), 60_000); return true; }
  if ((await rodarBruto("shutdown", ["-r", "+1", msg])).ok) return true;
  setTimeout(() => void rodar("systemctl", ["reboot"]), 60_000); // Mint/Ubuntu: o usuário logado pode reiniciar
  return true;
}

async function travarSessao() {
  if (PLATAFORMA === "win32") return rodar("rundll32.exe", ["user32.dll,LockWorkStation"]);
  if (PLATAFORMA === "darwin") return rodar("pmset", ["displaysleepnow"]);
  return rodar("loginctl", ["lock-session"]);
}

/** Executa uma ação recebida e devolve o resultado para o próximo check-in. */
async function executar(a) {
  const ok = (motivo) => ({ id: a.id, status: "EXECUTADA", motivo });
  const nao = (motivo) => ({ id: a.id, status: "RECUSADA", motivo });
  switch (a.tipo) {
    case "ALERTA":
      caixa(`Aviso da equipe do espaço · ${a.prioridade ?? "INFO"}`, [a.titulo, a.mensagem], a.prioridade === "CRITICO" ? cor.vermelho : cor.amarelo);
      await notificar(a.titulo, a.mensagem);
      return ok("Exibido na tela do usuário");
    case "BLOQUEAR":
      await notificar("Dispositivo bloqueado", "Procure o Líder do espaço no balcão do espaço maker.");
      if (flag("permitir-bloqueio")) { await travarSessao(); return ok("Sessão travada até o Líder liberar"); }
      return ok("Bloqueio registrado (agente iniciado sem --permitir-bloqueio)");
    case "DESBLOQUEAR":
      await notificar("Dispositivo liberado", "Você já pode usar o computador.");
      return ok("Liberado");
    case "SINCRONIZAR":
      return ok("Política reaplicada");
    case "INSTALAR_APP":
    case "REMOVER_APP":
      log(cor.azul, `→ ${a.tipo === "INSTALAR_APP" ? "Instalar" : "Remover"} ${a.parametro} (simulado: em produção usa winget / Intune)`);
      return ok("Simulado no agente de demonstração");
    case "SESSAO_REMOTA": {
      const motivo = a.justificativa ?? "—";
      // Você mesmo autorizou ao pedir ajuda ("o Líder pode ver minha tela"): não pergunta de novo,
      // mas o aviso fixo de "tela sendo vista" aparece do mesmo jeito.
      if (a.parametro?.endsWith(":pre-autorizado")) {
        void transmitirTela(a.id);
        return ok("Pré-autorizado pelo usuário no pedido de ajuda — compartilhando a tela");
      }
      await notificar("Pedido de suporte remoto", `O Líder do espaço quer ver sua tela: ${motivo}`);
      caixa("Pedido de suporte remoto", [`Motivo: ${motivo}`, "Responda na janela que abriu (ou aqui no terminal)."], cor.azul);
      let aceitou = await dialogoPermissao(motivo);
      if (aceitou === null) {
        const r = await perguntar("Autorizar que o Líder veja sua tela? (s/n) ", 60);
        aceitou = r === null ? null : r === "s" || r === "sim";
      }
      if (aceitou === null) return nao("Sem resposta do usuário");
      if (!aceitou) return nao("O usuário recusou o acesso à tela");
      void transmitirTela(a.id);
      return ok("Autorizado pelo usuário — compartilhando a tela");
    }
    case "REINICIAR": {
      if (!flag("permitir-reinicio")) return nao("Reinício desativado: inicie o agente com --permitir-reinicio");
      const r = await reiniciar();
      if (!r) return nao("O sistema não deixou reiniciar (falta permissão de administrador?)");
      caixa("Reinício pedido pelo Líder", ["Este computador reinicia em 1 minuto.", "Salve seus arquivos agora."], cor.amarelo);
      await notificar("Reinício em 1 minuto", "O Líder do espaço pediu para reiniciar este computador. Salve seus arquivos.");
      return ok("Reiniciando em 1 minuto");
    }
    case "APAGAR_DADOS":
      return nao("Apagamento desativado no agente de demonstração");
    default:
      return nao(`Ação desconhecida: ${a.tipo}`);
  }
}

// ───────────────────────── suporte remoto: tela ─────────────────────────

/** Janela nativa "Permitir / Recusar". true/false = resposta; null = sem interface gráfica (cai no terminal). */
async function dialogoPermissao(motivo, textoProprio = null, titulo = "LabMaker · suporte remoto") {
  const texto = textoProprio
    ? textoProprio.replace(/["`$\\]/g, " ")
    : `O Líder do espaço maker quer VER sua tela (sem controlar mouse ou teclado).\n\nMotivo: ${aspas(motivo)}\n\nA sessão dura no máximo 30 minutos e você pode encerrar quando quiser.`;
  if (PLATAFORMA === "win32") {
    const r = await rodarBruto("powershell.exe", ["-NoProfile", "-Command",
      `Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.MessageBox]::Show("${texto.replace(/\n/g, "`n")}", "${titulo}", "YesNo", "Question", "Button2", "DefaultDesktopOnly")`], 60_000);
    if (r.faltando) return null;
    return String(r.saida).trim() === "Yes";
  }
  if (PLATAFORMA === "darwin") {
    const r = await rodarBruto("osascript", ["-e", `display dialog "${texto.replace(/"/g, "'")}" with title "${titulo}" buttons {"Recusar", "Permitir"} default button "Recusar" giving up after 60`], 65_000);
    if (r.faltando) return null;
    return /button returned:Permitir/.test(String(r.saida)) && !/gave up:true/.test(String(r.saida));
  }
  const r = await rodarBruto("zenity", ["--question", `--title=${titulo}`, `--text=${texto}`, "--ok-label=Permitir", "--cancel-label=Recusar", "--timeout=60", "--width=420"], 65_000);
  if (r.faltando || (!process.env.DISPLAY && !process.env.WAYLAND_DISPLAY)) return null;
  return r.ok;
}

const ARQ_TMP = path.join(os.tmpdir(), "labmaker-tela");
let capturaLinux = null; // descobre uma vez qual ferramenta funciona

/** Foto da tela em JPEG (ou PNG), já reduzida para ~1280 px de largura quando a ferramenta permite. */
async function capturarTela() {
  if (PLATAFORMA === "win32") {
    const r = await rodarBruto("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", `
Add-Type -AssemblyName System.Windows.Forms, System.Drawing
$b = [System.Windows.Forms.SystemInformation]::VirtualScreen
$img = New-Object System.Drawing.Bitmap $b.Width, $b.Height
$g = [System.Drawing.Graphics]::FromImage($img); $g.CopyFromScreen($b.Left, $b.Top, 0, 0, $img.Size)
$w = [Math]::Min(1280, $b.Width); $h = [int]($b.Height * $w / $b.Width)
$p = New-Object System.Drawing.Bitmap $img, $w, $h
$enc = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' }
$par = New-Object System.Drawing.Imaging.EncoderParameters 1
$par.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter ([System.Drawing.Imaging.Encoder]::Quality), ([long]55)
$ms = New-Object System.IO.MemoryStream; $p.Save($ms, $enc, $par); [Convert]::ToBase64String($ms.ToArray())`], 15_000);
    const b64 = String(r.saida).trim();
    return r.ok && b64 ? { imagem: b64, tipo: "image/jpeg" } : null;
  }
  if (PLATAFORMA === "darwin") {
    const arq = `${ARQ_TMP}.jpg`;
    const r = await rodarBruto("screencapture", ["-x", "-t", "jpg", arq], 10_000);
    if (!r.ok) return null;
    await rodarBruto("sips", ["-Z", "1280", arq], 10_000);
    return { imagem: fs.readFileSync(arq).toString("base64"), tipo: "image/jpeg" };
  }
  // Linux: precisa de sessão X11 (no Linux Mint e no Ubuntu "on Xorg" funciona; Wayland bloqueia captura)
  const opcoes = [
    ["import", ["-window", "root", "-resize", "1280x", "-quality", "55", "jpg:-"], null, "image/jpeg"],
    ["scrot", ["-o", "-q", "55", `${ARQ_TMP}.jpg`], `${ARQ_TMP}.jpg`, "image/jpeg"],
    ["gnome-screenshot", ["-f", `${ARQ_TMP}.png`], `${ARQ_TMP}.png`, "image/png"],
    ["xfce4-screenshooter", ["-f", "-s", `${ARQ_TMP}.png`], `${ARQ_TMP}.png`, "image/png"],
    ["grim", ["-t", "jpeg", `${ARQ_TMP}.jpg`], `${ARQ_TMP}.jpg`, "image/jpeg"],
  ];
  for (const op of capturaLinux ? [capturaLinux] : opcoes) {
    const [cmd, argv, arq, tipo] = op;
    const r = await rodarBruto(cmd, argv, 10_000);
    if (!r.ok) continue;
    const dados = arq ? fs.readFileSync(arq) : r.saida;
    if (!dados.length) continue;
    if (!capturaLinux) log(cor.cinza, `captura de tela usando ${cmd}`);
    capturaLinux = op;
    return { imagem: dados.toString("base64"), tipo };
  }
  return null;
}

let transmitindo = null; // { acaoId, parar, aviso, aoEnter, controlador, perguntando }

/**
 * Envia a tela enquanto o servidor responder { continuar: true }: ~1 quadro/s só vendo, ~4/s com o
 * controle remoto ativo. Se o Líder pedir o controle, pergunta ao usuário (segundo consentimento).
 */
async function transmitirTela(acaoId) {
  const cfg = lerConfig();
  if (!cfg?.token || transmitindo) return;
  const t = (transmitindo = { acaoId, parar: false, aviso: null, aoEnter: null, controlador: null, perguntando: false });
  await notificar("Sua tela está sendo compartilhada", "O Líder do espaço está vendo sua tela. Ele não controla mouse nem teclado sem você permitir.");
  caixa("● Compartilhando sua tela com o Líder do espaço", ["Só visualização: ninguém mexe no seu mouse ou teclado sem você permitir.", "Pressione ENTER aqui para encerrar a qualquer momento."], cor.vermelho);
  t.aoEnter = () => { t.parar = true; };
  process.stdin.once("data", t.aoEnter);
  if (process.stdin.isPaused()) process.stdin.resume();
  // Janela fixa "sua tela está sendo vista" com o botão Parar — o usuário sempre sabe e sempre pode parar
  t.aviso = janelaCompartilhando(() => { t.parar = true; });

  let quadros = 0, iguais = 0, falhas = 0, motivoFim = "", anterior = "", intervalo = 1000;
  while (!t.parar) {
    const t0 = Date.now();
    // com o controle ativo no Windows, o ajudante captura mais rápido e com o cursor
    const q = (t.controlador?.capturar && (await t.controlador.capturar())) || (await capturarTela());
    if (!q) {
      motivoFim = "Não foi possível capturar a tela neste sistema (veja docs/DEMO-VM-CELULAR.md).";
      break;
    }
    try {
      // tela igual à anterior: só avisa que continua (não reenvia a imagem)
      const mesmo = q.imagem === anterior;
      const r = await api(cfg.servidor, "/api/agente/tela", mesmo ? { acaoId, mesmo: true } : { acaoId, ...q }, cfg.token);
      if (mesmo) iguais++; else { anterior = q.imagem; quadros++; }
      falhas = 0;
      if (!r.continuar) { motivoFim = r.motivo ?? "Sessão encerrada pelo Líder."; break; }
      intervalo = r.intervaloMs ?? 1000;
      if (r.controle === "pedido" && !t.perguntando && !t.controlador) void perguntarControle(t, r.controlePor);
      if (r.controle !== "ativo" && t.controlador && !t.perguntando) void pararControle(t, "O Líder devolveu o controle.");
    } catch (e) {
      if (++falhas >= 10) { motivoFim = `Servidor indisponível: ${e.message}`; break; }
    }
    await new Promise((res) => setTimeout(res, Math.max(80, intervalo - (Date.now() - t0))));
  }
  if (t.parar) {
    motivoFim = "Você encerrou o compartilhamento.";
    await api(cfg.servidor, "/api/agente/tela", { acaoId, fim: true }, cfg.token).catch(() => {});
  }
  await pararControle(t, null);
  process.stdin.off("data", t.aoEnter);
  process.stdin.pause();
  t.aviso?.fechar();
  transmitindo = null;
  log(cor.verde, `■ Compartilhamento de tela encerrado (${quadros} quadros enviados, ${iguais} sem mudança). ${motivoFim}`);
  await notificar("Compartilhamento encerrado", motivoFim);
}

// ───────────────────────── controle remoto (mouse e teclado) ─────────────────────────
// Só com a tela já compartilhada E um segundo "Permitir" do usuário. Windows: um PowerShell
// ajudante que fica aberto durante o controle (C# + SendInput; também captura a tela mais rápido e
// com o cursor). Linux: xdotool (sessão X11). macOS: indisponível (precisa de permissão de
// Acessibilidade dada à mão) — o Líder vê "indisponível" e segue só vendo.

/** KeyboardEvent.code → [scan code, tecla estendida]. Tecla física: com o mesmo layout (ABNT2) dos dois lados, sai igual. */
const SCANCODES = {
  Escape: [0x01], Digit1: [0x02], Digit2: [0x03], Digit3: [0x04], Digit4: [0x05], Digit5: [0x06], Digit6: [0x07], Digit7: [0x08], Digit8: [0x09], Digit9: [0x0a], Digit0: [0x0b],
  Minus: [0x0c], Equal: [0x0d], Backspace: [0x0e], Tab: [0x0f],
  KeyQ: [0x10], KeyW: [0x11], KeyE: [0x12], KeyR: [0x13], KeyT: [0x14], KeyY: [0x15], KeyU: [0x16], KeyI: [0x17], KeyO: [0x18], KeyP: [0x19],
  BracketLeft: [0x1a], BracketRight: [0x1b], Enter: [0x1c], ControlLeft: [0x1d],
  KeyA: [0x1e], KeyS: [0x1f], KeyD: [0x20], KeyF: [0x21], KeyG: [0x22], KeyH: [0x23], KeyJ: [0x24], KeyK: [0x25], KeyL: [0x26],
  Semicolon: [0x27], Quote: [0x28], Backquote: [0x29], ShiftLeft: [0x2a], Backslash: [0x2b],
  KeyZ: [0x2c], KeyX: [0x2d], KeyC: [0x2e], KeyV: [0x2f], KeyB: [0x30], KeyN: [0x31], KeyM: [0x32],
  Comma: [0x33], Period: [0x34], Slash: [0x35], ShiftRight: [0x36], NumpadMultiply: [0x37], AltLeft: [0x38], Space: [0x39], CapsLock: [0x3a],
  F1: [0x3b], F2: [0x3c], F3: [0x3d], F4: [0x3e], F5: [0x3f], F6: [0x40], F7: [0x41], F8: [0x42], F9: [0x43], F10: [0x44],
  NumLock: [0x45], ScrollLock: [0x46], Numpad7: [0x47], Numpad8: [0x48], Numpad9: [0x49], NumpadSubtract: [0x4a],
  Numpad4: [0x4b], Numpad5: [0x4c], Numpad6: [0x4d], NumpadAdd: [0x4e], Numpad1: [0x4f], Numpad2: [0x50], Numpad3: [0x51], Numpad0: [0x52], NumpadDecimal: [0x53],
  IntlBackslash: [0x56], F11: [0x57], F12: [0x58], IntlRo: [0x73], NumpadComma: [0x7e],
  NumpadEnter: [0x1c, 1], ControlRight: [0x1d, 1], NumpadDivide: [0x35, 1], PrintScreen: [0x37, 1], AltRight: [0x38, 1],
  Home: [0x47, 1], ArrowUp: [0x48, 1], PageUp: [0x49, 1], ArrowLeft: [0x4b, 1], ArrowRight: [0x4d, 1], End: [0x4f, 1], ArrowDown: [0x50, 1], PageDown: [0x51, 1],
  Insert: [0x52, 1], Delete: [0x53, 1], MetaLeft: [0x5b, 1], MetaRight: [0x5c, 1], ContextMenu: [0x5d, 1],
};

/** KeyboardEvent.code → keysym do X11 (xdotool). */
const KEYSYMS = (() => {
  const m = {
    Escape: "Escape", Minus: "minus", Equal: "equal", Backspace: "BackSpace", Tab: "Tab", BracketLeft: "bracketleft", BracketRight: "bracketright",
    Enter: "Return", ControlLeft: "Control_L", ControlRight: "Control_R", Semicolon: "semicolon", Quote: "apostrophe", Backquote: "grave",
    ShiftLeft: "Shift_L", ShiftRight: "Shift_R", Backslash: "backslash", Comma: "comma", Period: "period", Slash: "slash", AltLeft: "Alt_L", AltRight: "ISO_Level3_Shift",
    Space: "space", CapsLock: "Caps_Lock", NumLock: "Num_Lock", ScrollLock: "Scroll_Lock", NumpadMultiply: "KP_Multiply", NumpadSubtract: "KP_Subtract",
    NumpadAdd: "KP_Add", NumpadDecimal: "KP_Decimal", NumpadEnter: "KP_Enter", NumpadDivide: "KP_Divide", NumpadComma: "KP_Separator", IntlBackslash: "less", IntlRo: "slash",
    PrintScreen: "Print", Home: "Home", End: "End", PageUp: "Prior", PageDown: "Next", Insert: "Insert", Delete: "Delete",
    ArrowUp: "Up", ArrowDown: "Down", ArrowLeft: "Left", ArrowRight: "Right", MetaLeft: "Super_L", MetaRight: "Super_R", ContextMenu: "Menu",
  };
  for (let i = 0; i < 26; i++) m[`Key${String.fromCharCode(65 + i)}`] = String.fromCharCode(97 + i);
  for (let i = 0; i <= 9; i++) { m[`Digit${i}`] = String(i); m[`Numpad${i}`] = `KP_${i}`; }
  for (let i = 1; i <= 12; i++) m[`F${i}`] = `F${i}`;
  return m;
})();

/** O evento veio do servidor, mas é a fronteira do computador do aluno: confere tudo antes de usar. */
function eventoValido(e) {
  const c01 = (v) => typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 1;
  if (!e || typeof e !== "object") return false;
  if (e.t === "m") return c01(e.x) && c01(e.y);
  if (e.t === "b") return [0, 1, 2].includes(e.b) && typeof e.d === "boolean" && c01(e.x) && c01(e.y);
  if (e.t === "w") return Number.isInteger(e.dy) && e.dy !== 0 && Math.abs(e.dy) <= 20 && c01(e.x) && c01(e.y);
  if (e.t === "k") return typeof e.c === "string" && Object.hasOwn(SCANCODES, e.c) && typeof e.d === "boolean";
  if (e.t === "txt") return typeof e.s === "string" && e.s.length > 0 && e.s.length <= 2000;
  return false;
}

// Ajudante do Windows: compilado uma vez quando o controle começa (~2 s) e fica lendo comandos.
const AJUDANTE_WINDOWS = `$ErrorActionPreference = 'Stop'
try {
Add-Type -ReferencedAssemblies System.Drawing, System.Windows.Forms -TypeDefinition @'
using System;
using System.Drawing;
using System.Drawing.Imaging;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Windows.Forms;

public static class LabMakerControle {
  [StructLayout(LayoutKind.Sequential)] struct MOUSEINPUT { public int dx; public int dy; public uint mouseData; public uint dwFlags; public uint time; public IntPtr dwExtraInfo; }
  [StructLayout(LayoutKind.Sequential)] struct KEYBDINPUT { public ushort wVk; public ushort wScan; public uint dwFlags; public uint time; public IntPtr dwExtraInfo; }
  [StructLayout(LayoutKind.Explicit)] struct ENTRADA { [FieldOffset(0)] public MOUSEINPUT mi; [FieldOffset(0)] public KEYBDINPUT ki; }
  [StructLayout(LayoutKind.Sequential)] struct INPUT { public uint type; public ENTRADA u; }
  [StructLayout(LayoutKind.Sequential)] struct CURSORINFO { public int cbSize; public int flags; public IntPtr hCursor; public int x; public int y; }

  [DllImport("user32.dll", SetLastError = true)] static extern uint SendInput(uint n, INPUT[] entradas, int tamanho);
  [DllImport("user32.dll")] static extern bool SetProcessDPIAware();
  [DllImport("user32.dll")] static extern bool GetCursorInfo(ref CURSORINFO ci);
  [DllImport("user32.dll")] static extern bool DrawIcon(IntPtr hdc, int x, int y, IntPtr icone);

  const uint MOVE = 0x0001, ESQ_DESCE = 0x0002, ESQ_SOBE = 0x0004, DIR_DESCE = 0x0008, DIR_SOBE = 0x0010;
  const uint MEIO_DESCE = 0x0020, MEIO_SOBE = 0x0040, RODA = 0x0800, VIRTUALDESK = 0x4000, ABSOLUTO = 0x8000;
  const uint EXTENDIDA = 0x0001, SOBE = 0x0002, UNICODE = 0x0004, SCANCODE = 0x0008;
  static ImageCodecInfo jpeg;

  /* Tela em pixels reais (sem isso, com escala de 125/150% a captura sai cortada). */
  public static void Iniciar() { SetProcessDPIAware(); }

  static void Enviar(INPUT[] e) { SendInput((uint)e.Length, e, Marshal.SizeOf(typeof(INPUT))); }
  static INPUT Mouse(int dx, int dy, uint dados, uint flags) { INPUT i = new INPUT(); i.type = 0; i.u.mi.dx = dx; i.u.mi.dy = dy; i.u.mi.mouseData = dados; i.u.mi.dwFlags = flags; return i; }
  static INPUT Tecla(ushort vk, ushort scan, uint flags) { INPUT i = new INPUT(); i.type = 1; i.u.ki.wVk = vk; i.u.ki.wScan = scan; i.u.ki.dwFlags = flags; return i; }

  /* mv X Y (0..65535 sobre a área de trabalho inteira) | bt BOTAO 1/0 | wh DELTA | ky SCAN EXT 1/0 | tx BASE64 | cap LARGURA QUALIDADE */
  public static string Executar(string linha) {
    string[] p = linha.Split(' ');
    switch (p[0]) {
      case "mv":
        Enviar(new INPUT[] { Mouse(int.Parse(p[1]), int.Parse(p[2]), 0, MOVE | ABSOLUTO | VIRTUALDESK) });
        return null;
      case "bt": {
        int b = int.Parse(p[1]); bool desce = p[2] == "1";
        uint f = b == 0 ? (desce ? ESQ_DESCE : ESQ_SOBE) : b == 1 ? (desce ? MEIO_DESCE : MEIO_SOBE) : (desce ? DIR_DESCE : DIR_SOBE);
        Enviar(new INPUT[] { Mouse(0, 0, 0, f) });
        return null;
      }
      case "wh":
        Enviar(new INPUT[] { Mouse(0, 0, unchecked((uint)int.Parse(p[1])), RODA) });
        return null;
      case "ky": {
        uint f = SCANCODE | (p[2] == "1" ? EXTENDIDA : 0) | (p[3] == "1" ? 0 : SOBE);
        Enviar(new INPUT[] { Tecla(0, (ushort)int.Parse(p[1]), f) });
        return null;
      }
      case "tx": {
        string t = Encoding.UTF8.GetString(Convert.FromBase64String(p[1]));
        foreach (char c in t) {
          if (c == '\\r') continue;
          if (c == '\\n') { Enviar(new INPUT[] { Tecla(0x0D, 0, 0), Tecla(0x0D, 0, SOBE) }); continue; }
          Enviar(new INPUT[] { Tecla(0, c, UNICODE), Tecla(0, c, UNICODE | SOBE) });
        }
        return null;
      }
      case "cap":
        return "cap " + Capturar(int.Parse(p[1]), long.Parse(p[2]));
    }
    return null;
  }

  static string Capturar(int largura, long qualidade) {
    Rectangle b = SystemInformation.VirtualScreen;
    using (Bitmap img = new Bitmap(b.Width, b.Height)) {
      using (Graphics g = Graphics.FromImage(img)) {
        g.CopyFromScreen(b.Left, b.Top, 0, 0, img.Size);
        CURSORINFO ci = new CURSORINFO(); ci.cbSize = Marshal.SizeOf(typeof(CURSORINFO));
        if (GetCursorInfo(ref ci) && ci.flags == 1) { IntPtr hdc = g.GetHdc(); DrawIcon(hdc, ci.x - b.Left, ci.y - b.Top, ci.hCursor); g.ReleaseHdc(hdc); }
      }
      int w = Math.Min(largura, b.Width); int h = (int)((long)b.Height * w / b.Width);
      using (Bitmap menor = new Bitmap(w, h)) {
        using (Graphics g2 = Graphics.FromImage(menor)) {
          g2.InterpolationMode = System.Drawing.Drawing2D.InterpolationMode.HighQualityBilinear;
          g2.DrawImage(img, 0, 0, w, h);
        }
        if (jpeg == null) foreach (ImageCodecInfo c in ImageCodecInfo.GetImageEncoders()) if (c.MimeType == "image/jpeg") jpeg = c;
        EncoderParameters par = new EncoderParameters(1);
        par.Param[0] = new EncoderParameter(System.Drawing.Imaging.Encoder.Quality, qualidade);
        using (MemoryStream ms = new MemoryStream()) { menor.Save(ms, jpeg, par); return Convert.ToBase64String(ms.ToArray()); }
      }
    }
  }
}
'@
[LabMakerControle]::Iniciar()
} catch { [Console]::Out.WriteLine('falhou ' + $_.Exception.Message); exit 1 }
[Console]::Out.WriteLine('pronto')
while ($true) {
  $l = [Console]::In.ReadLine()
  if ($null -eq $l -or $l -eq 'sair') { break }
  try { $r = [LabMakerControle]::Executar($l); if ($r) { [Console]::Out.WriteLine($r) } }
  catch { [Console]::Out.WriteLine('erro ' + $l.Split(' ')[0] + ' ' + $_.Exception.Message) }
}
`;

/** Eventos → comandos do ajudante do Windows. */
function linhasWindows(eventos) {
  const pos = (e) => `mv ${Math.round(e.x * 65535)} ${Math.round(e.y * 65535)}`;
  const out = [];
  for (const e of eventos) {
    if (e.t === "m") out.push(pos(e));
    else if (e.t === "b") out.push(pos(e), `bt ${e.b} ${e.d ? 1 : 0}`);
    else if (e.t === "w") out.push(pos(e), `wh ${-e.dy * 120}`); // no navegador + é para baixo; no Windows + é para cima
    else if (e.t === "k") { const [scan, ext] = SCANCODES[e.c]; out.push(`ky ${scan} ${ext ? 1 : 0} ${e.d ? 1 : 0}`); }
    else if (e.t === "txt") out.push(`tx ${Buffer.from(e.s, "utf8").toString("base64")}`);
  }
  return out;
}

/** Eventos → argumentos do xdotool (um processo por lote; "type" vai à parte). */
function lotesXdotool(eventos, largura, altura) {
  const lotes = [];
  let atual = [];
  const xy = (e) => [String(Math.round(e.x * (largura - 1))), String(Math.round(e.y * (altura - 1)))];
  for (const e of eventos) {
    if (e.t === "m") atual.push("mousemove", ...xy(e));
    else if (e.t === "b") atual.push("mousemove", ...xy(e), e.d ? "mousedown" : "mouseup", String([1, 2, 3][e.b]));
    else if (e.t === "w") atual.push("mousemove", ...xy(e), "click", "--repeat", String(Math.abs(e.dy)), e.dy > 0 ? "5" : "4");
    else if (e.t === "k") { if (KEYSYMS[e.c]) atual.push(e.d ? "keydown" : "keyup", KEYSYMS[e.c]); }
    else if (e.t === "txt") { if (atual.length) lotes.push(atual); lotes.push(["type", "--delay", "8", "--", e.s]); atual = []; }
  }
  if (atual.length) lotes.push(atual);
  return lotes;
}

async function controladorWindows() {
  const filho = spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-EncodedCommand", Buffer.from(AJUDANTE_WINDOWS, "utf16le").toString("base64")], { windowsHide: true, stdio: ["pipe", "pipe", "ignore"] });
  let vivo = true, esperaCaptura = null, aoIniciar = null;
  filho.on("error", () => { vivo = false; aoIniciar?.(false); });
  filho.on("exit", () => { vivo = false; aoIniciar?.(false); esperaCaptura?.(null); });
  createInterface({ input: filho.stdout }).on("line", (l) => {
    if (aoIniciar) { if (l === "pronto") aoIniciar(true); else if (l.startsWith("falhou")) { log(cor.amarelo, `controle remoto: ${l}`); aoIniciar(false); } return; }
    if (esperaCaptura && (l.startsWith("cap ") || l.startsWith("erro cap"))) esperaCaptura(l.startsWith("cap ") ? l.slice(4) : null);
  });
  const ok = await new Promise((resolve) => {
    const t = setTimeout(() => resolve(false), 30_000);
    aoIniciar = (v) => { clearTimeout(t); aoIniciar = null; resolve(v); };
  });
  if (!ok) { try { filho.kill(); } catch { /* já saiu */ } return null; }
  const escrever = (l) => { if (vivo) filho.stdin.write(`${l}\n`); };
  return {
    capturar: () => new Promise((resolve) => {
      if (!vivo || esperaCaptura) return resolve(null);
      const t = setTimeout(() => { esperaCaptura = null; resolve(null); }, 5000);
      esperaCaptura = (b64) => { clearTimeout(t); esperaCaptura = null; resolve(b64 ? { imagem: b64, tipo: "image/jpeg" } : null); };
      escrever("cap 1280 50");
    }),
    aplicar: async (eventos) => { for (const l of linhasWindows(eventos)) escrever(l); },
    fechar: () => { escrever("sair"); setTimeout(() => { try { filho.kill(); } catch { /* já saiu */ } }, 1500); },
  };
}

async function controladorLinux() {
  if (!process.env.DISPLAY || !noPath("xdotool")) return null; // Wayland/sem X: o xdotool não controla
  const g = await rodarBruto("xdotool", ["getdisplaygeometry"], 4000);
  const [largura, altura] = String(g.saida).trim().split(/\s+/).map(Number);
  if (!g.ok || !(largura > 0 && altura > 0)) return null;
  return {
    aplicar: async (eventos) => { for (const a of lotesXdotool(eventos, largura, altura)) await rodarBruto("xdotool", a, a[0] === "type" ? 60_000 : 5000); },
    fechar: () => {},
  };
}

/** Controle do sistema + memória do que está apertado (ao terminar, nada fica preso). */
async function criarControlador() {
  const base = PLATAFORMA === "win32" ? await controladorWindows() : PLATAFORMA === "linux" ? await controladorLinux() : null;
  if (!base) return null;
  const teclas = new Set(), botoes = new Set();
  let ultimo = { x: 0.5, y: 0.5 };
  return {
    capturar: base.capturar,
    async aplicar(eventos) {
      const validos = (Array.isArray(eventos) ? eventos : []).filter(eventoValido);
      for (const e of validos) {
        if (e.t === "k") { if (e.d) teclas.add(e.c); else teclas.delete(e.c); }
        if (e.t === "b") { if (e.d) botoes.add(e.b); else botoes.delete(e.b); }
        if ("x" in e) ultimo = { x: e.x, y: e.y };
      }
      if (validos.length) await base.aplicar(validos);
    },
    async fechar() {
      const soltar = [...[...teclas].map((c) => ({ t: "k", c, d: false })), ...[...botoes].map((b) => ({ t: "b", b, d: false, ...ultimo }))];
      teclas.clear(); botoes.clear();
      if (soltar.length) await base.aplicar(soltar).catch(() => {});
      base.fechar();
    },
  };
}

/** O Líder pediu o controle: pergunta ao usuário e, se ele permitir, liga o controle. */
async function perguntarControle(t, por) {
  t.perguntando = true;
  const cfg = lerConfig();
  const quem = por ? por.split(" ")[0] : "O Líder do espaço";
  try {
    await notificar("Pedido de controle remoto", `${quem} quer controlar seu mouse e teclado para ajudar.`);
    caixa("Pedido de controle remoto", [`${quem} quer CONTROLAR seu mouse e teclado.`, "Responda na janela que abriu (ou aqui no terminal)."], cor.azul);
    const texto = `${quem} (Líder do espaço maker) quer CONTROLAR seu mouse e teclado para resolver o problema.\n\n` +
      "Você continua vendo tudo o que ele faz e pode parar a qualquer momento no botão Parar.\n\nPermitir?";
    let ok = await dialogoPermissao(null, texto, "LabMaker · controle remoto");
    if (ok === null) {
      // sem janela gráfica: pergunta no terminal (o ENTER de "parar" fica de fora enquanto isso)
      process.stdin.off("data", t.aoEnter);
      const r = await perguntar("Permitir que o Líder controle seu mouse e teclado? (s/n) ", 60);
      if (!t.parar) { process.stdin.once("data", t.aoEnter); if (process.stdin.isPaused()) process.stdin.resume(); }
      ok = r === "s" || r === "sim";
    }
    if (t.parar) return;
    let controlador = null;
    if (ok) {
      log(cor.cinza, "preparando o controle remoto…");
      controlador = await criarControlador().catch(() => null);
      if (!controlador) log(cor.amarelo, "Este sistema não deixa controlar o mouse e o teclado (no Linux precisa de X11 + xdotool; no macOS, indisponível).");
    }
    const resposta = !ok ? "recusado" : controlador ? "aceito" : "indisponivel";
    const r = await api(cfg.servidor, "/api/agente/tela", { acaoId: t.acaoId, controle: resposta }, cfg.token).catch(() => null);
    if (resposta === "aceito" && r?.controle === "ativo" && !t.parar) {
      t.controlador = controlador;
      t.aviso?.fechar();
      t.aviso = janelaCompartilhando(() => { t.parar = true; }, `● ${quem} está CONTROLANDO seu computador (mouse e teclado). Clique em Parar para encerrar na hora.`);
      caixa("● Controle remoto ativo", [`${quem} está controlando seu mouse e teclado.`, "Pressione ENTER aqui (ou Parar na janela) para encerrar."], cor.vermelho);
      await notificar("Controle remoto ativo", `${quem} está controlando seu computador. Clique em Parar para encerrar.`);
      void lacoControle(t);
    } else {
      await controlador?.fechar();
      log(cor.cinza, resposta === "recusado" ? "Controle remoto recusado." : "Controle remoto indisponível neste sistema.");
    }
  } finally {
    t.perguntando = false;
  }
}

/** Busca os eventos do Líder (espera longa) e aplica, até o controle acabar. */
async function lacoControle(t) {
  const cfg = lerConfig();
  let falhas = 0, aplicados = 0;
  while (t.controlador && !t.parar) {
    let r;
    try {
      r = await api(cfg.servidor, "/api/agente/tela/controle", { acaoId: t.acaoId }, cfg.token, 30_000);
      falhas = 0;
    } catch {
      if (++falhas >= 5) break;
      await new Promise((res) => setTimeout(res, 1000));
      continue;
    }
    if (t.parar || !t.controlador) break;
    if (r.eventos?.length) {
      await t.controlador.aplicar(r.eventos).catch((e) => log(cor.amarelo, `controle remoto: ${e.message}`));
      aplicados += r.eventos.length;
    }
    if (!r.continuar) break;
  }
  if (t.controlador && !t.parar) await pararControle(t, "O Líder devolveu o controle.");
  log(cor.cinza, `controle remoto: ${aplicados} eventos aplicados`);
}

async function pararControle(t, motivo) {
  const c = t.controlador;
  if (!c) return;
  t.controlador = null;
  await c.fechar().catch(() => {});
  if (motivo && !t.parar) {
    // a tela continua compartilhada: volta o aviso de "só vendo"
    t.aviso?.fechar();
    t.aviso = janelaCompartilhando(() => { t.parar = true; });
    log(cor.verde, `■ Controle remoto encerrado: ${motivo} A tela continua compartilhada.`);
    await notificar("Controle remoto encerrado", `${motivo} Ele continua vendo sua tela até encerrar.`);
  }
}

/**
 * Janela pequena e fixa enquanto a tela é compartilhada, com o botão "Parar de compartilhar".
 * Fecha sozinha quando a sessão acaba. Retorna { fechar }.
 */
function janelaCompartilhando(aoParar, texto = "● Sua tela está sendo vista pelo Líder do espaço. Só visualização: ninguém mexe no seu mouse ou teclado.") {
  texto = texto.replace(/['"`$]/g, " ");
  let filho = null;
  let fechadoPorNos = false;
  try {
    if (PLATAFORMA === "win32") {
      filho = spawn("powershell.exe", ["-NoProfile", "-Command", `
Add-Type -AssemblyName System.Windows.Forms, System.Drawing
Add-Type -ReferencedAssemblies System.Windows.Forms, System.Drawing -TypeDefinition @'
public class AvisoLabMaker : System.Windows.Forms.Form {
  /* Nunca rouba o foco do teclado (WS_EX_NOACTIVATE): quem está digitando - o aluno ou o Líder no
     controle remoto - continua na janela certa, e Enter/Espaço não apertam o Parar sem querer.
     O botão Parar funciona normalmente com o mouse. */
  protected override bool ShowWithoutActivation { get { return true; } }
  protected override System.Windows.Forms.CreateParams CreateParams {
    get { System.Windows.Forms.CreateParams cp = base.CreateParams; cp.ExStyle |= 0x08000000 | 0x00000008; return cp; }
  }
}
'@
$f = New-Object AvisoLabMaker
$f.Text = 'LabMaker · suporte remoto'; $f.TopMost = $true; $f.Width = 400; $f.Height = 140
$f.FormBorderStyle = 'FixedToolWindow'; $f.StartPosition = 'Manual'
$f.Location = New-Object System.Drawing.Point(([System.Windows.Forms.Screen]::PrimaryScreen.WorkingArea.Width - 420), 20)
$l = New-Object System.Windows.Forms.Label; $l.Text = '${texto}'; $l.Width = 370; $l.Height = 40; $l.Left = 12; $l.Top = 10; $l.ForeColor = 'DarkRed'
$b = New-Object System.Windows.Forms.Button; $b.Text = 'Parar de compartilhar'; $b.Width = 180; $b.Height = 30; $b.Left = 12; $b.Top = 56
$b.Add_Click({ [Console]::Out.Write('parar'); $f.Close() })
$f.Controls.Add($l); $f.Controls.Add($b); [System.Windows.Forms.Application]::Run($f)`], { windowsHide: true });
    } else if (PLATAFORMA === "darwin") {
      filho = spawn("osascript", ["-e", `display dialog "${texto}" with title "LabMaker · suporte remoto" buttons {"Parar de compartilhar"} default button 1 giving up after 600`]);
    } else if (process.env.DISPLAY || process.env.WAYLAND_DISPLAY) {
      // O zenity pega o foco ao abrir: com xdotool, devolve o foco para a janela em que a pessoa (ou
      // o Líder no controle remoto) estava — senão o próximo Enter apertaria "Parar" sem querer.
      void (async () => {
        const a = process.env.DISPLAY && noPath("xdotool") ? await rodarBruto("xdotool", ["getactivewindow"], 2000) : null;
        const anterior = a?.ok ? String(a.saida).trim() : "";
        if (fechadoPorNos) return;
        try {
          filho = spawn("zenity", ["--info", "--title=LabMaker · suporte remoto", `--text=${texto}`, "--ok-label=Parar de compartilhar", "--width=380", "--no-wrap"], { env: AMBIENTE });
          ligar(filho);
          if (/^\d+$/.test(anterior)) setTimeout(() => void rodarBruto("xdotool", ["windowactivate", anterior], 3000), 900);
        } catch { filho = null; }
      })();
    }
  } catch { filho = null; }
  if (filho) ligar(filho);
  function ligar(filho) {
    let saida = "", falhou = false;
    filho.stdout?.on("data", (d) => { saida += d; });
    filho.on("error", () => { falhou = true; }); // sem zenity: fica só o ENTER no terminal
    filho.on("exit", (codigo) => {
      if (fechadoPorNos || falhou || codigo === 127) return;
      // Windows: só "parar" conta; macOS: o botão; Linux: zenity sai com 0 ao clicar (fechar no X também para)
      if (PLATAFORMA !== "win32" || saida.includes("parar")) aoParar();
      else if (codigo === 0 && saida === "") aoParar();
    });
  }
  return { fechar: () => { fechadoPorNos = true; try { filho?.kill(); } catch { /* já fechou */ } } };
}

// ───────────────────────── atendimento: chat e "pedir ajuda" ─────────────────────────

let chamadoAtual = null;
let janelaChat = false;
const filaChat = [];

let janelaAbertaEm = 0;

/**
 * Mensagem do Líder chegou: mostra no terminal, notifica e, se a janelinha de chat estiver fechada,
 * abre de novo (sem travar o check-in). Sem navegador, cai na caixa de texto de antes.
 */
function receberMensagens(mensagens, janelaAberta = false) {
  const doLider = [];
  for (const m of mensagens) {
    const quem = m.autor === "SISTEMA" ? "LabMaker" : m.autorNome?.split(" ")[0] ?? "Líder";
    log(m.autor === "SISTEMA" ? cor.cinza : cor.azul, `💬 ${quem}: ${m.texto}`);
    void notificar(m.autor === "SISTEMA" ? "Pedido de ajuda" : `Mensagem de ${quem}`, m.texto);
    if (m.autor === "LIDER") doLider.push(`${quem}: ${m.texto}`);
  }
  // janela aberta: a mensagem já aparece lá. Acabou de abrir: espera ela dar sinal ao servidor.
  if (!doLider.length || janelaAberta || Date.now() - janelaAbertaEm < 45_000) return;
  janelaAbertaEm = Date.now();
  void (async () => {
    const cfg = lerConfig();
    try {
      const r = await api(cfg.servidor, "/api/agente/chamados/janela", {}, cfg.token);
      if (abrirJanelaApp(r.janela)) return;
    } catch { /* cai na caixa de texto */ }
    filaChat.push(...doLider);
    if (!janelaChat) void abrirJanelaChat();
  })();
}

/** O executável está no PATH? */
const noPath = (nome) => (process.env.PATH ?? "").split(path.delimiter).some((d) => d && fs.existsSync(path.join(d, nome)));

/**
 * Abre a janelinha de chat como app: Edge ou Chrome com --app (sem abas nem barra de endereço).
 * Sem nenhum dos dois, abre no navegador padrão. Devolve false se não conseguiu abrir nada.
 */
function abrirJanelaApp(url) {
  if (!/^https?:\/\//.test(url ?? "")) return false;
  const argsApp = [`--app=${url}`, "--window-size=430,660", "--new-window"];
  const candidatos =
    PLATAFORMA === "win32"
      ? [process.env["ProgramFiles(x86)"], process.env.ProgramFiles, process.env.LOCALAPPDATA].filter(Boolean)
          .flatMap((b) => [path.join(b, "Microsoft", "Edge", "Application", "msedge.exe"), path.join(b, "Google", "Chrome", "Application", "chrome.exe")])
      : PLATAFORMA === "darwin"
        ? ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge", "/Applications/Chromium.app/Contents/MacOS/Chromium"]
        : ["google-chrome", "google-chrome-stable", "chromium", "chromium-browser", "microsoft-edge"];
  for (const c of candidatos) {
    if (path.isAbsolute(c) ? !fs.existsSync(c) : !noPath(c)) continue;
    try {
      spawn(c, argsApp, { detached: true, stdio: "ignore", env: AMBIENTE }).on("error", () => {}).unref();
      return true;
    } catch { /* próximo */ }
  }
  try {
    const [cmd, argv] = PLATAFORMA === "win32" ? ["rundll32.exe", ["url.dll,FileProtocolHandler", url]] : [PLATAFORMA === "darwin" ? "open" : "xdg-open", [url]];
    if (PLATAFORMA === "linux" && !noPath(cmd)) return false;
    spawn(cmd, argv, { detached: true, stdio: "ignore", env: AMBIENTE }).on("error", () => {}).unref();
    return true;
  } catch {
    return false;
  }
}

async function abrirJanelaChat() {
  janelaChat = true;
  try {
    while (filaChat.length) {
      const texto = filaChat.splice(0).join("\n");
      const resposta = await caixaDeTexto("Mensagem do Líder do espaço", `${texto}\n\nResponder (opcional):`);
      if (resposta === null) {
        log(cor.cinza, `   (sem janela gráfica — responda com: node ${path.basename(process.argv[1])} --mensagem "sua resposta")`);
        break;
      }
      if (resposta.trim()) {
        const cfg = lerConfig();
        await api(cfg.servidor, "/api/agente/chamados/mensagem", { texto: resposta.trim(), nome: os.userInfo().username }, cfg.token).catch((e) => log(cor.vermelho, `✖ resposta não enviada: ${e.message}`));
        log(cor.verde, `↑ você: ${resposta.trim()}`);
      }
    }
  } finally { janelaChat = false; }
}

/** Janela com campo de texto. Devolve o texto (vazio se fechou sem escrever) ou null se não há interface gráfica. */
async function caixaDeTexto(titulo, texto) {
  const t = aspas(titulo), m = String(texto).replace(/["`$\\]/g, " ").slice(0, 900);
  if (PLATAFORMA === "win32") {
    const r = await rodarBruto("powershell.exe", ["-NoProfile", "-Command", `Add-Type -AssemblyName Microsoft.VisualBasic; [Microsoft.VisualBasic.Interaction]::InputBox("${m.replace(/\n/g, "`n")}", "LabMaker · ${t}", "")`], 10 * 60_000);
    return r.faltando ? null : String(r.saida).trim();
  }
  if (PLATAFORMA === "darwin") {
    const r = await rodarBruto("osascript", ["-e", `display dialog "${m.replace(/"/g, "'")}" with title "LabMaker · ${t}" default answer "" buttons {"Fechar", "Enviar"} default button "Enviar"`], 10 * 60_000);
    if (r.faltando) return null;
    return /button returned:Enviar/.test(String(r.saida)) ? (String(r.saida).match(/text returned:(.*)$/s)?.[1] ?? "").trim() : "";
  }
  if (!process.env.DISPLAY && !process.env.WAYLAND_DISPLAY) return null;
  const r = await rodarBruto("zenity", ["--entry", `--title=LabMaker · ${t}`, `--text=${m}`, "--ok-label=Enviar", "--cancel-label=Fechar", "--width=420"], 10 * 60_000);
  if (r.faltando) return null;
  return r.ok ? String(r.saida).trim() : "";
}

/**
 * --pedir-ajuda (o atalho da área de trabalho): abre o chamado NA HORA e a janelinha de chat.
 * A pessoa conta o problema no chat; a primeira mensagem vira a descrição na fila do Líder.
 */
async function pedirAjuda() {
  const cfg = lerConfig();
  if (!cfg?.token) throw new Error("Este computador ainda não foi inscrito no LabMaker.");
  void notificar("Pedir ajuda ao Líder", "Abrindo seu pedido de ajuda…");
  // 60 s: no plano grátis o servidor pode estar "acordando" (a primeira resposta demora)
  const r = await api(cfg.servidor, "/api/agente/chamados", { nome: os.userInfo().username }, cfg.token, 60_000);
  const msg = r.jaExistia ? `Seu pedido #${r.chamado.numero} continua na fila do Líder.` : `Pedido #${r.chamado.numero} aberto: o Líder já foi avisado.`;
  log(cor.verde, `✔ ${msg}`);
  if (abrirJanelaApp(r.janela)) {
    await notificar("Pedido de ajuda aberto", `${msg} Converse com ele na janela que abriu.`);
    return;
  }
  // sem navegador nenhum: o formulário de antes (caixa de texto)
  await pedirAjudaSemJanela(cfg, r.chamado.numero);
}

async function pedirAjudaSemJanela(cfg, numero) {
  let descricao = await caixaDeTexto("Pedir ajuda ao Líder", "O que está acontecendo? (ex.: o Inkscape não abre)");
  let autoriza;
  if (descricao === null) {
    descricao = await perguntar("O que está acontecendo? ", 300);
    const r = await perguntar("O Líder pode ver sua tela durante o atendimento? (s/n) ", 120);
    autoriza = r === "s" || r === "sim";
  } else if (descricao) {
    autoriza = (await dialogoSimNao("Pedir ajuda ao Líder", "Você autoriza o Líder a VER sua tela durante este atendimento?\n(Só visualização. Você pode parar quando quiser.)")) === true;
  }
  if (!descricao || descricao.trim().length < 3) { log(cor.amarelo, `Pedido #${numero} aberto sem descrição: o Líder vai perguntar o que houve.`); return; }
  await api(cfg.servidor, "/api/agente/chamados/mensagem", { texto: descricao.trim(), nome: os.userInfo().username }, cfg.token);
  if (autoriza) await api(cfg.servidor, "/api/agente/chamados/estado", { autorizaTela: true }, cfg.token).catch(() => {});
  await notificar("Pedido de ajuda enviado", `Pedido #${numero} enviado. O Líder vai responder por aqui.`);
}

async function dialogoSimNao(titulo, texto) {
  const m = String(texto).replace(/["`$\\]/g, " ");
  if (PLATAFORMA === "win32") {
    const r = await rodarBruto("powershell.exe", ["-NoProfile", "-Command", `Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.MessageBox]::Show("${m.replace(/\n/g, "`n")}", "LabMaker · ${aspas(titulo)}", "YesNo", "Question")`], 120_000);
    return r.faltando ? null : String(r.saida).trim() === "Yes";
  }
  if (PLATAFORMA === "darwin") {
    const r = await rodarBruto("osascript", ["-e", `display dialog "${m.replace(/"/g, "'")}" buttons {"Não", "Sim"} default button "Não"`], 120_000);
    return r.faltando ? null : /button returned:Sim/.test(String(r.saida));
  }
  const r = await rodarBruto("zenity", ["--question", `--title=LabMaker · ${aspas(titulo)}`, `--text=${m}`, "--ok-label=Sim", "--cancel-label=Não", "--width=420"], 120_000);
  return r.faltando ? null : r.ok;
}

// ───────────────────────── iniciar com o computador ─────────────────────────

function arquivosDoServico() {
  const home = os.homedir();
  const area = (() => {
    if (PLATAFORMA === "linux") {
      try { const d = fs.readFileSync(path.join(home, ".config", "user-dirs.dirs"), "utf8").match(/XDG_DESKTOP_DIR="(.+)"/)?.[1]; if (d) return d.replace("$HOME", home); } catch { /* padrão */ }
    }
    for (const n of ["Desktop", "Área de Trabalho", "Área de trabalho"]) if (fs.existsSync(path.join(home, n))) return path.join(home, n);
    return path.join(home, "Desktop");
  })();
  if (PLATAFORMA === "win32") {
    const inicio = path.join(process.env.APPDATA ?? path.join(home, "AppData", "Roaming"), "Microsoft", "Windows", "Start Menu", "Programs", "Startup");
    // atalho .lnk → wscript + .vbs: abre o "Pedir ajuda" sem nenhuma janela preta
    return {
      inicio: path.join(inicio, "LabMaker Agente.cmd"), atalho: path.join(area, "Pedir ajuda ao Líder.lnk"),
      vbs: path.join(path.dirname(path.resolve(process.argv[1])), "pedir-ajuda.vbs"), antigos: [path.join(area, "Pedir ajuda ao Líder.cmd")],
    };
  }
  if (PLATAFORMA === "darwin") return { inicio: path.join(home, "Library", "LaunchAgents", "dev.labmaker.agente.plist"), atalho: path.join(area, "Pedir ajuda ao Líder.command") };
  return { inicio: path.join(home, ".config", "autostart", "labmaker-agente.desktop"), atalho: path.join(area, "pedir-ajuda-labmaker.desktop") };
}

async function instalarServico() {
  const cfg = lerConfig();
  if (!cfg?.token) throw new Error("Inscreva o computador primeiro (--servidor … --inscricao …).");
  // guarda as opções para o início automático usar as mesmas
  // soma às opções já salvas (ligar de novo não é preciso; --remover-servico limpa tudo)
  const agora = ["permitir-bloqueio", "permitir-reinicio", "aplicar-politica"].filter((o) => args.includes(`--${o}`));
  salvarConfig({ ...cfg, opcoes: { ...cfg.opcoes, ...Object.fromEntries(agora.map((o) => [o, true])) } });
  const node = process.execPath, script = path.resolve(process.argv[1]);
  const { inicio, atalho } = arquivosDoServico();
  fs.mkdirSync(path.dirname(inicio), { recursive: true });
  fs.mkdirSync(path.dirname(atalho), { recursive: true });
  if (PLATAFORMA === "win32") {
    fs.writeFileSync(inicio, `@echo off\r\nstart "Agente LabMaker" /min "${node}" "${script}"\r\n`);
    const { vbs, antigos } = arquivosDoServico();
    fs.writeFileSync(vbs, `' LabMaker: abre o pedido de ajuda e a janelinha de chat, sem janela preta\r\nCreateObject("WScript.Shell").Run """${node}"" ""${script}"" --pedir-ajuda", 0, False\r\n`);
    const q = (t) => t.replace(/'/g, "''");
    await rodarBruto("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command",
      `$s = (New-Object -ComObject WScript.Shell).CreateShortcut('${q(atalho)}'); $s.TargetPath = "$env:SystemRoot\\System32\\wscript.exe"; ` +
      `$s.Arguments = '"${q(vbs)}"'; $s.IconLocation = "$env:SystemRoot\\System32\\shell32.dll,23"; $s.Description = 'Abre um pedido de ajuda no LabMaker'; $s.Save()`], 15_000);
    if (fs.existsSync(atalho)) for (const a of antigos) { try { fs.unlinkSync(a); } catch { /* não existia */ } }
    else fs.writeFileSync(antigos[0], `@echo off\r\nstart "" /min "${node}" "${script}" --pedir-ajuda\r\n`); // sem PowerShell/COM: o .cmd de antes
  } else if (PLATAFORMA === "darwin") {
    fs.writeFileSync(inicio, `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>dev.labmaker.agente</string>
  <key>ProgramArguments</key><array><string>${node}</string><string>${script}</string></array>
  <key>RunAtLoad</key><true/><key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>${path.join(os.homedir(), ".labmaker-agente.log")}</string>
  <key>StandardErrorPath</key><string>${path.join(os.homedir(), ".labmaker-agente.log")}</string>
</dict></plist>
`);
    fs.writeFileSync(atalho, `#!/bin/sh\n"${node}" "${script}" --pedir-ajuda\n`, { mode: 0o755 });
    await rodarBruto("launchctl", ["load", "-w", inicio]);
  } else {
    // Linux: abre num terminal (o aviso de ENTER e o log ficam visíveis); sem terminal, roda e grava log
    const terminal = ["x-terminal-emulator", "gnome-terminal", "xfce4-terminal", "konsole"].find((t) => fs.existsSync(`/usr/bin/${t}`));
    const cmd = terminal ? `${terminal} -e "${node}" "${script}"` : `sh -c '"${node}" "${script}" >> "$HOME/.labmaker-agente.log" 2>&1'`;
    fs.writeFileSync(inicio, `[Desktop Entry]\nType=Application\nName=Agente LabMaker\nComment=Conecta este computador ao LabMaker\nExec=${cmd}\nX-GNOME-Autostart-enabled=true\nTerminal=false\n`);
    fs.writeFileSync(atalho, `[Desktop Entry]\nType=Application\nName=Pedir ajuda ao Líder\nComment=Abre um pedido de ajuda no LabMaker\nExec="${node}" "${script}" --pedir-ajuda\nIcon=help-browser\nTerminal=false\n`, { mode: 0o755 });
    await rodarBruto("gio", ["set", atalho, "metadata::trusted", "true"]); // Mint/Ubuntu: deixa o atalho clicável
  }
  log(cor.verde, "✔ O agente vai iniciar sozinho quando este computador ligar.");
  log(cor.verde, `✔ Atalho criado na área de trabalho: ${path.basename(atalho)}`);
  if (flag("permitir-bloqueio")) log(cor.cinza, "  (com --permitir-bloqueio salvo)");
  if (flag("permitir-reinicio")) log(cor.cinza, "  (com --permitir-reinicio salvo)");
}

function removerServico() {
  const { inicio, atalho, vbs, antigos = [] } = arquivosDoServico();
  if (PLATAFORMA === "darwin") void rodarBruto("launchctl", ["unload", inicio]);
  for (const f of [inicio, atalho, vbs, ...antigos].filter(Boolean)) { try { fs.unlinkSync(f); } catch { /* já não existia */ } }
  const cfg = lerConfig();
  if (cfg?.opcoes) { delete cfg.opcoes; salvarConfig(cfg); }
  log(cor.verde, "✔ Início automático e atalho removidos.");
}

// ───────────────────────── política: downloads ─────────────────────────

let politica = null;
const eventosPendentes = [];

function vigiarDownloads() {
  if (!fs.existsSync(PASTA_DOWNLOADS)) return;
  const vistos = new Set(fs.readdirSync(PASTA_DOWNLOADS));
  fs.watch(PASTA_DOWNLOADS, (_tipo, nome) => {
    if (!nome || vistos.has(nome)) return;
    vistos.add(nome);
    const ext = path.extname(nome).toLowerCase();
    if (!EXECUTAVEIS.includes(ext) || !politica || politica.modoDownload === "LIVRE") return;
    let acao = "detectado";
    if (flag("aplicar-politica")) {
      try {
        fs.mkdirSync(QUARENTENA, { recursive: true });
        fs.renameSync(path.join(PASTA_DOWNLOADS, nome), path.join(QUARENTENA, nome));
        acao = "bloqueado e movido para a quarentena";
      } catch { /* arquivo ainda em uso pelo navegador */ }
    }
    log(cor.vermelho, `✖ Download ${acao}: ${nome}`);
    eventosPendentes.push({ tipo: "DOWNLOAD_BLOQUEADO", severidade: "AVISO", descricao: `Download ${acao}: ${nome} — política "${politica.nome}"` });
    void notificar("Download bloqueado", `${nome} não é permitido nos computadores do espaço.`);
  });
}

// ───────────────────────── comunicação com o servidor ─────────────────────────

async function api(servidor, caminho, corpo, token, esperaMs = 10_000) {
  const r = await fetch(`${servidor}${caminho}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(corpo),
    signal: AbortSignal.timeout(esperaMs),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
  return j;
}

async function inscrever(servidor, codigo) {
  const { so, versaoSo } = infoDoSistema();
  const fabricante = PLATAFORMA === "win32" ? await ps("(Get-CimInstance Win32_ComputerSystem).Manufacturer") : PLATAFORMA === "darwin" ? "Apple" : null;
  const modelo = PLATAFORMA === "win32" ? await ps("(Get-CimInstance Win32_ComputerSystem).Model") : PLATAFORMA === "darwin" ? await rodar("sysctl", ["-n", "hw.model"]) : null;
  const serie = PLATAFORMA === "win32" ? await ps("(Get-CimInstance Win32_BIOS).SerialNumber") : null;
  let gb = 0;
  try { const s = fs.statfsSync(PLATAFORMA === "win32" ? "C:\\" : "/"); gb = Math.round((s.blocks * s.bsize) / 1e9); } catch { /* ignora */ }
  const hostname = (opt("nome") ?? os.hostname().split(".")[0]).replace(/[^A-Za-z0-9._-]/g, "-").slice(0, 63);
  const r = await api(servidor, "/api/agente/inscrever", {
    codigo, hostname, so, versaoSo, tipo: (opt("tipo") ?? "NOTEBOOK").toUpperCase(),
    fabricante: fabricante || os.type(), modelo: modelo || os.arch(), numeroSerie: serie || `AG-${hostname}`,
    enderecoMac: lerMac(), agenteVersao: VERSAO, armazenamentoGb: gb,
  });
  salvarConfig({ servidor, token: r.token, dispositivoId: r.dispositivoId, hostname: r.hostname });
  log(cor.verde, `✔ Inscrito como ${cor.neg}${r.hostname}${cor.fim}${cor.verde}. Token salvo em ${ARQ_CONFIG}`);
}

let seguranca = {};
let app = null;
let bateria = { bateria: null, carregando: false };
let resultados = [];

async function coletarLento() {
  [bateria, app] = await Promise.all([lerBateria(), lerAppAtivo()]);
}

let bloqueadoAgora = false;

async function checkin(cfg) {
  const corpo = {
    agenteVersao: VERSAO,
    versaoSo: infoDoSistema().versaoSo,
    telemetria: {
      cpu: lerCpu(),
      memoria: Math.round(100 - (os.freemem() / os.totalmem()) * 100),
      disco: lerDisco(),
      bateria: bateria.bateria,
      carregando: bateria.carregando,
      rede: lerRede(),
      usuarioSessao: os.userInfo().username,
      appAtivo: app ? String(app).slice(0, 120) : null,
      uptimeH: Math.round(os.uptime() / 3600),
    },
    seguranca,
    eventos: eventosPendentes.splice(0),
    resultados: resultados.splice(0),
  };
  const r = await api(cfg.servidor, "/api/agente/checkin", corpo, cfg.token);
  politica = r.politica;
  const t = corpo.telemetria;
  log(cor.cinza, `↑ check-in · CPU ${t.cpu ?? "—"}% · memória ${t.memoria}% · ${t.appAtivo ?? "—"}${corpo.resultados.length ? ` · ${corpo.resultados.length} resultado(s)` : ""}`);
  if (r.chamado?.id !== chamadoAtual?.id || r.chamado?.status !== chamadoAtual?.status) {
    if (r.chamado) log(cor.azul, `🛟 pedido de ajuda #${r.chamado.numero}: ${r.chamado.status === "EM_ATENDIMENTO" ? `em atendimento${r.chamado.atendente ? ` por ${r.chamado.atendente}` : ""}` : "na fila do Líder"}`);
    else if (chamadoAtual) log(cor.verde, `🛟 pedido de ajuda #${chamadoAtual.numero} encerrado`);
    chamadoAtual = r.chamado ?? null;
  }
  if (r.mensagens?.length) receberMensagens(r.mensagens, !!r.janelaAjuda);
  const novas = r.acoes ?? [];
  // Bloqueio até o Líder liberar: se a pessoa destravar o Windows com a senha dela, o agente
  // trava de novo no próximo check-in (a cada 5 s enquanto estiver bloqueado).
  if (r.bloqueado && flag("permitir-bloqueio") && !novas.some((a) => a.tipo === "BLOQUEAR" || a.tipo === "DESBLOQUEAR")) {
    await travarSessao();
  }
  bloqueadoAgora = !!r.bloqueado;
  alarmeDevolucao(r.devolucao, cfg.hostname);
  for (const a of novas) {
    log(cor.azul, `↓ ação recebida: ${a.tipo}${a.titulo ? ` — ${a.titulo}` : a.parametro ? ` — ${a.parametro}` : ""}`);
    resultados.push(await executar(a));
  }
  return { intervalo: bloqueadoAgora && flag("permitir-bloqueio") ? 5000 : (r.intervaloSeg ?? 15) * 1000, temResultado: resultados.length > 0 };
}

async function main() {
  console.log(`\n${cor.neg}Agente LabMaker ${VERSAO}${cor.fim} ${cor.cinza}· ${os.hostname()} · ${os.type()} ${os.release()}${cor.fim}`);
  if (flag("testar-captura")) {
    const q = await capturarTela();
    if (!q) { log(cor.vermelho, "✖ Não consegui capturar a tela. No Linux, use uma sessão Xorg e instale: sudo apt install imagemagick"); process.exit(1); }
    const arq = path.resolve(`teste-captura.${q.tipo === "image/png" ? "png" : "jpg"}`);
    fs.writeFileSync(arq, Buffer.from(q.imagem, "base64"));
    log(cor.verde, `✔ Captura funcionando: ${arq} (${Math.round(q.imagem.length * 0.75 / 1024)} KB)`);
    process.exit(0);
  }
  if (args.includes("--pedir-ajuda")) {
    // pelo atalho o agente roda escondido: qualquer erro precisa virar aviso na tela
    try { await pedirAjuda(); } catch (e) {
      log(cor.vermelho, `✖ ${e.message}`);
      await notificar("Não deu para pedir ajuda", `${e.message}. Confira a internet ou chame o Líder do espaço pessoalmente.`);
      await dialogoSimNao("Pedir ajuda ao Líder", `Não consegui falar com o LabMaker agora (${e.message}).\nConfira a internet ou chame o Líder do espaço pessoalmente.\n\nTentar de novo?`).then(async (denovo) => {
        if (denovo) await pedirAjuda().catch(() => {});
      });
    }
    process.exit(0);
  }
  if (opt("mensagem")) {
    const c = lerConfig();
    await api(c.servidor, "/api/agente/chamados/mensagem", { texto: opt("mensagem"), nome: os.userInfo().username }, c.token);
    log(cor.verde, "✔ Mensagem enviada ao Líder.");
    process.exit(0);
  }
  if (args.includes("--remover-servico")) { removerServico(); process.exit(0); }
  const servidor = (opt("servidor") ?? lerConfig()?.servidor ?? "").replace(/\/$/, "");
  const codigo = opt("inscricao");
  if (codigo) {
    if (!servidor) throw new Error("Informe --servidor http://IP:3000");
    await inscrever(servidor, codigo);
  }
  if (args.includes("--instalar-servico")) { await instalarServico(); if (!codigo) process.exit(0); }
  const cfg = lerConfig();
  if (!cfg?.token) {
    console.log(`\nPrimeira vez? Em ${cor.neg}Notebooks → Adicionar aparelho → Computador${cor.fim} gere o código e use o comando de instalação,\nou rode: node agente.mjs --servidor https://SEU-SITE --inscricao <CÓDIGO>\n`);
    process.exit(1);
  }
  // Opções passadas agora ficam salvas: da próxima vez (ou no início automático) basta "node agente.mjs"
  const novas = ["permitir-bloqueio", "permitir-reinicio", "aplicar-politica"].filter((o) => args.includes(`--${o}`) && !cfg.opcoes?.[o]);
  if (novas.length) { cfg.opcoes = { ...cfg.opcoes, ...Object.fromEntries(novas.map((o) => [o, true])) }; salvarConfig(cfg); }
  log(cor.verde, `Conectando a ${cfg.servidor} como ${cfg.hostname}…`);
  const ligadas = ["permitir-bloqueio", "permitir-reinicio", "aplicar-politica"].filter((o) => cfg.opcoes?.[o]);
  if (ligadas.length) log(cor.cinza, `  opções ligadas: ${ligadas.map((o) => `--${o}`).join(" ")}`);
  [seguranca] = await Promise.all([lerSeguranca(), coletarLento()]);
  vigiarDownloads();
  setInterval(() => void coletarLento(), 15_000);
  setInterval(async () => { seguranca = await lerSeguranca(); }, 10 * 60_000);

  for (;;) {
    let espera = 15_000;
    let pendente = false;
    try {
      const r = await checkin(cfg);
      pendente = r.temResultado;
      espera = r.temResultado ? 1000 : r.intervalo; // resultado novo sobe na hora
    } catch (e) {
      log(cor.vermelho, `✖ servidor indisponível: ${e.message} — tentando de novo em 15 s`);
      if (/Token do agente/.test(e.message)) { log(cor.vermelho, "Token recusado: inscreva o computador de novo."); process.exit(1); }
    }
    if (flag("uma-vez") && !pendente) process.exit(0);
    await new Promise((res) => setTimeout(res, espera));
  }
}

main().catch((e) => { log(cor.vermelho, `✖ ${e.message}`); process.exit(1); });
