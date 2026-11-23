/**
 * Instalação do agente em UM comando — regra pura, testada.
 *
 * O código de inscrição de verdade é um JWT (200+ caracteres). Para ninguém precisar digitar isso,
 * o servidor guarda o JWT atrás de um código curto de 6 letras (sem 0/O, 1/I/L, que confundem) e
 * a rota /i/CÓDIGO devolve um script que baixa o agente, inscreve o computador com as opções
 * escolhidas e liga o início automático:
 *
 *   Windows (Win+R, cmd ou PowerShell): powershell -c "irm https://SERVIDOR/i/K7P2QX|iex"
 *   Linux / macOS:                      curl -fsSL https://SERVIDOR/i/K7P2QX | sh
 *
 * O mesmo código serve para vários computadores enquanto vale (2 h).
 */

export const ALFABETO_CONVITE = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const TAMANHO_CONVITE = 6;
export const VALIDADE_CONVITE_MIN = 120;

export type OpcoesInstalacao = {
  /** "Bloquear tela" trava o computador de verdade (e trava de novo até o Líder liberar) */
  bloqueio: boolean;
  /** "Reiniciar" reinicia de verdade, com 1 minuto de aviso */
  reinicio: boolean;
  /** o agente inicia sozinho quando o computador liga (+ atalho "Pedir ajuda ao Líder") */
  iniciarComPc: boolean;
  /** executáveis baixados vão para a quarentena */
  politica: boolean;
};

export const OPCOES_PADRAO: OpcoesInstalacao = { bloqueio: true, reinicio: true, iniciarComPc: true, politica: false };

/** Código curto aleatório. `aleatorio(n)` devolve um inteiro em [0, n) — crypto.randomInt no servidor. */
export function gerarCodigoCurto(aleatorio: (n: number) => number): string {
  let c = "";
  for (let i = 0; i < TAMANHO_CONVITE; i++) c += ALFABETO_CONVITE[aleatorio(ALFABETO_CONVITE.length)];
  return c;
}

/** Aceita "k7p-2qx", " K7P2QX " etc. Devolve o código normalizado ou null se não for um código curto. */
export function normalizarCodigo(entrada: string): string | null {
  const c = entrada.trim().toUpperCase().replace(/[\s-]/g, "");
  if (c.length !== TAMANHO_CONVITE) return null;
  for (const ch of c) if (!ALFABETO_CONVITE.includes(ch)) return null;
  return c;
}

/** Opções da tela → argumentos do agente (agente/agente.mjs). */
export function argumentosAgente(o: OpcoesInstalacao): string[] {
  return [
    ...(o.bloqueio ? ["--permitir-bloqueio"] : []),
    ...(o.reinicio ? ["--permitir-reinicio"] : []),
    ...(o.politica ? ["--aplicar-politica"] : []),
    ...(o.iniciarComPc ? ["--instalar-servico"] : []),
  ];
}

/** Endereço aceito no script: http(s)://host[:porta][/caminho], sem aspas, espaços ou caracteres de shell. */
export function servidorSeguro(servidor: string): string | null {
  const s = servidor.trim().replace(/\/+$/, "");
  return /^https?:\/\/[A-Za-z0-9.\-[\]:]+(\/[A-Za-z0-9._~\-/]*)?$/.test(s) ? s : null;
}

/** Os dois comandos curtos que a tela mostra. */
export function comandosInstalacao(servidor: string, codigo: string) {
  const url = `${servidor}/i/${codigo}`;
  return {
    url,
    windows: `powershell -c "irm ${url}|iex"`,
    unix: `curl -fsSL ${url} | sh`,
    manual: `node agente.mjs --servidor ${servidor} --inscricao ${codigo}`,
  };
}

