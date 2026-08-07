import { redirect } from 'next/navigation';
import { getDashboardSession } from '../../lib/app-relay-auth/session';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'AppRelay Control Plane',
  description: 'Google Play Store APK & Split Artifact Acquisition Dashboard',
};

/**
 * Authoritative gate for every dashboard page. The middleware redirect is a
 * convenience; this check is the one that actually verifies the token, so a
 * forged cookie cannot render the UI.
 */
export default async function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getDashboardSession();
  if (!session) {
    redirect('/login');
  }

  return <>{children}</>;
}
