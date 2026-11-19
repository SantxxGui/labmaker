"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import {
  COR, andon, desenharFaiscas, engrenagem, linha, portico, retangulo, texto, type Faisca, type Rastro,
} from "@/components/industrial/scene";

const W = 1600;
const H = 900;

/**
 * Fundo animado: uma linha de produção desenhada em traço fino —
 * braço robótico, centro de usinagem com faíscas, esteira, engrenagens e andon.
 * Pausa fora da tela e respeita "reduzir movimento" do sistema.
 */
export function IndustrialBackdrop({ className, intensidade = 1 }: { className?: string; intensidade?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const reduzir = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const rastroImp: Rastro = { pts: [] };
    const rastroLaser: Rastro = { pts: [] };
    const rastroVinil: Rastro = { pts: [] };
    const faiscas: Faisca[] = [];
    let visivel = true;
    let raf = 0;
    let ultimo = 0;
    let escala = 1;
    let ox = 0;
    let oy = 0;

    function redimensionar() {
      const r = canvas!.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas!.width = Math.max(1, Math.round(r.width * dpr));
      canvas!.height = Math.max(1, Math.round(r.height * dpr));
      escala = Math.max(r.width / W, r.height / H) * dpr;
      ox = (canvas!.width - W * escala) / 2;
      oy = canvas!.height - H * escala; // cena alinhada pela base
    }

    function quadro(t: number, dt: number) {
      ctx!.setTransform(1, 0, 0, 1, 0, 0);
      ctx!.clearRect(0, 0, canvas!.width, canvas!.height);
      ctx!.setTransform(escala, 0, 0, escala, ox, oy);
      ctx!.lineCap = "round";
      ctx!.lineJoin = "round";

      // linha do piso e cotas
      ctx!.strokeStyle = COR.linhaFraca;
      ctx!.lineWidth = 1;
      linha(ctx!, 0, 820, W, 820);
      for (let x = 40; x < W; x += 80) linha(ctx!, x, 820, x - 18, 838);

      engrenagem(ctx!, 1490, 170, 52, 14, t * 0.0006);
      engrenagem(ctx!, 1418, 222, 34, 9, -t * 0.0006 * (52 / 34) + 0.2);
      engrenagem(ctx!, 130, 150, 38, 10, -t * 0.0004);

      // bancadas
      ctx!.strokeStyle = COR.linhaFraca;
      retangulo(ctx!, 40, 780, 440, 40, false);
      retangulo(ctx!, 490, 780, 360, 40, false);
      retangulo(ctx!, 880, 700, 560, 120, false);

      // impressora 3D (bico), plotter de recorte (lâmina) e cortadora a laser
      const imp = portico(ctx!, { x: 70, y: 380, w: 380, h: 400, t: t * 1.3, ferramenta: "bico", ativo: true, rastro: rastroImp, faiscas, dt });
      portico(ctx!, { x: 510, y: 560, w: 320, h: 220, t: t * 1.8 + 4000, ferramenta: "lamina", ativo: true, rastro: rastroVinil, faiscas, dt });
      const laser = portico(ctx!, { x: 900, y: 300, w: 520, h: 400, t, ferramenta: "laser", ativo: true, rastro: rastroLaser, faiscas, dt });
      desenharFaiscas(ctx!, faiscas, dt);
      andon(ctx!, 1390, 520, t, "ok");
      andon(ctx!, 470, 520, t + 1700, Math.sin(t * 0.00025) > 0.6 ? "aviso" : "ok");

      // leituras estilo HUD
      ctx!.strokeStyle = COR.linhaFraca;
      linha(ctx!, laser.fx, 300 - 46, laser.fx, 300 - 18);
      texto(ctx!, `X ${(laser.fx - 900).toFixed(2).padStart(7, "0")}`, laser.fx + 8, 300 - 32, 11, COR.texto);
      texto(ctx!, `P ${laser.cortando ? 65 + Math.round(Math.sin(t * 0.002) * 3) : 0}%`, 1416, 300 - 32, 11, COR.texto, "right");
      texto(ctx!, "LASER-01 · CO2 60 W · 10.20.30.21", 900, 300 - 62, 11, "rgba(255,255,255,0.3)");
      texto(ctx!, `IMP3D · bico ${imp.cortando ? 215 : 180}°C · camada ${Math.floor(t / 3000) % 412}/412`, 70, 380 - 40, 11, "rgba(255,255,255,0.3)");
      texto(ctx!, "PLOTTER · vinil fosco", 510, 560 - 30, 11, "rgba(255,255,255,0.3)");
    }

    function loop(agora: number) {
      raf = requestAnimationFrame(loop);
      if (!visivel) return;
      const passo = agora - ultimo;
      if (passo < 30) return; // ~30 fps
      const dt = Math.min(3, passo / 16.7);
      ultimo = agora;
      quadro(agora, dt);
    }

    redimensionar();
    const ro = new ResizeObserver(redimensionar);
    ro.observe(canvas);
    const io = new IntersectionObserver(([e]) => (visivel = e.isIntersecting));
    io.observe(canvas);

    if (reduzir) quadro(12000, 1);
    else raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
    };
  }, []);

  return (
    <canvas
      ref={ref}
      aria-hidden
      style={{ opacity: intensidade }}
      className={cn("pointer-events-none absolute inset-0 h-full w-full", className)}
    />
  );
}
