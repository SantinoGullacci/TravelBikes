'use client';

import { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { Edit3, Plus, Trash2, X } from 'lucide-react';

interface Category {
  id: string;
  name: string;
  wheel_size: string | null;
  frame_size: string | null;
  price_per_day?: number;
  price_2h_cash?: number;
  price_2h_transfer?: number;
  price_1day_cash?: number;
  price_1day_transfer?: number;
}

interface PhysicalBike {
  id: string;
  category_id: string;
  internal_code: string;
  status: string;
}

interface EditableItem {
  id?: string;
  category_id: string;
  bike_id: string | null;
  old_bike_id?: string | null;
}

interface EditRentalModalProps {
  rental: any;
  categories: Category[];
  allBikes: PhysicalBike[];
  onClose: () => void;
  onSaved: () => void;
}

// Calcula la fecha de fin inclusiva (1 día el miércoles = empieza y termina el miércoles)
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

const doRentalDatesOverlap = (startA: string, endA: string, startB: string, endB: string) => {
  if (!startA || !endA || !startB || !endB) return false;
  return startA <= endB && endA >= startB;
};

export default function EditRentalModal({ rental, categories, allBikes, onClose, onSaved }: EditRentalModalProps) {
  const [editForm, setEditForm] = useState({
    customer_name: rental.customer_name,
    customer_dni: rental.customer_dni,
    customer_phone: rental.customer_phone,
    customer_address: rental.customer_address || '',
    people_count: rental.people_count,
    days_count: rental.days_count,
    start_date: rental.start_date,
    payment_method: rental.payment_method,
    is_paid: rental.is_paid,
  });

  const [editItems, setEditItems] = useState<EditableItem[]>(
    rental.rental_items.map((item: any) => ({
      id: item.id,
      category_id: item.category_id,
      bike_id: item.bike_id,
      old_bike_id: item.bike_id,
    }))
  );

  const [removedItemIds, setRemovedItemIds] = useState<{ itemId: string; bikeId: string | null }[]>([]);
  const [savingEdit, setSavingEdit] = useState(false);
  const [fullCategories, setFullCategories] = useState<Category[]>(categories);
  const [otherActiveRentals, setOtherActiveRentals] = useState<any[]>([]);

  // Cargamos las tarifas completas y los compromisos vigentes de otros alquileres para blindar fechas y stock
  useEffect(() => {
    const fetchFreshContext = async () => {
      const [catsRes, rentalsRes] = await Promise.all([
        supabase
          .from('catalog_categories')
          .select('id, name, wheel_size, frame_size, price_2h_cash, price_2h_transfer, price_1day_cash, price_1day_transfer')
          .eq('active', true)
          .order('name', { ascending: true }),
        supabase
          .from('rentals')
          .select('id, status, start_date, end_date, days_count, notes, rental_items(id, category_id, bike_id)')
          .in('status', ['pending', 'reserved', 'active'])
          .neq('id', rental.id),
      ]);

      if (!catsRes.error && catsRes.data) {
        setFullCategories(catsRes.data as Category[]);
      }
      if (!rentalsRes.error && rentalsRes.data) {
        setOtherActiveRentals(rentalsRes.data);
      }
    };

    fetchFreshContext();
  }, [rental.id]);

  const is2Hours = Boolean(rental.notes?.includes('2 horas'));
  const isTransferOrCard = editForm.payment_method !== 'cash';
  const daysMultiplier = is2Hours ? 1 : Math.max(1, Number(editForm.days_count || 1));

  // Obtiene el precio unitario correcto según categoría, duración (2h vs día) y método de pago (efectivo vs transf/banco)
  const getUnitPriceForCategory = (categoryId: string) => {
    const cat = fullCategories.find((c) => c.id === categoryId) || categories.find((c) => c.id === categoryId);
    if (!cat) return 0;

    if (is2Hours) {
      const p2h = isTransferOrCard ? Number(cat.price_2h_transfer ?? 0) : Number(cat.price_2h_cash ?? 0);
      if (p2h > 0) return p2h;
    } else {
      const p1d = isTransferOrCard ? Number(cat.price_1day_transfer ?? 0) : Number(cat.price_1day_cash ?? 0);
      if (p1d > 0) return p1d;
    }

    return Number(cat.price_per_day ?? 0);
  };

  const calculatedEditTotal = editItems.reduce((acc, item) => {
    const unitPrice = getUnitPriceForCategory(item.category_id);
    return acc + unitPrice * daysMultiplier;
  }, 0);

  // Calcula qué unidades físicas y cuántos cupos por categoría ya están ocupados por OTROS pedidos en las fechas editadas
  const dateConflictInfo = useMemo(() => {
    const targetStart = editForm.start_date;
    const targetEnd = calculateInclusiveEndDate(targetStart, editForm.days_count, rental.notes);

    const conflictingBikeIds = new Set<string>();
    const occupiedCountByCat: Record<string, number> = {};

    otherActiveRentals.forEach((other) => {
      const otherStart = other.start_date;
      const otherEnd = calculateInclusiveEndDate(otherStart, other.days_count, other.notes);

      if (doRentalDatesOverlap(targetStart, targetEnd, otherStart, otherEnd)) {
        (other.rental_items || []).forEach((it: any) => {
          if (it.category_id) {
            occupiedCountByCat[it.category_id] = (occupiedCountByCat[it.category_id] || 0) + 1;
          }
          if (it.bike_id) {
            conflictingBikeIds.add(it.bike_id);
          }
        });
      }
    });

    const totalUsableByCat: Record<string, number> = {};
    allBikes.forEach((b) => {
      if (b.status !== 'maintenance' && b.status !== 'retired') {
        totalUsableByCat[b.category_id] = (totalUsableByCat[b.category_id] || 0) + 1;
      }
    });

    return {
      conflictingBikeIds,
      occupiedCountByCat,
      totalUsableByCat,
    };
  }, [editForm.start_date, editForm.days_count, rental.notes, otherActiveRentals, allBikes]);

  const handleSaveFullEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (editItems.length === 0) {
      alert('El alquiler debe tener al menos una bicicleta o accesorio.');
      return;
    }

    if (rental.status === 'active' && editItems.some((i) => !i.bike_id)) {
      alert('En un alquiler activo, todas las bicicletas/accesorios deben tener un código físico asignado.');
      return;
    }

    // 1. Verificar que no haya códigos físicos duplicados dentro de este mismo modal
    const selectedBikeIds = editItems.map((i) => i.bike_id).filter(Boolean) as string[];
    if (new Set(selectedBikeIds).size !== selectedBikeIds.length) {
      alert('Error: Asignaste la misma unidad física más de una vez en este pedido. Elegí códigos diferentes.');
      return;
    }

    // 2. Verificar que ningún código físico seleccionado esté comprometido en otra reserva/alquiler en estas fechas
    for (const bId of selectedBikeIds) {
      if (dateConflictInfo.conflictingBikeIds.has(bId)) {
        const bikeObj = allBikes.find((b) => b.id === bId);
        alert(
          `La unidad física ${bikeObj?.internal_code || ''} ya está asignada a otra reserva o alquiler que se cruza con estas fechas.`
        );
        return;
      }
    }

    // 3. Verificar que la cantidad de bicicletas por categoría en este pedido no supere el stock disponible para las fechas elegidas
    const requestedCountByCat: Record<string, number> = {};
    editItems.forEach((item) => {
      requestedCountByCat[item.category_id] = (requestedCountByCat[item.category_id] || 0) + 1;
    });

    for (const [catId, requestedQty] of Object.entries(requestedCountByCat)) {
      const totalUsable = dateConflictInfo.totalUsableByCat[catId] || 0;
      const occupiedByOthers = dateConflictInfo.occupiedCountByCat[catId] || 0;
      const maxAllowedForThisRental = Math.max(0, totalUsable - occupiedByOthers);

      if (requestedQty > maxAllowedForThisRental) {
        const catObj = fullCategories.find((c) => c.id === catId) || categories.find((c) => c.id === catId);
        alert(
          `Sin cupo suficiente para "${catObj?.name || 'esta categoría'}" en la fecha ${editForm.start_date}: tenés ${totalUsable} unidad(es) en flota, ${occupiedByOthers} ocupada(s) en otros pedidos para esa fecha y estás intentando asignar ${requestedQty}.`
        );
        return;
      }
    }

    setSavingEdit(true);
    try {
      for (const removed of removedItemIds) {
        await supabase.from('rental_items').delete().eq('id', removed.itemId);
        if (removed.bikeId) {
          await supabase.from('bikes_inventory').update({ status: 'available' }).eq('id', removed.bikeId);
        }
      }

      const todayStr = new Date().toISOString().split('T')[0];

      for (const item of editItems) {
        const unitPrice = getUnitPriceForCategory(item.category_id);
        const priceApplied = unitPrice * daysMultiplier;

        if (item.id) {
          if (item.old_bike_id && item.old_bike_id !== item.bike_id) {
            await supabase.from('bikes_inventory').update({ status: 'available' }).eq('id', item.old_bike_id);
          }

          await supabase
            .from('rental_items')
            .update({
              category_id: item.category_id,
              bike_id: item.bike_id || null,
              price_applied: priceApplied,
            })
            .eq('id', item.id);
        } else {
          await supabase.from('rental_items').insert({
            rental_id: rental.id,
            category_id: item.category_id,
            bike_id: item.bike_id || null,
            price_applied: priceApplied,
          });
        }

        // Solo marcamos como 'rented' en el inventario físico actual si el alquiler está activo,
        // o 'reserved' si la reserva es para hoy; así las reservas futuras se controlan por fecha sin bloquear el día de hoy.
        if (item.bike_id) {
          if (rental.status === 'active') {
            await supabase.from('bikes_inventory').update({ status: 'rented' }).eq('id', item.bike_id);
          } else if (rental.status === 'reserved' && editForm.start_date <= todayStr) {
            await supabase.from('bikes_inventory').update({ status: 'reserved' }).eq('id', item.bike_id);
          }
        }
      }

      const inclusiveEndDate = calculateInclusiveEndDate(editForm.start_date, editForm.days_count, rental.notes);

      const { error: rentalUpdateError } = await supabase
        .from('rentals')
        .update({
          customer_name: editForm.customer_name,
          customer_dni: editForm.customer_dni,
          customer_phone: editForm.customer_phone,
          customer_address: editForm.customer_address,
          people_count: editForm.people_count,
          days_count: editForm.days_count,
          start_date: editForm.start_date,
          end_date: inclusiveEndDate,
          payment_method: editForm.payment_method,
          is_paid: editForm.is_paid,
          total_amount: calculatedEditTotal,
        })
        .eq('id', rental.id);

      if (rentalUpdateError) throw rentalUpdateError;

      // Si el alquiler ya tenía un movimiento en Control de Caja, lo sincronizamos con el nuevo monto y método
      if (editForm.is_paid) {
        await supabase
          .from('cash_transactions')
          .update({
            amount: calculatedEditTotal,
            payment_method: editForm.payment_method,
          })
          .eq('rental_id', rental.id);
      }

      onSaved();
    } catch (err: any) {
      alert('Error al guardar cambios: ' + err.message);
    } finally {
      setSavingEdit(false);
    }
  };

  const todayStr = new Date().toISOString().split('T')[0];
  const isFutureDate = editForm.start_date > todayStr;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 overflow-y-auto">
      <form
        onSubmit={handleSaveFullEdit}
        className="bg-slate-900 border border-slate-800 rounded-2xl p-6 w-full max-w-2xl space-y-5 shadow-2xl my-8 max-h-[92vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <h3 className="text-lg font-bold text-white flex items-center gap-2">
            <Edit3 className="w-5 h-5 text-sky-400" /> Modificar Alquiler / Reserva
          </h3>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-slate-400 mb-1">Nombre del Cliente</label>
            <input
              type="text"
              required
              value={editForm.customer_name}
              onChange={(e) => setEditForm({ ...editForm, customer_name: e.target.value })}
              className="w-full p-2.5 rounded-xl bg-slate-950 border border-slate-700 text-sm text-white"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">Alojamiento / Dirección</label>
            <input
              type="text"
              value={editForm.customer_address}
              onChange={(e) => setEditForm({ ...editForm, customer_address: e.target.value })}
              className="w-full p-2.5 rounded-xl bg-slate-950 border border-slate-700 text-sm text-white"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">DNI</label>
            <input
              type="text"
              required
              value={editForm.customer_dni}
              onChange={(e) => setEditForm({ ...editForm, customer_dni: e.target.value })}
              className="w-full p-2.5 rounded-xl bg-slate-950 border border-slate-700 text-sm text-white"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">Teléfono</label>
            <input
              type="text"
              required
              value={editForm.customer_phone}
              onChange={(e) => setEditForm({ ...editForm, customer_phone: e.target.value })}
              className="w-full p-2.5 rounded-xl bg-slate-950 border border-slate-700 text-sm text-white"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div>
            <label className="block text-xs text-slate-400 mb-1">
              {is2Hours ? 'Modalidad (2 Horas)' : 'Días de Alquiler'}
            </label>
            <input
              type="number"
              min={1}
              disabled={is2Hours}
              required
              value={is2Hours ? 1 : editForm.days_count}
              onChange={(e) => setEditForm({ ...editForm, days_count: Math.max(1, Number(e.target.value)) })}
              className="w-full p-2.5 rounded-xl bg-slate-950 border border-slate-700 text-sm font-bold text-white disabled:opacity-50"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">Personas</label>
            <input
              type="number"
              min={1}
              required
              value={editForm.people_count}
              onChange={(e) => setEditForm({ ...editForm, people_count: Math.max(1, Number(e.target.value)) })}
              className="w-full p-2.5 rounded-xl bg-slate-950 border border-slate-700 text-sm text-white"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">Fecha Inicio / Retiro</label>
            <input
              type="date"
              required
              value={editForm.start_date}
              onChange={(e) => setEditForm({ ...editForm, start_date: e.target.value })}
              className="w-full p-2.5 rounded-xl bg-slate-950 border border-slate-700 text-sm text-white dark:[color-scheme:dark]"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">Medio de Pago</label>
            <select
              value={editForm.payment_method}
              onChange={(e) => setEditForm({ ...editForm, payment_method: e.target.value as any })}
              className="w-full p-2.5 rounded-xl bg-slate-950 border border-slate-700 text-sm font-semibold text-white"
            >
              <option value="cash">Efectivo</option>
              <option value="transfer">Transferencia</option>
              <option value="bank">Tarjeta / Banco</option>
            </select>
          </div>
        </div>

        <div className="space-y-3 border-t border-slate-800 pt-4">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-300">
              Bicicletas y Accesorios ({editItems.length})
            </label>
            <button
              type="button"
              onClick={() => {
                // Buscamos la primera categoría que todavía tenga cupo disponible para esa fecha
                const currentCounts: Record<string, number> = {};
                editItems.forEach((it) => {
                  currentCounts[it.category_id] = (currentCounts[it.category_id] || 0) + 1;
                });

                const availableCat = fullCategories.find((c) => {
                  const totalUsable = dateConflictInfo.totalUsableByCat[c.id] || 0;
                  const occupiedByOthers = dateConflictInfo.occupiedCountByCat[c.id] || 0;
                  const alreadyInModal = currentCounts[c.id] || 0;
                  return totalUsable - occupiedByOthers - alreadyInModal > 0;
                });

                if (!availableCat) {
                  alert('No quedan bicicletas ni accesorios con cupo disponible para agregar en esta fecha.');
                  return;
                }

                setEditItems([...editItems, { category_id: availableCat.id, bike_id: null }]);
              }}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold"
            >
              <Plus className="w-3.5 h-3.5" /> Agregar Bici / Accesorio
            </button>
          </div>

          <div className="space-y-2">
            {editItems.map((item, idx) => {
              // Evitar mostrar códigos físicos ya elegidos en otra fila de este mismo modal o comprometidos en esa fecha
              const chosenInOtherRows = editItems
                .filter((_, otherIdx) => otherIdx !== idx)
                .map((other) => other.bike_id)
                .filter(Boolean);

              const selectableBikes = allBikes.filter((b) => {
                if (b.category_id !== item.category_id) return false;
                if (b.status === 'maintenance' || b.status === 'retired') return false;
                if (b.id === item.bike_id || b.id === item.old_bike_id) return true;
                if (!isFutureDate && b.status !== 'available') return false;
                if (chosenInOtherRows.includes(b.id)) return false;
                if (dateConflictInfo.conflictingBikeIds.has(b.id)) return false;
                return true;
              });

              return (
                <div
                  key={idx}
                  className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-center bg-slate-950 p-2.5 rounded-xl border border-slate-800"
                >
                  <div className="sm:col-span-6">
                    <select
                      value={item.category_id}
                      onChange={(e) => {
                        const updated = [...editItems];
                        updated[idx] = { ...updated[idx], category_id: e.target.value, bike_id: null };
                        setEditItems(updated);
                      }}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs text-white"
                    >
                      {fullCategories.map((c) => {
                        const unitPrice = getUnitPriceForCategory(c.id);
                        const totalUsable = dateConflictInfo.totalUsableByCat[c.id] || 0;
                        const occupiedByOthers = dateConflictInfo.occupiedCountByCat[c.id] || 0;
                        const freeForThisRental = Math.max(0, totalUsable - occupiedByOthers);

                        return (
                          <option key={c.id} value={c.id} disabled={freeForThisRental === 0 && c.id !== item.category_id}>
                            {c.name}{' '}
                            {[c.wheel_size, c.frame_size ? `Talle ${c.frame_size}` : null]
                              .filter(Boolean)
                              .join(' • ')}{' '}
                            (${Number(unitPrice).toLocaleString('es-AR')} {is2Hours ? '/ 2hs' : '/ día'}) — [{freeForThisRental} disp.]
                          </option>
                        );
                      })}
                    </select>
                  </div>

                  <div className="sm:col-span-5">
                    <select
                      value={item.bike_id || ''}
                      onChange={(e) => {
                        const updated = [...editItems];
                        updated[idx] = { ...updated[idx], bike_id: e.target.value || null };
                        setEditItems(updated);
                      }}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs font-semibold text-emerald-300"
                    >
                      <option value="">-- Código físico --</option>
                      {selectableBikes.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.internal_code}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="sm:col-span-1 flex justify-end">
                    <button
                      type="button"
                      onClick={() => {
                        const target = editItems[idx];
                        if (target.id) {
                          setRemovedItemIds([...removedItemIds, { itemId: target.id, bikeId: target.old_bike_id || null }]);
                        }
                        setEditItems(editItems.filter((_, i) => i !== idx));
                      }}
                      className="p-2 rounded-lg text-rose-400 hover:bg-rose-950"
                      title="Quitar ítem"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-4 pt-4 border-t border-slate-800">
          <div>
            <span className="text-xs text-slate-400 block">
              Nuevo Total Calculado ({editForm.payment_method === 'cash' ? 'Efectivo' : 'Transferencia / Tarjeta'}):
            </span>
            <span className="text-2xl font-extrabold text-emerald-400">
              ${calculatedEditTotal.toLocaleString('es-AR')}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl bg-slate-800 text-xs font-semibold text-white"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={savingEdit}
              className="px-6 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold"
            >
              {savingEdit ? 'Guardando...' : 'Guardar Cambios'}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}