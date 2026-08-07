'use server';

// Authentication server actions for the dashboard login form.
//
// These are intentionally 'use server' — a login endpoint is meant to be
// callable from the browser. Unlike the job actions, they grant no privilege on
// their own: signInOperator verifies the password against Supabase Auth and the
// resulting session lives in an httpOnly cookie the client cannot read.

import { redirect } from 'next/navigation';
import { signInOperator, signOutOperator } from '../../lib/app-relay-auth/session';

export interface LoginFormState {
  error?: string;
}

export async function loginAction(
  _prevState: LoginFormState,
  formData: FormData
): Promise<LoginFormState> {
  const email = String(formData.get('email') || '').trim();
  const password = String(formData.get('password') || '');

  if (!email || !password) {
    return { error: 'Email and password are required.' };
  }

  const result = await signInOperator(email, password);
  if (!result.ok) {
    return { error: result.message };
  }

  redirect('/dash/release-ops/app-relay');
}

export async function logoutAction(): Promise<void> {
  await signOutOperator();
  redirect('/login');
}
