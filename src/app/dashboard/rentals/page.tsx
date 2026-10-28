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
  MapPin,
} from 'lucide-react';

// Calcula el fin inclusivo real del alquiler (1 día el miércoles = empieza y termina el miércoles)
const calculateInclusiveEndDate = (startDateStr: string, daysCount: number, notes?: string | null) => {
  if (!startDateStr) return '';
  const is2Hours = Boolean(notes?.includes('2 horas'));
  const days = is2Hours ? 1 : Math.max(1, Number(daysCount || 1));
  const startObj = new Date(startDateStr + 'T00:00:00');
  const endObj = new Date(startObj);
  if (days > 1) {
    endObj.setDate(startObj.getDate() + (days - 1));
  }
  return endObj.toISOString().split('T')[0];
};

// Evalúa si dos rangos de fechas se solapan
const doRentalDatesOverlap = (
  startA: string,
  endA: string,
  startB: string,
  endB: string
) => {
  if (!startA || !endA || !startB || !endB) return false;
  return startA <= endB && endA >= startB;
};

export default function RentalsDashboardPage() {
  const [rentals, setRentals] = useState<any[]>([]);
  const [allBikes, setAllBikes] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [pricingMap, setPricingMap] = useState<Record<string, any>>({});
  const [filterTab, setFilterTab] = useState<'pending' | 'active' | 'reserved'>('pending');
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);

  const [itemBikes, setItemBikes] = useState<Record<string, string>>({});

  const [reserveRental, setReserveRental] = useState<any | null>(null);
  const [returnRental, setReturnRental] = useState<any | null>(null);
  const [editRental, setEditRental] = useState<any | null>(null);

  const loadData = async () => {
    setLoading(true);
    const [data, catsWithPricesRes] = await Promise.all([
      fetchRentalsAndStock(),
      supabase
        .from('catalog_categories')
        .select('id, name, wheel_size, frame_size, price_2h_cash, price_2h_transfer, price_1day_cash, price_1day_transfer'),
    ]);

    setRentals(data.rentals);
    setAllBikes(data.allBikes);
    setCategories(data.categories);

    const map: Record<string, any> = {};
    (catsWithPricesRes.data || []).forEach((c: any) => {
      map[c.id] = c;
      const key = `${c.name || ''}|${c.wheel_size || ''}|${c.frame_size || ''}`;
      map[key] = c;
    });
    setPricingMap(map);

    const initialMap: Record<string, string> = {};
    data.rentals.forEach((r: any) => {
      r.rental_items.forEach((item: any) => {
        if (item.bike_id) {
          initialMap[item.id] = item.bike_id;
        }
      });
    });
    setItemBikes(initialMap);

    setLoading(false);
  };

  useEffect(() => {
    loadData();

    const channel = supabase
      .channel('realtime-rentals-dashboard')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rentals' }, () => {
        loadData();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rental_items' }, () => {
        loadData();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bikes_inventory' }, () => {
        loadData();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'catalog_categories' }, () => {
        loadData();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const getCategoryPricesForItem = (item: any) => {
    const catId = item.category_id || item.catalog_categories?.id;
    if (catId && pricingMap[catId]) {
      return pricingMap[catId];
    }
    if (item.catalog_categories) {
      const key = `${item.catalog_categories.name || ''}|${item.catalog_categories.wheel_size || ''}|${item.catalog_categories.frame_size || ''}`;
      if (pricingMap[key]) {
        return pricingMap[key];
      }
    }
    return item.catalog_categories || null;
  };

  const calculateTotalByMethod = (rental: any, method: string) => {
    if (!rental || !rental.rental_items || rental.rental_items.length === 0) {
      return Number(rental?.total_amount || 0);
    }

    const is2Hours = Boolean(rental.notes?.includes('2 horas'));
    const isTransferOrCard = method !== 'cash';
    const multiplier = is2Hours ? 1 : Number(rental.days_count || 1);

    return rental.rental_items.reduce((acc: number, item: any) => {
      const cat = getCategoryPricesForItem(item);
      if (!cat) return acc + Number(item.price_applied || 0);

      const unitPrice = is2Hours
        ? Number(isTransferOrCard ? cat.price_2h_transfer : cat.price_2h_cash)
        : Number(isTransferOrCard ? cat.price_1day_transfer : cat.price_1day_cash);

      if (!unitPrice || isNaN(unitPrice)) {
        return acc + Number(item.price_applied || 0);
      }

      return acc + unitPrice * multiplier;
    }, 0);
  };

  // Devuelve un Set con los bike_id ya comprometidos en OTROS alquileres/reservas cuyas fechas se pisen con este alquiler
  const getConflictingBikeIdsForRental = (targetRental: any, customStartDate?: string, forceSingleDayToday?: boolean) => {
    const today = new Date().toISOString().split('T')[0];
    const targetStart = customStartDate || targetRental.start_date;
    const targetEnd = forceSingleDayToday
      ? targetStart
      : calculateInclusiveEndDate(targetStart, targetRental.days_count, targetRental.notes);
    const conflictingBikeIds = new Set<string>();

    rentals.forEach((otherRental: any) => {
      if (otherRental.id === targetRental.id) return;
      if (!['pending', 'reserved', 'active'].includes(otherRental.status)) return;

      // Si el otro alquiler está activo, ocupa hoy y vuelve hoy
      const otherStart = otherRental.status === 'active' ? today : otherRental.start_date;
      const otherEnd =
        otherRental.status === 'active'
          ? today
          : calculateInclusiveEndDate(otherStart, otherRental.days_count, otherRental.notes);

      if (doRentalDatesOverlap(targetStart, targetEnd, otherStart, otherEnd)) {
        (otherRental.rental_items || []).forEach((otherItem: any) => {
          const bId = itemBikes[otherItem.id] !== undefined ? itemBikes[otherItem.id] : otherItem.bike_id;
          if (bId) {
            conflictingBikeIds.add(bId);
          }
        });
      }
    });

    return conflictingBikeIds;
  };

  // Verifica que activar o reservar este pedido para una fecha no supere el stock físico real de cada categoría
  const validateCategoryQuotaForDates = (targetRental: any, targetStartDate: string, isActivatingNow = false) => {
    const today = new Date().toISOString().split('T')[0];
    const targetEnd = isActivatingNow
      ? targetStartDate
      : calculateInclusiveEndDate(targetStartDate, targetRental.days_count, targetRental.notes);

    // Contar cuántas unidades pide este alquiler por categoría
    const requestedByCat: Record<string, { qty: number; name: string }> = {};
    (targetRental.rental_items || []).forEach((it: any) => {
      const catId = it.category_id;
      const catName = it.catalog_categories?.name || 'esta categoría';
      if (!requestedByCat[catId]) requestedByCat[catId] = { qty: 0, name: catName };
      requestedByCat[catId].qty += 1;
    });

    for (const [catId, info] of Object.entries(requestedByCat)) {
      const totalOperationalUnits = allBikes.filter(
        (b: any) => b.category_id === catId && b.status !== 'maintenance' && b.status !== 'retired'
      ).length;

      let alreadyCommittedInOverlappingRentals = 0;
      rentals.forEach((other: any) => {
        if (other.id === targetRental.id) return;
        if (!['reserved', 'active'].includes(other.status)) return;

        const otherStart = other.status === 'active' ? today : other.start_date;
        const otherEnd =
          other.status === 'active'
            ? today
            : calculateInclusiveEndDate(otherStart, other.days_count, other.notes);

        if (doRentalDatesOverlap(targetStartDate, targetEnd, otherStart, otherEnd)) {
          (other.rental_items || []).forEach((otherItem: any) => {
            if (otherItem.category_id === catId) {
              alreadyCommittedInOverlappingRentals += 1;
            }
          });
        }
      });

      const availableForDates = Math.max(0, totalOperationalUnits - alreadyCommittedInOverlappingRentals);
      if (info.qty > availableForDates) {
        alert(
          `No se puede comprometer este pedido para el ${targetStartDate}: "${info.name}" solo cuenta con ${totalOperationalUnits} unidad(es) en flota y ya hay ${alreadyCommittedInOverlappingRentals} reservada(s)/activa(s) en esas fechas.`
        );
        return false;
      }
    }

    return true;
  };

  const handleAssignBike = async (itemId: string, bikeId: string, rental: any) => {
    const isDuplicateInSameRental = rental.rental_items.some((otherItem: any) => {
      if (otherItem.id === itemId) return false;
      const currentSelectedBike = itemBikes[otherItem.id] || otherItem.bike_id;
      return currentSelectedBike === bikeId;
    });

    if (bikeId && isDuplicateInSameRental) {
      alert('Esta unidad física ya está asignada a otro ítem en este mismo pedido. Elegí una unidad diferente.');
      return;
    }

    if (bikeId) {
      const conflictingBikes = getConflictingBikeIdsForRental(rental);
      if (conflictingBikes.has(bikeId)) {
        alert('Esta unidad física ya está comprometida en otra reserva o alquiler para las mismas fechas.');
        return;
      }
    }

    setItemBikes((prev) => ({ ...prev, [itemId]: bikeId }));

    await updateRentalItemBike(itemId, bikeId || null);
    loadData();
  };

  const handleTogglePaid = async (rentalId: string, isPaid: boolean) => {
    await updateRentalPaidStatus(rentalId, isPaid);
    loadData();
  };

  const handleChangeStatus = async (rental: any, newStatus: string, extra: any = {}) => {
    const currentToday = new Date().toISOString().split('T')[0];
    const updatedExtra = { ...extra };

    // Cuando un alquiler o reserva pasa a ACTIVO, se lleva las bicis HOY y vuelven HOY.
    const isActivating = newStatus === 'active';
    const targetStartDate = isActivating ? currentToday : (updatedExtra.start_date || rental.start_date);

    if (newStatus === 'reserved' || newStatus === 'active') {
      if (!validateCategoryQuotaForDates(rental, targetStartDate, isActivating)) {
        return;
      }
    }

    if (isActivating) {
      const missingBike = rental.rental_items.some((item: any) => !item.bike_id);
      if (missingBike) {
        alert('Asigná una unidad física a cada ítem antes de activar el alquiler.');
        return;
      }

      const assignedBikeIds = rental.rental_items.map((item: any) => item.bike_id);
      const uniqueBikeIds = new Set(assignedBikeIds);
      if (assignedBikeIds.length !== uniqueBikeIds.size) {
        alert('Error: Hay unidades físicas repetidas en este pedido. Cada ítem debe tener una unidad única y diferente.');
        return;
      }

      const conflictingBikes = getConflictingBikeIdsForRental(rental, currentToday, true);
      const hasDateConflict = assignedBikeIds.some((id: string) => conflictingBikes.has(id));
      if (hasDateConflict) {
        alert('Error: Una de las unidades físicas asignadas ya está en uso hoy en otro alquiler.');
        return;
      }

      // Al activarse hoy, deja de existir como reserva futura: empieza hoy y termina hoy
      updatedExtra.start_date = currentToday;
      updatedExtra.end_date = currentToday;

      // Actualización directa en BD para garantizar que start_date y end_date pasen a hoy aunque rentalsService ignore extra
      await supabase
        .from('rentals')
        .update({
          start_date: currentToday,
          end_date: currentToday,
        })
        .eq('id', rental.id);

      if (assignedBikeIds.length > 0) {
        await supabase.from('bikes_inventory').update({ status: 'rented' }).in('id', assignedBikeIds);
      }
    }

    setProcessingId(rental.id);
    await updateRentalStatus(rental.id, newStatus, updatedExtra);
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
  const todayStr = new Date().toISOString().split('T')[0];

  const paymentLabels: Record<string, string> = {
    cash: 'Efectivo',
    transfer: 'Transferencia',
    bank: 'Tarjeta / Banco',
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black uppercase tracking-wider text-slate-900 dark:text-white">Alquileres y Reservas</h1>
          <p className="text-sm text-orange-600 dark:text-orange-500 font-semibold tracking-wide">Mostrador de Travel Bikes</p>
        </div>
        <button
          onClick={loadData}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 hover:border-orange-500/50 hover:bg-slate-50 dark:hover:bg-zinc-800 text-slate-800 dark:text-white text-sm font-bold transition shadow-md"
        >
          <RefreshCw className="w-4 h-4 text-orange-600 dark:text-orange-500" /> Actualizar
        </button>
      </div>

      <div className="grid grid-cols-3 gap-2 bg-white dark:bg-zinc-900 p-1.5 rounded-2xl border border-slate-200 dark:border-zinc-800 w-full max-w-2xl shadow-lg transition-colors overflow-x-auto">
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
              className={`flex items-center justify-center gap-1.5 sm:gap-2 py-3 px-2 sm:px-4 rounded-xl text-xs sm:text-sm font-extrabold uppercase tracking-wider transition whitespace-nowrap ${
                active
                  ? 'bg-orange-600 text-white shadow-md shadow-orange-600/30 dark:shadow-orange-950/50'
                  : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Icon className="w-4 h-4 shrink-0" />
              <span className="truncate">{tab.label}</span>
              <span className={`px-1.5 sm:px-2 py-0.5 text-[10px] sm:text-xs rounded-full font-black shrink-0 ${active ? 'bg-zinc-950/70 text-orange-300' : 'bg-slate-100 dark:bg-zinc-950 text-slate-600 dark:text-zinc-400'}`}>
                {tab.count}
              </span>
            </button>
          );
        })}
      </div>

      {loading ? (
        <p className="text-slate-500 dark:text-zinc-400 py-10 text-center font-medium">Cargando...</p>
      ) : filteredRentals.length === 0 ? (
        <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-2xl p-12 text-center text-slate-500 dark:text-zinc-400 shadow-md">
          No hay registros en esta sección.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {filteredRentals.map((rental) => {
            const conflictingBikesForThisRental = getConflictingBikeIdsForRental(rental);
            const isFutureReservation = rental.start_date > todayStr;

            return (
              <div key={rental.id} className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-2xl p-6 flex flex-col justify-between space-y-5 shadow-xl relative overflow-hidden transition-colors">
                <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-zinc-900 dark:from-white via-orange-500 to-red-600" />
                <div className="space-y-4">
                  <div className="flex items-start justify-between border-b border-slate-100 dark:border-zinc-800 pb-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-xl font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
                          <User className="w-5 h-5 text-orange-600 dark:text-orange-500" /> {rental.customer_name}
                        </h3>
                        {(rental.status === 'active' || rental.status === 'reserved') && (
                          <button
                            onClick={() => setEditRental(rental)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-zinc-800 hover:bg-orange-600 text-slate-700 dark:text-zinc-200 hover:text-white text-xs font-bold transition"
                          >
                            <Edit3 className="w-3.5 h-3.5" /> Editar
                          </button>
                        )}
                      </div>
                      <p className="text-xs text-slate-500 dark:text-zinc-400 mt-1">
                        DNI: <strong className="text-slate-900 dark:text-white">{rental.customer_dni}</strong> • <Phone className="w-3 h-3 inline text-orange-600 dark:text-orange-500" /> {rental.customer_phone}
                      </p>
                      {rental.customer_address && (
                        <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">
                          <MapPin className="w-3 h-3 inline text-orange-600 dark:text-orange-500" /> Alojamiento/Dir: <strong className="text-slate-900 dark:text-white">{rental.customer_address}</strong>
                        </p>
                      )}
                      {rental.status === 'reserved' && (
                        <p className="mt-2 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-orange-50 dark:bg-orange-500/10 border border-orange-200 dark:border-orange-500/30 text-orange-700 dark:text-orange-400 text-xs font-bold">
                          <Calendar className="w-3.5 h-3.5" /> Retiro: {rental.start_date}
                        </p>
                      )}
                    </div>
                    <div className="text-right space-y-1">
                      <span className="text-2xl font-black text-orange-600 dark:text-orange-500 block">
                        ${Number(rental.total_amount).toLocaleString('es-AR')}
                      </span>
                      <p className="text-xs text-slate-500 dark:text-zinc-400 font-medium">
                        {paymentLabels[rental.payment_method]} • {rental.days_count} día/s
                      </p>
                      {rental.status !== 'pending' && (
                        <span className={`inline-block px-2.5 py-0.5 rounded-full text-[11px] font-extrabold tracking-wide uppercase ${rental.is_paid ? 'bg-slate-900 dark:bg-white/10 text-white border border-slate-800 dark:border-white/30' : 'bg-red-100 dark:bg-red-600/20 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-500/40'}`}>
                          {rental.is_paid ? '✓ Pagado' : '⚠ Pendiente'}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="space-y-2.5">
                    <p className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400">Ítems:</p>
                    {rental.rental_items.map((item: any) => {
                      const assignedBikeIdsInThisRental = rental.rental_items
                        .filter((otherItem: any) => otherItem.id !== item.id)
                        .map((otherItem: any) => itemBikes[otherItem.id] !== undefined ? itemBikes[otherItem.id] : otherItem.bike_id);

                      // Filtramos las unidades que pertenecen a la categoría, no están en mantenimiento ni ocupadas en esas fechas
                      const matchingBikes = allBikes.filter((b: any) => {
                        if (b.category_id !== item.category_id) return false;
                        if (b.status === 'maintenance' || b.status === 'retired') return false;
                        // Si el pedido es para hoy, la bici tiene que estar físicamente disponible ahora
                        if (!isFutureReservation && b.status !== 'available') return false;
                        if (assignedBikeIdsInThisRental.includes(b.id)) return false;
                        if (conflictingBikesForThisRental.has(b.id)) return false;
                        return true;
                      });

                      const currentSelectedBikeId = itemBikes[item.id] !== undefined ? itemBikes[item.id] : (item.bike_id || '');

                      return (
                        <div key={item.id} className="flex flex-wrap items-center justify-between gap-2 bg-slate-50 dark:bg-zinc-950 p-3 rounded-xl border border-slate-200 dark:border-zinc-800">
                          <div className="text-sm">
                            <span className="font-bold text-slate-900 dark:text-white">{item.catalog_categories?.name}</span>
                            <span className="text-xs text-orange-600 dark:text-orange-400 font-semibold ml-2">
                              {[item.catalog_categories?.wheel_size, item.catalog_categories?.frame_size ? `Talle ${item.catalog_categories.frame_size}` : null].filter(Boolean).join(' • ')}
                            </span>
                          </div>
                          {rental.status === 'active' ? (
                            <span className="px-3 py-1 rounded-lg bg-orange-50 dark:bg-orange-950/60 text-orange-800 dark:text-orange-300 border border-orange-200 dark:border-orange-700/60 text-xs font-bold">
                              Unidad: {item.bikes_inventory?.internal_code || 'Asignada'}
                            </span>
                          ) : (
                            <select
                              value={currentSelectedBikeId}
                              onChange={(e) => handleAssignBike(item.id, e.target.value, rental)}
                              className="bg-white dark:bg-zinc-900 border border-slate-300 dark:border-zinc-700 rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-900 dark:text-white focus:border-orange-600 dark:focus:border-orange-500 outline-none transition"
                            >
                              <option value="">-- Asignar unidad --</option>
                              {currentSelectedBikeId && item.bikes_inventory && currentSelectedBikeId === item.bike_id && (
                                <option value={currentSelectedBikeId}>{item.bikes_inventory.internal_code} (Sel.)</option>
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

                  <div className="bg-slate-50 dark:bg-zinc-950 p-3.5 rounded-xl border border-slate-200 dark:border-zinc-800 flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-zinc-300 flex items-center gap-1.5">
                      <DollarSign className="w-4 h-4 text-orange-600 dark:text-orange-500" /> Pago:
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleTogglePaid(rental.id, true)}
                        className={`px-4 py-1.5 rounded-lg text-xs font-extrabold transition ${rental.is_paid ? 'bg-orange-600 text-white ring-2 ring-orange-400' : 'bg-white dark:bg-zinc-900 text-slate-600 dark:text-zinc-400 border border-slate-200 dark:border-zinc-800 hover:text-slate-900 dark:hover:text-white'}`}
                      >
                        SÍ
                      </button>
                      <button
                        onClick={() => handleTogglePaid(rental.id, false)}
                        className={`px-4 py-1.5 rounded-lg text-xs font-extrabold transition ${!rental.is_paid ? 'bg-red-600 text-white ring-2 ring-red-400' : 'bg-white dark:bg-zinc-900 text-slate-600 dark:text-zinc-400 border border-slate-200 dark:border-zinc-800 hover:text-slate-900 dark:hover:text-white'}`}
                      >
                        PENDIENTE DE PAGO
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center justify-between bg-slate-50/80 dark:bg-zinc-950/60 px-3 py-2 rounded-xl border border-slate-200 dark:border-zinc-800/80 text-xs">
                    <span className="text-slate-600 dark:text-zinc-400 truncate">
                      <FileText className="w-3.5 h-3.5 inline mr-1 text-orange-600 dark:text-orange-500" />
                      {rental.notes || 'Sin notas'}
                    </span>
                    <button onClick={() => handleUpdateNotes(rental.id, rental.notes)} className="text-orange-600 dark:text-orange-400 hover:text-orange-700 dark:hover:text-orange-300 hover:underline font-bold ml-3 shrink-0">
                      {rental.notes ? 'Editar' : '+ Nota'}
                    </button>
                  </div>
                </div>

                <div className="pt-3 border-t border-slate-100 dark:border-zinc-800 flex flex-wrap gap-2 justify-end">
                  {rental.status === 'pending' && (
                    <>
                      <button onClick={() => handleChangeStatus(rental, 'cancelled')} className="px-3 py-2 rounded-xl bg-slate-100 dark:bg-zinc-800 hover:bg-red-100 dark:hover:bg-red-950 text-slate-700 dark:text-zinc-300 hover:text-red-700 dark:hover:text-red-300 text-xs font-bold transition">
                        Cancelar
                      </button>
                      <button onClick={() => setReserveRental(rental)} className="px-4 py-2 rounded-xl bg-slate-50 dark:bg-zinc-950 hover:bg-slate-100 dark:hover:bg-zinc-800 text-orange-600 dark:text-orange-400 text-xs font-bold border border-orange-200 dark:border-orange-500/40 transition">
                        Reservar
                      </button>
                      <button onClick={() => handleChangeStatus(rental, 'active')} className="px-5 py-2 rounded-xl bg-orange-600 hover:bg-orange-500 text-white text-xs font-extrabold uppercase tracking-wider transition shadow-md shadow-orange-600/30 dark:shadow-orange-950/50">
                        Activar
                      </button>
                    </>
                  )}
                  {rental.status === 'reserved' && (
                    <>
                      <button onClick={() => handleChangeStatus(rental, 'cancelled')} className="px-3 py-2 rounded-xl bg-slate-100 dark:bg-zinc-800 hover:bg-red-100 dark:hover:bg-red-950 text-slate-700 dark:text-zinc-300 hover:text-red-700 dark:hover:text-red-300 text-xs font-bold transition">
                        Cancelar
                      </button>
                      <button onClick={() => handleChangeStatus(rental, 'active')} className="px-5 py-2 rounded-xl bg-orange-600 hover:bg-orange-500 text-white text-xs font-extrabold uppercase tracking-wider transition shadow-md shadow-orange-600/30 dark:shadow-orange-950/50">
                        Entregar (Activar)
                      </button>
                    </>
                  )}
                  {rental.status === 'active' && (
                    <button onClick={() => handleReturnClick(rental)} className="w-full py-2.5 rounded-xl bg-gradient-to-r from-orange-600 to-red-600 hover:from-orange-500 hover:to-red-500 text-white text-sm font-extrabold uppercase tracking-wider transition shadow-lg shadow-orange-600/30 dark:shadow-orange-950/50">
                      Registrar Devolución
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modales */}
      {reserveRental && (
        <ReserveModal
          customerName={reserveRental.customer_name}
          initialDate={reserveRental.start_date}
          onClose={() => setReserveRental(null)}
          onConfirm={async (pickupDate) => {
            const inclusiveEnd = calculateInclusiveEndDate(pickupDate, reserveRental.days_count, reserveRental.notes);
            await handleChangeStatus(reserveRental, 'reserved', {
              start_date: pickupDate,
              end_date: inclusiveEnd,
            });
            setReserveRental(null);
          }}
        />
      )}

      {returnRental && (
        <PaymentConfirmModal
          customerName={returnRental.customer_name}
          totalAmount={returnRental.total_amount}
          cashAmount={calculateTotalByMethod(returnRental, 'cash')}
          transferAmount={calculateTotalByMethod(returnRental, 'transfer')}
          initialMethod={returnRental.payment_method}
          onClose={() => setReturnRental(null)}
          onConfirm={async (method) => {
            const finalAmount = calculateTotalByMethod(returnRental, method);
            const is2Hours = Boolean(returnRental.notes?.includes('2 horas'));
            const isTransferOrCard = method !== 'cash';
            const multiplier = is2Hours ? 1 : Number(returnRental.days_count || 1);

            for (const item of returnRental.rental_items || []) {
              const cat = getCategoryPricesForItem(item);
              if (cat) {
                const unitPrice = is2Hours
                  ? Number(isTransferOrCard ? cat.price_2h_transfer : cat.price_2h_cash)
                  : Number(isTransferOrCard ? cat.price_1day_transfer : cat.price_1day_cash);
                if (unitPrice && !isNaN(unitPrice)) {
                  await supabase
                    .from('rental_items')
                    .update({ price_applied: unitPrice * multiplier })
                    .eq('id', item.id);
                }
              }
            }

            await supabase
              .from('rentals')
              .update({
                total_amount: finalAmount,
                payment_method: method,
                is_paid: true,
              })
              .eq('id', returnRental.id);

            await updateRentalStatus(returnRental.id, 'completed', {
              is_paid: true,
              payment_method: method,
              total_amount: finalAmount,
            });

            await supabase
              .from('cash_transactions')
              .update({
                amount: finalAmount,
                payment_method: method,
              })
              .eq('rental_id', returnRental.id);

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