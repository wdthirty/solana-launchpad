'use client';

import { useState, useEffect, ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Lock } from 'lucide-react';
import { toast } from 'sonner';

const INTERNAL_PASSWORD = process.env.NEXT_PUBLIC_INTERNAL_PASSWORD || 'changeme';
const AUTH_STORAGE_KEY = 'internal_page_auth';

interface PasswordProtectionProps {
  children: ReactNode;
  title?: string;
  description?: string;
}

export function PasswordProtection({
  children,
  title = 'Protected Page',
  description = 'Enter the password to access this page.'
}: PasswordProtectionProps) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const storedAuth = sessionStorage.getItem(AUTH_STORAGE_KEY);
    if (storedAuth === 'true') {
      setIsAuthenticated(true);
    }
    setIsLoading(false);
  }, []);

  const handleLogin = () => {
    if (passwordInput === INTERNAL_PASSWORD) {
      setIsAuthenticated(true);
      sessionStorage.setItem(AUTH_STORAGE_KEY, 'true');
      toast.success('Access granted');
    } else {
      toast.error('Incorrect password');
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black">
        <div className="text-center space-y-4 max-w-sm p-6">
          <Lock className="w-12 h-12 mx-auto text-muted-foreground" />
          <h1 className="text-2xl font-semibold text-white">{title}</h1>
          <p className="text-muted-foreground">{description}</p>
          <div className="flex gap-2">
            <Input
              type="password"
              placeholder="Password"
              value={passwordInput}
              onChange={(e) => setPasswordInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
              className="bg-zinc-900 border-zinc-800"
            />
            <Button onClick={handleLogin}>Enter</Button>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
