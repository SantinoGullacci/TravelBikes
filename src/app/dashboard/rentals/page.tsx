'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import {
  fetchRentalsAndStock,
  updateRentalItemBike,
  updateRentalPaidStatus,
  updateRentalStatus,
  updateRentalNotes,
} from '@/services/rentalsService';
import ReserveModal from '@/components/modals/ReserveModal';
import PaymentConfirmModal from '@/components/modals/PaymentConfirmModal';
import EditRentalModal from '@/components/modals/EditRentalModal';
import {
  CheckCircle,
  Clock,
  Calendar,
  RefreshCw,
  Phone,
  User,
  FileText,
  Edit3,
  DollarSign,
} from 'lucide-react';

export default function RentalsDashboardPage() {
  const [rentals, setRentals] = useState<any[]>([]);
  const [allBikes, setAllBikes] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [filterTab, setFilterTab] = useState<'pending' | 'active' | 'reserved'>('pending');
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);

  // Estados para modales
  const [reserveRental, setReserveRental] = useState<any | null>(null);
  const [returnRental, setReturnRental] = useState<any | null>(null);
  const [editRental, setEditRental] = useState<any | null>(null);

  const loadData = async () => {
    setLoading(true);
    const data = await fetchRentalsAndStock();
    setRentals(data.rentals);
    setAllBikes(data.allBikes);
    setCategories(data.categories);
    setLoading(false);
  };

  useEffect(() => {
    loadData();

    const channel = supabase
      .channel('realtime-rentals')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rentals' }, () => {
        loadData();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const handleAssignBike = async (itemId: string, bikeId: string) => {
    await updateRentalItemBike(itemId, bikeId || null);
    loadData();
  };

  const handleTogglePaid = async (rentalId: string, isPaid: boolean) => {
    await updateRentalPaidStatus(rentalId, isPaid);
    loadData();
  };

  const handleChangeStatus = async (rental: any, newStatus: string, extra = {}) => {
    if (newStatus === 'active') {
      const missingBike = rental.rental_items.some((item: any) => !item.bike_id);
      if (missingBike) {
        alert('Asigná una unidad física a cada ítem antes de activar el alquiler.');
        return;
      }
    }

    setProcessingId(rental.id);
    await updateRentalStatus(rental.id, newStatus, extra);
    setProcessingId(null);
    loadData();
  };

  const handleReturnClick = (rental: any) => {
    if (rental.is_paid) {
      handleChangeStatus(rental, 'completed');
    } else {
      setReturnRental(rental);
    }
  };

  const handleUpdateNotes = async (rentalId: string, currentNotes: string | null) => {
    const newNote = prompt('Editar nota del alquiler:', currentNotes || '');
    if (newNote === null) return;
    await updateRentalNotes(rentalId, newNote);
    loadData();
  };

  const filteredRentals = rentals.filter((r) => r.status === filterTab);
  const availableBikesOnly = allBikes.filter((b) => b.status === 'available');

  const paymentLabels: Record<string, string> = {
    cash: 'Efectivo',
    transfer: 'Transferencia',
    bank: 'Tarjeta / Banco',
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-white">Alquileres y Reservas</h1>
          <p className="text-sm text-slate-400">Mostrador de Travel Bikes</p>
        </div>
        <button
          onClick={loadData}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-900 border border-slate-800 hover:bg-slate-800 text-sm font-semibold"
        >
          <RefreshCw className="w-4 h-4" /> Actualizar
        </button>
      </div>

      <div className="grid grid-cols-3 gap-3 bg-slate-900 p-1.5 rounded-2xl border border-slate-800 max-w-2xl">
        {[
          { id: 'pending', label: 'Pendientes', count: rentals.filter((r) => r.status === 'pending').length, icon: Clock },
          { id: 'active', label: 'Activos', count: rentals.filter((r) => r.status === 'active').length, icon: CheckCircle },
          { id: 'reserved', label: 'Reservas', count: rentals.filter((r) => r.status === 'reserved').length, icon: Calendar },
        ].map((tab) => {
          const Icon = tab.icon;
          const active = filterTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setFilterTab(tab.id as any)}
              className={`flex items-center justify-center gap-2 py-3 px-4 rounded-xl text-sm font-bold transition ${
                active ? 'bg-sky-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{tab.label}</span>
              <span className="px-2 py-0.5 text-xs rounded-full bg-slate-950/60">{tab.count}</span>
            </button>
          );
        })}
      </div>

      {loading ? (
        <p className="text-slate-400 py-10 text-center">Cargando...</p>
      ) : filteredRentals.length === 0 ? (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-12 text-center text-slate-400">
          No hay registros en esta sección.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {filteredRentals.map((rental) => (
            <div key={rental.id} className="bg-slate-900 border border-slate-800 rounded-2xl p-6 flex flex-col justify-between space-y-5">
              <div className="space-y-4">
                <div className="flex items-start justify-between border-b border-slate-800 pb-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-xl font-bold text-white flex items-center gap-2">
                        <User className="w-5 h-5 text-sky-400" /> {rental.customer_name}
                      </h3>
                      {(rental.status === 'active' || rental.status === 'reserved') && (
                        <button
                          onClick={() => setEditRental(rental)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-sky-600 text-slate-200 hover:text-white text-xs font-semibold transition"
                        >
                          <Edit3 className="w-3.5 h-3.5" /> Editar
                        </button>
                      )}
                    </div>
                    <p className="text-xs text-slate-400 mt-1">
                      DNI: <strong className="text-slate-200">{rental.customer_dni}</strong> • <Phone className="w-3 h-3 inline" /> {rental.customer_phone}
                    </p>
                    {rental.status === 'reserved' && (
                      <p className="mt-2 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs font-bold">
                        <Calendar className="w-3.5 h-3.5" /> Retiro: {rental.start_date}
                      </p>
                    )}
                  </div>
                  <div className="text-right space-y-1">
                    <span className="text-2xl font-extrabold text-emerald-400 block">
                      ${Number(rental.total_amount).toLocaleString('es-AR')}
                    </span>
                    <p className="text-xs text-slate-400">
                      {paymentLabels[rental.payment_method]} • {rental.days_count} día/s
                    </p>
                    {rental.status !== 'pending' && (
                      <span className={`inline-block px-2.5 py-0.5 rounded-full text-[11px] font-extrabold tracking-wide uppercase ${rental.is_paid ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40' : 'bg-rose-500/20 text-rose-300 border border-rose-500/40'}`}>
                        {rental.is_paid ? '✓ Pagado' : '⚠ Pendiente'}
                      </span>
                    )}
                  </div>
                </div>

                <div className="space-y-2.5">
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Ítems:</p>
                  {rental.rental_items.map((item: any) => {
                    const matchingBikes = availableBikesOnly.filter((b) => b.category_id === item.category_id);
                    return (
                      <div key={item.id} className="flex flex-wrap items-center justify-between gap-2 bg-slate-950 p-3 rounded-xl border border-slate-800">
                        <div className="text-sm">
                          <span className="font-bold text-white">{item.catalog_categories?.name}</span>
                          <span className="text-xs text-sky-400 ml-2">
                            {[item.catalog_categories?.wheel_size, item.catalog_categories?.frame_size ? `Talle ${item.catalog_categories.frame_size}` : null].filter(Boolean).join(' • ')}
                          </span>
                        </div>
                        {rental.status === 'active' ? (
                          <span className="px-3 py-1 rounded-lg bg-emerald-950 text-emerald-300 border border-emerald-800 text-xs font-bold">
                            Unidad: {item.bikes_inventory?.internal_code || 'Asignada'}
                          </span>
                        ) : (
                          <select
                            value={item.bike_id || ''}
                            onChange={(e) => handleAssignBike(item.id, e.target.value)}
                            className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs font-semibold text-white focus:border-sky-500 outline-none"
                          >
                            <option value="">-- Asignar unidad --</option>
                            {item.bike_id && item.bikes_inventory && (
                              <option value={item.bike_id}>{item.bikes_inventory.internal_code} (Sel.)</option>
                            )}
                            {matchingBikes.map((b: any) => (
                              <option key={b.id} value={b.id}>{b.internal_code}</option>
                            ))}
                          </select>
                        )}
                      </div>
                    );
                  })}
                </div>

                <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                    <DollarSign className="w-4 h-4 text-emerald-400" /> Pago:
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleTogglePaid(rental.id, true)}
                      className={`px-4 py-1.5 rounded-lg text-xs font-extrabold transition ${rental.is_paid ? 'bg-emerald-600 text-white ring-2 ring-emerald-400' : 'bg-slate-900 text-slate-400 border border-slate-800'}`}
                    >
                      SÍ
                    </button>
                    <button
                      onClick={() => handleTogglePaid(rental.id, false)}
                      className={`px-4 py-1.5 rounded-lg text-xs font-extrabold transition ${!rental.is_paid ? 'bg-rose-600 text-white ring-2 ring-rose-400' : 'bg-slate-900 text-slate-400 border border-slate-800'}`}
                    >
                      PENDIENTE DE PAGO
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between bg-slate-950/60 px-3 py-2 rounded-xl border border-slate-800/80 text-xs">
                  <span className="text-slate-400 truncate">
                    <FileText className="w-3.5 h-3.5 inline mr-1 text-slate-500" />
                    {rental.notes || 'Sin notas'}
                  </span>
                  <button onClick={() => handleUpdateNotes(rental.id, rental.notes)} className="text-sky-400 hover:underline font-semibold ml-3 shrink-0">
                    {rental.notes ? 'Editar' : '+ Nota'}
                  </button>
                </div>
              </div>

              <div className="pt-3 border-t border-slate-800 flex flex-wrap gap-2 justify-end">
                {rental.status === 'pending' && (
                  <>
                    <button onClick={() => handleChangeStatus(rental, 'cancelled')} className="px-3 py-2 rounded-xl bg-slate-800 text-xs font-semibold">
                      Cancelar
                    </button>
                    <button onClick={() => setReserveRental(rental)} className="px-4 py-2 rounded-xl bg-amber-600/20 text-amber-300 text-xs font-bold border border-amber-500/40">
                      Reservar
                    </button>
                    <button onClick={() => handleChangeStatus(rental, 'active')} className="px-5 py-2 rounded-xl bg-emerald-600 text-white text-xs font-bold">
                      Activar
                    </button>
                  </>
                )}
                {rental.status === 'reserved' && (
                  <>
                    <button onClick={() => handleChangeStatus(rental, 'cancelled')} className="px-3 py-2 rounded-xl bg-slate-800 text-xs font-semibold">
                      Cancelar
                    </button>
                    <button onClick={() => handleChangeStatus(rental, 'active')} className="px-5 py-2 rounded-xl bg-emerald-600 text-white text-xs font-bold">
                      Entregar (Activar)
                    </button>
                  </>
                )}
                {rental.status === 'active' && (
                  <button onClick={() => handleReturnClick(rental)} className="w-full py-2.5 rounded-xl bg-sky-600 text-white text-sm font-bold">
                    Registrar Devolución
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modales */}
      {reserveRental && (
        <ReserveModal
          customerName={reserveRental.customer_name}
          initialDate={reserveRental.start_date}
          onClose={() => setReserveRental(null)}
          onConfirm={async (pickupDate) => {
            const startObj = new Date(pickupDate + 'T00:00:00');
            const endObj = new Date(startObj);
            endObj.setDate(startObj.getDate() + reserveRental.days_count);
            await handleChangeStatus(reserveRental, 'reserved', {
              start_date: pickupDate,
              end_date: endObj.toISOString().split('T')[0],
            });
            setReserveRental(null);
          }}
        />
      )}

      {returnRental && (
        <PaymentConfirmModal
          customerName={returnRental.customer_name}
          totalAmount={returnRental.total_amount}
          initialMethod={returnRental.payment_method}
          onClose={() => setReturnRental(null)}
          onConfirm={async (method) => {
            await supabase.from('rentals').update({ is_paid: true, payment_method: method, status: 'completed' }).eq('id', returnRental.id);
            setReturnRental(null);
            loadData();
          }}
        />
      )}

      {editRental && (
        <EditRentalModal
          rental={editRental}
          categories={categories}
          allBikes={allBikes}
          onClose={() => setEditRental(null)}
          onSaved={() => {
            setEditRental(null);
            loadData();
          }}
        />
      )}
    </div>
  );
}