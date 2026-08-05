import type { Metadata } from 'next';
import { AuthForm } from '@/components/forms/auth-form';

export const metadata: Metadata = {
  title: 'Sign in'
};

export default function LoginPage() {
  return (
    <div className="surface-card space-y-6">
      <div className="space-y-3">
        {/* `bg-card/60` on a `surface-card` was white-on-white with a grey hairline —
            invisible as a pill, and the first thing anyone sees on sign-in. */}
        <span className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-medium text-foreground shadow-e-1 backdrop-blur">
          <span className="h-2 w-2 rounded-full bg-success-fill" aria-hidden />
          Invite-only access
        </span>
        <div className="space-y-1">
          <h1 className="font-heading text-3xl font-semibold tracking-tight">Sign in</h1>
          <p className="text-sm text-muted-foreground">Welcome back. Use your email and password to continue.</p>
        </div>
      </div>
      <AuthForm />
    </div>
  );
}
