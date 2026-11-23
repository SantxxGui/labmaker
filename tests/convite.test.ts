import { describe, expect, it } from "vitest";
import {
  ALFABETO_CONVITE, OPCOES_PADRAO, argumentosAgente, conviteVencido, comandosInstalacao, gerarCodigoCurto, normalizarCodigo,
  scriptErro, scriptPara, scriptUnix, scriptWindows, servidorSeguro,
} from "@/lib/convite";

describe("código curto de instalação", () => {
  it("tem 6 letras do alfabeto sem caracteres que confundem (0/O, 1/I/L)", () => {
    let i = 0;
    const c = gerarCodigoCurto((n) => (i++ * 7) % n);
    expect(c).toHaveLength(6);
    expect([...c].every((ch) => ALFABETO_CONVITE.includes(ch))).toBe(true);
    expect(ALFABETO_CONVITE).not.toMatch(/[0O1IL]/);
  });
  it("aceita minúsculas, espaços e traço, e recusa o que não é código curto", () => {
    expect(normalizarCodigo(" k7p-2qx ")).toBe("K7P2QX");
    expect(normalizarCodigo("K7P2Q")).toBeNull();
    expect(normalizarCodigo("K7P2Q0")).toBeNull(); // 0 não existe no alfabeto
    expect(normalizarCodigo("eyJhbGciOiJIUzI1NiJ9.eyJmaW0iOiJ4In0.abc")).toBeNull(); // JWT antigo segue pelo caminho antigo
  });
});

describe("comando de instalação", () => {
  it("cabe numa linha curta, para Win+R e para o terminal", () => {
    const c = comandosInstalacao("https://labmaker-6fwp.onrender.com", "K7P2QX");
    expect(c.windows).toBe('powershell -c "irm https://labmaker-6fwp.onrender.com/i/K7P2QX|iex"');
    expect(c.unix).toBe("curl -fsSL https://labmaker-6fwp.onrender.com/i/K7P2QX | sh");
    expect(c.windows.length).toBeLessThan(80);
  });
  it("só aceita endereço de servidor sem caracteres que quebrariam o script", () => {
    expect(servidorSeguro("https://labmaker-6fwp.onrender.com/")).toBe("https://labmaker-6fwp.onrender.com");
    expect(servidorSeguro("http://192.168.0.10:3000")).toBe("http://192.168.0.10:3000");
    expect(servidorSeguro("https://x.com'; rm -rf ~")).toBeNull();
    expect(servidorSeguro("ftp://x.com")).toBeNull();
  });
  it("as opções marcadas viram os argumentos do agente", () => {
    expect(argumentosAgente(OPCOES_PADRAO)).toEqual(["--permitir-bloqueio", "--permitir-reinicio", "--instalar-servico"]);
    expect(argumentosAgente({ bloqueio: false, reinicio: false, iniciarComPc: false, politica: true })).toEqual(["--aplicar-politica"]);
  });
  it("escolhe o script pelo programa que pediu", () => {
    expect(scriptPara("Mozilla/5.0 (Windows NT; Windows NT 10.0; pt-BR) WindowsPowerShell/5.1.26100.1")).toBe("powershell");
    expect(scriptPara("Mozilla/5.0 (Linux) PowerShell/7.4.6")).toBe("powershell");
    expect(scriptPara("curl/8.5.0")).toBe("sh");
    expect(scriptPara("Mozilla/5.0 (Windows NT 10.0) Chrome/131.0")).toBeNull();
  });
  it("os scripts levam servidor, código e opções; o do Windows não vaza variáveis", () => {
    const w = scriptWindows("https://s.dev", "K7P2QX", OPCOES_PADRAO);
    expect(w.trimStart()).toMatch(/^# LabMaker[^\n]*\n& \{/);
    expect(w).toContain("$servidor = 'https://s.dev'");
    expect(w).toContain("$extras = @('--permitir-bloqueio', '--permitir-reinicio', '--instalar-servico')");
    const u = scriptUnix("https://s.dev", "K7P2QX", { ...OPCOES_PADRAO, iniciarComPc: false });
    expect(u).toContain("--inscricao \"$CODIGO\" --permitir-bloqueio --permitir-reinicio\n");
    expect(scriptErro("powershell", "Código inválido")).toContain("Codigo invalido");
  });
});

describe("validade do código", () => {
  const criado = new Date("2026-11-23T11:00:00Z"); // 08:00 em São Paulo
  it("vale até o horário escolhido (12 h → até 20:00) e vence no minuto exato", () => {
    const c = { expiraEm: "2026-11-23T23:00:00Z" };
    expect(conviteVencido(c, criado, new Date("2026-11-23T22:59:59Z"))).toBe(false);
    expect(conviteVencido(c, criado, new Date("2026-11-23T23:00:00Z"))).toBe(true);
  });
  it("convite gerado antes desta mudança (sem expiraEm) continua valendo 2 h", () => {
    expect(conviteVencido({}, criado, new Date("2026-11-23T12:59:00Z"))).toBe(false);
    expect(conviteVencido({}, criado, new Date("2026-11-23T13:00:00Z"))).toBe(true);
  });
});
