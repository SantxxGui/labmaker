/**
 * Cena industrial desenhada em canvas 2D (traço fino, estilo planta técnica).
 * Usada no fundo animado das telas e nas "câmeras" das máquinas.
 * Tudo é vetorial e procedural: sem imagens, leve e nítido em qualquer tela.
 */

export type Ctx = CanvasRenderingContext2D;

export const COR = {
  linha: "rgba(255,255,255,0.20)",
  linhaForte: "rgba(255,255,255,0.38)",
  linhaFraca: "rgba(255,255,255,0.08)",
  preenchimento: "rgba(255,255,255,0.025)",
  sinal: "#f59e0b",
  sinalSuave: "rgba(245,158,11,0.35)",
  ok: "#34d399",
  perigo: "#fb7185",
  texto: "rgba(255,255,255,0.45)",
};

const TAU = Math.PI * 2;

export function linha(ctx: Ctx, x1: number, y1: number, x2: number, y2: number) {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}

export function retangulo(ctx: Ctx, x: number, y: number, w: number, h: number, preencher = true) {
  if (preencher) {
    ctx.fillStyle = COR.preenchimento;
    ctx.fillRect(x, y, w, h);
  }
  ctx.strokeRect(x, y, w, h);
}

export function circulo(ctx: Ctx, x: number, y: number, r: number, fill?: string) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  ctx.stroke();
}

/** Fonte mono do tema (a variável do next/font tem nome gerado, por isso é lida em tempo de execução). */
let fonteMono: string | null = null;
function mono() {
  if (fonteMono === null) {
    const v = typeof document !== "undefined" ? getComputedStyle(document.documentElement).getPropertyValue("--font-geist-mono").trim() : "";
    fonteMono = `${v ? `${v}, ` : ""}ui-monospace, monospace`;
  }
  return fonteMono;
}

export function texto(ctx: Ctx, s: string, x: number, y: number, tamanho = 11, cor = COR.texto, align: CanvasTextAlign = "left") {
  ctx.font = `${tamanho}px ${mono()}`;
  ctx.fillStyle = cor;
  ctx.textAlign = align;
  ctx.fillText(s, x, y);
}

/** Engrenagem com `dentes` dentes, girando `angulo`. */
export function engrenagem(ctx: Ctx, x: number, y: number, r: number, dentes: number, angulo: number) {
  ctx.beginPath();
  for (let i = 0; i < dentes * 2; i++) {
    const a = angulo + (i / (dentes * 2)) * TAU;
    const rr = i % 2 === 0 ? r : r * 0.84;
    const a2 = angulo + ((i + 1) / (dentes * 2)) * TAU;
    ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    ctx.lineTo(x + Math.cos(a2) * rr, y + Math.sin(a2) * rr);
  }
  ctx.closePath();
  ctx.fillStyle = COR.preenchimento;
  ctx.fill();
  ctx.stroke();
  circulo(ctx, x, y, r * 0.28);
  for (let i = 0; i < 4; i++) {
    const a = angulo + (i / 4) * TAU;
    linha(ctx, x + Math.cos(a) * r * 0.28, y + Math.sin(a) * r * 0.28, x + Math.cos(a) * r * 0.7, y + Math.sin(a) * r * 0.7);
  }
}

// ─────────────────────────────── partículas (faíscas) ───────────────────────────────

export type Faisca = { x: number; y: number; vx: number; vy: number; vida: number };

export function emitirFaiscas(lista: Faisca[], x: number, y: number, n: number, forca = 1) {
  for (let i = 0; i < n; i++) {
    const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.4;
    const v = (1.5 + Math.random() * 3.5) * forca;
    lista.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, vida: 1 });
  }
  if (lista.length > 220) lista.splice(0, lista.length - 220);
}

export function desenharFaiscas(ctx: Ctx, lista: Faisca[], dt: number) {
  ctx.save();
  for (let i = lista.length - 1; i >= 0; i--) {
    const f = lista[i];
    f.vy += 0.12 * dt;
    f.x += f.vx * dt;
    f.y += f.vy * dt;
    f.vida -= 0.028 * dt;
    if (f.vida <= 0) {
      lista.splice(i, 1);
      continue;
    }
    ctx.strokeStyle = `rgba(251,191,36,${f.vida})`;
    ctx.lineWidth = 1.4;
    linha(ctx, f.x, f.y, f.x - f.vx * 1.6, f.y - f.vy * 1.6);
  }
  ctx.restore();
}

