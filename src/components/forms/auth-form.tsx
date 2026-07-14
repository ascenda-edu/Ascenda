'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { AuthError } from '@supabase/supabase-js';
import { loginSchema, type LoginFormValues } from '@/lib/validation/auth';
import { RETURNING_USER_STORAGE_KEY } from '@/lib/constants';
import { useSupabase } from '@/hooks/useSupabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { isProfileComplete } from '@/lib/profile/completion';

export const AuthForm = () => {
  const router = useRouter();
  const supabase = useSupabase();
  const [error, setError] = useState<string | null>(null);
  const [authServiceReady, setAuthServiceReady] = useState(true);
  const [isPending, startTransition] = useTransition();

  const form = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' }
  });

  useEffect(() => {
    let isMounted = true;
    supabase.auth.getSession().then(({ error: sessionError }) => {
      if (!isMounted) return;
      if (sessionError) {
        console.error('Supabase auth unavailable', sessionError);
        setAuthServiceReady(false);
        setError((prev) => prev ?? 'We could not reach the sign-in service. Please refresh and try again.');
      } else {
        setAuthServiceReady(true);
      }
    });

    return () => {
      isMounted = false;
    };
  }, [supabase]);

  const determineRedirectTarget = async (userId?: string | null) => {
    if (!userId) {
      const { data } = await supabase.auth.getUser();
      userId = data.user?.id ?? null;
    }
    if (!userId) {
      return '/dashboard';
    }

    const [personalResponse, academicResponse, lifestyleResponse, subjectResponse] = await Promise.all([
      supabase
        .from('student_personal_information')
        .select('first_name,last_name,email,nationality,resident_country')
        .eq('profile_id', userId)
        .maybeSingle(),
      supabase
        .from('student_academic_input')
        .select('programme_type,school_name,school_country,graduation_year,intended_clusters,english_required,english_status')
        .eq('profile_id', userId)
        .maybeSingle(),
      supabase.from('student_lifestyle_preference').select('extracurricular_interests').eq('profile_id', userId).maybeSingle(),
      supabase.from('student_subjects').select('id').eq('profile_id', userId)
    ]);

    const firstError = [personalResponse.error, academicResponse.error, lifestyleResponse.error, subjectResponse.error].find(Boolean);

    if (firstError) {
      console.error('Unable to determine onboarding status', firstError);
      return '/dashboard';
    }

    const needsOnboarding = !isProfileComplete({
      personal: personalResponse.data ?? null,
      academicInput: academicResponse.data ?? null,
      subjectCount: subjectResponse.data?.length ?? 0,
      lifestyle: lifestyleResponse.data ?? null
    });
    return needsOnboarding ? '/profile/wizard' : '/dashboard';
  };

  const formatAuthError = (authError: AuthError) => {
    const message = authError.message || 'Something went wrong.';
    if (/invalid login credentials/i.test(message)) {
      return 'Email or password looks incorrect. Double-check and try again.';
    }
    if (/over email rate limit/i.test(message) || authError.status === 429) {
      return 'Too many attempts. Please wait a moment before trying again.';
    }
    return message;
  };

  const onSubmit = (values: LoginFormValues) => {
    setError(null);
    if (!authServiceReady) {
      setError('Sign-in service is temporarily unavailable. Please refresh and try again.');
      return;
    }
    startTransition(async () => {
      const { error: signInError, data } = await supabase.auth.signInWithPassword(values);

      if (signInError) {
        setError(formatAuthError(signInError));
        return;
      }

      const redirectTarget = await determineRedirectTarget(data.user?.id);

      if (typeof window !== 'undefined') {
        window.localStorage.setItem(RETURNING_USER_STORAGE_KEY, 'true');
      }

      router.refresh();
      router.push(redirectTarget);
    });
  };

  return (
    <form className="form-stack" onSubmit={form.handleSubmit(onSubmit)}>
      <div className="form-field">
        <Label className="form-label" htmlFor="email">
          Email
        </Label>
        <Input id="email" type="email" autoComplete="email" className="form-input" {...form.register('email')} />
        {form.formState.errors.email ? (
          <p className="form-feedback form-feedback--error" role="alert">
            {form.formState.errors.email.message}
          </p>
        ) : null}
      </div>
      <div className="form-field">
        <Label className="form-label" htmlFor="password">
          Password
        </Label>
        <Input
          id="password"
          type="password"
          autoComplete="current-password"
          className="form-input"
          {...form.register('password')}
        />
        {form.formState.errors.password ? (
          <p className="form-feedback form-feedback--error" role="alert">
            {form.formState.errors.password.message}
          </p>
        ) : null}
      </div>
      {error ? (
        <p className="form-feedback form-feedback--error" role="alert">
          {error}
        </p>
      ) : null}
      <Button
        type="submit"
        className="form-action w-full"
        disabled={isPending || !authServiceReady}
        data-loading={isPending ? 'true' : undefined}
      >
        {isPending ? 'Please wait…' : 'Sign in'}
      </Button>
      <p className="text-center text-xs text-muted-foreground">
        Access is invite-only. If you need an account, contact your Ascenda administrator.
      </p>
    </form>
  );
};
