import type { Metadata } from "next";
import { requirePageSession } from "@/lib/auth";
import { UsuarioModel } from "@/models/usuario.model";
import { UsuariosView } from "@/views/usuarios/usuarios-view";

export const metadata: Metadata = { title: "Usuários" };

export default async function UsuariosPage() {
  const session = await requirePageSession("usuario:gerenciar");
  return <UsuariosView inicial={await UsuarioModel.listar()} euId={session.sub} />;
}