// ─────────────────────────────── máquinas ───────────────────────────────

/** Rastro da ferramenta (trajetória já usinada/cortada/medida). */
export type Rastro = { pts: { x: number; y: number; idade: number }[] };

export type Ferramenta = "fresa" | "laser" | "bico" | "apalpador" | "lamina";

/**
 * Pórtico (CNC / laser / impressora / máquina de medir).
 * Retorna a posição da ponta da ferramenta.
 */
export function portico(
  ctx: Ctx,
  o: { x: number; y: number; w: number; h: number; t: number; ferramenta: Ferramenta; ativo: boolean; rastro: Rastro; faiscas: Faisca[]; dt: number },
) {
  const { x, y, w, h, t, ferramenta, ativo, rastro, faiscas, dt } = o;
  const mesaY = y + h * 0.78;
  const vigaY = y + h * 0.16;
  ctx.strokeStyle = COR.linha;
  ctx.lineWidth = 1.2;

  // base e mesa
  retangulo(ctx, x, mesaY, w, h * 0.06);
  retangulo(ctx, x + w * 0.04, mesaY + h * 0.06, w * 0.92, h * 0.16);
  for (let i = 1; i < 8; i++) linha(ctx, x + (w * i) / 8, mesaY, x + (w * i) / 8, mesaY + h * 0.06);
  // colunas e viga
  retangulo(ctx, x + w * 0.02, vigaY, w * 0.05, mesaY - vigaY);
  retangulo(ctx, x + w * 0.93, vigaY, w * 0.05, mesaY - vigaY);
  retangulo(ctx, x, vigaY - h * 0.07, w, h * 0.07);
  ctx.strokeStyle = COR.linhaFraca;
  linha(ctx, x + w * 0.07, vigaY - h * 0.035, x + w * 0.93, vigaY - h * 0.035);

  // peça
  const pecaX = x + w * 0.2;
  const pecaW = w * 0.6;
  const pecaY = mesaY - h * (ferramenta === "bico" ? 0.04 : ferramenta === "lamina" ? 0.015 : 0.09);
  ctx.strokeStyle = COR.linhaForte;
  retangulo(ctx, pecaX, pecaY, pecaW, mesaY - pecaY);

  // trajetória da ferramenta (Lissajous suave sobre a peça)
  const u = t * 0.00035;
  const fx = pecaX + pecaW * (0.5 + 0.42 * Math.sin(u * 2.1) * Math.cos(u * 0.7));
  const cortando = ativo && Math.sin(u * 1.3) > -0.55;
  const fy = cortando ? pecaY : pecaY - h * 0.08;

  // carro + eixo Z
  const carroW = w * 0.12;
  ctx.strokeStyle = COR.linhaForte;
  retangulo(ctx, fx - carroW / 2, vigaY - h * 0.09, carroW, h * 0.11);
  const cabecaH = h * 0.14;
  const cabecaY = fy - cabecaH - (ferramenta === "apalpador" ? h * 0.06 : h * 0.04);
  ctx.strokeStyle = COR.linha;
  linha(ctx, fx - carroW * 0.18, vigaY + h * 0.02, fx - carroW * 0.18, cabecaY);
  linha(ctx, fx + carroW * 0.18, vigaY + h * 0.02, fx + carroW * 0.18, cabecaY);
  ctx.strokeStyle = COR.linhaForte;
  retangulo(ctx, fx - carroW * 0.3, cabecaY, carroW * 0.6, cabecaH);

  // ferramenta
  ctx.strokeStyle = COR.linhaForte;
  if (ferramenta === "fresa") {
    linha(ctx, fx, cabecaY + cabecaH, fx, fy);
    const giro = t * 0.04;
    for (let i = 0; i < 3; i++) {
      const dx = Math.sin(giro + i * 2.1) * carroW * 0.06;
      linha(ctx, fx + dx, fy - h * 0.04, fx - dx, fy);
    }
  } else if (ferramenta === "laser") {
    linha(ctx, fx - carroW * 0.12, cabecaY + cabecaH, fx, fy - h * 0.025);
    linha(ctx, fx + carroW * 0.12, cabecaY + cabecaH, fx, fy - h * 0.025);
    if (cortando) {
      ctx.strokeStyle = COR.sinal;
      ctx.lineWidth = 2;
      linha(ctx, fx, fy - h * 0.025, fx, fy);
      ctx.lineWidth = 1.2;
    }
  } else if (ferramenta === "lamina") {
    linha(ctx, fx, cabecaY + cabecaH, fx, fy - 3);
    ctx.strokeStyle = COR.sinal;
    linha(ctx, fx - 2, fy - 3, fx + 2, fy);
  } else if (ferramenta === "bico") {
    linha(ctx, fx - carroW * 0.08, cabecaY + cabecaH, fx, fy - 2);
    linha(ctx, fx + carroW * 0.08, cabecaY + cabecaH, fx, fy - 2);
  } else {
    linha(ctx, fx, cabecaY + cabecaH, fx, fy - 6);
    circulo(ctx, fx, fy - 3, 3, cortando ? "rgba(251,113,133,0.9)" : undefined);
  }

  // rastro
  if (cortando) {
    rastro.pts.push({ x: fx, y: ferramenta === "bico" ? pecaY - 1 : ferramenta === "lamina" ? pecaY + Math.sin(u * 7) * h * 0.012 : pecaY + 0.5, idade: 0 });
    if (ferramenta === "fresa" && Math.random() < 0.6 * dt) emitirFaiscas(faiscas, fx, fy, 2, 0.8);
    if (ferramenta === "laser" && Math.random() < 0.9 * dt) emitirFaiscas(faiscas, fx, fy, 3, 1.1);
  }
  ctx.save();
  for (let i = rastro.pts.length - 1; i >= 0; i--) {
    const p = rastro.pts[i];
    p.idade += dt;
    const vida = ferramenta === "apalpador" ? 600 : 260;
    if (p.idade > vida) {
      rastro.pts.splice(i, 1);
      continue;
    }
    const a = 1 - p.idade / vida;
    ctx.fillStyle =
      ferramenta === "laser" ? `rgba(251,191,36,${a * 0.9})` : ferramenta === "apalpador" ? `rgba(251,113,133,${a})` : `rgba(255,255,255,${a * 0.45})`;
    if (ferramenta === "apalpador") {
      if (i % 14 === 0) ctx.fillRect(p.x - 1.5, p.y - 1.5, 3, 3);
    } else ctx.fillRect(p.x - 1, p.y - 1, 2, 2);
  }
  ctx.restore();
  return { fx, fy, cortando };
}

