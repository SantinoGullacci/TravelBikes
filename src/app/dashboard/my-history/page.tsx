'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { History, RefreshCw, Search, Phone, User, FileText, CheckCircle, XCircle, Calendar, DollarSign } from 'lucide-react';

interface RentalItem {
  id: string;
  catalog_categories: {
    name: string;
    wheel_size: string | null;
    frame_size: string | null;
  };
  bikes_inventory: {
    internal_code: string;
  } | null;
}

interface Rental {
  id: string;
  customer_name: string;
  customer_dni: string;
  customer_phone: string;
  people_count: number;
  days_count: number;
  start_date: string;
  end_date: string;
  payment_method: 'cash' | 'transfer' | 'bank';
  is_paid: boolean;
  total_amount: number;
  status: 'completed' | 'cancelled';
  notes: string | null;
  created_at: string;
  rental_items: RentalItem[];
}

export default function MyHistoryDashboardPage() {
  const [historyRentals, setHistoryRentals] = useState<Rental[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  const fetchHistory = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('rentals')
      .select(`
        *,
        rental_items (
          id,
          catalog_categories ( name, wheel_size, frame_size ),
          bikes_inventory ( internal_code )
        )
      `)
      .in('status', ['completed', 'cancelled'])
      .order('created_at', { ascending: false });

    if (!error && data) {
      setHistoryRentals(data as unknown as Rental[]);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchHistory();

    const channel = supabase
      .channel('realtime-history')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rentals' }, () => {
        fetchHistory();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const handleUpdateNotes = async (rentalId: string, currentNotes: string | null) => {
    const newNote = prompt('Agregar o editar nota del alquiler finalizado:', currentNotes || '');
    if (newNote === null) return;

    const { error } = await supabase
      .from('rentals')
      .update({ notes: newNote })
      .eq('id', rentalId);

    if (error) {
      alert('Error al actualizar nota: ' + error.message);
    } else {
      fetchHistory();
    }
  };

  const filteredHistory = historyRentals.filter((r) => {
    const term = searchTerm.toLowerCase();
    return (
      r.customer_name.toLowerCase().includes(term) ||
      r.customer_dni.toLowerCase().includes(term) ||
      r.customer_phone.toLowerCase().includes(term)
    );
  });

  const paymentLabels: Record<string, string> = {
    cash: 'Efectivo',
    transfer: 'Transferencia',
    bank: 'Tarjeta / Banco',
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black uppercase tracking-wider text-slate-900 dark:text-white">My History</h1>
          <p className="text-sm text-orange-600 dark:text-orange-500 font-semibold tracking-wide">Registro de devoluciones finalizadas y cancelaciones</p>
        </div>
        <button
          onClick={fetchHistory}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 hover:border-orange-500/50 hover:bg-slate-50 dark:hover:bg-zinc-800 text-slate-800 dark:text-white text-sm font-bold transition shadow-md"
        >
          <RefreshCw className="w-4 h-4 text-orange-600 dark:text-orange-500" /> Actualizar
        </button>
      </div>

      <div className="bg-white dark:bg-zinc-900 p-3 rounded-2xl border border-slate-200 dark:border-zinc-800 max-w-md shadow-lg transition-colors">
        <div className="relative">
          <Search className="w-4 h-4 text-orange-600 dark:text-orange-500 absolute left-3.5 top-3.5" />
          <input
            type="text"
            placeholder="Buscar por cliente, DNI o teléfono..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-50 dark:bg-zinc-950 border border-slate-300 dark:border-zinc-800 text-xs text-slate-900 dark:text-white focus:border-orange-600 dark:focus:border-orange-500 outline-none transition"
          />
        </div>
      </div>

      {loading ? (
        <p className="text-slate-500 dark:text-zinc-400 py-12 text-center font-medium">Cargando historial...</p>
      ) : filteredHistory.length === 0 ? (
        <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-2xl p-12 text-center text-slate-500 dark:text-zinc-400 shadow-md">
          No hay registros en el historial.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {filteredHistory.map((rental) => {
            const isCompleted = rental.status === 'completed';

            return (
              <div
                key={rental.id}
                className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-2xl p-6 flex flex-col justify-between space-y-4 shadow-xl relative overflow-hidden transition-colors"
              >
                <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-zinc-900 dark:from-white via-orange-500 to-red-600" />
                <div className="space-y-3">
                  <div className="flex items-start justify-between border-b border-slate-100 dark:border-zinc-800 pb-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-lg font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
                          <User className="w-4 h-4 text-orange-600 dark:text-orange-500" /> {rental.customer_name}
                        </h3>
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold tracking-wider uppercase ${
                            isCompleted
                              ? 'bg-slate-900 dark:bg-white/10 text-white border border-slate-800 dark:border-white/30'
                              : 'bg-red-100 dark:bg-red-950/80 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-700/80'
                          }`}
                        >
                          {isCompleted ? <CheckCircle className="w-3 h-3 text-orange-500" /> : <XCircle className="w-3 h-3 text-red-500" />}
                          {isCompleted ? 'Completado' : 'Cancelado'}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 dark:text-zinc-400 mt-1">
                        DNI: <strong className="text-slate-900 dark:text-white">{rental.customer_dni}</strong> •{' '}
                        <Phone className="w-3 h-3 inline text-orange-600 dark:text-orange-500" /> {rental.customer_phone}
                      </p>
                    </div>

                    <div className="text-right">
                      <span className="text-xl font-black text-orange-600 dark:text-orange-500 block">
                        ${Number(rental.total_amount).toLocaleString('es-AR')}
                      </span>
                      <p className="text-[11px] text-slate-500 dark:text-zinc-400 font-medium">
                        {paymentLabels[rental.payment_method]} • {rental.days_count} día/s
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 text-xs text-slate-700 dark:text-zinc-300 bg-slate-50 dark:bg-zinc-950 px-3 py-2 rounded-xl border border-slate-200 dark:border-zinc-800">
                    <span className="flex items-center gap-1.5 font-semibold">
                      <Calendar className="w-3.5 h-3.5 text-orange-600 dark:text-orange-500" /> Retiro: {rental.start_date}
                    </span>
                    <span className="text-orange-600 dark:text-orange-500 font-bold">→</span>
                    <span className="font-semibold">Devolución: {rental.end_date}</span>
                  </div>

                  <div className="space-y-1.5">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400">
                      Bicicletas / Accesorios utilizados:
                    </p>
                    {rental.rental_items.map((item) => (
                      <div
                        key={item.id}
                        className="flex items-center justify-between bg-slate-50 dark:bg-zinc-950 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-zinc-800 text-xs"
                      >
                        <span className="text-slate-900 dark:text-white font-bold">{item.catalog_categories?.name}</span>
                        <span className="text-orange-600 dark:text-orange-400 font-extrabold">
                          Unidad: {item.bikes_inventory?.internal_code || 'S/C'}
                        </span>
                      </div>
                    ))}
                  </div>

                  <div className="flex items-center justify-between bg-slate-50 dark:bg-zinc-950 px-3 py-2 rounded-xl border border-slate-200 dark:border-zinc-800 text-xs">
                    <span className="text-slate-600 dark:text-zinc-300 truncate">
                      <FileText className="w-3.5 h-3.5 inline mr-1.5 text-orange-600 dark:text-orange-500" />
                      {rental.notes ? rental.notes : 'Sin notas registradas'}
                    </span>
                    <button
                      onClick={() => handleUpdateNotes(rental.id, rental.notes)}
                      className="text-orange-600 dark:text-orange-400 hover:text-orange-700 dark:hover:text-orange-300 hover:underline font-bold ml-3 shrink-0"
                    >
                      {rental.notes ? 'Editar nota' : '+ Agregar nota'}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}