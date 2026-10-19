'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Edit3, Plus, Trash2, X } from 'lucide-react';

interface Category {
  id: string;
  name: string;
  wheel_size: string | null;
  frame_size: string | null;
  price_per_day: number;
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

export default function EditRentalModal({ rental, categories, allBikes, onClose, onSaved }: EditRentalModalProps) {
  const [editForm, setEditForm] = useState({
    customer_name: rental.customer_name,
    customer_dni: rental.customer_dni,
    customer_phone: rental.customer_phone,
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

  const calculatedEditTotal = editItems.reduce((acc, item) => {
    const cat = categories.find((c) => c.id === item.category_id);
    const price = cat ? Number(cat.price_per_day) : 0;
    return acc + price * editForm.days_count;
  }, 0);

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

    setSavingEdit(true);
    try {
      for (const removed of removedItemIds) {
        await supabase.from('rental_items').delete().eq('id', removed.itemId);
        if (removed.bikeId) {
          await supabase.from('bikes_inventory').update({ status: 'available' }).eq('id', removed.bikeId);
        }
      }

      const targetBikeStatus = rental.status === 'active' ? 'rented' : 'reserved';

      for (const item of editItems) {
        const cat = categories.find((c) => c.id === item.category_id);
        const priceApplied = (cat ? Number(cat.price_per_day) : 0) * editForm.days_count;

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

        if (item.bike_id && (rental.status === 'active' || rental.status === 'reserved')) {
          await supabase.from('bikes_inventory').update({ status: targetBikeStatus }).eq('id', item.bike_id);
        }
      }

      const startObj = new Date(editForm.start_date + 'T00:00:00');
      const endObj = new Date(startObj);
      endObj.setDate(startObj.getDate() + editForm.days_count);

      const { error: rentalUpdateError } = await supabase
        .from('rentals')
        .update({
          customer_name: editForm.customer_name,
          customer_dni: editForm.customer_dni,
          customer_phone: editForm.customer_phone,
          people_count: editForm.people_count,
          days_count: editForm.days_count,
          start_date: editForm.start_date,
          end_date: endObj.toISOString().split('T')[0],
          payment_method: editForm.payment_method,
          is_paid: editForm.is_paid,
          total_amount: calculatedEditTotal,
        })
        .eq('id', rental.id);

      if (rentalUpdateError) throw rentalUpdateError;

      onSaved();
    } catch (err: any) {
      alert('Error al guardar cambios: ' + err.message);
    } finally {
      setSavingEdit(false);
    }
  };

  const availableBikesOnly = allBikes.filter((b) => b.status === 'available');

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

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs text-slate-400 mb-1">Nombre del Cliente</label>
            <input
              type="text"
              required
              value={editForm.customer_name}
              onChange={(e) => setEditForm({ ...editForm, customer_name: e.target.value })}
              className="w-full p-2.5 rounded-xl bg-slate-950 border border-slate-700 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">DNI</label>
            <input
              type="text"
              required
              value={editForm.customer_dni}
              onChange={(e) => setEditForm({ ...editForm, customer_dni: e.target.value })}
              className="w-full p-2.5 rounded-xl bg-slate-950 border border-slate-700 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">Teléfono</label>
            <input
              type="text"
              required
              value={editForm.customer_phone}
              onChange={(e) => setEditForm({ ...editForm, customer_phone: e.target.value })}
              className="w-full p-2.5 rounded-xl bg-slate-950 border border-slate-700 text-sm"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div>
            <label className="block text-xs text-slate-400 mb-1">Días de Alquiler</label>
            <input
              type="number"
              min={1}
              required
              value={editForm.days_count}
              onChange={(e) => setEditForm({ ...editForm, days_count: Math.max(1, Number(e.target.value)) })}
              className="w-full p-2.5 rounded-xl bg-slate-950 border border-slate-700 text-sm font-bold"
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
              className="w-full p-2.5 rounded-xl bg-slate-950 border border-slate-700 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">Fecha Inicio / Retiro</label>
            <input
              type="date"
              required
              value={editForm.start_date}
              onChange={(e) => setEditForm({ ...editForm, start_date: e.target.value })}
              className="w-full p-2.5 rounded-xl bg-slate-950 border border-slate-700 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">Medio de Pago</label>
            <select
              value={editForm.payment_method}
              onChange={(e) => setEditForm({ ...editForm, payment_method: e.target.value as any })}
              className="w-full p-2.5 rounded-xl bg-slate-950 border border-slate-700 text-sm font-semibold"
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
                if (categories.length === 0) return;
                setEditItems([...editItems, { category_id: categories[0].id, bike_id: null }]);
              }}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold"
            >
              <Plus className="w-3.5 h-3.5" /> Agregar Bici / Accesorio
            </button>
          </div>

          <div className="space-y-2">
            {editItems.map((item, idx) => {
              const selectableBikes = allBikes.filter(
                (b) =>
                  b.category_id === item.category_id &&
                  (b.status === 'available' || b.id === item.bike_id || b.id === item.old_bike_id)
              );

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
                      {categories.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}{' '}
                          {[c.wheel_size, c.frame_size ? `Talle ${c.frame_size}` : null]
                            .filter(Boolean)
                            .join(' • ')}{' '}
                          (${Number(c.price_per_day).toLocaleString('es-AR')}/día)
                        </option>
                      ))}
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
            <span className="text-xs text-slate-400 block">Nuevo Total Calculado:</span>
            <span className="text-2xl font-extrabold text-emerald-400">
              ${calculatedEditTotal.toLocaleString('es-AR')}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl bg-slate-800 text-xs font-semibold"
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