/** Braço robótico de 3 eixos. */
export function bracoRobotico(ctx: Ctx, x: number, y: number, escala: number, t: number, ativo: boolean) {
  const s = escala;
  const u = ativo ? t * 0.0009 : 0;
  const a1 = -Math.PI / 2 + 0.55 * Math.sin(u);
  const a2 = a1 + 1.1 + 0.5 * Math.sin(u * 1.7 + 1);
  const a3 = a2 + 0.9 + 0.6 * Math.sin(u * 2.3 + 2);
  const l1 = 150 * s;
  const l2 = 120 * s;
  const l3 = 48 * s;
  const p1 = { x: x + Math.cos(a1) * l1, y: y + Math.sin(a1) * l1 };
  const p2 = { x: p1.x + Math.cos(a2) * l2, y: p1.y + Math.sin(a2) * l2 };
  const p3 = { x: p2.x + Math.cos(a3) * l3, y: p2.y + Math.sin(a3) * l3 };

  ctx.strokeStyle = COR.linha;
  ctx.lineWidth = 1.2;
  retangulo(ctx, x - 46 * s, y, 92 * s, 22 * s);
  retangulo(ctx, x - 30 * s, y - 18 * s, 60 * s, 18 * s);

  const segmento = (a: { x: number; y: number }, b: { x: number; y: number }, larg: number) => {
    const ang = Math.atan2(b.y - a.y, b.x - a.x);
    const nx = Math.sin(ang) * larg;
    const ny = -Math.cos(ang) * larg;
    ctx.beginPath();
    ctx.moveTo(a.x + nx, a.y + ny);
    ctx.lineTo(b.x + nx, b.y + ny);
    ctx.lineTo(b.x - nx, b.y - ny);
    ctx.lineTo(a.x - nx, a.y - ny);
    ctx.closePath();
    ctx.fillStyle = COR.preenchimento;
    ctx.fill();
    ctx.stroke();
  };
  ctx.strokeStyle = COR.linhaForte;
  segmento({ x, y: y - 18 * s }, p1, 13 * s);
  segmento(p1, p2, 10 * s);
  segmento(p2, p3, 6 * s);
  for (const p of [{ x, y: y - 18 * s }, p1, p2]) circulo(ctx, p.x, p.y, 9 * s, "rgba(9,9,11,1)");
  // garra
  const g = 10 * s * (0.6 + 0.4 * Math.abs(Math.sin(u * 2)));
  linha(ctx, p3.x, p3.y, p3.x + Math.cos(a3 + 0.6) * g, p3.y + Math.sin(a3 + 0.6) * g);
  linha(ctx, p3.x, p3.y, p3.x + Math.cos(a3 - 0.6) * g, p3.y + Math.sin(a3 - 0.6) * g);
  ctx.strokeStyle = COR.sinal;
  circulo(ctx, p2.x, p2.y, 3 * s, ativo && Math.sin(t * 0.008) > 0 ? COR.sinal : undefined);
}

