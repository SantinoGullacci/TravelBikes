'use client';

import { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { Wallet, DollarSign, Calendar, RefreshCw, Banknote, CreditCard, ArrowRightLeft, Search } from 'lucide-react';

interface RentalTransaction {
  id: string;
  customer_name: string;
  customer_dni: string;
  payment_method: 'cash' | 'transfer' | 'bank';
  total_amount: number;
  created_at: string;
  end_date: string;
  status: string;
}

export default function CashRegisterPage() {
  const [rentals, setRentals] = useState<RentalTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const fetchCashData = async () => {
    setLoading(true);
    let query = supabase
      .from('rentals')
      .select('id, customer_name, customer_dni, payment_method, total_amount, created_at, end_date, status')
      .eq('is_paid', true)
      .order('created_at', { ascending: false });

    if (startDate) {
      query = query.gte('created_at', `${startDate}T00:00:00`);
    }
    if (endDate) {
      query = query.lte('created_at', `${endDate}T23:59:59`);
    }

    const { data, error } = await query;

    if (!error && data) {
      setRentals(data as RentalTransaction[]);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchCashData();

    const channel = supabase
      .channel('realtime-cash-register')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rentals' }, () => {
        fetchCashData();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [startDate, endDate]);

  const stats = useMemo(() => {
    let totalCash = 0;
    let totalTransfer = 0;
    let totalCard = 0;

    rentals.forEach((r) => {
      const amount = Number(r.total_amount) || 0;
      if (r.payment_method === 'cash') totalCash += amount;
      else if (r.payment_method === 'transfer') totalTransfer += amount;
      else if (r.payment_method === 'bank') totalCard += amount;
    });

    const grandTotal = totalCash + totalTransfer + totalCard;

    return { totalCash, totalTransfer, totalCard, grandTotal };
  }, [rentals]);

  const filteredRentals = rentals.filter((r) =>
    r.customer_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    r.customer_dni.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const paymentLabels: Record<string, { label: string; icon: any; color: string }> = {
    cash: { label: 'Efectivo', icon: Banknote, color: 'text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 border-emerald-200 dark:border-emerald-800' },
    transfer: { label: 'Transferencia', icon: ArrowRightLeft, color: 'text-orange-700 dark:text-orange-400 bg-orange-50 dark:bg-orange-950/60 border-orange-200 dark:border-orange-800' },
    bank: { label: 'Tarjeta / Débito', icon: CreditCard, color: 'text-sky-700 dark:text-sky-400 bg-sky-50 dark:bg-sky-950/60 border-sky-200 dark:border-sky-800' },
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black uppercase tracking-wider text-slate-900 dark:text-white">Control de Caja</h1>
          <p className="text-sm text-orange-600 dark:text-orange-500 font-semibold tracking-wide">Auditoría de ingresos y métodos de pago (Exclusivo Admin)</p>
        </div>
        <button
          onClick={fetchCashData}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 hover:border-orange-500/50 hover:bg-slate-50 dark:hover:bg-zinc-800 text-slate-800 dark:text-white text-sm font-bold transition shadow-md"
        >
          <RefreshCw className="w-4 h-4 text-orange-600 dark:text-orange-500" /> Actualizar
        </button>
      </div>

      <div className="bg-white dark:bg-zinc-900 p-4 rounded-2xl border border-slate-200 dark:border-zinc-800 shadow-xl flex flex-wrap items-center gap-4 transition-colors">
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-orange-600 dark:text-orange-500" />
          <span className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-zinc-300">Filtrar por fecha:</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="p-2.5 rounded-xl bg-slate-50 dark:bg-zinc-950 border border-slate-300 dark:border-zinc-700 text-xs text-slate-900 dark:text-white font-semibold focus:border-orange-600 dark:focus:border-orange-500 outline-none transition dark:[color-scheme:dark]"
        />
            <span className="text-slate-500 font-bold">hasta</span>
            <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="p-2.5 rounded-xl bg-slate-50 dark:bg-zinc-950 border border-slate-300 dark:border-zinc-700 text-xs text-slate-900 dark:text-white font-semibold focus:border-orange-600 dark:focus:border-orange-500 outline-none transition dark:[color-scheme:dark]"
            />
          {(startDate || endDate) && (
            <button
              onClick={() => { setStartDate(''); setEndDate(''); }}
              className="px-3 py-2 bg-slate-100 dark:bg-zinc-800 hover:bg-slate-200 dark:hover:bg-zinc-700 text-xs font-bold text-slate-700 dark:text-zinc-300 rounded-xl transition"
            >
              Limpiar filtros
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-2xl p-5 shadow-xl relative overflow-hidden transition-colors">
          <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-orange-500 to-red-600" />
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400">Total Ingresos</span>
            <Wallet className="w-5 h-5 text-orange-600 dark:text-orange-500" />
          </div>
          <p className="text-3xl font-black text-slate-900 dark:text-white mt-2">
            ${stats.grandTotal.toLocaleString('es-AR')}
          </p>
          <p className="text-xs text-slate-500 dark:text-zinc-500 mt-1">{rentals.length} transacciones cobradas</p>
        </div>

        <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-2xl p-5 shadow-xl transition-colors">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400">Efectivo</span>
            <Banknote className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
          </div>
          <p className="text-2xl font-black text-emerald-600 dark:text-emerald-400 mt-2">
            ${stats.totalCash.toLocaleString('es-AR')}
          </p>
          <p className="text-xs text-slate-500 dark:text-zinc-500 mt-1">Caja física en local</p>
        </div>

        <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-2xl p-5 shadow-xl transition-colors">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400">Transferencia</span>
            <ArrowRightLeft className="w-5 h-5 text-orange-600 dark:text-orange-400" />
          </div>
          <p className="text-2xl font-black text-orange-600 dark:text-orange-400 mt-2">
            ${stats.totalTransfer.toLocaleString('es-AR')}
          </p>
          <p className="text-xs text-slate-500 dark:text-zinc-500 mt-1">Mercado Pago / CBU</p>
        </div>

        <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-2xl p-5 shadow-xl transition-colors">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400">Tarjeta / Débito</span>
            <CreditCard className="w-5 h-5 text-sky-600 dark:text-sky-400" />
          </div>
          <p className="text-2xl font-black text-sky-600 dark:text-sky-400 mt-2">
            ${stats.totalCard.toLocaleString('es-AR')}
          </p>
          <p className="text-xs text-slate-500 dark:text-zinc-500 mt-1">POS / Banco</p>
        </div>
      </div>

      <div className="bg-white dark:bg-zinc-900 p-3 rounded-2xl border border-slate-200 dark:border-zinc-800 max-w-md shadow-lg transition-colors">
        <div className="relative">
          <Search className="w-4 h-4 text-orange-600 dark:text-orange-500 absolute left-3.5 top-3.5" />
          <input
            type="text"
            placeholder="Buscar por cliente o DNI..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-50 dark:bg-zinc-950 border border-slate-300 dark:border-zinc-800 text-xs text-slate-900 dark:text-white focus:border-orange-600 dark:focus:border-orange-500 outline-none transition"
          />
        </div>
      </div>

      {loading ? (
        <p className="text-slate-500 dark:text-zinc-400 py-12 text-center font-medium">Calculando caja...</p>
      ) : filteredRentals.length === 0 ? (
        <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-2xl p-12 text-center text-slate-500 dark:text-zinc-400 shadow-md">
          No hay transacciones registradas en este período.
        </div>
      ) : (
        <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-2xl overflow-hidden shadow-xl transition-colors">
          <div className="p-4 border-b border-slate-100 dark:border-zinc-800 font-extrabold uppercase tracking-wider text-xs text-slate-500 dark:text-zinc-400">
            Detalle de Cobros ({filteredRentals.length})
          </div>
          <div className="divide-y divide-slate-100 dark:divide-zinc-800/80">
            {filteredRentals.map((rental) => {
              const pm = paymentLabels[rental.payment_method] || { label: rental.payment_method, icon: DollarSign, color: 'text-slate-700 bg-slate-100 border-slate-200' };
              const PaymentIcon = pm.icon;
              const dateFormatted = new Date(rental.created_at).toLocaleString('es-AR', {
                dateStyle: 'short',
                timeStyle: 'short',
              });

              return (
                <div key={rental.id} className="p-4 flex flex-wrap items-center justify-between gap-4 hover:bg-slate-50 dark:hover:bg-zinc-800/40 transition">
                  <div>
                    <h4 className="font-extrabold text-slate-900 dark:text-white text-base">{rental.customer_name}</h4>
                    <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">
                      DNI: <strong className="text-slate-900 dark:text-white">{rental.customer_dni}</strong> • {dateFormatted}
                    </p>
                  </div>

                  <div className="flex items-center gap-4">
                    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border ${pm.color}`}>
                      <PaymentIcon className="w-3.5 h-3.5" /> {pm.label}
                    </span>
                    <span className="text-lg font-black text-orange-600 dark:text-orange-500">
                      ${Number(rental.total_amount).toLocaleString('es-AR')}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}