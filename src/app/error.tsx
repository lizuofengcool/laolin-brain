'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { AlertTriangle, RotateCcw } from 'lucide-react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[GlobalError]', error);
  }, [error]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background p-4 text-center">
      <div className="max-w-md space-y-6">
        <div className="flex justify-center">
          <div className="relative">
            <AlertTriangle className="h-16 w-16 text-destructive animate-pulse" />
            <div className="absolute inset-0 rounded-full bg-destructive/10 blur-2xl" />
          </div>
        </div>
        <h2 className="text-2xl font-bold tracking-tight">哎呀，出了点问题</h2>
        <p className="text-muted-foreground leading-relaxed">
          应用遇到了一个意外错误。请尝试重试操作或刷新页面。如果问题持续存在，请联系开发者。
        </p>
        <div className="flex justify-center gap-3">
          <Button onClick={() => reset()} className="gap-2">
            <RotateCcw className="h-4 w-4" />
            重试
          </Button>
          <Button variant="secondary" onClick={() => window.location.reload()}>
            刷新页面
          </Button>
        </div>
        {process.env.NODE_ENV === 'development' && error.digest && (
          <p className="text-xs text-muted-foreground">Error digest: {error.digest}</p>
        )}
        {process.env.NODE_ENV === 'development' && (
          <div className="mt-4 rounded-lg bg-muted p-4 text-left text-sm overflow-auto max-h-48">
            <p className="font-mono text-destructive break-words">{error.message}</p>
            <pre className="mt-2 overflow-auto text-xs whitespace-pre-wrap break-words">{error.stack}</pre>
          </div>
        )}
      </div>
    </div>
  );
}