/** Qual script o pedido quer: PowerShell (irm), sh (curl/wget) ou nenhum (navegador). */
export function scriptPara(userAgent: string | null): "powershell" | "sh" | null {
  const ua = userAgent ?? "";
  if (/PowerShell/i.test(ua)) return "powershell";
  if (/^(curl|Wget)\//i.test(ua)) return "sh";
  return null;
}

/**
 * Script do Windows (Windows PowerShell 5.1 e PowerShell 7). Tudo dentro de `& { }` para não deixar
 * variáveis nem $ErrorActionPreference na janela de quem rodou. Se algo falha, a janela espera um
 * Enter antes de fechar — pelo Win+R ela sumiria sem mostrar o erro.
 */
export function scriptWindows(servidor: string, codigo: string, o: OpcoesInstalacao): string {
  const argsAgente = argumentosAgente(o).map((a) => `'${a}'`).join(", ");
  return `# LabMaker — instala o agente neste computador (código ${codigo})
& {
  $ErrorActionPreference = 'Stop'
  [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
  $servidor = '${servidor}'
  $codigo = '${codigo}'
  $extras = @(${argsAgente})
  function Pausar { Read-Host 'Pressione Enter para fechar' | Out-Null }
  Write-Host ''
  Write-Host 'LabMaker - instalando o agente neste computador' -ForegroundColor Cyan
  try {
    $node = (Get-Command node -ErrorAction SilentlyContinue).Source
    $padrao = Join-Path $env:ProgramFiles 'nodejs\\node.exe'
    if (-not $node -and (Test-Path $padrao)) { $node = $padrao }
    if (-not $node -and (Get-Command winget -ErrorAction SilentlyContinue)) {
      Write-Host '> Node.js nao encontrado: instalando (aceite o aviso do Windows)...'
      winget install -e --id OpenJS.NodeJS.LTS --silent --accept-source-agreements --accept-package-agreements | Out-Host
      if (Test-Path $padrao) { $node = $padrao }
    }
    if (-not $node) {
      Write-Host 'X Instale o Node.js (versao LTS) em https://nodejs.org e rode este comando de novo.' -ForegroundColor Red
      Pausar
      return
    }
    $pasta = Join-Path $env:LOCALAPPDATA 'LabMaker'
    New-Item -ItemType Directory -Force -Path $pasta | Out-Null
    $agente = Join-Path $pasta 'agente.mjs'
    Write-Host '> Baixando o agente...'
    Invoke-WebRequest -UseBasicParsing -Uri "$servidor/api/agente/script" -OutFile $agente
    & $node $agente --servidor $servidor --inscricao $codigo @extras
    if ($LASTEXITCODE -ne 0) { Pausar }
  } catch {
    Write-Host ('X ' + $_.Exception.Message) -ForegroundColor Red
    Pausar
  }
}
`;
}

/** Script do Linux / macOS (sh). O agente lê o teclado do terminal mesmo vindo de "curl | sh". */
export function scriptUnix(servidor: string, codigo: string, o: OpcoesInstalacao): string {
  return `#!/bin/sh
# LabMaker — instala o agente neste computador (código ${codigo})
set -e
SERVIDOR='${servidor}'
CODIGO='${codigo}'
echo ""
echo "LabMaker - instalando o agente neste computador"
if ! command -v node >/dev/null 2>&1; then
  echo "X Instale o Node.js 18+ (https://nodejs.org ou: sudo apt install nodejs) e rode de novo." >&2
  exit 1
fi
PASTA="$HOME/.labmaker"
mkdir -p "$PASTA"
echo "> Baixando o agente..."
curl -fsSL "$SERVIDOR/api/agente/script" -o "$PASTA/agente.mjs"
set -- "$PASTA/agente.mjs" --servidor "$SERVIDOR" --inscricao "$CODIGO"${argumentosAgente(o).map((a) => ` ${a}`).join("")}
if (exec </dev/tty) 2>/dev/null; then exec node "$@" </dev/tty; else exec node "$@"; fi
`;
}

/** O console antigo do Windows pode trocar acentos por símbolos: as mensagens do PowerShell vão sem acento. */
const semAcento = (t: string) => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

/** Resposta para código inexistente ou vencido, no idioma de quem pediu. */
export function scriptErro(tipo: "powershell" | "sh", motivo: string): string {
  return tipo === "powershell"
    ? `& { Write-Host ''; Write-Host 'X ${semAcento(motivo).replace(/'/g, "''")}' -ForegroundColor Red; Read-Host 'Pressione Enter para fechar' | Out-Null }\n`
    : `#!/bin/sh\necho "X ${motivo.replace(/["$`\\]/g, "")}" >&2\nexit 1\n`;
}
