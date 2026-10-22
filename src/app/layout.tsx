import type { Metadata } from 'next' // o 'next' según tu config
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Staff | Travel Bikes',
  description: 'Panel de control y gestión para el staff de Travel Bikes',
  icons: {
    icon: '/logo.png', // Asegura que use tu logo como favicon
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es" suppressHydrationWarning>
      <body className={`${inter.className} bg-slate-50 dark:bg-zinc-950 text-slate-900 dark:text-zinc-100 transition-colors`}>
        {children}
      </body>
    </html>
  );
}