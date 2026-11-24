import { DispositivoController } from "@/controllers/dispositivo.controller";

/** POST /api/dispositivos/:id/tela/controle — pedir/devolver o controle remoto ou mandar mouse e teclado. */
export const POST = DispositivoController.telaControle;
