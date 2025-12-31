import { Suspense } from 'react';
import { LoginForm } from '@/components/auth/LoginForm';

export const metadata = {
  title: 'Sign In - SubzCreator',
  description: 'Sign in to your SubzCreator account',
};

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0a0a0b] px-4">
      {/* Background gradient */}
      <div className="fixed inset-0 bg-gradient-to-br from-amber-500/5 via-transparent to-orange-500/5 pointer-events-none" />

      <div className="relative w-full max-w-md">
        {/* Logo/Brand */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-white tracking-tight">
            SubzCreator
          </h1>
          <p className="mt-2 text-white/50">
            Transcription & Subtitling Platform
          </p>
        </div>

        {/* Login Card */}
        <div className="p-8 bg-[#111113] rounded-2xl border border-white/[0.06] shadow-2xl">
          <div className="text-center mb-6">
            <h2 className="text-xl font-semibold text-white">
              Welcome back
            </h2>
            <p className="mt-1 text-sm text-white/50">
              Sign in to continue to your projects
            </p>
          </div>

          <Suspense fallback={<div className="animate-pulse h-64 bg-white/[0.03] rounded-xl" />}>
            <LoginForm />
          </Suspense>
        </div>

        {/* Footer */}
        <p className="mt-8 text-center text-xs text-white/30">
          Professional transcription and subtitling
        </p>
      </div>
    </div>
  );
}
