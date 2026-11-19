import Link from "next/link";
import {
  AlertTriangle, ArrowRight, Ban, Building2, CalendarClock, Cctv, Check, Database, Download, Gauge, Laptop, Lock, Megaphone, MonitorSmartphone,
  Network, Radio, ScrollText, Server, ShieldCheck, Usb, Workflow,
} from "lucide-react";
import { IndustrialBackdrop } from "@/components/industrial/industrial-backdrop";
import { Logo } from "@/components/logo";
import { Holofote, Letreiro, NumeroAnimado, PalavraRotativa, Revelar } from "@/components/motion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DemoAlerta, DemoDownload } from "@/views/landing/demo-ti";
import { Vitrine } from "@/views/landing/vitrine";
import { ROTAS } from "@/lib/openapi";

/** Landing page — Server Component; as partes animadas/interativas rodam no cliente. */
/** contagem = números reais do banco (página inicial do servidor); sem ela (demonstração), texto neutro. */
export function Landing({ contagem }: { contagem?: { maquinas: number; aparelhos: number } | null } = {}) {
  return (
    <div className="min-h-dvh overflow-x-clip">
      <Navbar />
      <main>
        <Hero contagem={contagem} />
        <Ticker />
        <Numeros />
        <Modulos />
        <SecaoTI />
        <Conectividade />
        <Conformidade />
        <Arquitetura />
        <Cta />
      </main>
      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-6 py-8 text-[13px] text-subtle sm:flex-row">
          <Logo />
          <p>© {new Date().getFullYear()} LabMaker · Gestão do espaço maker</p>
        </div>
      </footer>
    </div>
  );
}

function Navbar() {
  return (
    <header className="glass fixed inset-x-0 top-0 z-40 border-b border-line">
      <nav className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
        <Link href="/" aria-label="LabMaker — início"><Logo /></Link>
        <ul className="hidden items-center gap-1 md:flex">
          {[["#produto", "Produto"], ["#ti", "Notebooks"], ["#conectividade", "Máquinas"], ["#conformidade", "Regras"], ["#arquitetura", "Arquitetura"]].map(([href, label]) => (
            <li key={href}><a href={href} className="rounded-md px-3 py-2 text-sm text-subtle transition-colors hover:text-fg">{label}</a></li>
          ))}
        </ul>
        <Button asChild size="sm"><Link href="/login">Entrar</Link></Button>
      </nav>
    </header>
  );
}

function Hero({ contagem }: { contagem?: { maquinas: number; aparelhos: number } | null }) {
  return (
    <section id="produto" className="relative scroll-mt-14 overflow-hidden border-b border-line">
      <div aria-hidden className="absolute inset-0">
        <div className="absolute inset-0 bg-grid [mask-image:radial-gradient(ellipse_70%_60%_at_50%_40%,#000_30%,transparent_100%)]" />
        <IndustrialBackdrop intensidade={0.9} className="[mask-image:linear-gradient(to_bottom,transparent_0%,#000_35%,#000_75%,transparent_100%)]" />
        <div className="absolute inset-x-0 top-0 h-[75%] bg-[radial-gradient(ellipse_60%_70%_at_50%_35%,rgba(5,5,6,0.97)_40%,transparent)]" />
        <div className="flutuar absolute left-1/2 top-24 size-[560px] -translate-x-1/2 rounded-full bg-signal/[0.08] blur-[130px]" />
      </div>

      <div className="relative mx-auto max-w-6xl px-6 pb-20 pt-32 text-center sm:pt-40">
        <p className="rise glass mx-auto inline-flex items-center gap-2 rounded-full border border-line px-3.5 py-1.5 font-mono text-[11.5px] text-muted">
          <span className="ao-vivo size-1.5 rounded-full bg-ok text-ok" />
          {contagem && contagem.maquinas + contagem.aparelhos > 0
            ? `${contagem.maquinas} ${contagem.maquinas === 1 ? "máquina" : "máquinas"} · ${contagem.aparelhos} ${contagem.aparelhos === 1 ? "aparelho" : "aparelhos"} · espaço maker ao vivo`
            : "reservas · máquinas · notebooks · espaço maker ao vivo"}
        </p>
        <h1 className="rise rise-1 mx-auto mt-8 max-w-5xl text-balance text-[42px] font-semibold leading-[1.03] tracking-[-0.045em] sm:text-[64px] lg:text-[80px]">
          Seu espaço maker,
          <PalavraRotativa className="!grid justify-items-center text-signal" palavras={["ao vivo.", "sem filas.", "sob controle.", "em uma tela."]} />
        </h1>
        <p className="rise rise-2 mx-auto mt-7 max-w-2xl text-pretty text-lg leading-relaxed text-muted">
          Alunos reservam impressoras 3D, cortadoras a laser e plotters de recorte. O Líder do espaço acompanha cada máquina e cada notebook
          do espaço em tempo real — câmera, alarmes, avisos na tela, bloqueio e controle de downloads.
        </p>
        <div className="rise rise-3 mt-10 flex flex-wrap items-center justify-center gap-3">
          <Button asChild size="lg" className="reflexo group">
            <Link href="/login">Acessar a plataforma <ArrowRight className="transition-transform group-hover:translate-x-0.5" /></Link>
          </Button>
          <Button asChild size="lg" variant="secondary"><a href="#ti">Testar o aviso nos notebooks</a></Button>
        </div>
        <Revelar className="mt-16"><Vitrine /></Revelar>
      </div>
    </section>
  );
}

