import './globals.css';

export const metadata = {
  title: 'AppRelay Control Plane — SinoMedia Release Ops',
  description: 'Google Play Store APK & Split Artifact Acquisition Dashboard',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="bg-slate-950 text-slate-100 antialiased">{children}</body>
    </html>
  );
}
