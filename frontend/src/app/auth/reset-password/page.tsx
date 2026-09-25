'use client';

import * as React from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { motion } from 'motion/react';
import { Lock, AlertCircle, CheckCircle, Eye, EyeOff } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { Label } from '@/components/ui/Label';
import { Alert, AlertDescription } from '@/components/ui/Alert';
import { AuthShell } from '@/components/auth/AuthShell';
import { validatePasswordStrength } from '@/lib/auth/password';

function ResetPasswordContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token');
  const [password, setPassword] = React.useState('');
  const [confirmPassword, setConfirmPassword] = React.useState('');
  const [showPassword, setShowPassword] = React.useState(false);
  const [status, setStatus] = React.useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [message, setMessage] = React.useState('');
  const [passwordStrength, setPasswordStrength] = React.useState<{ valid: boolean; message: string }>({ valid: false, message: '' });

  const handlePasswordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setPassword(value);
    setPasswordStrength(validatePasswordStrength(value));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage('');

    if (password !== confirmPassword) {
      setStatus('error');
      setMessage('Passwords do not match');
      return;
    }

    const strength = validatePasswordStrength(password);
    if (!strength.valid) {
      setStatus('error');
      setMessage(strength.message);
      return;
    }

    if (!token) {
      setStatus('error');
      setMessage('No reset token provided');
      return;
    }

    setStatus('loading');

    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password, confirm_password: confirmPassword }),
      });

      const data = await res.json();

      if (!res.ok) {
        setStatus('error');
        setMessage(data.detail || 'Password reset failed');
        return;
      }

      setStatus('success');
      setMessage(data.message || 'Password reset successfully!');
    } catch {
      setStatus('error');
      setMessage('An unexpected error occurred');
    }
  };

  return (
    <AuthShell
      footer={
        <>
          Remember your password?{' '}
          <Link href="/auth/login" className="font-medium text-primary hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      <CardHeader className="pb-4 text-center">
        <CardTitle className="text-heading-lg">Reset password</CardTitle>
        <CardDescription>Enter your new password below</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {status === 'success' && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
            <Alert variant="success">
              <CheckCircle className="h-4 w-4" />
              <AlertDescription>{message}</AlertDescription>
            </Alert>
            <Button className="w-full" size="lg" asChild>
              <Link href="/auth/login">Go to login</Link>
            </Button>
          </motion.div>
        )}

        {status === 'error' && message && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{message}</AlertDescription>
          </Alert>
        )}

        {status !== 'success' && (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="password">New password</Label>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={handlePasswordChange}
                  placeholder="••••••••"
                  className="pl-10 pr-10"
                  required
                  autoFocus
                  disabled={status === 'loading'}
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
              {password && (
                <div className="space-y-1">
                  <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                    <motion.div
                      className={cn(
                        'h-full rounded-full transition-all duration-300',
                        passwordStrength.valid ? 'bg-success' : 'bg-destructive'
                      )}
                      initial={{ width: 0 }}
                      animate={{ width: passwordStrength.valid ? '100%' : '30%' }}
                    />
                  </div>
                  <p
                    className="text-caption"
                    style={{ color: passwordStrength.valid ? 'var(--success)' : 'var(--destructive)' }}
                  >
                    {passwordStrength.message || 'Password must be at least 8 chars with upper, lower, number, special'}
                  </p>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirm password</Label>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="confirmPassword"
                  type={showPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                  className="pl-10"
                  required
                  disabled={status === 'loading'}
                  autoComplete="new-password"
                />
              </div>
              {confirmPassword && confirmPassword !== password && (
                <p className="text-caption text-destructive">Passwords do not match</p>
              )}
            </div>

            <Button type="submit" className="w-full" size="lg" loading={status === 'loading'}>
              {status === 'loading' ? 'Resetting...' : 'Reset password'}
            </Button>
          </form>
        )}
      </CardContent>
    </AuthShell>
  );
}

export default function ResetPasswordPage() {
  return (
    <React.Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-background">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-muted border-t-primary" aria-label="Loading" />
        </div>
      }
    >
      <ResetPasswordContent />
    </React.Suspense>
  );
}
