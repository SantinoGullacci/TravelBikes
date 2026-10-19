'use client';

import { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { Bike, Zap, Caravan, Plus, Minus, CheckCircle2, Users, Calendar, ShoppingBag } from 'lucide-react';

interface StockVariant {
  category_id: string;
  name: string;
  type: 'bike' | 'ebike' | 'accessory';
  wheel_size: string | null;
  frame_size: string | null;
  description: string | null;
  price_per_day: number;
  available_count: number;
}

export default function KioskCheckInPage() {
  const [variants, setVariants] = useState<StockVariant[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  // Pestaña activa para no saturar la pantalla de la tablet
  const [activeTab, setActiveTab] = useState<'bikes' | 'accessory'>('bikes');
  // Cantidades seleccionadas por category_id (cada variante de talle/rodado tiene su ID)
  const [selectedQuantities, setSelectedQuantities] = useState<Record<string, number>>({});

  const [formData, setFormData] = useState({
    customer_name: '',
    customer_dni: '',
    customer_phone: '',
    people_count: 1,
    days_count: 1,
    payment_method: 'cash' as 'cash' | 'transfer' | 'bank',
  });

  const fetchAvailableStock = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('available_stock_by_category')
      .select('*')
      .order('name', { ascending: true });

    if (!error && data) {
      setVariants(data);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchAvailableStock();
  }, []);

  // Agrupar variantes por Nombre de Modelo dentro de la pestaña activa
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

  // Lista detallada de lo que el cliente ya sumó al carrito
  const selectedList = useMemo(() => {
    return variants
      .filter((v) => (selectedQuantities[v.category_id] || 0) > 0)
      .map((v) => ({
        ...v,
        qty: selectedQuantities[v.category_id],
      }));
  }, [variants, selectedQuantities]);

  const totalSelectedItems = selectedList.reduce((acc, item) => acc + item.qty, 0);

  const totalAmount = selectedList.reduce(
    (sum, item) => sum + item.qty * Number(item.price_per_day) * formData.days_count,
    0
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (totalSelectedItems === 0) {
      alert('Por favor, seleccioná al menos una bicicleta o accesorio.');
      return;
    }

    setSubmitting(true);
    try {
      const rentalId = crypto.randomUUID();
      const today = new Date();
      const endDate = new Date(today);
      endDate.setDate(today.getDate() + formData.days_count);

      const { error: rentalError } = await supabase.from('rentals').insert({
        id: rentalId,
        customer_name: formData.customer_name,
        customer_dni: formData.customer_dni,
        customer_phone: formData.customer_phone,
        people_count: formData.people_count,
        days_count: formData.days_count,
        start_date: today.toISOString().split('T')[0],
        end_date: endDate.toISOString().split('T')[0],
        payment_method: formData.payment_method,
        total_amount: totalAmount,
        status: 'pending',
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
            price_applied: Number(item.price_per_day) * formData.days_count,
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
      people_count: 1,
      days_count: 1,
      payment_method: 'cash',
    });
    setActiveTab('bikes');
    setSubmitted(false);
    fetchAvailableStock();
  };

  if (submitted) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex flex-col items-center justify-center p-6 text-center">
        <CheckCircle2 className="w-24 h-24 text-emerald-400 mb-6 animate-bounce" />
        <h1 className="text-4xl font-bold mb-3">¡Pedido Registrado!</h1>
        <p className="text-xl text-slate-300 max-w-md mb-8">
          Gracias, <span className="font-semibold text-white">{formData.customer_name}</span>. 
          Devolvele la tablet al vendedor para que te entregue tus bicicletas.
        </p>
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 mb-8 w-full max-w-md">
          <p className="text-slate-400 text-sm">Total a abonar ({formData.days_count} día/s)</p>
          <p className="text-4xl font-extrabold text-emerald-400 mt-1">
            ${totalAmount.toLocaleString('es-AR')}
          </p>
        </div>
        <button
          onClick={resetKiosk}
          className="px-8 py-4 bg-sky-600 hover:bg-sky-500 rounded-xl font-bold text-lg transition"
        >
          Continuar
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4 md:p-8 max-w-6xl mx-auto">
      <header className="mb-6 border-b border-slate-800 pb-4 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-white">
            Travel Bikes <span className="text-sky-400">Puerto Madryn</span>
          </h1>
          <p className="text-slate-400 text-sm mt-1">Seleccioná rodado, talle y accesorios para tu paseo</p>
        </div>
      </header>

      <form onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* COLUMNA IZQUIERDA: Pestañas + Modelos agrupados con sus Talles/Rodados */}
        <div className="lg:col-span-7 space-y-6">
          {/* Personas y Días */}
          <div className="grid grid-cols-2 gap-4 bg-slate-900 p-4 rounded-2xl border border-slate-800">
            <div>
              <label className="flex items-center gap-2 text-xs text-slate-400 mb-2">
                <Users className="w-4 h-4 text-sky-400" /> ¿Cuántas personas?
              </label>
              <div className="flex items-center justify-between bg-slate-950 rounded-xl p-1.5 border border-slate-800">
                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, people_count: Math.max(1, formData.people_count - 1) })}
                  className="p-2.5 bg-slate-800 rounded-lg active:scale-95"
                >
                  <Minus className="w-5 h-5" />
                </button>
                <span className="text-xl font-bold">{formData.people_count}</span>
                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, people_count: formData.people_count + 1 })}
                  className="p-2.5 bg-slate-800 rounded-lg active:scale-95"
                >
                  <Plus className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div>
              <label className="flex items-center gap-2 text-xs text-slate-400 mb-2">
                <Calendar className="w-4 h-4 text-sky-400" /> ¿Cuántos días?
              </label>
              <div className="flex items-center justify-between bg-slate-950 rounded-xl p-1.5 border border-slate-800">
                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, days_count: Math.max(1, formData.days_count - 1) })}
                  className="p-2.5 bg-slate-800 rounded-lg active:scale-95"
                >
                  <Minus className="w-5 h-5" />
                </button>
                <span className="text-xl font-bold">{formData.days_count}</span>
                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, days_count: formData.days_count + 1 })}
                  className="p-2.5 bg-slate-800 rounded-lg active:scale-95"
                >
                  <Plus className="w-5 h-5" />
                </button>
              </div>
            </div>
          </div>