function Ticker() {
  const itens: [React.ElementType, string, string][] = [
    [Radio, "BAMBU X1C", "camada 212/412 · bico 215 °C"],
    [Download, "LM-NB-01", "download bloqueado: MinecraftInstaller.exe"],
    [AlertTriangle, "LASER #2", "W-201 água do chiller quente"],
    [Megaphone, "Líder", "aviso lido por 11 de 13 notebooks"],
    [Usb, "LM-DT-LASER", "pendrive bloqueado na estação"],
    [CalendarClock, "LASER #1", "reserva 14:00 · Ana Ribeiro"],
    [Lock, "LM-NB-07", "bloqueado: não devolvido"],
    [Ban, "LM-NB-08", "site de apostas bloqueado"],
    [ShieldCheck, "Prusa #2", "nivelamento da mesa registrado"],
  ];
  return (
    <div className="border-b border-line bg-white/[0.015] py-3.5">
      <Letreiro duracao={45}>
        {itens.map(([I, quem, oque]) => (
          <span key={quem + oque} className="flex shrink-0 items-center gap-2 text-[13px]">
            <I className="size-3.5 text-signal" />
            <span className="font-mono text-fg">{quem}</span>
            <span className="text-muted">{oque}</span>
          </span>
        ))}
      </Letreiro>
    </div>
  );
}

