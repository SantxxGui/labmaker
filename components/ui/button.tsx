import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "relative inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium tracking-[-0.01em] transition-colors duration-150 select-none disabled:pointer-events-none disabled:opacity-45 active:translate-y-px [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary:
          "bg-white text-zinc-950 hover:bg-zinc-200 shadow-[0_0_0_1px_rgba(255,255,255,0.12),0_0_28px_-8px_rgba(255,255,255,0.5)]",
        solid: "bg-white text-zinc-950 hover:bg-zinc-200",
        signal: "bg-signal text-zinc-950 hover:brightness-110 shadow-[0_0_28px_-8px_rgba(245,158,11,0.7)]",
        secondary: "border border-line-strong bg-white/[0.03] text-fg hover:bg-white/[0.07] hover:border-white/25",
        ghost: "text-muted hover:bg-raised hover:text-fg",
        danger: "border border-danger/30 bg-danger-soft text-danger hover:border-danger/60",
      },
      size: {
        sm: "h-8 px-3 text-[13px]",
        md: "h-9 px-4",
        lg: "h-11 px-5 text-[15px]",
        icon: "size-8",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  loading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild, loading, disabled, children, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp ref={ref} className={cn(buttonVariants({ variant, size }), className)} disabled={disabled || loading} {...props}>
        {asChild ? children : (<>{loading && <Loader2 className="animate-spin" />}{children}</>)}
      </Comp>
    );
  },
);
Button.displayName = "Button";
