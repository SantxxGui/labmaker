import type { Metadata } from "next";
import { AuthForm } from "@/views/auth/auth-form";
import { AuthShell } from "@/views/auth/auth-shell";

export const metadata: Metadata = { title: "Criar conta" };

export default function CadastroPage() {
  return (
    <AuthShell>
      <AuthForm mode="cadastro" />
    </AuthShell>
  );
}
