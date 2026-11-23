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
 *   --pedir-ajuda         abre o formulário "Pedir ajuda ao Líder" (cria um chamado) e sai
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

const VERSAO = "4.8.0";
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
async function dialogoPermissao(motivo) {
  const texto = `O Líder do espaço maker quer VER sua tela (sem controlar mouse ou teclado).\n\nMotivo: ${aspas(motivo)}\n\nA sessão dura no máximo 10 minutos e você pode encerrar quando quiser.`;
  if (PLATAFORMA === "win32") {
    const r = await rodarBruto("powershell.exe", ["-NoProfile", "-Command",
      `Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.MessageBox]::Show("${texto.replace(/\n/g, "`n")}", "LabMaker · suporte remoto", "YesNo", "Question", "Button2", "DefaultDesktopOnly")`], 60_000);
    if (r.faltando) return null;
    return String(r.saida).trim() === "Yes";
  }
  if (PLATAFORMA === "darwin") {
    const r = await rodarBruto("osascript", ["-e", `display dialog "${texto.replace(/"/g, "'")}" with title "LabMaker · suporte remoto" buttons {"Recusar", "Permitir"} default button "Recusar" giving up after 60`], 65_000);
    if (r.faltando) return null;
    return /button returned:Permitir/.test(String(r.saida)) && !/gave up:true/.test(String(r.saida));
  }
  const r = await rodarBruto("zenity", ["--question", "--title=LabMaker · suporte remoto", `--text=${texto}`, "--ok-label=Permitir", "--cancel-label=Recusar", "--timeout=60", "--width=420"], 65_000);
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

let transmitindo = null; // { acaoId, parar }

/** Envia ~1 quadro por segundo enquanto o servidor responder { continuar: true }. */
async function transmitirTela(acaoId) {
  const cfg = lerConfig();
  if (!cfg?.token || transmitindo) return;
  transmitindo = { acaoId, parar: false };
  await notificar("Sua tela está sendo compartilhada", "O Líder do espaço está vendo sua tela. Ele não controla mouse nem teclado.");
  caixa("● Compartilhando sua tela com o Líder do espaço", ["Só visualização: ninguém mexe no seu mouse ou teclado.", "Pressione ENTER aqui para encerrar a qualquer momento."], cor.vermelho);
  const aoEnter = () => { if (transmitindo) transmitindo.parar = true; };
  process.stdin.once("data", aoEnter);
  if (process.stdin.isPaused()) process.stdin.resume();
  // Janela fixa "sua tela está sendo vista" com o botão Parar — o usuário sempre sabe e sempre pode parar
  const aviso = janelaCompartilhando(() => { if (transmitindo) transmitindo.parar = true; });

  let quadros = 0, iguais = 0, falhas = 0, motivoFim = "", anterior = "";
  while (!transmitindo.parar) {
    const t0 = Date.now();
    const q = await capturarTela();
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
    } catch (e) {
      if (++falhas >= 10) { motivoFim = `Servidor indisponível: ${e.message}`; break; }
    }
    await new Promise((res) => setTimeout(res, Math.max(150, 1000 - (Date.now() - t0))));
  }
  if (transmitindo.parar) {
    motivoFim = "Você encerrou o compartilhamento.";
    await api(cfg.servidor, "/api/agente/tela", { acaoId, fim: true }, cfg.token).catch(() => {});
  }
  process.stdin.off("data", aoEnter);
  process.stdin.pause();
  aviso.fechar();
  transmitindo = null;
  log(cor.verde, `■ Compartilhamento de tela encerrado (${quadros} quadros enviados, ${iguais} sem mudança). ${motivoFim}`);
  await notificar("Compartilhamento encerrado", motivoFim);
}

/**
 * Janela pequena e fixa enquanto a tela é compartilhada, com o botão "Parar de compartilhar".
 * Fecha sozinha quando a sessão acaba. Retorna { fechar }.
 */
