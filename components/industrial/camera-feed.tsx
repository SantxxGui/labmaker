"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import {
  COR, andon, camaraClimatica, desenharFaiscas, maquinaEnsaio, portico, texto, type Faisca, type Ferramenta, type Rastro,
} from "@/components/industrial/scene";
import type { EstadoMaquina, TipoEquipamento } from "@/lib/types";

const W = 960;
const H = 540;

const FERRAMENTA: Partial<Record<TipoEquipamento, Ferramenta>> = {
  USINAGEM_CNC: "fresa",
  CORTE_LASER: "laser",
  MANUFATURA_ADITIVA: "bico",
  PLOTTER_RECORTE: "lamina",
  METROLOGIA: "apalpador",
};

/**
 * Visualização de câmera da máquina.
 * Em produção, o stream RTSP da câmera IP é convertido para WebRTC pelo gateway
 * (ex.: MediaMTX/go2rtc) e exibido em um <video>. Aqui a imagem é sintetizada
 * a partir do estado real reportado pela telemetria.
 */
export function CameraFeed({ tipo, estado, rotulo, className }: {
  tipo: TipoEquipamento;
  estado: EstadoMaquina | "MANUTENCAO";
  rotulo: string;
  className?: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const estadoRef = useRef(estado);
  estadoRef.current = estado;

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const rastro: Rastro = { pts: [] };
    const faiscas: Faisca[] = [];
    let raf = 0;
    let ultimo = 0;
    let tCena = 0; // tempo da cena: só avança com a máquina operando
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    // Granulação pré-gerada (deslocada a cada quadro)
    const grao = document.createElement("canvas");
    grao.width = 256;
    grao.height = 256;
    const g = grao.getContext("2d")!;
    const img = g.createImageData(256, 256);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = Math.random() * 255;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 22;
    }
    g.putImageData(img, 0, 0);
    const padrao = ctx.createPattern(grao, "repeat")!;

    function ajustar() {
      const r = canvas!.getBoundingClientRect();
      canvas!.width = Math.round(r.width * dpr);
      canvas!.height = Math.round(r.height * dpr);
    }

    function quadro(agora: number, dt: number) {
      const est = estadoRef.current;
      const ativo = est === "OPERANDO";
      if (ativo) tCena += 16.7 * dt;
      const s = canvas!.width / W;
      ctx!.setTransform(1, 0, 0, 1, 0, 0);
      ctx!.fillStyle = "#0a0b0c";
      ctx!.fillRect(0, 0, canvas!.width, canvas!.height);

      if (est === "OFFLINE") {
        ctx!.fillStyle = padrao;
        ctx!.save();
        ctx!.globalAlpha = 6;
        ctx!.translate(Math.random() * 256, Math.random() * 256);
        ctx!.fillRect(-256, -256, canvas!.width + 512, canvas!.height + 512);
        ctx!.restore();
        ctx!.setTransform(s, 0, 0, s, 0, 0);
        texto(ctx!, "SEM SINAL", W / 2, H / 2, 28, "rgba(255,255,255,0.75)", "center");
        texto(ctx!, "câmera e controlador sem resposta", W / 2, H / 2 + 26, 14, COR.texto, "center");
      } else {
        ctx!.setTransform(s, 0, 0, s, 0, 0);
        ctx!.lineCap = "round";
        // piso em perspectiva
        ctx!.strokeStyle = COR.linhaFraca;
        ctx!.lineWidth = 1;
        for (let i = -8; i <= 8; i++) {
          ctx!.beginPath();
          ctx!.moveTo(W / 2 + i * 40, 430);
          ctx!.lineTo(W / 2 + i * 140, H);
          ctx!.stroke();
        }
        const ferramenta = FERRAMENTA[tipo];
        if (ferramenta) {
          portico(ctx!, { x: 170, y: 80, w: 620, h: 400, t: tCena, ferramenta, ativo, rastro, faiscas, dt: ativo ? dt : 0 });
          desenharFaiscas(ctx!, faiscas, ativo ? dt : 0.6);
        } else if (tipo === "ENSAIO_MATERIAIS") {
          maquinaEnsaio(ctx!, 330, 50, 300, 440, tCena, ativo);
        } else if (tipo === "CAMARA_CLIMATICA") {
          camaraClimatica(ctx!, 240, 60, 480, 420, tCena, ativo, est === "ALARME" || est === "MANUTENCAO");
        } else {
          texto(ctx!, "Câmera não instalada neste equipamento", W / 2, H / 2, 16, COR.texto, "center");
        }
        andon(ctx!, 860, 220, agora, est === "OPERANDO" ? "ok" : est === "ALARME" || est === "MANUTENCAO" ? "alarme" : est === "PAUSADO" ? "aviso" : "parado");

        // granulação + linhas de varredura + vinheta
        ctx!.setTransform(1, 0, 0, 1, 0, 0);
        ctx!.save();
        ctx!.fillStyle = padrao;
        ctx!.translate((agora * 0.37) % 256, (agora * 0.53) % 256);
        ctx!.fillRect(-256, -256, canvas!.width + 512, canvas!.height + 512);
        ctx!.restore();
        ctx!.fillStyle = "rgba(0,0,0,0.18)";
        for (let y = 0; y < canvas!.height; y += 3 * dpr) ctx!.fillRect(0, y, canvas!.width, dpr);
        const vin = ctx!.createRadialGradient(canvas!.width / 2, canvas!.height / 2, canvas!.height * 0.35, canvas!.width / 2, canvas!.height / 2, canvas!.width * 0.7);
        vin.addColorStop(0, "rgba(0,0,0,0)");
        vin.addColorStop(1, "rgba(0,0,0,0.65)");
        ctx!.fillStyle = vin;
        ctx!.fillRect(0, 0, canvas!.width, canvas!.height);
      }

      // sobreposição da câmera
      ctx!.setTransform(s, 0, 0, s, 0, 0);
      texto(ctx!, rotulo, 22, 34, 14, "rgba(255,255,255,0.8)");
      const relogio = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "medium", timeZone: "America/Sao_Paulo" }).format(new Date());
      texto(ctx!, relogio, 22, H - 22, 14, "rgba(255,255,255,0.8)");
      texto(ctx!, est === "OFFLINE" ? "— fps" : "1080p · 25 fps · WebRTC", W - 22, H - 22, 13, "rgba(255,255,255,0.55)", "right");
      const selo = est === "OFFLINE" ? "OFF" : "AO VIVO";
      texto(ctx!, selo, W - 22, 34, 14, "rgba(255,255,255,0.8)", "right");
      if (est !== "OFFLINE" && Math.floor(agora / 700) % 2 === 0) {
        const larg = ctx!.measureText(selo).width;
        ctx!.fillStyle = "#ef4444";
        ctx!.beginPath();
        ctx!.arc(W - 22 - larg - 14, 29, 5.5, 0, Math.PI * 2);
        ctx!.fill();
      }
    }

    function loop(agora: number) {
      raf = requestAnimationFrame(loop);
      const passo = agora - ultimo;
      if (passo < 40) return; // ~25 fps
      const dt = Math.min(3, passo / 16.7);
      ultimo = agora;
      quadro(agora, dt);
    }

    ajustar();
    const ro = new ResizeObserver(ajustar);
    ro.observe(canvas);
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [tipo, rotulo]);

  return <canvas ref={ref} aria-label={`Câmera: ${rotulo}`} className={cn("block aspect-video w-full bg-black", className)} />;
}