/** Esteira transportadora com rolos e caixas. */
export function esteira(ctx: Ctx, x: number, y: number, w: number, t: number, ativo: boolean) {
  const v = ativo ? t * 0.05 : 0;
  ctx.strokeStyle = COR.linha;
  ctx.lineWidth = 1.2;
  linha(ctx, x, y, x + w, y);
  linha(ctx, x, y + 26, x + w, y + 26);
  ctx.save();
  ctx.setLineDash([10, 14]);
  ctx.lineDashOffset = -v;
  ctx.strokeStyle = COR.linhaFraca;
  linha(ctx, x, y + 4, x + w, y + 4);
  ctx.restore();
  const n = Math.floor(w / 70);
  for (let i = 0; i <= n; i++) {
    const rx = x + (i / n) * w;
    ctx.strokeStyle = COR.linha;
    circulo(ctx, rx, y + 13, 9);
    const a = v / 9;
    linha(ctx, rx, y + 13, rx + Math.cos(a) * 9, y + 13 + Math.sin(a) * 9);
    linha(ctx, rx - 12, y + 36, rx, y + 26);
  }
  // caixas
  const passo = 240;
  for (let i = -1; i < w / passo + 1; i++) {
    const bx = x + ((i * passo + v * 0.9) % (w + passo)) - passo / 2;
    if (bx < x - 60 || bx > x + w) continue;
    ctx.strokeStyle = COR.linhaForte;
    const bw = 58 + (i % 3) * 10;
    const bh = 40 + (i % 2) * 12;
    retangulo(ctx, bx, y - bh, bw, bh);
    ctx.strokeStyle = COR.linhaFraca;
    linha(ctx, bx, y - bh, bx + bw, y);
    texto(ctx, `LT-${2600 + ((i + 40) % 97)}`, bx + 6, y - bh + 13, 9);
  }
}

/** Torre de sinalização (andon). */
export function andon(ctx: Ctx, x: number, y: number, t: number, estado: "ok" | "aviso" | "alarme" | "parado") {
  ctx.strokeStyle = COR.linha;
  ctx.lineWidth = 1.2;
  linha(ctx, x, y, x, y + 70);
  const pisca = Math.sin(t * 0.009) > 0;
  const luzes: [string, boolean][] = [
    [COR.perigo, estado === "alarme" && pisca],
    [COR.sinal, estado === "aviso" && pisca],
    [COR.ok, estado === "ok"],
  ];
  luzes.forEach(([cor, aceso], i) => {
    ctx.strokeStyle = aceso ? cor : COR.linha;
    retangulo(ctx, x - 9, y - 66 + i * 22, 18, 20, false);
    if (aceso) {
      ctx.fillStyle = cor;
      ctx.globalAlpha = 0.85;
      ctx.fillRect(x - 7, y - 64 + i * 22, 14, 16);
      ctx.globalAlpha = 1;
    }
  });
}

