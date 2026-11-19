"use client";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

/** Confirmação de ações destrutivas. */
export function ConfirmDialog({ open, onOpenChange, title, description, confirmLabel = "Confirmar", loading, onConfirm }: {
  open: boolean; onOpenChange: (open: boolean) => void; title: string; description?: React.ReactNode;
  confirmLabel?: string; loading?: boolean; onConfirm: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(o) => !loading && onOpenChange(o)}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={loading}>Voltar</Button>
          <Button variant="danger" onClick={onConfirm} loading={loading}>{confirmLabel}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