function Numeros() {
  const dados: [number, string, string][] = [
    [ROTAS.length, "", "operações REST documentadas"],
    [18, "", "tabelas com integridade referencial"],
    [100, "%", "das ações remotas auditadas"],
    [0, "", "reservas em duplicidade"],
  ];
  return (
    <section className="border-b border-line">
      <dl className="mx-auto grid max-w-6xl grid-cols-2 divide-line px-6 md:grid-cols-4 md:divide-x">
        {dados.map(([n, suf, l]) => (
          <div key={l} className="py-8 md:px-8 md:first:pl-0">
            <dt className="text-[44px] font-semibold leading-none tracking-[-0.04em]"><NumeroAnimado valor={n} sufixo={suf} duracao={1.4} /></dt>
            <dd className="mt-2 text-[13px] text-muted">{l}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

const MODULOS = [
  { icon: CalendarClock, t: "Reservas para alunos", d: "O aluno escolhe a máquina, o dia e o horário livre. Uma trava no banco impede duas reservas no mesmo horário." },
  { icon: Radio, t: "Máquinas ao vivo", d: "Impressoras 3D, lasers e plotters: o que está imprimindo ou cortando, quanto falta, câmera e alarmes." },
  { icon: MonitorSmartphone, t: "Notebooks do espaço", d: "Quem está com cada notebook, o que está aberto, bateria, segurança e se foi devolvido." },
  { icon: Megaphone, t: "Avisos na tela", d: "\"O espaço fecha em 15 minutos\" na tela de todos os notebooks, com confirmação de leitura." },
  { icon: Ban, t: "Downloads, USB e sites", d: "Sem instaladores, jogos ou apostas nos notebooks de alunos; estações das máquinas só com os programas certos." },
  { icon: ScrollText, t: "Manutenção e auditoria", d: "Nivelamento, alinhamento e troca de lâmina com validade. Cada ação fica registrada com autor e horário." },
];

function Modulos() {
  return (
    <section className="border-b border-line">
      <div className="mx-auto max-w-6xl px-6 py-24">
        <Revelar>
          <p className="eyebrow">Módulos</p>
          <h2 className="mt-3 max-w-2xl text-balance text-3xl font-semibold tracking-[-0.035em] sm:text-[44px] sm:leading-[1.05]">Da reserva do aluno ao notebook devolvido no balcão.</h2>
        </Revelar>
        <div className="mt-12 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {MODULOS.map((m, i) => (
            <Revelar key={m.t} atraso={(i % 3) * 0.08}>
              <Holofote className="glass group h-full rounded-2xl border border-line p-7 transition-transform duration-300 hover:-translate-y-1">
                <span className="relative grid size-10 place-items-center rounded-xl border border-white/10 bg-white/[0.05] transition-colors group-hover:border-signal/50 group-hover:text-signal">
                  <m.icon className="size-[18px]" strokeWidth={1.75} />
                </span>
                <h3 className="relative mt-5 text-[16px] font-semibold tracking-tight">{m.t}</h3>
                <p className="relative mt-2 text-sm leading-relaxed text-muted">{m.d}</p>
              </Holofote>
            </Revelar>
          ))}
        </div>
      </div>
    </section>
  );
}

function SecaoTI() {
  return (
    <section id="ti" className="relative scroll-mt-14 overflow-hidden border-b border-line">
      <div aria-hidden className="absolute -right-40 top-10 size-[520px] rounded-full bg-sky-500/[0.06] blur-[130px]" />
      <div className="relative mx-auto max-w-6xl px-6 py-24">
        <Revelar>
          <p className="eyebrow">Notebooks do espaço · experimente</p>
          <h2 className="mt-3 max-w-3xl text-balance text-3xl font-semibold tracking-[-0.035em] sm:text-[44px] sm:leading-[1.05]">Um clique, e o aviso aparece em todos os notebooks do espaço.</h2>
          <p className="mt-4 max-w-2xl text-muted">
            Um agente leve em cada notebook, estação e tablet do espaço recebe os avisos do Líder, aplica as regras e devolve a confirmação.
            Teste abaixo: escolha a prioridade e envie.
          </p>
        </Revelar>
        <div className="mt-10 grid gap-4 lg:grid-cols-[1.55fr_1fr]">
          <Revelar><DemoAlerta /></Revelar>
          <Revelar atraso={0.1} className="h-full"><DemoDownload /></Revelar>
        </div>
        <Revelar className="mt-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              [Lock, "Bloqueio remoto", "Notebook não devolvido? Tela travada em segundos."],
              [Laptop, "Suporte remoto", "Ajude o aluno sem sair do balcão — só com autorização dele."],
              [ShieldCheck, "Conformidade", "Criptografia, antivírus, firewall e atualizações checados."],
              [Server, "Apps por catálogo", "PrusaSlicer, LightBurn, Fusion 360: instala e remove à distância."],
            ].map(([I, t, d]) => {
              const Icone = I as React.ElementType;
              return (
                <Holofote key={t as string} className="glass rounded-2xl border border-line p-5">
                  <Icone className="relative size-4 text-signal" />
                  <p className="relative mt-3 text-[14px] font-semibold">{t as string}</p>
                  <p className="relative mt-1 text-[13px] leading-relaxed text-muted">{d as string}</p>
                </Holofote>
              );
            })}
          </div>
        </Revelar>
      </div>
    </section>
  );
}