function janelaCompartilhando(aoParar) {
  const texto = "● Sua tela está sendo vista pelo Líder do espaço. Só visualização: ninguém mexe no seu mouse ou teclado.";
  let filho = null;
  let fechadoPorNos = false;
  try {
    if (PLATAFORMA === "win32") {
      filho = spawn("powershell.exe", ["-NoProfile", "-Command", `
Add-Type -AssemblyName System.Windows.Forms, System.Drawing
$f = New-Object System.Windows.Forms.Form
$f.Text = 'LabMaker · suporte remoto'; $f.TopMost = $true; $f.Width = 400; $f.Height = 140
$f.FormBorderStyle = 'FixedToolWindow'; $f.StartPosition = 'Manual'
$f.Location = New-Object System.Drawing.Point(([System.Windows.Forms.Screen]::PrimaryScreen.WorkingArea.Width - 420), 20)
$l = New-Object System.Windows.Forms.Label; $l.Text = '${texto}'; $l.Width = 370; $l.Height = 40; $l.Left = 12; $l.Top = 10; $l.ForeColor = 'DarkRed'
$b = New-Object System.Windows.Forms.Button; $b.Text = 'Parar de compartilhar'; $b.Width = 180; $b.Height = 30; $b.Left = 12; $b.Top = 56
$b.Add_Click({ [Console]::Out.Write('parar'); $f.Close() })
$f.Controls.Add($l); $f.Controls.Add($b); [void]$f.ShowDialog()`], { windowsHide: true });
    } else if (PLATAFORMA === "darwin") {
      filho = spawn("osascript", ["-e", `display dialog "${texto}" with title "LabMaker · suporte remoto" buttons {"Parar de compartilhar"} default button 1 giving up after 600`]);
    } else if (process.env.DISPLAY || process.env.WAYLAND_DISPLAY) {
      filho = spawn("zenity", ["--info", "--title=LabMaker · suporte remoto", `--text=${texto}`, "--ok-label=Parar de compartilhar", "--width=380", "--no-wrap"], { env: AMBIENTE });
    }
  } catch { filho = null; }
  if (filho) {
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

/** Mensagem do Líder chegou: mostra no terminal, notifica e abre uma janela para responder (sem travar o check-in). */
function receberMensagens(mensagens) {
  for (const m of mensagens) {
    const quem = m.autor === "SISTEMA" ? "LabMaker" : m.autorNome?.split(" ")[0] ?? "Líder";
    log(m.autor === "SISTEMA" ? cor.cinza : cor.azul, `💬 ${quem}: ${m.texto}`);
    void notificar(m.autor === "SISTEMA" ? "Pedido de ajuda" : `Mensagem de ${quem}`, m.texto);
    if (m.autor === "LIDER") filaChat.push(`${quem}: ${m.texto}`);
  }
  if (filaChat.length && !janelaChat) void abrirJanelaChat();
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

/** --pedir-ajuda: formulário → chamado na fila do Líder. */
async function pedirAjuda() {
  const cfg = lerConfig();
  if (!cfg?.token) throw new Error("Este computador ainda não foi inscrito no LabMaker.");
  let descricao = await caixaDeTexto("Pedir ajuda ao Líder", "O que está acontecendo? (ex.: o Inkscape não abre)");
  let autoriza;
  if (descricao === null) {
    descricao = await perguntar("O que está acontecendo? ", 300);
    const r = await perguntar("O Líder pode ver sua tela durante o atendimento? (s/n) ", 120);
    autoriza = r === "s" || r === "sim";
  } else if (descricao) {
    autoriza = (await dialogoSimNao("Pedir ajuda ao Líder", "Você autoriza o Líder a VER sua tela durante este atendimento?\n(Só visualização. Você pode parar quando quiser.)")) === true;
  }
  if (!descricao || descricao.trim().length < 3) { log(cor.amarelo, "Pedido cancelado."); return; }
  const r = await api(cfg.servidor, "/api/agente/chamados", { descricao: descricao.trim(), nome: os.userInfo().username, autorizaTela: !!autoriza }, cfg.token);
  const msg = r.jaExistia ? `Seu pedido #${r.chamado.numero} já estava na fila — mensagem adicionada.` : `Pedido #${r.chamado.numero} enviado. O Líder vai responder por aqui.`;
  log(cor.verde, `✔ ${msg}`);
  await notificar("Pedido de ajuda enviado", msg);
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
    return { inicio: path.join(inicio, "LabMaker Agente.cmd"), atalho: path.join(area, "Pedir ajuda ao Líder.cmd") };
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
    fs.writeFileSync(atalho, `@echo off\r\n"${node}" "${script}" --pedir-ajuda\r\n`);
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
  const { inicio, atalho } = arquivosDoServico();
  if (PLATAFORMA === "darwin") void rodarBruto("launchctl", ["unload", inicio]);
  for (const f of [inicio, atalho]) { try { fs.unlinkSync(f); } catch { /* já não existia */ } }
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

async function api(servidor, caminho, corpo, token) {
  const r = await fetch(`${servidor}${caminho}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(corpo),
    signal: AbortSignal.timeout(10_000),
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
  if (r.mensagens?.length) receberMensagens(r.mensagens);
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
  if (args.includes("--pedir-ajuda")) { await pedirAjuda(); process.exit(0); }
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
