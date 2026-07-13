import { z } from 'zod';

export const loginSchema = z.object({
  email: z.string().email('Please enter a valid email address.'),
  password: z.string().min(8, 'Password must be at least 8 characters.')
});

// Kept for backwards-compatibility with existing imports.
export const authSchema = loginSchema;

export type LoginFormValues = z.infer<typeof loginSchema>;
export type AuthFormValues = LoginFormValues;
