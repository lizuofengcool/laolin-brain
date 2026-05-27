import { Button } from '@/components/ui/button';
import { Home, FileQuestion } from 'lucide-react';
import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background p-4 text-center">
      <div className="max-w-md space-y-6">
        <div className="flex justify-center">
          <div className="relative">
            <FileQuestion className="h-20 w-20 text-muted-foreground/40" />
          </div>
        </div>
        <h1 className="text-7xl font-bold text-muted-foreground/20">404</h1>
        <h2 className="text-2xl font-bold tracking-tight">页面未找到</h2>
        <p className="text-muted-foreground leading-relaxed">
          您访问的页面不存在或已被移动。
        </p>
        <div className="flex justify-center">
          <Link href="/">
            <Button className="gap-2">
              <Home className="h-4 w-4" />
              返回首页
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
