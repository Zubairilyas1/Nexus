'use client';

import * as React from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { motion } from 'motion/react';
import { CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { AuthShell } from '@/components/auth/AuthShell';

function VerifyEmailContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token');
  const [status, setStatus] = React.useState<'verifying' | 'success' | 'error'>('verifying');
  const [message, setMessage] = React.useState('');

  React.useEffect(() => {
    let cancelled = false;

    async function verifyEmail() {
      if (!token) {
        setStatus('error');
        setMessage('No verification token provided');
        return;
      }

      try {
        const res = await fetch(`/api/auth/verify-email?token=${encodeURIComponent(token)}`);
        const data = await res.json();

        if (cancelled) return;

        if (!res.ok) {
          setStatus('error');
          setMessage(data.detail || 'Verification failed');
          return;
        }

        setStatus('success');
        setMessage(data.message || 'Email verified successfully!');
      } catch {
        if (!cancelled) {
          setStatus('error');
          setMessage('An unexpected error occurred');
        }
      }
    }

    verifyEmail();
    return () => {
      cancelled = true;
    };
  }, [token]);

  return (
    <AuthShell
      footer={
        <>
          Didn&apos;t receive the email?{' '}
          <Link href="/auth/register" className="font-medium text-primary hover:underline">
            Register again
          </Link>
        </>
      }
    >
      <CardHeader className="pb-4 text-center">
        {status === 'verifying' && (
          <>
            <Loader2 className="mx-auto mb-4 h-12 w-12 animate-spin text-primary" />
            <CardTitle className="text-heading-lg">Verifying your email</CardTitle>
            <CardDescription>Please wait while we verify your email address</CardDescription>
          </>
        )}
        {status === 'success' && (
          <>
            <motion.div
              initial={{ scale: 0.6, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 260, damping: 18 }}
              className="mb-4 flex justify-center"
            >
              <CheckCircle className="h-12 w-12 text-success" />
            </motion.div>
            <CardTitle className="text-heading-lg">Email verified</CardTitle>
            <CardDescription>{message}</CardDescription>
          </>
        )}
        {status === 'error' && (
          <>
            <AlertCircle className="mx-auto mb-4 h-12 w-12 text-destructive" />
            <CardTitle className="text-heading-lg">Verification failed</CardTitle>
            <CardDescription>{message}</CardDescription>
          </>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {status === 'success' && (
          <Button className="w-full" size="lg" asChild>
            <Link href="/auth/login">Continue to login</Link>
          </Button>
        )}
        {status === 'error' && (
          <Button variant="outline" className="w-full" asChild>
            <Link href="/auth/register">Try registering again</Link>
          </Button>
        )}
      </CardContent>
    </AuthShell>
  );
}

export default function VerifyEmailPage() {
  return (
    <React.Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-background">
          <Loader2 className="h-8 w-8 animate-spin text-primary" aria-label="Loading" />
        </div>
      }
    >
      <VerifyEmailContent />
    </React.Suspense>
  );
}
