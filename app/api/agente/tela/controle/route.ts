import { AgenteController } from "@/controllers/agente.controller";

/** POST /api/agente/tela/controle — o agente busca os eventos de mouse/teclado do Líder (espera longa). */
export const POST = AgenteController.controle;
