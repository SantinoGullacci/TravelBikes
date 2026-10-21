'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { Bike, ClipboardList, History, Wallet, LogOut, Tablet, Sun, Moon } from 'lucide-react';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [profile, setProfile] = useState<{ full_name: string; role: 'staff' | 'admin' } | null>(null);
  const [loading, setLoading] = useState(true);
  const [darkMode, setDarkMode] = useState(true);

  useEffect(() => {
    // Sincronizar tema guardado
    const storedTheme = localStorage.getItem('theme');
    if (storedTheme === 'light') {
      setDarkMode(false);
      document.documentElement.classList.remove('dark');
    } else {
      setDarkMode(true);
      document.documentElement.classList.add('dark');
    }

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

  const toggleTheme = () => {
    if (darkMode) {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
      setDarkMode(false);
    } else {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
      setDarkMode(true);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.replace('/login');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-100 dark:bg-zinc-950 text-slate-500 dark:text-zinc-400 flex items-center justify-center font-semibold tracking-wide">
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
    <div className="min-h-screen bg-slate-100 dark:bg-zinc-950 text-slate-900 dark:text-zinc-100 flex flex-col transition-colors">
      {/* Barra superior */}
      {/* Barra superior */}
      <header className="bg-white dark:bg-zinc-900 border-b border-slate-200 dark:border-zinc-800 relative shadow-xl transition-colors">
        <div className="px-4 sm:px-6 py-4 flex flex-col md:flex-row items-center justify-between gap-4">
          
          <div className="flex flex-col sm:flex-row items-center gap-4 w-full md:w-auto justify-between md:justify-start">
            <div className="flex items-center gap-2">
              <img 
                src="/logo.png" 
                alt="Travel Bikes Logo" 
                className="h-20 w-auto object-contain" 
              />
            </div>

            <nav className="flex flex-wrap items-center justify-center gap-1.5 w-full sm:w-auto">
              {navItems.map((item) => {
                const Icon = item.icon;
                const active = pathname.startsWith(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-extrabold uppercase tracking-wider transition ${
                      active
                        ? 'bg-orange-600 text-white shadow-md shadow-orange-600/30 dark:shadow-orange-950/50'
                        : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-zinc-800'
                    }`}
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    <span className="hidden sm:inline">{item.label}</span>
                  </Link>
                );
              })}
            </nav>
          </div>

          <div className="flex items-center gap-2.5 w-full md:w-auto justify-end">
            <button
              onClick={toggleTheme}
              className="p-2.5 rounded-xl bg-slate-100 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 text-slate-800 dark:text-zinc-200 hover:border-orange-500 transition shadow-sm flex items-center justify-center shrink-0"
              title="Cambiar tema claro / oscuro"
            >
              {darkMode ? <Sun className="w-4 h-4 text-orange-500" /> : <Moon className="w-4 h-4 text-orange-600" />}
            </button>

            <Link
              href="/kiosk"
              className="flex items-center gap-1.5 text-xs bg-slate-100 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 hover:border-orange-500/50 hover:bg-slate-200 dark:hover:bg-zinc-800 text-orange-600 dark:text-orange-400 px-3 py-2 rounded-xl font-bold transition shadow-sm"
            >
              <Tablet className="w-4 h-4 text-orange-600 dark:text-orange-500" /> 
              <span className="hidden sm:inline">Modo Tablet</span>
            </Link>

            <div className="text-right hidden lg:block">
              <p className="text-xs font-extrabold text-slate-900 dark:text-white">{profile?.full_name}</p>
              <p className="text-[10px] font-black uppercase tracking-widest text-orange-600 dark:text-orange-500">{profile?.role}</p>
            </div>

            <button
              onClick={handleLogout}
              title="Cerrar sesión"
              className="p-2.5 rounded-xl bg-slate-100 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 hover:border-red-700 hover:bg-red-950 hover:text-red-300 text-slate-500 dark:text-zinc-400 transition"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Franja tricolor dinámica según el modo claro u oscuro */}
        <div className="w-full h-2 bg-gradient-to-r from-zinc-900 dark:from-white via-orange-500 to-red-600 shadow-md" />
      </header>

      <main className="flex-1 p-6 max-w-7xl w-full mx-auto">{children}</main>
    </div>
  );
}