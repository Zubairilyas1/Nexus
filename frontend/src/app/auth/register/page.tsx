'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Mail, Lock, User, Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { AuthShell } from '@/components/auth/AuthShell';
import { validatePasswordStrength } from '@/lib/auth/password';

export default function RegisterPage() {
  const router = useRouter();

  const [name, setName] = React.useState('');
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [confirmPassword, setConfirmPassword] = React.useState('');
  const [showPassword, setShowPassword] = React.useState(false);
  const [isLoading, setIsLoading] = React.useState(false);
  const [formError, setFormError] = React.useState('');
  const [passwordStrength, setPasswordStrength] = React.useState<{ valid: boolean; message: string }>({
    valid: false,
    message: '',
  });

  const handlePasswordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setPassword(value);
    setPasswordStrength(validatePasswordStrength(value));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    if (password !== confirmPassword) {
      setFormError('Passwords do not match');
      return;
    }

    const strength = validatePasswordStrength(password);
    if (!strength.valid) {
      setFormError(strength.message);
      return;
    }

    setIsLoading(true);
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || 'Registration failed');
      }

      router.push('/auth/login?registered=true');
    } catch (err: any) {
      setFormError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AuthShell>
      <div className="text-center mb-8">
        <h2 className="text-2xl font-semibold text-white mb-2">Create an account</h2>
        <p className="text-sm text-zinc-400">Sign up to get started with NexusVision</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {formError && (
          <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/50 text-red-400 text-sm text-center">
            {formError}
          </div>
        )}

        <div className="space-y-2 text-left">
          <label className="text-sm font-medium text-zinc-300">Full Name</label>
          <div className="relative">
            <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-400" />
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-zinc-950/50 border border-cyan-500/30 rounded-lg py-3 pl-10 pr-4 text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400 transition-colors"
            />
          </div>
        </div>

        <div className="space-y-2 text-left">
          <label className="text-sm font-medium text-zinc-300">Email</label>
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-400" />
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-zinc-950/50 border border-cyan-500/30 rounded-lg py-3 pl-10 pr-4 text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400 transition-colors"
            />
          </div>
        </div>

        <div className="space-y-2 text-left">
          <label className="text-sm font-medium text-zinc-300">Password</label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-400" />
            <input
              type={showPassword ? 'text' : 'password'}
              required
              value={password}
              onChange={handlePasswordChange}
              className="w-full bg-zinc-950/50 border border-cyan-500/30 rounded-lg py-3 pl-10 pr-10 text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400 transition-colors"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-300 transition-colors"
            >
              {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
            </button>
          </div>
          {password && !passwordStrength.valid && (
            <p className="text-xs text-amber-400 mt-1">{passwordStrength.message}</p>
          )}
        </div>

        <div className="space-y-2 text-left">
          <label className="text-sm font-medium text-zinc-300">Confirm Password</label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-400" />
            <input
              type={showPassword ? 'text' : 'password'}
              required
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full bg-zinc-950/50 border border-cyan-500/30 rounded-lg py-3 pl-10 pr-10 text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400 transition-colors"
            />
          </div>
        </div>

        <Button
          type="submit"
          disabled={isLoading || (password.length > 0 && !passwordStrength.valid)}
          className="w-full bg-[#38bdf8] hover:bg-[#0ea5e9] text-white font-bold py-6 rounded-lg text-lg transition-colors"
        >
          Sign up
        </Button>
      </form>

      <div className="mt-6 text-center">
        <span className="text-sm text-zinc-400">
          Already have an account?{' '}
          <Link href="/auth/login" className="text-cyan-400 hover:text-cyan-300 transition-colors">
            Sign in
          </Link>
        </span>
      </div>
    </AuthShell>
  );
}
