import { Laptop } from "lucide-react";
import type { EmprestimoDTO } from "@/lib/types";
import { cn, formatDataHora } from "@/lib/utils";

/** Aviso para o aluno: o notebook do espaço que está com ele e até quando devolver. */
export function MeuEmprestimo({ emprestimos }: { emprestimos: EmprestimoDTO[] }) {
  if (emprestimos.length === 0) return null;
  return (
    <div className="space-y-2">
      {emprestimos.map((e) => {
        const atrasado = e.situacao === "ATRASADO";
        return (
          <div key={e.id} className={cn("glass flex items-center gap-3 rounded-2xl border px-5 py-3.5", atrasado ? "border-danger/40" : "border-line")}>
            <Laptop className={cn("size-5 shrink-0", atrasado ? "text-danger" : "text-signal")} />
            <p className="text-[13.5px] text-fg">
              Você está com o notebook <span className="font-mono">{e.dispositivo.hostname}</span> do espaço.{" "}
              <span className={atrasado ? "font-medium text-danger" : "text-muted"}>
                {atrasado ? `O prazo terminou em ${formatDataHora(e.prazoEm)} — devolva no balcão.` : `Devolva até ${formatDataHora(e.prazoEm)}.`}
              </span>
            </p>
          </div>
        );
      })}
    </div>
  );
}