/** Máquina universal de ensaios (prensa de tração). */
export function maquinaEnsaio(ctx: Ctx, x: number, y: number, w: number, h: number, t: number, ativo: boolean) {
  ctx.strokeStyle = COR.linha;
  ctx.lineWidth = 1.2;
  retangulo(ctx, x, y + h * 0.82, w, h * 0.18);
  retangulo(ctx, x + w * 0.12, y, w * 0.08, h * 0.82);
  retangulo(ctx, x + w * 0.8, y, w * 0.08, h * 0.82);
  retangulo(ctx, x + w * 0.08, y, w * 0.84, h * 0.08);
  const ciclo = ativo ? (t * 0.00012) % 1 : 0.35;
  const travY = y + h * 0.22 - ciclo * h * 0.08;
  ctx.strokeStyle = COR.linhaForte;
  retangulo(ctx, x + w * 0.16, travY, w * 0.68, h * 0.07);
  // garras e corpo de prova
  const garraSup = travY + h * 0.07;
  const garraInf = y + h * 0.6;
  retangulo(ctx, x + w * 0.44, garraSup, w * 0.12, h * 0.08);
  retangulo(ctx, x + w * 0.44, garraInf, w * 0.12, h * 0.08);
  const meio = (garraSup + h * 0.08 + garraInf) / 2;
  const pescoco = w * (0.03 - ciclo * 0.018);
  ctx.beginPath();
  ctx.moveTo(x + w * 0.46, garraSup + h * 0.08);
  ctx.lineTo(x + w * 0.5 - pescoco, meio);
  ctx.lineTo(x + w * 0.46, garraInf);
  ctx.moveTo(x + w * 0.54, garraSup + h * 0.08);
  ctx.lineTo(x + w * 0.5 + pescoco, meio);
  ctx.lineTo(x + w * 0.54, garraInf);
  ctx.stroke();
  if (ativo && ciclo > 0.9) {
    ctx.strokeStyle = COR.sinal;
    linha(ctx, x + w * 0.47, meio, x + w * 0.53, meio);
  }
  // extensômetro
  ctx.strokeStyle = COR.sinalSuave;
  linha(ctx, x + w * 0.6, meio - h * 0.06, x + w * 0.66, meio - h * 0.06);
  linha(ctx, x + w * 0.6, meio + h * 0.06, x + w * 0.66, meio + h * 0.06);
  linha(ctx, x + w * 0.66, meio - h * 0.06, x + w * 0.66, meio + h * 0.06);
  return { ciclo };
}

/** Câmara climática vista de frente. */
export function camaraClimatica(ctx: Ctx, x: number, y: number, w: number, h: number, t: number, ativo: boolean, alarme: boolean) {
  ctx.strokeStyle = COR.linha;
  ctx.lineWidth = 1.2;
  retangulo(ctx, x, y, w, h);
  retangulo(ctx, x + w * 0.06, y + h * 0.06, w * 0.6, h * 0.86);
  ctx.strokeStyle = COR.linhaForte;
  retangulo(ctx, x + w * 0.16, y + h * 0.18, w * 0.4, h * 0.42);
  // prateleiras com amostras
  ctx.strokeStyle = COR.linhaFraca;
  for (let i = 1; i < 4; i++) linha(ctx, x + w * 0.16, y + h * (0.18 + i * 0.105), x + w * 0.56, y + h * (0.18 + i * 0.105));
  for (let i = 0; i < 5; i++) {
    ctx.strokeStyle = COR.linha;
    retangulo(ctx, x + w * (0.19 + i * 0.07), y + h * 0.26, w * 0.04, h * 0.025, false);
  }
  // vapor/ar circulando
  if (ativo) {
    ctx.strokeStyle = "rgba(56,189,248,0.25)";
    for (let i = 0; i < 4; i++) {
      const yy = y + h * (0.22 + i * 0.09) + Math.sin(t * 0.002 + i) * 4;
      ctx.beginPath();
      for (let k = 0; k <= 20; k++) ctx.lineTo(x + w * (0.17 + k * 0.019), yy + Math.sin(t * 0.004 + k * 0.6 + i) * 3);
      ctx.stroke();
    }
  }
  // painel
  ctx.strokeStyle = COR.linha;
  retangulo(ctx, x + w * 0.72, y + h * 0.1, w * 0.22, h * 0.24);
  texto(ctx, alarme ? "M-301" : "85.0°C", x + w * 0.83, y + h * 0.25, Math.max(10, w * 0.05), alarme ? COR.perigo : COR.sinal, "center");
  ctx.strokeStyle = COR.linha;
  linha(ctx, x + w * 0.62, y + h * 0.4, x + w * 0.62, y + h * 0.6);
  for (let i = 0; i < 6; i++) linha(ctx, x + w * (0.74 + i * 0.03), y + h * 0.82, x + w * (0.74 + i * 0.03), y + h * 0.9);
}