{/* Pestañas de Categoría (2 pestañas: Bicicletas y Accesorios) */}
          <div className="grid grid-cols-2 gap-2 bg-slate-900 p-1.5 rounded-2xl border border-slate-800">
            {[
              { id: 'bikes', label: 'Bicicletas (MTB y E-Bike)', icon: Bike },
              { id: 'accessory', label: 'Accesorios y Trailers', icon: Caravan },
            ].map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id as 'bikes' | 'accessory')}
                  className={`flex items-center justify-center gap-2 py-3.5 px-4 rounded-xl font-bold text-sm transition ${
                    isActive
                      ? 'bg-sky-600 text-white shadow-lg'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <Icon className="w-5 h-5" />
                  {tab.label}
                </button>
              );
            })}
          </div>
          

          {/* Modelos Agrupados con filas de Rodado + Talle */}
          {loading ? (
            <p className="text-slate-400 py-8 text-center">Cargando catálogo...</p>
          ) : (
            <div className="space-y-4">
              {Object.entries(groupedModels).map(([modelName, modelVariants]) => (
                <div
                  key={modelName}
                  className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-xl font-bold text-white">{modelName}</h3>
                      {modelVariants[0].type === 'ebike' && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30">
                          <Zap className="w-3.5 h-3.5" /> Eléctrica
                        </span>
                      )}
                    </div>
                    {modelVariants[0].description && (
                      <p className="text-xs text-slate-400 mt-0.5">{modelVariants[0].description}</p>
                    )}
                  </div>

                  {/* Lista de variantes (Rodado y Talle) de ese modelo */}
                  <div className="divide-y divide-slate-800/80">
                    {modelVariants.map((variant) => {
                      const qty = selectedQuantities[variant.category_id] || 0;
                      const outOfStock = variant.available_count === 0;

                      return (
                        <div
                          key={variant.category_id}
                          className="py-3 first:pt-1 last:pb-0 flex items-center justify-between gap-4"
                        >
                          <div className="flex flex-wrap items-center gap-2">
                            {variant.wheel_size && (
                              <span className="px-2.5 py-1 rounded-lg bg-sky-950 text-sky-300 border border-sky-800 text-xs font-bold">
                                Rodado {variant.wheel_size}
                              </span>
                            )}
                            {variant.frame_size && (
                              <span className="px-2.5 py-1 rounded-lg bg-slate-800 text-slate-200 text-xs font-semibold">
                                Talle {variant.frame_size}
                              </span>
                            )}
                            <span className="text-emerald-400 font-bold text-sm ml-1">
                              ${Number(variant.price_per_day).toLocaleString('es-AR')}/día
                            </span>
                            <span className="text-xs text-slate-500">
                              ({outOfStock ? 'Agotado' : `${variant.available_count} disp.`})
                            </span>
                          </div>

                          <div className="flex items-center gap-2.5">
                            <button
                              type="button"
                              disabled={qty === 0}
                              onClick={() => updateQuantity(variant.category_id, -1, variant.available_count)}
                              className="p-2.5 rounded-xl bg-slate-800 disabled:opacity-25 active:scale-95"
                            >
                              <Minus className="w-4 h-4" />
                            </button>
                            <span className="w-6 text-center text-lg font-bold">{qty}</span>
                            <button
                              type="button"
                              disabled={qty >= variant.available_count}
                              onClick={() => updateQuantity(variant.category_id, 1, variant.available_count)}
                              className="p-2.5 rounded-xl bg-sky-600 text-white disabled:opacity-25 active:scale-95"
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

        {/* COLUMNA DERECHA: Carrito de selección + Formulario del Cliente */}
        <div className="lg:col-span-5 space-y-6">
          {/* Resumen de lo elegido (para que vea qué tiene de otras pestañas) */}
          <div className="bg-slate-900 p-5 rounded-2xl border border-slate-800">
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2 mb-3">
              <ShoppingBag className="w-4 h-4 text-sky-400" /> Tu Selección ({totalSelectedItems})
            </h2>
            {selectedList.length === 0 ? (
              <p className="text-sm text-slate-500 italic">Todavía no agregaste bicicletas ni accesorios.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {selectedList.map((item) => (
                  <li key={item.category_id} className="flex justify-between items-center bg-slate-950 px-3 py-2 rounded-xl border border-slate-800">
                    <div>
                      <span className="font-bold text-sky-400">{item.qty}x</span>{' '}
                      <span className="font-medium">{item.name}</span>{' '}
                      <span className="text-xs text-slate-400">
                        {[item.wheel_size, item.frame_size ? `Talle ${item.frame_size}` : null]
                          .filter(Boolean)
                          .join(' • ')}
                      </span>
                    </div>
                    <span className="font-semibold text-slate-200">
                      ${(item.qty * Number(item.price_per_day) * formData.days_count).toLocaleString('es-AR')}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Formulario de Datos */}
          <div className="bg-slate-900 p-6 rounded-2xl border border-slate-800 space-y-4">
            <h2 className="text-xl font-bold">Tus Datos</h2>

            <div>
              <label className="block text-xs text-slate-400 mb-1">Nombre y Apellido</label>
              <input
                type="text"
                required
                placeholder="Ej. Juan Pérez"
                value={formData.customer_name}
                onChange={(e) => setFormData({ ...formData, customer_name: e.target.value })}
                className="w-full p-3.5 rounded-xl bg-slate-950 border border-slate-800 text-base focus:border-sky-500 outline-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-slate-400 mb-1">DNI / Pasaporte</label>
                <input
                  type="text"
                  inputMode="numeric"
                  required
                  placeholder="Sin puntos"
                  value={formData.customer_dni}
                  onChange={(e) => setFormData({ ...formData, customer_dni: e.target.value })}
                  className="w-full p-3.5 rounded-xl bg-slate-950 border border-slate-800 text-base focus:border-sky-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Teléfono / WhatsApp</label>
                <input
                  type="tel"
                  inputMode="tel"
                  required
                  placeholder="Ej. 2804123456"
                  value={formData.customer_phone}
                  onChange={(e) => setFormData({ ...formData, customer_phone: e.target.value })}
                  className="w-full p-3.5 rounded-xl bg-slate-950 border border-slate-800 text-base focus:border-sky-500 outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs text-slate-400 mb-2">Método de Pago</label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { id: 'cash', label: 'Efectivo' },
                  { id: 'transfer', label: 'Transferencia' },
                  { id: 'bank', label: 'Tarjeta' },
                ].map((method) => (
                  <button
                    key={method.id}
                    type="button"
                    onClick={() => setFormData({ ...formData, payment_method: method.id as any })}
                    className={`p-3 rounded-xl font-semibold text-xs border transition ${
                      formData.payment_method === method.id
                        ? 'bg-sky-600 border-sky-400 text-white'
                        : 'bg-slate-950 border-slate-800 text-slate-400'
                    }`}
                  >
                    {method.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="pt-4 border-t border-slate-800 flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-400">Total ({formData.days_count} día/s)</p>
                <p className="text-3xl font-extrabold text-emerald-400">
                  ${totalAmount.toLocaleString('es-AR')}
                </p>
              </div>
              <button
                type="submit"
                disabled={submitting || totalSelectedItems === 0}
                className="px-6 py-4 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white font-bold rounded-xl text-base transition active:scale-95"
              >
                {submitting ? 'Enviando...' : 'Confirmar Alquiler'}
              </button>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}