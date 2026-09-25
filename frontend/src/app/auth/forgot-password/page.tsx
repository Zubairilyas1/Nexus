'use client';

import * as React from 'react';
import Link from 'next/link';
import { Mail, AlertCircle, CheckCircle } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { Label } from '@/components/ui/Label';
import { Alert, AlertDescription } from '@/components/ui/Alert';
import { AuthShell } from '@/components/auth/AuthShell';

export default function ForgotPasswordPage() {
  const [email, setEmail] = React.useState('');
  const [status, setStatus] = React.useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [message, setMessage] = React.useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus('loading');
    setMessage('');

    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });

      const data = await res.json();

      if (!res.ok) {
        setStatus('error');
        setMessage(data.detail || 'Request failed');
        return;
      }

      setStatus('success');
      setMessage(data.message || 'If the email exists, a password reset link has been sent.');
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
        <CardTitle className="text-heading-lg">Forgot password?</CardTitle>
        <CardDescription>Enter your email to receive a password reset link</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {status === 'success' ? (
          <div className="space-y-4">
            <Alert variant="success">
              <CheckCircle className="h-4 w-4" />
              <AlertDescription>{message}</AlertDescription>
            </Alert>
            <Button asChild className="w-full" size="lg">
              <Link href="/auth/login">Back to login</Link>
            </Button>
          </div>
        ) : (
          <>
            {status === 'error' ? (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{message}</AlertDescription>
              </Alert>
            ) : null}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <div className="relative">
                  <Mail className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="pl-10"
                    required
                    disabled={status === 'loading'}
                    autoComplete="email"
                    autoFocus
                  />
                </div>
              </div>

              <Button
                type="submit"
                className="w-full"
                size="lg"
                disabled={status === 'loading'}
                loading={status === 'loading'}
              >
                {status === 'loading' ? 'Sending...' : 'Send reset link'}
              </Button>
            </form>
          </>
        )}
      </CardContent>
    </AuthShell>
  );
}
