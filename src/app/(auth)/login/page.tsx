import type { Metadata } from 'next';
import { AuthForm } from '@/components/forms/auth-form';

export const metadata: Metadata = {
  title: 'Sign in'
};

export default function LoginPage() {
  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="font-heading text-2xl font-semibold">Sign in</h1>
        <p className="text-sm text-muted-foreground">Welcome back. Use your email and password to continue.</p>
      </div>
      <AuthForm />
    </div>
  );
}