function Conectividade() {
  const fluxo = [
    { icon: Gauge, t: "Máquinas e câmeras", d: "Impressoras 3D, lasers, plotters e câmeras IP na rede do espaço", tag: "10.20.30.x" },
    { icon: Network, t: "Gateway (Raspberry Pi)", d: "Fala MQTT com as impressoras, faz a ponte do laser e do plotter e converte vídeo RTSP em WebRTC", tag: "rede das máquinas" },
    { icon: Server, t: "API LabMaker", d: "Valida permissão e estado da máquina antes de qualquer comando; audita tudo", tag: "HTTPS" },
    { icon: MonitorSmartphone, t: "Navegador", d: "Recebe só dados tratados; nunca fala direto com o IP da máquina", tag: "TLS" },
  ];
  return (
    <section id="conectividade" className="scroll-mt-14 border-b border-line bg-white/[0.015]">
      <div className="mx-auto max-w-6xl px-6 py-24">
        <Revelar>
          <p className="eyebrow">Como as máquinas se conectam</p>
          <h2 className="mt-3 max-w-3xl text-balance text-3xl font-semibold tracking-[-0.035em] sm:text-[44px] sm:leading-[1.05]">Cada máquina pelo seu IP, sem expor a rede da faculdade.</h2>
          <p className="mt-4 max-w-2xl text-muted">
            Um Raspberry Pi no espaço conversa com as máquinas pelo protocolo de cada fabricante (Bambu e Prusa por MQTT, laser pela ponte do LightBurn). O LabMaker conversa só com ele — as máquinas ficam numa rede separada.
          </p>
        </Revelar>
        <div className="mt-12 grid gap-3 lg:grid-cols-4">
          {fluxo.map((c, i) => (
            <Revelar key={c.t} atraso={i * 0.08}>
              <Holofote className="glass relative h-full rounded-2xl border border-line p-6">
                <div className="relative flex items-center justify-between">
                  <c.icon className="size-5" strokeWidth={1.75} />
                  <span className="rounded-full border border-line px-2 font-mono text-[10.5px] leading-5 text-subtle">{c.tag}</span>
                </div>
                <h3 className="relative mt-5 text-[16px] font-semibold tracking-tight">{c.t}</h3>
                <p className="relative mt-2 text-sm leading-relaxed text-muted">{c.d}</p>
              </Holofote>
            </Revelar>
          ))}
        </div>
        <Revelar className="mt-6">
          <div className="flex overflow-hidden rounded-2xl border border-signal/25 bg-signal/[0.04]">
            <div className="hazard w-2 shrink-0" />
            <div className="flex flex-col gap-2 px-6 py-5 sm:flex-row sm:items-center sm:gap-6">
              <p className="shrink-0 font-mono text-[11px] uppercase tracking-[0.14em] text-signal">Segurança · laser e NR-12</p>
              <p className="text-sm text-muted">
                À distância só dá para pausar, retomar, cancelar e reconhecer alarme — sempre validado contra o estado real da máquina. O botão de emergência e a tampa do laser são físicos, no local, e o laser nunca é ligado remotamente.
              </p>
            </div>
          </div>
        </Revelar>
      </div>
    </section>
  );
}

