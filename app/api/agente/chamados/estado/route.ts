import { AgenteController } from "@/controllers/agente.controller";

/** POST /api/agente/chamados/estado — a janelinha de chat lê a conversa e avisa que está aberta. */
export const POST = AgenteController.estadoChamado;
