'use client';

import { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { Wallet, DollarSign, Calendar, RefreshCw, Banknote, CreditCard, ArrowRightLeft, Search, History, TrendingUp, X } from 'lucide-react';

interface RentalTransaction {
  id: string;
  customer_name: string;
  customer_dni: string;
  customer_address: string | null;
  payment_method: 'cash' | 'transfer' | 'bank';
  total_amount: number;
  created_at: string;
  end_date: string;
  status: string;
}

export default function CashRegisterPage() {
  const [allPaidRentals, setAllPaidRentals] = useState<RentalTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  const todayStr = new Date().toISOString().split('T')[0];
  const currentMonthStr = todayStr.substring(0, 7); // Formato "YYYY-MM"

  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Estado para el historial de meses anteriores seleccionado
  const [selectedHistoryMonth, setSelectedHistoryMonth] = useState<string>('');

  const fetchCashData = async () => {
    setLoading(true);
    const { data: allData } = await supabase
      .from('rentals')
      .select('id, customer_name, customer_dni, customer_address, payment_method, total_amount, created_at, end_date, status')
      .eq('is_paid', true)
      .order('created_at', { ascending: false });

    if (allData) setAllPaidRentals(allData as RentalTransaction[]);
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
  }, []);

  // Historial agrupado por meses anteriores (excluyendo el mes actual)
  const monthlyHistory = useMemo(() => {
    const historyMap: Record<string, { total: number; count: number; cash: number; transfer: number; card: number; rentals: RentalTransaction[] }> = {};

    allPaidRentals.forEach((r) => {
      const monthKey = r.created_at.substring(0, 7);
      if (!historyMap[monthKey]) {
        historyMap[monthKey] = { total: 0, count: 0, cash: 0, transfer: 0, card: 0, rentals: [] };
      }
      const amount = Number(r.total_amount) || 0;
      historyMap[monthKey].total += amount;
      historyMap[monthKey].count += 1;
      historyMap[monthKey].rentals.push(r);
      if (r.payment_method === 'cash') historyMap[monthKey].cash += amount;
      else if (r.payment_method === 'transfer') historyMap[monthKey].transfer += amount;
      else if (r.payment_method === 'bank') historyMap[monthKey].card += amount;
    });

    return Object.entries(historyMap).sort((a, b) => b[0].localeCompare(a[0]));
  }, [allPaidRentals]);

  // Si hay un mes seleccionado en el historial, filtramos por ese mes. Si no, aplicamos el filtro de fecha superior o el mes actual por defecto.
  const activeRentalsList = useMemo(() => {
    if (selectedHistoryMonth) {
      const found = monthlyHistory.find(([m]) => m === selectedHistoryMonth);
      return found ? found[1].rentals : [];
    }

    return allPaidRentals.filter((r) => {
      const rDate = r.created_at.split('T')[0];
      const rMonth = rDate.substring(0, 7);

      if (startDate && endDate) {
        return rDate >= startDate && rDate <= endDate;
      } else if (startDate) {
        return rDate >= startDate;
      } else if (endDate) {
        return rDate <= endDate;
      } else {
        // Por defecto mes actual
        return rMonth === currentMonthStr;
      }
    });
  }, [allPaidRentals, startDate, endDate, selectedHistoryMonth, monthlyHistory, currentMonthStr]);

  // Totales del listado activo
  const stats = useMemo(() => {
    let totalCash = 0;
    let totalTransfer = 0;
    let totalCard = 0;

    activeRentalsList.forEach((r) => {
      const amount = Number(r.total_amount) || 0;
      if (r.payment_method === 'cash') totalCash += amount;
      else if (r.payment_method === 'transfer') totalTransfer += amount;
      else if (r.payment_method === 'bank') totalCard += amount;
    });

    const grandTotal = totalCash + totalTransfer + totalCard;
    return { totalCash, totalTransfer, totalCard, grandTotal };
  }, [activeRentalsList]);

  // Caja Diaria (Hoy) fija independiente del filtro
  const dailyTotal = useMemo(() => {
    let daily = 0;
    allPaidRentals.forEach((r) => {
      if (r.created_at.split('T')[0] === todayStr) {
        daily += Number(r.total_amount) || 0;
      }
    });
    return daily;
  }, [allPaidRentals, todayStr]);

  // Caja Mensual (Mes Actual) fija independiente del filtro
  const monthlyTotal = useMemo(() => {
    let monthly = 0;
    allPaidRentals.forEach((r) => {
      if (r.created_at.split('T')[0].substring(0, 7) === currentMonthStr) {
        monthly += Number(r.total_amount) || 0;
      }
    });
    return monthly;
  }, [allPaidRentals, currentMonthStr]);

  const filteredRentals = activeRentalsList.filter((r) =>
    r.customer_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    r.customer_dni.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const paymentLabels: Record<string, { label: string; icon: any; color: string }> = {
    cash: { label: 'Efectivo', icon: Banknote, color: 'text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 border-emerald-200 dark:border-emerald-800' },
    transfer: { label: 'Transferencia', icon: ArrowRightLeft, color: 'text-orange-700 dark:text-orange-400 bg-orange-50 dark:bg-orange-950/60 border-orange-200 dark:border-orange-800' },
    bank: { label: 'Débito', icon: CreditCard, color: 'text-sky-700 dark:text-sky-400 bg-sky-50 dark:bg-sky-950/60 border-sky-200 dark:border-sky-800' },
  };

  const selectedHistoryData = monthlyHistory.find(([m]) => m === selectedHistoryMonth)?.[1];

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

      {/* Barra de Filtros (Fechas + Búsqueda de cliente a la derecha) */}
      <div className="bg-white dark:bg-zinc-900 p-4 rounded-2xl border border-slate-200 dark:border-zinc-800 shadow-xl flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4 transition-colors">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-orange-600 dark:text-orange-500" />
            <span className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-zinc-300">Filtrar Detalle:</span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="date"
              value={startDate}
              onChange={(e) => { setStartDate(e.target.value); setSelectedHistoryMonth(''); }}
              className="p-2.5 rounded-xl bg-slate-50 dark:bg-zinc-950 border border-slate-300 dark:border-zinc-700 text-xs text-slate-900 dark:text-white font-semibold focus:border-orange-600 dark:focus:border-orange-500 outline-none transition dark:[color-scheme:dark]"
            />
            <span className="text-slate-500 font-bold">hasta</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => { setEndDate(e.target.value); setSelectedHistoryMonth(''); }}
              className="p-2.5 rounded-xl bg-slate-50 dark:bg-zinc-950 border border-slate-300 dark:border-zinc-700 text-xs text-slate-900 dark:text-white font-semibold focus:border-orange-600 dark:focus:border-orange-500 outline-none transition dark:[color-scheme:dark]"
            />
            {(startDate || endDate || selectedHistoryMonth) && (
              <button
                onClick={() => { setStartDate(''); setEndDate(''); setSelectedHistoryMonth(''); }}
                className="px-3 py-2 bg-slate-100 dark:bg-zinc-800 hover:bg-slate-200 dark:hover:bg-zinc-700 text-xs font-bold text-slate-700 dark:text-zinc-300 rounded-xl transition"
              >
                Restablecer mes actual
              </button>
            )}
          </div>
        </div>

        {/* Búsqueda de cliente a la derecha */}
        <div className="relative min-w-[240px]">
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

      {/* Contadores de Caja Diaria y Mensual */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-2xl p-5 shadow-xl relative overflow-hidden transition-colors">
          <div className="absolute top-0 left-0 right-0 h-1.5 bg-emerald-500" />
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400">Caja Diaria (Hoy)</span>
            <TrendingUp className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
          </div>
          <p className="text-3xl font-black text-emerald-600 dark:text-emerald-400 mt-2">
            ${dailyTotal.toLocaleString('es-AR')}
          </p>
          <p className="text-xs text-slate-500 dark:text-zinc-500 mt-1">Ingresos del día corriente</p>
        </div>

        <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-2xl p-5 shadow-xl relative overflow-hidden transition-colors">
          <div className="absolute top-0 left-0 right-0 h-1.5 bg-sky-500" />
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400">Caja Mensual (Actual)</span>
            <Calendar className="w-5 h-5 text-sky-600 dark:text-sky-400" />
          </div>
          <p className="text-3xl font-black text-sky-600 dark:text-sky-400 mt-2">
            ${monthlyTotal.toLocaleString('es-AR')}
          </p>
          <p className="text-xs text-slate-500 dark:text-zinc-500 mt-1">Acumulado del mes en curso</p>
        </div>
      </div>

      {/* Métodos de Pago del Rango / Mes Activo */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-2xl p-4 shadow-lg transition-colors">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400">Efectivo</span>
            <Banknote className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
          </div>
          <p className="text-2xl font-black text-emerald-600 dark:text-emerald-400 mt-1">
            ${stats.totalCash.toLocaleString('es-AR')}
          </p>
        </div>

        <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-2xl p-4 shadow-lg transition-colors">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400">Transferencia</span>
            <ArrowRightLeft className="w-4 h-4 text-orange-600 dark:text-orange-400" />
          </div>
          <p className="text-2xl font-black text-orange-600 dark:text-orange-400 mt-1">
            ${stats.totalTransfer.toLocaleString('es-AR')}
          </p>
        </div>

        <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-2xl p-4 shadow-lg transition-colors">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400">Débito</span>
            <CreditCard className="w-4 h-4 text-sky-600 dark:text-sky-400" />
          </div>
          <p className="text-2xl font-black text-sky-600 dark:text-sky-400 mt-1">
            ${stats.totalCard.toLocaleString('es-AR')}
          </p>
        </div>
      </div>

      {/* Historial de Cajas Mensuales Anteriores */}
      <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-2xl p-5 shadow-xl transition-colors space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 dark:border-zinc-800 pb-3">
          <div className="flex items-center gap-2">
            <History className="w-5 h-5 text-orange-600 dark:text-orange-500" />
            <h3 className="text-base font-extrabold uppercase tracking-wider text-slate-900 dark:text-white">
              Historial de Cajas Mensuales Anteriores
            </h3>
          </div>
          
          <div className="flex flex-wrap items-center gap-2">
            {selectedHistoryMonth && (
              <button
                onClick={() => setSelectedHistoryMonth('')}
                className="flex items-center gap-1.5 px-3 py-2.5 bg-red-50 dark:bg-red-950/60 border border-red-200 dark:border-red-800 hover:bg-red-100 text-red-600 dark:text-red-400 text-xs font-extrabold rounded-xl transition"
                title="Quitar filtro de mes histórico"
              >
                <X className="w-4 h-4" /> Eliminar filtro
              </button>
            )}

            <select
              value={selectedHistoryMonth}
              onChange={(e) => { setSelectedHistoryMonth(e.target.value); setStartDate(''); setEndDate(''); }}
              className="p-2.5 rounded-xl bg-slate-50 dark:bg-zinc-950 border border-slate-300 dark:border-zinc-700 text-xs font-bold text-slate-900 dark:text-white outline-none transition"
            >
              <option value="">-- Seleccionar un mes histórico --</option>
              {monthlyHistory.map(([mKey]) => {
                const [y, m] = mKey.split('-');
                const dObj = new Date(parseInt(y), parseInt(m) - 1, 1);
                const mName = dObj.toLocaleString('es-AR', { month: 'long', year: 'numeric' });
                return (
                  <option key={mKey} value={mKey}>
                    {mName.charAt(0).toUpperCase() + mName.slice(1)}
                  </option>
                );
              })}
            </select>
          </div>
        </div>

        {/* Tarjeta de Resumen del Mes Histórico Seleccionado */}
        {selectedHistoryData && selectedHistoryMonth && (
          <div className="bg-orange-50/50 dark:bg-zinc-950 p-4 rounded-xl border border-orange-200 dark:border-orange-500/30 flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-orange-600 dark:text-orange-400">Resumen del mes seleccionado</p>
              <h4 className="text-2xl font-black text-slate-900 dark:text-white mt-1">
                ${selectedHistoryData.total.toLocaleString('es-AR')}
              </h4>
              <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">{selectedHistoryData.count} transacciones en el periodo</p>
            </div>
            <div className="flex items-center gap-4 text-xs font-semibold text-slate-700 dark:text-zinc-300">
              <span>Efectivo: <strong>${selectedHistoryData.cash.toLocaleString('es-AR')}</strong></span>
              <span>Digitales: <strong>${(selectedHistoryData.transfer + selectedHistoryData.card).toLocaleString('es-AR')}</strong></span>
            </div>
          </div>
        )}
      </div>

      {/* Listado Detallado de Cobros */}
      {loading ? (
        <p className="text-slate-500 dark:text-zinc-400 py-12 text-center font-medium">Calculando caja...</p>
      ) : filteredRentals.length === 0 ? (
        <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-2xl p-12 text-center text-slate-500 dark:text-zinc-400 shadow-md">
          No hay transacciones registradas en este período o mes seleccionado.
        </div>
      ) : (
        <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-2xl overflow-hidden shadow-xl transition-colors">
          <div className="p-4 border-b border-slate-100 dark:border-zinc-800 flex items-center justify-between">
            <span className="font-extrabold uppercase tracking-wider text-xs text-slate-500 dark:text-zinc-400">
              Detalle de Cobros ({filteredRentals.length})
            </span>
            <span className="text-sm font-black text-orange-600 dark:text-orange-500">
              Total Ingresos: ${stats.grandTotal.toLocaleString('es-AR')}
            </span>
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
                      DNI: <strong className="text-slate-900 dark:text-white">{rental.customer_dni}</strong>
                      {rental.customer_address && <> • Dir: <strong className="text-slate-900 dark:text-white">{rental.customer_address}</strong></>}
                      {' • '}{dateFormatted}
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