import { requirePageSession } from "@/lib/auth";
import { AppShell } from "@/views/shell/app-shell";

/** Layout da área autenticada: exige sessão e monta a navegação conforme o perfil. */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await requirePageSession();
  return <AppShell session={session}>{children}</AppShell>;
}
