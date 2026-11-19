import type { Metadata } from "next";
import { AuthForm } from "@/views/auth/auth-form";
import { AuthShell } from "@/views/auth/auth-shell";

export const metadata: Metadata = { title: "Entrar" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return (
    <AuthShell>
      <AuthForm mode="login" next={next} />
    </AuthShell>
  );
}
