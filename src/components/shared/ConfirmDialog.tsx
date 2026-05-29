"use client";

import { useRef } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

export function ConfirmDialog({
  open,
  title,
  description,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  description: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const actionTakenRef = useRef(false);
  const handleConfirm = () => { actionTakenRef.current = true; onConfirm(); };
  const handleCancelClick = () => { actionTakenRef.current = true; onCancel(); };
  const handleOpenChange = (v: boolean) => { if (!v && !actionTakenRef.current) onCancel(); actionTakenRef.current = false; };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">{description}</p>
        <DialogFooter>
          <Button variant="outline" onClick={handleCancelClick}>取消</Button>
          <Button variant="destructive" onClick={handleConfirm}>确认</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
