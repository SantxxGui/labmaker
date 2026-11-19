import * as React from "react";
import { cn } from "@/lib/utils";

const campo =
  "w-full rounded-lg border border-line-strong bg-black/40 px-3 text-sm text-fg placeholder:text-subtle transition-colors hover:border-subtle focus:border-white/40 focus:outline-none focus:ring-[3px] focus:ring-white/[0.07] aria-[invalid=true]:border-danger disabled:cursor-not-allowed disabled:opacity-50";

type InputProps = React.InputHTMLAttributes<HTMLInputElement> & { leading?: React.ReactNode; trailing?: React.ReactNode };

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type = "text", leading, trailing, ...props }, ref) => {
    const input = (
      <input ref={ref} type={type} className={cn(campo, "peer h-10", leading && "pl-9", trailing && "pr-10", className)} {...props} />
    );
    if (!leading && !trailing) return input;
    return (
      <div className="relative">
        {input}
        {leading && (
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-subtle peer-focus:text-fg [&_svg]:size-4">{leading}</span>
        )}
        {trailing && <span className="absolute right-1 top-1/2 -translate-y-1/2">{trailing}</span>}
      </div>
    );
  },
);
Input.displayName = "Input";

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => <textarea ref={ref} className={cn(campo, "min-h-20 py-2.5", className)} {...props} />,
);
Textarea.displayName = "Textarea";

export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn("text-[13px] font-medium leading-none text-fg", className)} {...props} />;
}

/** Campo de formulário: rótulo + controle + dica opcional. */
export function Field({ label, htmlFor, hint, children, className }: {
  label: string; htmlFor?: string; hint?: string; children: React.ReactNode; className?: string;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint && <p className="text-xs text-subtle">{hint}</p>}
    </div>
  );
}
