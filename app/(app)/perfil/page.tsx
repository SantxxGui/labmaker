import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requirePageSession } from "@/lib/auth";
import { UsuarioModel } from "@/models/usuario.model";
import { PerfilView } from "@/views/perfil/perfil-view";

export const metadata: Metadata = { title: "Meu perfil" };

/** /perfil — qualquer pessoa logada: o próprio nome e a própria senha */
export default async function PerfilPage() {
  const s = await requirePageSession();
  const usuario = await UsuarioModel.perfil(s.sub);
  if (!usuario) redirect("/login");
  return <PerfilView inicial={usuario} />;
}
