import { Box, CircuitBoard, Cog, FlaskConical, Hammer, Ruler, Thermometer, Wrench, Zap, Scissors } from "lucide-react";
import { cn } from "@/lib/utils";
import type { TipoEquipamento } from "@/lib/types";

const ICONS: Record<TipoEquipamento, typeof Box> = {
  METROLOGIA: Ruler,
  ENSAIO_MATERIAIS: Hammer,
  ANALISE_QUIMICA: FlaskConical,
  ELETRONICA: CircuitBoard,
  MANUFATURA_ADITIVA: Box,
  PLOTTER_RECORTE: Scissors,
  USINAGEM_CNC: Cog,
  CORTE_LASER: Zap,
  CAMARA_CLIMATICA: Thermometer,
  OUTRO: Wrench,
};

export function EquipmentIcon({ tipo, className }: { tipo: TipoEquipamento; className?: string }) {
  const Icon = ICONS[tipo];
  return (
    <span className={cn("grid size-9 shrink-0 place-items-center rounded-md border border-line bg-raised text-muted", className)}>
      <Icon className="size-4" strokeWidth={1.75} />
    </span>
  );
}
