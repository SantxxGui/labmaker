import { AgenteController } from "@/controllers/agente.controller";

/** GET /i/:codigo — instalação do agente em um comando (script PowerShell ou sh). */
export const GET = AgenteController.instalar;
