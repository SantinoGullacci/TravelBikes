'use client';

import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { Bike, Zap, Caravan, Plus, Minus, CheckCircle2, Users, Calendar, ShoppingBag, CreditCard, Banknote, ArrowRightLeft, Clock, Sun, Moon, Trash2, LayoutDashboard, ShieldAlert } from 'lucide-react';

interface StockVariant {
  category_id: string;
  name: string;
  type: 'bike' | 'ebike' | 'accessory';
  wheel_size: string | null;
  frame_size: string | null;
  description: string | null;
  price_2h_cash: number;
  price_2h_transfer: number;
  price_1day_cash: number;
  price_1day_transfer: number;
  available_count: number;
}

export default function KioskCheckInPage() {
  const router = useRouter();
  const [variants, setVariants] = useState<StockVariant[]>([]);
  const [loading, setLoading] = useState(true);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [darkMode, setDarkMode] = useState(true);

  const [activeTab, setActiveTab] = useState<'bikes' | 'accessory'>('bikes');
  const [selectedQuantities, setSelectedQuantities] = useState<Record<string, number>>({});

  const [todayStr, setTodayStr] = useState('');

  const [formData, setFormData] = useState({
    customer_name: '',
    customer_dni: '',
    customer_phone: '',
    customer_address: '',
    people_count: 1,
    rental_type: 'day' as '2h' | 'day',
    days_count: 1,
    start_date: '',
    start_time: '09:00',
    payment_method: 'cash' as 'cash' | 'debit' | 'transfer',
  });

  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
  }, []);

  // 1. Validar sesión activa de empleado/admin al cargar la página
  useEffect(() => {
    let isMounted = true;

    const verifySession = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (isMounted) {
          if (!session) {
            setIsAuthorized(false);
          } else {
            setIsAuthorized(true);
          }
          setCheckingAuth(false);
        }
      } catch (err) {
        if (isMounted) {
          setIsAuthorized(false);
          setCheckingAuth(false);
        }
      }
    };

    verifySession();

    const currentDay = new Date().toISOString().split('T')[0];
    setTodayStr(currentDay);
    setFormData((prev) => ({
      ...prev,
      start_date: currentDay,
    }));

    const storedTheme = localStorage.getItem('theme');
    if (storedTheme === 'light') {
      setDarkMode(false);
      document.documentElement.classList.remove('dark');
    } else {
      setDarkMode(true);
      document.documentElement.classList.add('dark');
    }
    document.title = 'Travel Bikes - Kiosco';

    return () => {
      isMounted = false;
    };
  }, []);

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

  const fetchAvailableStock = async () => {
    setLoading(true);
    const [stockRes, catsRes, totalBikesRes] = await Promise.all([
      supabase
        .from('available_stock_by_category')
        .select('*')
        .order('name', { ascending: true }),
      supabase
        .from('catalog_categories')
        .select('id, price_2h_cash, price_2h_transfer, price_1day_cash, price_1day_transfer')
        .eq('active', true),
      supabase
        .from('bikes_inventory')
        .select('category_id'),
    ]);

    if (!stockRes.error && stockRes.data) {
      const catsMap = new Map(
        (catsRes.data || []).map((c) => [c.id, c])
      );

      const categoriesWithPhysicalUnits = new Set(
        (totalBikesRes.data || []).map((b) => b.category_id)
      );

      const mergedVariants = stockRes.data
        .filter((item: any) => catsMap.has(item.category_id) && categoriesWithPhysicalUnits.has(item.category_id))
        .map((item: any) => {
          const catPrices = catsMap.get(item.category_id)!;
          return {
            ...item,
            price_2h_cash: Number(catPrices.price_2h_cash ?? item.price_2h_cash ?? 0),
            price_2h_transfer: Number(catPrices.price_2h_transfer ?? item.price_2h_transfer ?? 0),
            price_1day_cash: Number(catPrices.price_1day_cash ?? item.price_1day_cash ?? 0),
            price_1day_transfer: Number(catPrices.price_1day_transfer ?? item.price_1day_transfer ?? 0),
          };
        });

      setVariants(mergedVariants as StockVariant[]);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (!isAuthorized) return;

    fetchAvailableStock();

    const channel = supabase
      .channel('realtime-kiosk-stock')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bikes_inventory' }, () => {
        fetchAvailableStock();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'catalog_categories' }, () => {
        fetchAvailableStock();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [isAuthorized]);

  const groupedModels = useMemo(() => {
    const filtered = variants.filter((v) =>
      activeTab === 'bikes' ? v.type === 'bike' || v.type === 'ebike' : v.type === 'accessory'
    );
    const groups: Record<string, StockVariant[]> = {};
    filtered.forEach((v) => {
      if (!groups[v.name]) groups[v.name] = [];
      groups[v.name].push(v);
    });
    return groups;
  }, [variants, activeTab]);

  const updateQuantity = (categoryId: string, delta: number, maxAvailable: number) => {
    setSelectedQuantities((prev) => {
      const current = prev[categoryId] || 0;
      const next = Math.max(0, Math.min(maxAvailable, current + delta));
      return { ...prev, [categoryId]: next };
    });
  };

  const removeItemCompletely = (categoryId: string) => {
    setSelectedQuantities((prev) => {
      const updated = { ...prev };
      delete updated[categoryId];
      return updated;
    });
  };

  const selectedList = useMemo(() => {
    return variants
      .filter((v) => (selectedQuantities[v.category_id] || 0) > 0)
      .map((v) => {
        let unitPrice = 0;
        const isTransferOrCard = formData.payment_method !== 'cash';

        if (formData.rental_type === '2h') {
          unitPrice = isTransferOrCard ? Number(v.price_2h_transfer) : Number(v.price_2h_cash);
        } else {
          unitPrice = isTransferOrCard ? Number(v.price_1day_transfer) : Number(v.price_1day_cash);
        }

        const multiplier = formData.rental_type === 'day' ? formData.days_count : 1;

        return {
          ...v,
          qty: selectedQuantities[v.category_id],
          unitPrice,
          subtotal: selectedQuantities[v.category_id] * unitPrice * multiplier,
        };
      });
  }, [variants, selectedQuantities, formData.payment_method, formData.rental_type, formData.days_count]);

  const totalSelectedItems = selectedList.reduce((acc, item) => acc + item.qty, 0);
  const totalAmount = selectedList.reduce((sum, item) => sum + item.subtotal, 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (totalSelectedItems === 0) {
      alert('Por favor, seleccioná al menos una bicicleta o accesorio.');
      return;
    }

    setSubmitting(true);
    try {
      const rentalId = crypto.randomUUID();
      const startObj = new Date(formData.start_date + 'T00:00:00');
      const endDate = new Date(startObj);
      if (formData.rental_type === 'day') {
        endDate.setDate(startObj.getDate() + formData.days_count);
      }

      const initialStatus = formData.start_date > todayStr ? 'reserved' : 'pending';
      const dbPaymentMethod = formData.payment_method === 'debit' ? 'bank' : formData.payment_method;
      
      const timeNote = formData.rental_type === '2h' ? `[Horario: ${formData.start_time} hs - 2 horas]` : null;

      const { error: rentalError } = await supabase.from('rentals').insert({
        id: rentalId,
        customer_name: formData.customer_name,
        customer_dni: formData.customer_dni,
        customer_phone: formData.customer_phone,
        customer_address: formData.customer_address,
        people_count: formData.people_count,
        days_count: formData.rental_type === '2h' ? 1 : formData.days_count,
        start_date: formData.start_date,
        end_date: endDate.toISOString().split('T')[0],
        payment_method: dbPaymentMethod,
        total_amount: totalAmount,
        status: initialStatus,
        is_paid: false,
        notes: timeNote,
      });

      if (rentalError) throw rentalError;

      const itemsToInsert: {
        rental_id: string;
        category_id: string;
        price_applied: number;
      }[] = [];

      selectedList.forEach((item) => {
        for (let i = 0; i < item.qty; i++) {
          itemsToInsert.push({
            rental_id: rentalId,
            category_id: item.category_id,
            price_applied: item.subtotal / item.qty,
          });
        }
      });

      const { error: itemsError } = await supabase.from('rental_items').insert(itemsToInsert);
      if (itemsError) throw itemsError;

      setSubmitted(true);
    } catch (err: any) {
      alert('Hubo un error al registrar el alquiler: ' + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const resetKiosk = () => {
    setSelectedQuantities({});
    setFormData({
      customer_name: '',
      customer_dni: '',
      customer_phone: '',
      customer_address: '',
      people_count: 1,
      rental_type: 'day',
      days_count: 1,
      start_date: todayStr,
      start_time: '09:00',
      payment_method: 'cash',
    });
    setActiveTab('bikes');
    setSubmitted(false);
    fetchAvailableStock();
  };

  const hoursOptions = useMemo(() => {
    const options: string[] = [];
    if (!now) return options;

    const isToday = formData.start_date === todayStr;
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();

    for (let h = 8; h <= 21; h++) {
      for (let m = 0; m < 60; m += 15) {
        if (h === 21 && m > 0) break;

        if (isToday) {
          if (h < currentHour || (h === currentHour && m <= currentMinute)) {
            continue;
          }
        }

        const hourStr = h < 10 ? `0${h}` : `${h}`;
        const minStr = m === 0 ? '00' : `${m}`;
        options.push(`${hourStr}:${minStr}`);
      }
    }
    return options;
  }, [formData.start_date, todayStr, now]);

  // --- CONTROLES DE RENDERIZADO CONDICIONAL (SIEMPRE AL FINAL, DESPUÉS DE LOS HOOKS) ---

  if (checkingAuth) {
    return (
      <div className="min-h-screen bg-slate-100 dark:bg-zinc-950 text-slate-500 dark:text-zinc-400 flex items-center justify-center font-semibold tracking-wide">
        Verificando seguridad del sistema...
      </div>
    );
  }

  if (!isAuthorized) {
    return (
      <div className="min-h-screen bg-slate-100 dark:bg-zinc-950 text-slate-900 dark:text-white flex flex-col items-center justify-center p-6 text-center transition-colors">
        <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 shadow-2xl rounded-3xl p-8 max-w-md w-full space-y-6 relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-orange-500 via-red-600 to-zinc-900" />
          <div className="w-16 h-16 bg-red-100 dark:bg-red-950/60 text-red-600 dark:text-red-400 rounded-2xl flex items-center justify-center mx-auto">
            <ShieldAlert className="w-8 h-8" />
          </div>
          <div className="space-y-2">
            <h1 className="text-2xl font-black uppercase tracking-wider">Acceso Restringido</h1>
            <p className="text-sm text-slate-600 dark:text-zinc-400">
              Para utilizar el Kiosco de Travel Bikes, es obligatorio iniciar sesión con una cuenta de personal autorizada en este navegador.
            </p>
          </div>
          <button
            onClick={() => router.push('/login')}
            className="w-full py-3.5 bg-orange-600 hover:bg-orange-500 text-white rounded-xl font-extrabold uppercase tracking-wider text-sm transition shadow-lg shadow-orange-600/30"
          >
            Iniciar Sesión
          </button>
        </div>
      </div>
    );
  }

  if (submitted) {
    const isReservation = formData.start_date > todayStr;
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-zinc-950 text-slate-900 dark:text-white flex flex-col items-center justify-center p-6 text-center transition-colors">
        <CheckCircle2 className="w-24 h-24 text-orange-600 dark:text-orange-500 mb-6 animate-bounce" />
        <h1 className="text-4xl font-extrabold uppercase tracking-wider mb-3">
          {isReservation ? '¡Reserva Registrada!' : '¡Pedido Registrado!'}
        </h1>
        <p className="text-xl text-slate-600 dark:text-zinc-300 max-w-md mb-8">
          Gracias, <span className="font-bold text-slate-900 dark:text-white">{formData.customer_name}</span>.{' '}
          {isReservation
            ? `Tu reserva quedó agendada para el ${formData.start_date}.`
            : 'Devolvele la tablet al vendedor para retirar tus bicicletas.'}
        </p>
        <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 shadow-xl rounded-2xl p-6 mb-8 w-full max-w-md relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-zinc-900 dark:from-white via-orange-500 to-red-600" />
          <p className="text-slate-500 dark:text-zinc-400 text-sm uppercase tracking-wider font-semibold">Total a abonar</p>
          <p className="text-4xl font-black text-orange-600 dark:text-orange-500 mt-1">
            ${totalAmount.toLocaleString('es-AR')}
          </p>
        </div>
        <button
          onClick={resetKiosk}
          className="px-8 py-4 bg-orange-600 hover:bg-orange-500 text-white rounded-xl font-extrabold uppercase tracking-wider text-lg transition shadow-lg shadow-orange-600/30"
        >
          Continuar
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-zinc-950 text-slate-900 dark:text-zinc-100 p-4 md:p-8 max-w-6xl mx-auto transition-colors">
      <header className="mb-6 pb-4">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 px-2">
          <div>
            <div className="flex items-center gap-2.5">
              <img 
                src="/logo.png" 
                alt="Travel Bikes Logo" 
                className="h-20 md:h-22 w-auto object-contain" 
              />
            </div>
            <p className="text-orange-600 dark:text-orange-500 font-extrabold tracking-widest uppercase text-xs mt-1">
              Puerto Madryn
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push('/dashboard/rentals')}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 text-slate-800 dark:text-zinc-200 hover:border-orange-500 text-xs font-extrabold uppercase tracking-wider transition shadow-sm"
              title="Volver al panel de administración"
            >
              <LayoutDashboard className="w-4 h-4 text-orange-600 dark:text-orange-500" /> Ir al Dashboard
            </button>

            <button
              onClick={toggleTheme}
              className="p-2.5 rounded-xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 text-slate-800 dark:text-zinc-200 hover:border-orange-500 transition shadow-sm flex items-center justify-center shrink-0"
              title="Cambiar tema claro / oscuro"
            >
              {darkMode ? <Sun className="w-4 h-4 text-orange-500" /> : <Moon className="w-4 h-4 text-orange-600" />}
            </button>
          </div>
        </div>

        <div className="mt-5 w-full h-2 bg-gradient-to-r from-zinc-900 dark:from-white via-orange-500 to-red-600 shadow-md" />
      </header>

      <form onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="lg:col-span-7 space-y-6">
          <div className="bg-white dark:bg-zinc-900 p-5 rounded-2xl border border-slate-200 dark:border-zinc-800 space-y-4 shadow-xl transition-colors">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400 mb-2">
                Duración del Alquiler
              </label>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { id: '2h', label: '2 Horas', icon: Clock },
                  { id: 'day', label: 'Por Día(s)', icon: Calendar },
                ].map((t) => {
                  const Icon = t.icon;
                  const active = formData.rental_type === t.id;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setFormData({ ...formData, rental_type: t.id as any })}
                      className={`flex items-center justify-center gap-2 py-3 px-4 rounded-xl font-bold text-sm border transition ${
                        active
                          ? 'bg-orange-600 border-orange-500 text-white shadow-md shadow-orange-600/30 dark:shadow-orange-950/50'
                          : 'bg-slate-50 dark:bg-zinc-950 border-slate-200 dark:border-zinc-800 text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white'
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                      {t.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="flex items-center gap-2 text-xs text-slate-700 dark:text-zinc-300 mb-1.5 font-bold">
                  <Calendar className="w-4 h-4 text-orange-600 dark:text-orange-500" /> Fecha de inicio / retiro
                </label>
                <input
                  type="date"
                  required
                  min={todayStr || undefined}
                  value={formData.start_date}
                  onChange={(e) => {
                    const newDate = e.target.value;
                    setFormData((prev) => {
                      const isNowToday = newDate === todayStr;
                      const nowH = new Date().getHours();
                      const nowM = new Date().getMinutes();
                      let newTime = prev.start_time;

                      if (isNowToday) {
                        const [hStr, mStr] = prev.start_time.split(':');
                        if (parseInt(hStr) < nowH || (parseInt(hStr) === nowH && parseInt(mStr) <= nowM)) {
                          newTime = '09:00';
                        }
                      }

                      return { ...prev, start_date: newDate, start_time: newTime };
                    });
                  }}
                  className="w-full p-3.5 rounded-xl bg-slate-50 dark:bg-zinc-950 border border-slate-300 dark:border-zinc-700 text-slate-900 dark:text-white font-bold text-sm focus:border-orange-600 dark:focus:border-orange-500 outline-none transition dark:[color-scheme:dark]"
                />
              </div>

              {formData.rental_type === '2h' ? (
                <div>
                  <label className="flex items-center gap-2 text-xs text-slate-700 dark:text-zinc-300 mb-1.5 font-bold">
                    <Clock className="w-4 h-4 text-orange-600 dark:text-orange-500" /> Horario (08:00 a 21:00 hs)
                  </label>
                  <select
                    value={formData.start_time}
                    onChange={(e) => setFormData({ ...formData, start_time: e.target.value })}
                    className="w-full p-3.5 rounded-xl bg-slate-50 dark:bg-zinc-950 border border-slate-300 dark:border-zinc-700 text-slate-900 dark:text-white font-bold text-sm focus:border-orange-600 dark:focus:border-orange-500 outline-none transition"
                  >
                    {hoursOptions.length === 0 ? (
                      <option value="" disabled>No hay horarios disponibles hoy</option>
                    ) : (
                      hoursOptions.map((time) => (
                        <option key={time} value={time}>
                          {time} hs
                        </option>
                      ))
                    )}
                  </select>
                </div>
              ) : (
                <div>
                  <label className="flex items-center gap-2 text-xs text-slate-700 dark:text-zinc-300 mb-1.5 font-bold">
                    <Calendar className="w-4 h-4 text-orange-600 dark:text-orange-500" /> Cantidad de días
                  </label>
                  <div className="flex items-center justify-between bg-slate-50 dark:bg-zinc-950 rounded-xl p-1.5 border border-slate-300 dark:border-zinc-700">
                    <button
                      type="button"
                      onClick={() => setFormData({ ...formData, days_count: Math.max(1, formData.days_count - 1) })}
                      className="p-2 bg-slate-200 dark:bg-zinc-800 hover:bg-slate-300 dark:hover:bg-zinc-700 text-slate-800 dark:text-white rounded-lg active:scale-95 transition"
                    >
                      <Minus className="w-4 h-4" />
                    </button>
                    <span className="text-lg font-extrabold text-slate-900 dark:text-white">{formData.days_count}</span>
                    <button
                      type="button"
                      onClick={() => setFormData({ ...formData, days_count: formData.days_count + 1 })}
                      className="p-2 bg-orange-600 hover:bg-orange-500 text-white rounded-lg active:scale-95 transition"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div>
              <label className="flex items-center gap-2 text-xs text-slate-700 dark:text-zinc-300 mb-2 font-bold">
                <Users className="w-4 h-4 text-orange-600 dark:text-orange-500" /> ¿Cuántas personas son?
              </label>
              <div className="flex items-center justify-between bg-slate-50 dark:bg-zinc-950 rounded-xl p-2 border border-slate-300 dark:border-zinc-800 max-w-xs">
                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, people_count: Math.max(1, formData.people_count - 1) })}
                  className="p-2 bg-slate-200 dark:bg-zinc-800 hover:bg-slate-300 dark:hover:bg-zinc-700 text-slate-800 dark:text-white rounded-lg active:scale-95 transition"
                >
                  <Minus className="w-4 h-4" />
                </button>
                <span className="text-xl font-extrabold text-slate-900 dark:text-white">{formData.people_count}</span>
                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, people_count: formData.people_count + 1 })}
                  className="p-2 bg-orange-600 hover:bg-orange-500 text-white rounded-lg active:scale-95 transition"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 bg-white dark:bg-zinc-900 p-1.5 rounded-2xl border border-slate-200 dark:border-zinc-800 shadow-md transition-colors">
            {[
              { id: 'bikes', label: 'Bicicletas', icon: Bike },
              { id: 'accessory', label: 'Accesorios', icon: Caravan },
            ].map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`flex items-center justify-center gap-2 py-3.5 px-4 rounded-xl font-extrabold uppercase tracking-wider text-xs transition ${
                    isActive
                      ? 'bg-orange-600 text-white shadow-md shadow-orange-600/30 dark:shadow-orange-950/50'
                      : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  <Icon className="w-5 h-5" />
                  {tab.label}
                </button>
              );
            })}
          </div>

          {loading ? (
            <p className="text-slate-500 dark:text-zinc-400 py-8 text-center font-medium">Cargando catálogo...</p>
          ) : (
            <div className="space-y-4">
              {Object.entries(groupedModels).map(([modelName, modelVariants]) => (
                <div key={modelName} className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-2xl p-5 space-y-4 shadow-xl transition-colors">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-xl font-extrabold text-slate-900 dark:text-white tracking-tight">{modelName}</h3>
                      {modelVariants[0].type === 'ebike' && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-orange-100 dark:bg-orange-500/20 text-orange-700 dark:text-orange-400 border border-orange-200 dark:border-orange-500/30">
                          <Zap className="w-3.5 h-3.5" /> Eléctrica
                        </span>
                      )}
                    </div>
                    {modelVariants[0].description && (
                      <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">{modelVariants[0].description}</p>
                    )}
                  </div>

                  <div className="divide-y divide-slate-100 dark:divide-zinc-800/80">
                    {modelVariants.map((variant) => {
                      const qty = selectedQuantities[variant.category_id] || 0;
                      const outOfStock = variant.available_count === 0;

                      const isTransferOrCard = formData.payment_method !== 'cash';
                      let displayPrice = 0;
                      if (formData.rental_type === '2h') {
                        displayPrice = isTransferOrCard ? Number(variant.price_2h_transfer) : Number(variant.price_2h_cash);
                      } else {
                        displayPrice = isTransferOrCard ? Number(variant.price_1day_transfer) : Number(variant.price_1day_cash);
                      }

                      return (
                        <div key={variant.category_id} className="py-3.5 first:pt-1 last:pb-0 flex items-center justify-between gap-4">
                          <div className="flex flex-wrap items-center gap-2">
                            {variant.wheel_size && (
                              <span className="px-2.5 py-1 rounded-lg bg-orange-50 dark:bg-zinc-950 text-orange-700 dark:text-orange-400 border border-orange-200 dark:border-orange-500/40 text-xs font-extrabold">
                                {variant.wheel_size}
                              </span>
                            )}
                            {variant.frame_size && (
                              <span className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-zinc-800 text-slate-700 dark:text-white text-xs font-bold">
                                Talle {variant.frame_size}
                              </span>
                            )}
                            <span className="text-slate-900 dark:text-white font-black text-sm ml-1">
                              ${Number(displayPrice).toLocaleString('es-AR')}{' '}
                              <span className="text-orange-600 dark:text-orange-500 font-bold text-xs">
                                {formData.rental_type === '2h' ? '/ 2hs' : '/ día'}
                              </span>
                            </span>
                            <span className={`text-xs font-bold ${outOfStock ? 'text-red-600 dark:text-red-500' : 'text-slate-500 dark:text-zinc-400'}`}>
                              ({outOfStock ? 'Agotado' : `${variant.available_count} disp.`})
                            </span>
                          </div>

                          <div className="flex items-center gap-2.5">
                            <button
                              type="button"
                              disabled={qty === 0}
                              onClick={() => updateQuantity(variant.category_id, -1, variant.available_count)}
                              className="p-2.5 rounded-xl bg-slate-100 dark:bg-zinc-800 hover:bg-slate-200 dark:hover:bg-zinc-700 text-slate-800 dark:text-white disabled:opacity-25 active:scale-95 transition"
                            >
                              <Minus className="w-4 h-4" />
                            </button>
                            <span className="w-6 text-center text-lg font-extrabold text-slate-900 dark:text-white">{qty}</span>
                            <button
                              type="button"
                              disabled={qty >= variant.available_count || outOfStock}
                              onClick={() => updateQuantity(variant.category_id, 1, variant.available_count)}
                              className="p-2.5 rounded-xl bg-orange-600 hover:bg-orange-500 text-white disabled:opacity-25 active:scale-95 transition shadow-md shadow-orange-600/30 dark:shadow-orange-950/40"
                            >
                              <Plus className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="lg:col-span-5 space-y-6">
          <div className="bg-white dark:bg-zinc-900 p-5 rounded-2xl border border-slate-200 dark:border-zinc-800 space-y-3 shadow-xl transition-colors">
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400">
              Método de Pago (Aplica tarifa automática)
            </label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { id: 'cash', label: 'Efectivo', icon: Banknote },
                { id: 'debit', label: 'Débito', icon: CreditCard },
                { id: 'transfer', label: 'Transferencia', icon: ArrowRightLeft },
              ].map((m) => {
                const Icon = m.icon;
                const active = formData.payment_method === m.id;
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setFormData({ ...formData, payment_method: m.id as any })}
                    className={`flex flex-col items-center justify-center gap-1.5 p-3 rounded-xl font-bold text-xs border transition ${
                      active
                        ? 'bg-orange-600 border-orange-500 text-white shadow-md shadow-orange-600/30 dark:shadow-orange-950/50'
                        : 'bg-slate-50 dark:bg-zinc-950 border-slate-200 dark:border-zinc-800 text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    {m.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="bg-white dark:bg-zinc-900 p-5 rounded-2xl border border-slate-200 dark:border-zinc-800 shadow-xl transition-colors">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400 flex items-center gap-2 mb-3">
              <ShoppingBag className="w-4 h-4 text-orange-600 dark:text-orange-500" /> Tu Selección ({totalSelectedItems})
            </h2>
            {selectedList.length === 0 ? (
              <p className="text-sm text-slate-400 dark:text-zinc-500 italic">Todavía no elegiste bicicletas ni accesorios.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {selectedList.map((item) => (
                  <li key={item.category_id} className="flex justify-between items-center bg-slate-50 dark:bg-zinc-950 px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-zinc-800">
                    <div className="flex-1 pr-2">
                      <span className="font-extrabold text-orange-600 dark:text-orange-500">{item.qty}x</span>{' '}
                      <span className="font-bold text-slate-900 dark:text-white">{item.name}</span>{' '}
                      <span className="text-xs text-slate-500 dark:text-zinc-400 font-medium">
                        {[item.wheel_size, item.frame_size ? `Talle ${item.frame_size}` : null]
                          .filter(Boolean)
                          .join(' • ')}
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-black text-slate-900 dark:text-white">
                        ${item.subtotal.toLocaleString('es-AR')}
                      </span>
                      <button
                        type="button"
                        onClick={() => removeItemCompletely(item.category_id)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/50 transition"
                        title="Quitar de la selección"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="bg-white dark:bg-zinc-900 p-6 rounded-2xl border border-slate-200 dark:border-zinc-800 space-y-4 shadow-xl relative overflow-hidden transition-colors">
            <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-orange-500 via-red-600 to-zinc-900 dark:to-white" />
            <h2 className="text-xl font-extrabold text-slate-900 dark:text-white tracking-tight">Tus Datos</h2>

            <div>
              <label className="block text-xs text-slate-700 dark:text-zinc-300 font-bold mb-1">Nombre y Apellido</label>
              <input
                type="text"
                required
                placeholder="Ej. Juan Pérez"
                value={formData.customer_name}
                onChange={(e) => setFormData({ ...formData, customer_name: e.target.value })}
                className="w-full p-3.5 rounded-xl bg-slate-50 dark:bg-zinc-950 border border-slate-300 dark:border-zinc-800 text-slate-900 dark:text-white text-base focus:border-orange-600 dark:focus:border-orange-500 outline-none transition"
              />
            </div>

            <div>
              <label className="block text-xs text-slate-700 dark:text-zinc-300 font-bold mb-1">Alojamiento / Dirección</label>
              <input
                type="text"
                required
                placeholder="Ej. Hotel Las Restingas / Calle 9 de Julio 123"
                value={formData.customer_address}
                onChange={(e) => setFormData({ ...formData, customer_address: e.target.value })}
                className="w-full p-3.5 rounded-xl bg-slate-50 dark:bg-zinc-950 border border-slate-300 dark:border-zinc-800 text-slate-900 dark:text-white text-base focus:border-orange-600 dark:focus:border-orange-500 outline-none transition"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-slate-700 dark:text-zinc-300 font-bold mb-1">DNI / Pasaporte</label>
                <input
                  type="text"
                  inputMode="numeric"
                  required
                  placeholder="Sin puntos"
                  value={formData.customer_dni}
                  onChange={(e) => setFormData({ ...formData, customer_dni: e.target.value })}
                  className="w-full p-3.5 rounded-xl bg-slate-50 dark:bg-zinc-950 border border-slate-300 dark:border-zinc-800 text-slate-900 dark:text-white text-base focus:border-orange-600 dark:focus:border-orange-500 outline-none transition"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-700 dark:text-zinc-300 font-bold mb-1">Teléfono / WhatsApp</label>
                <input
                  type="tel"
                  inputMode="tel"
                  required
                  placeholder="Ej. 2804123456"
                  value={formData.customer_phone}
                  onChange={(e) => setFormData({ ...formData, customer_phone: e.target.value })}
                  className="w-full p-3.5 rounded-xl bg-slate-50 dark:bg-zinc-950 border border-slate-300 dark:border-zinc-800 text-slate-900 dark:text-white text-base focus:border-orange-600 dark:focus:border-orange-500 outline-none transition"
                />
              </div>
            </div>

            <div className="pt-4 border-t border-slate-200 dark:border-zinc-800 flex items-center justify-between gap-4">
              <div>
                <p className="text-xs text-slate-500 dark:text-zinc-400 font-bold">
                  Total ({formData.rental_type === '2h' ? `2 Horas (${formData.start_time} hs)` : `${formData.days_count} día/s`})
                </p>
                <p className="text-3xl font-black text-orange-600 dark:text-orange-500">
                  ${totalAmount.toLocaleString('es-AR')}
                </p>
              </div>
              <button
                type="submit"
                disabled={submitting || totalSelectedItems === 0}
                className="px-6 py-4 bg-gradient-to-r from-orange-600 to-red-600 hover:from-orange-500 hover:to-red-500 disabled:opacity-40 text-white font-extrabold uppercase tracking-wider rounded-xl text-sm transition active:scale-95 shadow-lg shadow-orange-600/30 dark:shadow-orange-950/60"
              >
                {submitting ? 'Enviando...' : formData.start_date > todayStr ? 'Confirmar Reserva' : 'Confirmar Alquiler'}
              </button>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}