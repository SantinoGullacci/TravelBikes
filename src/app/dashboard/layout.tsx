'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { Bike, ClipboardList, History, Wallet, LogOut, Tablet } from 'lucide-react';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [profile, setProfile] = useState<{ full_name: string; role: 'staff' | 'admin' } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkUser = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.replace('/login');
        return;
      }

      const { data } = await supabase
        .from('profiles')
        .select('full_name, role')
        .eq('id', session.user.id)
        .single();

      if (data) {
        setProfile(data as { full_name: string; role: 'staff' | 'admin' });
      }
      setLoading(false);
    };

    checkUser();
  }, [router]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.replace('/login');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-400 flex items-center justify-center">
        Verificando sesión...
      </div>
    );
  }

  const navItems = [
    { href: '/dashboard/rentals', label: 'Alquileres y Reservas', icon: ClipboardList },
    { href: '/dashboard/fleet', label: 'Estado de Flota / Stock', icon: Bike },
    { href: '/dashboard/my-history', label: 'Mi Historial', icon: History },
    ...(profile?.role === 'admin'
      ? [{ href: '/dashboard/cash-register', label: 'Control de Caja', icon: Wallet }]
      : []),
  ];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      {/* Barra superior */}
      <header className="bg-slate-900 border-b border-slate-800 px-6 py-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-6">
          <span className="text-xl font-extrabold text-white">
            Travel Bikes <span className="text-sky-400 text-sm font-semibold">Panel</span>
          </span>

          <nav className="flex items-center gap-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-semibold transition ${
                    active
                      ? 'bg-sky-600 text-white'
                      : 'text-slate-400 hover:text-white hover:bg-slate-800'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="flex items-center gap-4">
          <Link
            href="/kiosk"
            target="_blank"
            className="flex items-center gap-1.5 text-xs bg-slate-800 hover:bg-slate-700 text-sky-400 px-3 py-2 rounded-lg font-semibold transition"
          >
            <Tablet className="w-4 h-4" /> Abrir Modo Tablet
          </Link>
          <div className="text-right hidden sm:block">
            <p className="text-xs font-bold text-white">{profile?.full_name}</p>
            <p className="text-[11px] uppercase tracking-wider text-sky-400">{profile?.role}</p>
          </div>
          <button
            onClick={handleLogout}
            title="Cerrar sesión"
            className="p-2 rounded-lg bg-slate-800 hover:bg-rose-950 hover:text-rose-400 text-slate-400 transition"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      <main className="flex-1 p-6 max-w-7xl w-full mx-auto">{children}</main>
    </div>
  );
}