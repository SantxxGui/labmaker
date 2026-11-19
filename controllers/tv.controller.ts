/** CONTROLLER — Modo TV (monitor da recepção do espaço) */
import "server-only";
import { autorizar, handler, json } from "@/lib/api";
import { TvModel } from "@/models/tv.model";

export const TvController = {
  /** GET /api/tv — estado do espaço para a tela da recepção (atualiza a cada 5 s) */
  estado: handler(async () => {
    await autorizar("painel:ver");
    return json(await TvModel.estado(), { headers: { "Cache-Control": "no-store" } });
  }),
};
