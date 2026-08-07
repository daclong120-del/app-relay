import { redirect } from 'next/navigation';
import { getDashboardSession } from '../../lib/app-relay-auth/session';
import { LoginForm } from './login-form';

export const dynamic = 'force-dynamic';

export default async function LoginPage() {
  const session = await getDashboardSession();
  if (session) {
    redirect('/dash/release-ops/app-relay');
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <h1 className="mb-1 text-xl font-semibold text-slate-100">AppRelay Control Plane</h1>
        <p className="mb-6 text-sm text-slate-400">Sign in with your operator account.</p>
        <LoginForm />
      </div>
    </main>
  );
}