function Conformidade() {
  const log = [
    ["21:45", "Paulo H. Sato (OED)", "Aviso enviado", "O espaço fecha em 15 minutos → 13 notebooks", "warn"],
    ["14:21", "Gateway", "Alarme", "W-201 Água do chiller quente · Laser CO2 #2", "danger"],
    ["13:47", "Lucas Martins (estagiário)", "Comando remoto", "Pausar impressão → Bambu X1C (troca de filamento)", "info"],
    ["11:05", "Paulo H. Sato (OED)", "Ação em notebook", "Bloquear → LM-NB-07 (não devolvido)", "warn"],
  ] as const;
  return (
    <section id="conformidade" className="scroll-mt-14 border-b border-line">
      <div className="mx-auto grid max-w-6xl gap-12 px-6 py-24 lg:grid-cols-2 lg:items-center">
        <Revelar>
          <p className="eyebrow">Conformidade</p>
          <h2 className="mt-3 text-balance text-3xl font-semibold tracking-[-0.035em] sm:text-[44px] sm:leading-[1.05]">As regras do espaço viram regra do sistema.</h2>
          <p className="mt-4 text-muted">Nada de planilha no balcão nem de lembrar de cabeça quem pegou o notebook.</p>
          <ul className="mt-7 space-y-3.5">
            {["Máquina com calibração vencida não aceita reservas", "Limite de reservas por aluno e nada de horário duplicado", "Todo comando e ação remota registrados, inclusive os recusados", "Suporte remoto só com autorização visível do aluno (LGPD)"].map((t) => (
              <li key={t} className="flex items-start gap-3 text-[15px]">
                <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-ok-soft text-ok"><Check className="size-3.5" strokeWidth={3} /></span>
                {t}
              </li>
            ))}
          </ul>
        </Revelar>
        <Revelar atraso={0.1}>
          <div className="glass overflow-hidden rounded-2xl border border-line-strong">
            <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
              <p className="flex items-center gap-2 text-[13px] font-semibold"><ShieldCheck className="size-4" />Trilha de auditoria</p>
              <span className="font-mono text-[11px] text-subtle">somente inserção</span>
            </div>
            {log.map(([h, quem, acao, desc, tone]) => (
              <div key={h} className="grid grid-cols-[44px_1fr] gap-3 border-t border-line px-5 py-3.5 first:border-t-0">
                <span className="pt-0.5 font-mono text-[12px] text-subtle">{h}</span>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2"><span className="text-[13px] font-medium">{quem}</span><Badge tone={tone}>{acao}</Badge></div>
                  <p className="mt-1 truncate text-[13px] text-muted">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </Revelar>
      </div>
    </section>
  );
}

function Arquitetura() {
  const camadas = [
    { icon: MonitorSmartphone, nome: "View", pasta: "views/ · app/", desc: "React 19 + Tailwind + framer-motion. Telas renderizadas no servidor; interações via fetch." },
    { icon: Workflow, nome: "Rotas da API", pasta: "app/api/", desc: "35 endpoints REST. Cada rota liga um verbo HTTP a um controller." },
    { icon: Server, nome: "Controller", pasta: "controllers/", desc: "Validação (Zod), permissões (RBAC), regras de negócio e auditoria." },
    { icon: Database, nome: "Model", pasta: "models/ · prisma/", desc: "Único ponto de acesso ao PostgreSQL: 18 tabelas, transações e travas." },
  ];
  return (
    <section id="arquitetura" className="scroll-mt-14 border-b border-line">
      <div className="mx-auto max-w-6xl px-6 py-24">
        <Revelar>
          <p className="eyebrow">Arquitetura</p>
          <h2 className="mt-3 max-w-2xl text-balance text-3xl font-semibold tracking-[-0.035em] sm:text-[44px] sm:leading-[1.05]">MVC em camadas, com responsabilidades separadas.</h2>
        </Revelar>
        <div className="mt-12 grid gap-3 lg:grid-cols-4">
          {camadas.map((c, i) => (
            <Revelar key={c.nome} atraso={i * 0.08}>
              <Holofote className="glass relative h-full rounded-2xl border border-line p-6">
                <div className="relative flex items-center justify-between"><c.icon className="size-5" strokeWidth={1.75} /><span className="font-mono text-[11px] text-subtle">0{i + 1}</span></div>
                <h3 className="relative mt-5 text-[17px] font-semibold tracking-tight">{c.nome}</h3>
                <p className="relative mt-1 font-mono text-[11.5px] text-signal">{c.pasta}</p>
                <p className="relative mt-3 text-sm leading-relaxed text-muted">{c.desc}</p>
              </Holofote>
            </Revelar>
          ))}
        </div>
        <Revelar className="mt-6 flex flex-wrap gap-2">
          {["Next.js 16", "React 19", "TypeScript", "Tailwind CSS 4", "Prisma 7", "PostgreSQL", "Zod", "JWT (httpOnly)", "Vitest", "MQTT", "WebRTC", "Raspberry Pi", "Agente nos notebooks"].map((t) => (
            <span key={t} className="rounded-full border border-line bg-white/[0.03] px-3 py-1 font-mono text-[12px] text-muted transition-colors hover:border-white/25 hover:text-fg">{t}</span>
          ))}
        </Revelar>
      </div>
    </section>
  );
}

function Cta() {
  return (
    <section className="relative overflow-hidden">
      <div aria-hidden className="absolute inset-0 bg-grid opacity-60 [mask-image:radial-gradient(ellipse_60%_80%_at_50%_50%,#000,transparent)]" />
      <div aria-hidden className="flutuar absolute left-1/2 top-1/2 size-[420px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-signal/[0.08] blur-[110px]" />
      <Revelar className="relative mx-auto flex max-w-6xl flex-col items-center gap-7 px-6 py-28 text-center">
        <Building2 className="size-6 text-subtle" strokeWidth={1.5} />
        <h2 className="max-w-2xl text-balance text-3xl font-semibold tracking-[-0.035em] sm:text-[48px] sm:leading-[1.05]">Veja o espaço maker funcionando.</h2>
        <p className="max-w-lg text-muted">Entre como Líder e cadastre uma máquina ou um notebook — ou crie sua conta de aluno e reserve o que foi cadastrado.</p>
        <Button asChild size="lg" variant="signal" className="reflexo group">
          <Link href="/login"><Cctv />Entrar no LabMaker <ArrowRight className="transition-transform group-hover:translate-x-0.5" /></Link>
        </Button>
      </Revelar>
    </section>
  );
}
