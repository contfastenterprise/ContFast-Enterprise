'use client';

import React, { createContext, useContext, useState, useCallback, useRef } from 'react';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { toast } from 'sonner';

export interface ConfirmOptions {
  title: string;
  description: React.ReactNode;
  confirmText?: string;
  cancelText?: string;
  variant?: 'destructive' | 'default';
  action?: () => Promise<void>;
  onSuccessMessage?: string;
  onErrorMessage?: string;
}

export type ConfirmFunction = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFunction | undefined>(undefined);

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<ConfirmOptions>({
    title: '',
    description: '',
  });
  const [isConfirming, setIsConfirming] = useState(false);
  
  const resolver = useRef<((value: boolean) => void) | null>(null);

  const confirm = useCallback((opts: ConfirmOptions): Promise<boolean> => {
    setOptions(opts);
    setOpen(true);
    setIsConfirming(false);
    return new Promise((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  const handleConfirm = useCallback(async () => {
    if (options.action) {
      setIsConfirming(true);
      try {
        await options.action();
        if (options.onSuccessMessage) {
          toast.success(options.onSuccessMessage);
        } else {
          toast.success('Registro eliminado correctamente.');
        }
        if (resolver.current) {
          resolver.current(true);
        }
      } catch (error) {
        console.error('Delete error:', error);
        if (options.onErrorMessage) {
          toast.error(options.onErrorMessage);
        } else {
          toast.error('No fue posible eliminar el registro.');
        }
        if (resolver.current) {
          resolver.current(false);
        }
      } finally {
        setIsConfirming(false);
        setOpen(false);
        resolver.current = null;
      }
    } else {
      // If no action is provided, we just resolve true and close.
      // (Used for simple confirmations where the caller handles the loading/toast)
      if (resolver.current) {
        resolver.current(true);
      }
      setOpen(false);
      resolver.current = null;
    }
  }, [options]);

  const handleCancel = useCallback(() => {
    if (resolver.current) {
      resolver.current(false);
      setOpen(false);
      resolver.current = null;
    }
  }, []);
  
  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <ConfirmDialog
        open={open}
        onOpenChange={(val) => {
          if (!val && !isConfirming) {
            handleCancel();
          }
        }}
        title={options.title}
        description={options.description}
        confirmText={options.confirmText}
        cancelText={options.cancelText}
        variant={options.variant}
        onConfirm={handleConfirm}
        onCancel={handleCancel}
        isConfirming={isConfirming}
      />
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const context = useContext(ConfirmContext);
  if (!context) {
    throw new Error('useConfirm must be used within a ConfirmProvider');
  }
  return context;
}
