/** Cliente HTTP mínimo para os testes de ponta a ponta (guarda o cookie de sessão). */
export const BASE = (process.env.BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
export const SENHA = process.env.SENHA_TESTE ?? "labmaker123";

export class Cliente {
  cookie = "";
  constructor(public nome: string) {}
  async req(metodo: string, caminho: string, corpo?: unknown, headers: Record<string, string> = {}) {
    const r = await fetch(BASE + caminho, {
      method: metodo,
      headers: { ...(corpo !== undefined ? { "Content-Type": "application/json" } : {}), ...(this.cookie ? { Cookie: this.cookie } : {}), ...headers },
      body: corpo !== undefined ? JSON.stringify(corpo) : undefined,
      redirect: "manual",
    });
    const set = r.headers.get("set-cookie");
    if (set) this.cookie = set.split(";")[0];
    const tipo = r.headers.get("content-type") ?? "";
    const json = tipo.includes("json") ? await r.json().catch(() => null) : null;
    return { status: r.status, json: json as Record<string, any> | null, headers: r.headers };
  }
  get = (c: string) => this.req("GET", c);
  post = (c: string, b?: unknown) => this.req("POST", c, b ?? {});
  patch = (c: string, b: unknown) => this.req("PATCH", c, b);
  async login(email: string, senha = SENHA) {
    const r = await this.post("/api/auth/login", { email, senha });
    if (r.status !== 200) throw new Error(`${this.nome}: login falhou (${r.status}) ${r.json?.error ?? ""}`);
    return this;
  }
}

let falhas = 0;
let total = 0;
export function confere(nome: string, ok: boolean, detalhe = "") {
  total++;
  if (!ok) falhas++;
  console.log(`${ok ? "\x1b[32m✔" : "\x1b[31m✖"}\x1b[0m ${nome}${detalhe ? `\x1b[90m — ${detalhe}\x1b[0m` : ""}`);
}
export function resumo() {
  console.log(`\n${falhas ? "\x1b[31m" : "\x1b[32m"}${total - falhas}/${total} verificações passaram\x1b[0m`);
  if (falhas) process.exit(1);
}
export const unico = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

/** Próximo dia útil (seg–sáb) no fuso do laboratório, como AAAA-MM-DD. */
export function proximoDiaUtil(dias = 1) {
  const d = new Date(Date.now() - 3 * 3_600_000 + dias * 86_400_000);
  if (d.getUTCDay() === 0) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/** Garante uma área e uma máquina reservável, criadas pelo Líder (funciona no banco zerado). */
export async function prepararMaquina(lider: Cliente) {
  const labs = (await lider.get("/api/laboratorios")).json?.laboratorios ?? [];
  let lab = labs[0];
  if (!lab) {
    const unidades = (await lider.get("/api/laboratorios")).json?.unidades ?? [];
    const r = await lider.post("/api/laboratorios", { nome: "Área de testes", codigo: `T-${unico().slice(0, 6).toUpperCase()}`, unidadeId: unidades[0]?.id ?? "uni_emk" });
    lab = r.json?.laboratorio;
  }
  const r = await lider.post("/api/equipamentos", { nome: `Máquina de teste ${unico()}`, tipo: "OUTRO", laboratorioId: lab.id, duracaoSlotMinutos: 60 });
  if (r.status !== 201) throw new Error(`Não consegui criar a máquina de teste: ${r.status} ${r.json?.error}`);
  return r.json!.equipamento as { id: string; nome: string };
}
