'use client';

import { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { Bike, Plus, RefreshCw, Wrench, CheckCircle, Trash2, Search, DollarSign, Edit3, PackagePlus, Layers } from 'lucide-react';

interface Category {
  id: string;
  name: string;
  type: 'bike' | 'ebike' | 'accessory';
  wheel_size: string | null;
  frame_size: string | null;
  price_2h_cash: number;
  price_2h_transfer: number;
  price_1day_cash: number;
  price_1day_transfer: number;
}

interface PhysicalBike {
  id: string;
  category_id: string;
  internal_code: string;
  status: 'available' | 'rented' | 'reserved' | 'maintenance';
  catalog_categories: {
    name: string;
    type: string;
    wheel_size: string | null;
    frame_size: string | null;
    price_2h_cash: number;
    price_2h_transfer: number;
    price_1day_cash: number;
    price_1day_transfer: number;
  };
}

const noSpinnerClass =
  '[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none';

export default function FleetDashboardPage() {
  const [bikes, setBikes] = useState<PhysicalBike[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');

  // Estados para el modal de Nueva Unidad / Nuevo Producto
  const [showAddModal, setShowAddModal] = useState(false);
  const [addMode, setAddMode] = useState<'existing' | 'new'>('existing');
  const [newBikeForm, setNewBikeForm] = useState({
    category_id: '',
    internal_code: '',
  });
  const [newCategoryForm, setNewCategoryForm] = useState({
    name: '',
    type: 'bike' as 'bike' | 'ebike' | 'accessory',
    wheel_size: '',
    frame_size: '',
    price_2h_cash: '',
    price_2h_transfer: '',
    price_1day_cash: '',
    price_1day_transfer: '',
    internal_code: '',
  });
  const [submitting, setSubmitting] = useState(false);

  // Estado para el modal de edición de las 4 tarifas por categoría
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [priceForm, setPriceForm] = useState({
    price_2h_cash: '',
    price_2h_transfer: '',
    price_1day_cash: '',
    price_1day_transfer: '',
  });
  const [savingPrices, setSavingPrices] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    const [bikesRes, catsRes] = await Promise.all([
      supabase
        .from('bikes_inventory')
        .select(`
          id,
          category_id,
          internal_code,
          status,
          catalog_categories ( name, type, wheel_size, frame_size, price_2h_cash, price_2h_transfer, price_1day_cash, price_1day_transfer )
        `)
        .order('internal_code', { ascending: true }),

      supabase
        .from('catalog_categories')
        .select('id, name, type, wheel_size, frame_size, price_2h_cash, price_2h_transfer, price_1day_cash, price_1day_transfer')
        .eq('active', true)
        .order('name', { ascending: true }),
    ]);

    if (bikesRes.data) setBikes(bikesRes.data as unknown as PhysicalBike[]);
    
    if (catsRes.data) {
      // Obtenemos los IDs de categorías que tienen al menos una unidad física en bikes_inventory
      const validCategoryIds = new Set((bikesRes.data || []).map((b: any) => b.category_id));

      // Filtramos las categorías para que solo aparezcan las que tienen stock físico creado
      const activeCats = (catsRes.data as Category[]).filter((c) => validCategoryIds.has(c.id));

      setCategories(activeCats);
      setNewBikeForm((prev) => {
        const stillExists = activeCats.some((c) => c.id === prev.category_id);
        return {
          ...prev,
          category_id: stillExists ? prev.category_id : activeCats[0]?.id || '',
        };
      });
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchData();

    const channel = supabase
      .channel('realtime-fleet')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bikes_inventory' }, () => {
        fetchData();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'catalog_categories' }, () => {
        fetchData();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const handleUpdateStatus = async (bikeId: string, targetStatus: 'available' | 'maintenance') => {
    const { error } = await supabase
      .from('bikes_inventory')
      .update({ status: targetStatus })
      .eq('id', bikeId);

    if (error) {
      alert('Error al actualizar estado: ' + error.message);
    } else {
      fetchData();
    }
  };

  const handleDeleteBike = async (bikeId: string, internalCode: string, categoryId: string) => {
    const remainingInCategory = bikes.filter(
      (b) => b.category_id === categoryId && b.id !== bikeId
    ).length;

    const confirmMsg =
      remainingInCategory === 0
        ? `¿Eliminar la unidad "${internalCode}"? Es la última unidad de este producto, por lo que el producto también se eliminará del catálogo y del Kiosco.`
        : `¿Eliminar la unidad "${internalCode}" del inventario?`;

    if (!confirm(confirmMsg)) return;

    // 1. Eliminamos la unidad física de bikes_inventory
    const { error } = await supabase.from('bikes_inventory').delete().eq('id', bikeId);
    if (error) {
      alert('No se pudo eliminar la unidad: ' + error.message);
      return;
    }

    // 2. Verificamos en la base de datos cuántas unidades quedan realmente de esta categoría
    const { count, error: countError } = await supabase
      .from('bikes_inventory')
      .select('id', { count: 'exact', head: true })
      .eq('category_id', categoryId);

    // 3. Si quedaron 0 unidades, borramos la categoría de catalog_categories
    if (!countError && count === 0) {
      const { error: delCatError } = await supabase
        .from('catalog_categories')
        .delete()
        .eq('id', categoryId);

      // Si tiene alquileres históricos que impiden el DELETE físico, la desactivamos para ocultarla de todos lados
      if (delCatError) {
        await supabase
          .from('catalog_categories')
          .update({ active: false })
          .eq('id', categoryId);
      }
    }

    fetchData();
  };

  const handleAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      if (addMode === 'existing') {
        if (!newBikeForm.category_id || !newBikeForm.internal_code.trim()) return;

        const { error } = await supabase.from('bikes_inventory').insert({
          category_id: newBikeForm.category_id,
          internal_code: newBikeForm.internal_code.trim(),
          status: 'available',
        });

        if (error) throw error;
      } else {
        if (!newCategoryForm.name.trim() || !newCategoryForm.internal_code.trim()) {
          alert('Completá el nombre del producto y el código de la unidad.');
          setSubmitting(false);
          return;
        }

        const isAccessory = newCategoryForm.type === 'accessory';
        const p2hCash = Number(newCategoryForm.price_2h_cash) || 0;
        const p2hTransfer = Number(newCategoryForm.price_2h_transfer) || 0;
        const p1dCash = Number(newCategoryForm.price_1day_cash) || 0;
        const p1dTransfer = Number(newCategoryForm.price_1day_transfer) || 0;

        // 1. Crear el nuevo producto en catalog_categories (incluyendo price_per_day para cumplir la restricción NOT NULL)
        const { data: createdCategory, error: catError } = await supabase
          .from('catalog_categories')
          .insert({
            name: newCategoryForm.name.trim(),
            type: newCategoryForm.type,
            wheel_size: isAccessory || !newCategoryForm.wheel_size.trim() ? null : newCategoryForm.wheel_size.trim(),
            frame_size: isAccessory || !newCategoryForm.frame_size.trim() ? null : newCategoryForm.frame_size.trim(),
            price_per_day: p1dCash,
            price_2h_cash: p2hCash,
            price_2h_transfer: p2hTransfer,
            price_1day_cash: p1dCash,
            price_1day_transfer: p1dTransfer,
            active: true,
          })
          .select('id')
          .single();

        if (catError) throw catError;

        // 2. Crear la primera unidad física asociada en bikes_inventory
        const { error: bikeError } = await supabase.from('bikes_inventory').insert({
          category_id: createdCategory.id,
          internal_code: newCategoryForm.internal_code.trim(),
          status: 'available',
        });

        if (bikeError) throw bikeError;
      }

      // Resetear formularios y cerrar modal
      setShowAddModal(false);
      setNewBikeForm({ category_id: categories[0]?.id || '', internal_code: '' });
      setNewCategoryForm({
        name: '',
        type: 'bike',
        wheel_size: '',
        frame_size: '',
        price_2h_cash: '',
        price_2h_transfer: '',
        price_1day_cash: '',
        price_1day_transfer: '',
        internal_code: '',
      });
      fetchData();
    } catch (err: any) {
      alert('Error al guardar: ' + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleSavePrices = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCategory) return;

    const p2hCash = Number(priceForm.price_2h_cash) || 0;
    const p2hTransfer = Number(priceForm.price_2h_transfer) || 0;
    const p1dCash = Number(priceForm.price_1day_cash) || 0;
    const p1dTransfer = Number(priceForm.price_1day_transfer) || 0;

    setSavingPrices(true);
    const { error } = await supabase
      .from('catalog_categories')
      .update({
        price_per_day: p1dCash,
        price_2h_cash: p2hCash,
        price_2h_transfer: p2hTransfer,
        price_1day_cash: p1dCash,
        price_1day_transfer: p1dTransfer,
      })
      .eq('id', editingCategory.id);

    setSavingPrices(false);

    if (error) {
      alert('Error al actualizar precios: ' + error.message);
    } else {
      setEditingCategory(null);
      fetchData();
    }
  };

  const filteredBikes = bikes.filter((b) => {
    const matchesSearch =
      b.internal_code.toLowerCase().includes(searchTerm.toLowerCase()) ||
      b.catalog_categories?.name.toLowerCase().includes(searchTerm.toLowerCase());

    if (filterStatus === 'all') return matchesSearch;
    if (filterStatus === 'in_rental') {
      return matchesSearch && (b.status === 'rented' || b.status === 'reserved');
    }
    return matchesSearch && b.status === filterStatus;
  });

  const groupedByModel = useMemo(() => {
    const groups: Record<
      string,
      {
        categoryId: string;
        modelName: string;
        details: string;
        p2hCash: number;
        p2hTrans: number;
        p1dCash: number;
        p1dTrans: number;
        items: PhysicalBike[];
      }
    > = {};

    filteredBikes.forEach((bike) => {
      const cat = bike.catalog_categories;
      const key = bike.category_id;
      if (!groups[key]) {
        groups[key] = {
          categoryId: key,
          modelName: cat?.name || 'Sin modelo',
          details: [cat?.wheel_size, cat?.frame_size ? `Talle ${cat.frame_size}` : null]
            .filter(Boolean)
            .join(' • '),
          p2hCash: cat?.price_2h_cash || 0,
          p2hTrans: cat?.price_2h_transfer || 0,
          p1dCash: cat?.price_1day_cash || 0,
          p1dTrans: cat?.price_1day_transfer || 0,
          items: [],
        };
      }
      groups[key].items.push(bike);
    });

    return groups;
  }, [filteredBikes]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black uppercase tracking-wider text-slate-900 dark:text-white">
            Estado de Flota y Tarifas
          </h1>
          <p className="text-sm text-orange-600 dark:text-orange-500 font-semibold tracking-wide">
            Control de unidades, creación de productos y ajuste de tarifas
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={fetchData}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 hover:border-orange-500/50 hover:bg-slate-50 dark:hover:bg-zinc-800 text-slate-800 dark:text-white text-sm font-bold transition shadow-md"
          >
            <RefreshCw className="w-4 h-4 text-orange-600 dark:text-orange-500" /> Actualizar
          </button>
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-orange-600 to-red-600 hover:from-orange-500 hover:to-red-500 text-white text-sm font-extrabold uppercase tracking-wider transition shadow-lg shadow-orange-600/30 dark:shadow-orange-950/60"
          >
            <Plus className="w-4 h-4" /> Nueva Unidad / Producto
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4 bg-white dark:bg-zinc-900 p-3 rounded-2xl border border-slate-200 dark:border-zinc-800 shadow-lg transition-colors">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="w-4 h-4 text-orange-600 dark:text-orange-500 absolute left-3.5 top-3.5" />
          <input
            type="text"
            placeholder="Buscar por código (ej. MOU-1) o modelo..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-50 dark:bg-zinc-950 border border-slate-300 dark:border-zinc-800 text-xs text-slate-900 dark:text-white focus:border-orange-600 dark:focus:border-orange-500 outline-none transition"
          />
        </div>

        <div className="flex flex-wrap gap-1.5">
          {[
            { id: 'all', label: 'Todas' },
            { id: 'available', label: 'Disponibles' },
            { id: 'in_rental', label: 'En alquiler' },
            { id: 'maintenance', label: 'Mantenimiento' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setFilterStatus(tab.id)}
              className={`px-3 py-2 rounded-xl text-xs font-extrabold uppercase tracking-wider transition ${
                filterStatus === tab.id
                  ? 'bg-orange-600 text-white shadow-md shadow-orange-600/30 dark:shadow-orange-950/50'
                  : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white bg-slate-50 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <p className="text-slate-500 dark:text-zinc-400 py-12 text-center font-medium">Cargando flota...</p>
      ) : Object.keys(groupedByModel).length === 0 ? (
        <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-2xl p-12 text-center text-slate-500 dark:text-zinc-400 shadow-md">
          No se encontraron unidades con los filtros seleccionados.
        </div>
      ) : (
        <div className="space-y-4">
          {Object.entries(groupedByModel).map(([catId, group]) => (
            <div
              key={catId}
              className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-2xl p-5 space-y-4 shadow-xl relative overflow-hidden transition-colors"
            >
              <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-zinc-900 dark:from-white via-orange-500 to-red-600" />
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 dark:border-zinc-800 pb-3">
                <div>
                  <h3 className="text-lg font-extrabold text-slate-900 dark:text-white tracking-tight">
                    {group.modelName}
                  </h3>
                  <p className="text-xs text-orange-600 dark:text-orange-500 font-bold uppercase tracking-wider">
                    {group.details}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex items-center gap-2 bg-slate-50 dark:bg-zinc-950 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-zinc-800 text-[11px]">
                    <div>
                      <span className="text-slate-500">2h Ef:</span>{' '}
                      <strong>${Number(group.p2hCash).toLocaleString('es-AR')}</strong> |{' '}
                      <span className="text-slate-500">Tr:</span>{' '}
                      <strong>${Number(group.p2hTrans).toLocaleString('es-AR')}</strong>
                    </div>
                    <span className="text-slate-300 dark:text-zinc-700">|</span>
                    <div>
                      <span className="text-slate-500">1d Ef:</span>{' '}
                      <strong>${Number(group.p1dCash).toLocaleString('es-AR')}</strong> |{' '}
                      <span className="text-slate-500">Tr:</span>{' '}
                      <strong>${Number(group.p1dTrans).toLocaleString('es-AR')}</strong>
                    </div>
                    <button
                      onClick={() => {
                        const foundCat = categories.find((c) => c.id === group.categoryId);
                        if (foundCat) {
                          setEditingCategory(foundCat);
                          setPriceForm({
                            price_2h_cash: foundCat.price_2h_cash ? String(foundCat.price_2h_cash) : '',
                            price_2h_transfer: foundCat.price_2h_transfer ? String(foundCat.price_2h_transfer) : '',
                            price_1day_cash: foundCat.price_1day_cash ? String(foundCat.price_1day_cash) : '',
                            price_1day_transfer: foundCat.price_1day_transfer ? String(foundCat.price_1day_transfer) : '',
                          });
                        }
                      }}
                      className="ml-1 p-1 bg-orange-100 dark:bg-orange-950/60 text-orange-600 dark:text-orange-400 hover:bg-orange-200 rounded-lg transition"
                      title="Editar las 4 tarifas del modelo"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <span className="text-xs font-extrabold bg-slate-50 dark:bg-zinc-950 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-zinc-800 text-slate-700 dark:text-zinc-300">
                    Unidades: <strong className="text-orange-600 dark:text-orange-400">{group.items.length}</strong>
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                {group.items.map((bike) => {
                  let badgeStyle =
                    'bg-slate-50 dark:bg-zinc-950 border-slate-200 dark:border-zinc-700 text-slate-900 dark:text-white hover:border-orange-500';
                  let statusLabel = 'Disponible';
                  let StatusIcon = CheckCircle;
                  let iconColor = 'text-emerald-600 dark:text-white';

                  if (bike.status === 'rented' || bike.status === 'reserved') {
                    badgeStyle =
                      'bg-orange-50 dark:bg-orange-950/50 border-orange-300 dark:border-orange-600/60 text-orange-900 dark:text-orange-300';
                    statusLabel = 'En alquiler';
                    StatusIcon = Bike;
                    iconColor = 'text-orange-600 dark:text-orange-500';
                  } else if (bike.status === 'maintenance') {
                    badgeStyle =
                      'bg-red-50 dark:bg-red-950/60 border-red-300 dark:border-red-700/70 text-red-900 dark:text-red-300';
                    statusLabel = 'Mantenimiento';
                    StatusIcon = Wrench;
                    iconColor = 'text-red-600 dark:text-red-500';
                  }

                  const isInUse = bike.status === 'rented' || bike.status === 'reserved';

                  return (
                    <div
                      key={bike.id}
                      className={`p-3 rounded-2xl border flex flex-col justify-between space-y-2 transition shadow-sm ${badgeStyle}`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-black text-sm tracking-wide">{bike.internal_code}</span>
                        <StatusIcon className={`w-4 h-4 shrink-0 ${iconColor}`} />
                      </div>

                      <div className="text-[11px] font-bold uppercase tracking-wider opacity-90">{statusLabel}</div>

                      <div className="flex items-center justify-between pt-1.5 border-t border-slate-200/60 dark:border-white/10 text-[11px]">
                        {!isInUse ? (
                          <button
                            onClick={() =>
                              handleUpdateStatus(
                                bike.id,
                                bike.status === 'maintenance' ? 'available' : 'maintenance'
                              )
                            }
                            className="font-bold text-orange-600 dark:text-orange-400 hover:underline transition"
                          >
                            {bike.status === 'maintenance' ? 'Marcar disponible' : 'Enviar a mant.'}
                          </button>
                        ) : (
                          <button
                            onClick={() => handleUpdateStatus(bike.id, 'available')}
                            className="font-bold text-emerald-600 dark:text-emerald-400 hover:underline transition"
                            title="Forzar estado a disponible"
                          >
                            Marcar disponible
                          </button>
                        )}

                        <button
  onClick={() => handleDeleteBike(bike.id, bike.internal_code, bike.category_id)}
  className="text-slate-400 hover:text-red-600 dark:hover:text-red-400 p-0.5 transition"
  title="Eliminar unidad"
>
  <Trash2 className="w-3.5 h-3.5" />
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

      {/* Modal para Editar las 4 Tarifas por Categoría */}
      {editingCategory && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <form
            onSubmit={handleSavePrices}
            className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-2xl p-6 w-full max-w-lg space-y-5 shadow-2xl relative overflow-hidden transition-colors"
          >
            <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-zinc-900 dark:from-white via-orange-500 to-red-600" />
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-zinc-800 pb-3">
              <h3 className="text-lg font-extrabold uppercase tracking-wider text-slate-900 dark:text-white flex items-center gap-2">
                <DollarSign className="w-5 h-5 text-orange-600 dark:text-orange-500" /> Editar Tarifas:{' '}
                {editingCategory.name}
              </h3>
              <button
                type="button"
                onClick={() => setEditingCategory(null)}
                className="text-slate-400 hover:text-slate-900 dark:hover:text-white transition"
              >
                ✕
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-slate-700 dark:text-zinc-300 mb-1 font-semibold">
                  2 Horas - Efectivo ($)
                </label>
                <input
                  type="number"
                  inputMode="numeric"
                  required
                  min="0"
                  placeholder="0"
                  value={priceForm.price_2h_cash}
                  onChange={(e) => setPriceForm({ ...priceForm, price_2h_cash: e.target.value })}
                  className={`w-full p-3 rounded-xl bg-slate-50 dark:bg-zinc-950 border border-slate-300 dark:border-zinc-700 text-sm font-bold text-slate-900 dark:text-white focus:border-orange-600 outline-none transition ${noSpinnerClass}`}
                />
              </div>

              <div>
                <label className="block text-xs text-slate-700 dark:text-zinc-300 mb-1 font-semibold">
                  2 Horas - Transferencia ($)
                </label>
                <input
                  type="number"
                  inputMode="numeric"
                  required
                  min="0"
                  placeholder="0"
                  value={priceForm.price_2h_transfer}
                  onChange={(e) => setPriceForm({ ...priceForm, price_2h_transfer: e.target.value })}
                  className={`w-full p-3 rounded-xl bg-slate-50 dark:bg-zinc-950 border border-slate-300 dark:border-zinc-700 text-sm font-bold text-slate-900 dark:text-white focus:border-orange-600 outline-none transition ${noSpinnerClass}`}
                />
              </div>

              <div>
                <label className="block text-xs text-slate-700 dark:text-zinc-300 mb-1 font-semibold">
                  1 Día - Efectivo ($)
                </label>
                <input
                  type="number"
                  inputMode="numeric"
                  required
                  min="0"
                  placeholder="0"
                  value={priceForm.price_1day_cash}
                  onChange={(e) => setPriceForm({ ...priceForm, price_1day_cash: e.target.value })}
                  className={`w-full p-3 rounded-xl bg-slate-50 dark:bg-zinc-950 border border-slate-300 dark:border-zinc-700 text-sm font-bold text-slate-900 dark:text-white focus:border-orange-600 outline-none transition ${noSpinnerClass}`}
                />
              </div>

              <div>
                <label className="block text-xs text-slate-700 dark:text-zinc-300 mb-1 font-semibold">
                  1 Día - Transferencia ($)
                </label>
                <input
                  type="number"
                  inputMode="numeric"
                  required
                  min="0"
                  placeholder="0"
                  value={priceForm.price_1day_transfer}
                  onChange={(e) => setPriceForm({ ...priceForm, price_1day_transfer: e.target.value })}
                  className={`w-full p-3 rounded-xl bg-slate-50 dark:bg-zinc-950 border border-slate-300 dark:border-zinc-700 text-sm font-bold text-slate-900 dark:text-white focus:border-orange-600 outline-none transition ${noSpinnerClass}`}
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-100 dark:border-zinc-800">
              <button
                type="button"
                onClick={() => setEditingCategory(null)}
                className="px-4 py-2.5 rounded-xl bg-slate-100 dark:bg-zinc-800 hover:bg-slate-200 dark:hover:bg-zinc-700 text-slate-700 dark:text-zinc-200 text-xs font-bold transition"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={savingPrices}
                className="px-5 py-2.5 rounded-xl bg-orange-600 hover:bg-orange-500 text-white text-xs font-extrabold uppercase tracking-wider transition shadow-md shadow-orange-600/30"
              >
                {savingPrices ? 'Guardando...' : 'Guardar Tarifas'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Modal para Agregar Unidad a Modelo Existente o Crear Nuevo Producto */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <form
            onSubmit={handleAddSubmit}
            className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-2xl p-6 w-full max-w-lg space-y-5 shadow-2xl relative overflow-hidden transition-colors my-8"
          >
            <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-zinc-900 dark:from-white via-orange-500 to-red-600" />
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-zinc-800 pb-3">
              <h3 className="text-lg font-extrabold uppercase tracking-wider text-slate-900 dark:text-white flex items-center gap-2">
                <Bike className="w-5 h-5 text-orange-600 dark:text-orange-500" /> Alta en Inventario
              </h3>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="text-slate-400 hover:text-slate-900 dark:hover:text-white transition"
              >
                ✕
              </button>
            </div>

            {/* Selector de Modo: Existente vs Nuevo Producto */}
            <div className="grid grid-cols-2 gap-2 bg-slate-100 dark:bg-zinc-950 p-1.5 rounded-xl border border-slate-200 dark:border-zinc-800">
              <button
                type="button"
                onClick={() => setAddMode('existing')}
                className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg text-xs font-extrabold uppercase tracking-wider transition ${
                  addMode === 'existing'
                    ? 'bg-orange-600 text-white shadow'
                    : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <Layers className="w-4 h-4" /> Producto Existente
              </button>
              <button
                type="button"
                onClick={() => setAddMode('new')}
                className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg text-xs font-extrabold uppercase tracking-wider transition ${
                  addMode === 'new'
                    ? 'bg-orange-600 text-white shadow'
                    : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <PackagePlus className="w-4 h-4" /> Nuevo Producto
              </button>
            </div>

            {addMode === 'existing' ? (
              <div className="space-y-4">
                <div>
                  <label className="block text-xs text-slate-700 dark:text-zinc-300 mb-1 font-semibold">
                    Seleccionar Producto del Catálogo
                  </label>
                  <select
                    required
                    value={newBikeForm.category_id}
                    onChange={(e) => setNewBikeForm({ ...newBikeForm, category_id: e.target.value })}
                    className="w-full p-3 rounded-xl bg-slate-50 dark:bg-zinc-950 border border-slate-300 dark:border-zinc-700 text-sm font-semibold text-slate-900 dark:text-white focus:border-orange-600 outline-none transition"
                  >
                    {categories.map((cat) => (
                      <option key={cat.id} value={cat.id}>
                        {cat.name}{' '}
                        {[cat.wheel_size, cat.frame_size ? `Talle ${cat.frame_size}` : null]
                          .filter(Boolean)
                          .join(' • ')}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs text-slate-700 dark:text-zinc-300 mb-1 font-semibold">
                    Código Único Interno de la Unidad
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Ej. MOU-R29-M-3 o CASCO-5"
                    value={newBikeForm.internal_code}
                    onChange={(e) => setNewBikeForm({ ...newBikeForm, internal_code: e.target.value })}
                    className="w-full p-3 rounded-xl bg-slate-50 dark:bg-zinc-950 border border-slate-300 dark:border-zinc-700 text-sm font-bold text-slate-900 dark:text-white focus:border-orange-600 outline-none transition"
                  />
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <label className="block text-xs text-slate-700 dark:text-zinc-300 mb-1.5 font-semibold">
                    Tipo de Producto
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { id: 'bike', label: 'Bicicleta' },
                      { id: 'ebike', label: 'E-Bike' },
                      { id: 'accessory', label: 'Accesorio' },
                    ].map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => setNewCategoryForm({ ...newCategoryForm, type: t.id as any })}
                        className={`py-2.5 px-3 rounded-xl text-xs font-extrabold uppercase border transition ${
                          newCategoryForm.type === t.id
                            ? 'bg-orange-600 border-orange-500 text-white'
                            : 'bg-slate-50 dark:bg-zinc-950 border-slate-300 dark:border-zinc-800 text-slate-700 dark:text-zinc-400'
                        }`}
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="sm:col-span-2">
                    <label className="block text-xs text-slate-700 dark:text-zinc-300 mb-1 font-semibold">
                      Nombre del Producto
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="Ej. E-Bike 2, Tandem, Casco..."
                      value={newCategoryForm.name}
                      onChange={(e) => setNewCategoryForm({ ...newCategoryForm, name: e.target.value })}
                      className="w-full p-3 rounded-xl bg-slate-50 dark:bg-zinc-950 border border-slate-300 dark:border-zinc-700 text-sm font-bold text-slate-900 dark:text-white focus:border-orange-600 outline-none transition"
                    />
                  </div>

                  {newCategoryForm.type !== 'accessory' && (
                    <>
                      <div>
                        <label className="block text-xs text-slate-700 dark:text-zinc-300 mb-1 font-semibold">
                          Rodado (Opcional)
                        </label>
                        <input
                          type="text"
                          placeholder="Ej. R29, R26..."
                          value={newCategoryForm.wheel_size}
                          onChange={(e) => setNewCategoryForm({ ...newCategoryForm, wheel_size: e.target.value })}
                          className="w-full p-2.5 rounded-xl bg-slate-50 dark:bg-zinc-950 border border-slate-300 dark:border-zinc-700 text-sm font-semibold text-slate-900 dark:text-white focus:border-orange-600 outline-none transition"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-slate-700 dark:text-zinc-300 mb-1 font-semibold">
                          Talle (Opcional)
                        </label>
                        <input
                          type="text"
                          placeholder="Ej. S, M, L..."
                          value={newCategoryForm.frame_size}
                          onChange={(e) => setNewCategoryForm({ ...newCategoryForm, frame_size: e.target.value })}
                          className="w-full p-2.5 rounded-xl bg-slate-50 dark:bg-zinc-950 border border-slate-300 dark:border-zinc-700 text-sm font-semibold text-slate-900 dark:text-white focus:border-orange-600 outline-none transition"
                        />
                      </div>
                    </>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3 pt-1">
                  <div>
                    <label className="block text-[11px] text-slate-600 dark:text-zinc-400 mb-1 font-bold">
                      2 Horas - Efectivo ($)
                    </label>
                    <input
                      type="number"
                      inputMode="numeric"
                      min="0"
                      placeholder="0"
                      value={newCategoryForm.price_2h_cash}
                      onChange={(e) => setNewCategoryForm({ ...newCategoryForm, price_2h_cash: e.target.value })}
                      className={`w-full p-2.5 rounded-xl bg-slate-50 dark:bg-zinc-950 border border-slate-300 dark:border-zinc-700 text-sm font-bold text-slate-900 dark:text-white focus:border-orange-600 outline-none transition ${noSpinnerClass}`}
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-600 dark:text-zinc-400 mb-1 font-bold">
                      2 Horas - Transf. ($)
                    </label>
                    <input
                      type="number"
                      inputMode="numeric"
                      min="0"
                      placeholder="0"
                      value={newCategoryForm.price_2h_transfer}
                      onChange={(e) => setNewCategoryForm({ ...newCategoryForm, price_2h_transfer: e.target.value })}
                      className={`w-full p-2.5 rounded-xl bg-slate-50 dark:bg-zinc-950 border border-slate-300 dark:border-zinc-700 text-sm font-bold text-slate-900 dark:text-white focus:border-orange-600 outline-none transition ${noSpinnerClass}`}
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-600 dark:text-zinc-400 mb-1 font-bold">
                      1 Día - Efectivo ($)
                    </label>
                    <input
                      type="number"
                      inputMode="numeric"
                      min="0"
                      placeholder="0"
                      value={newCategoryForm.price_1day_cash}
                      onChange={(e) => setNewCategoryForm({ ...newCategoryForm, price_1day_cash: e.target.value })}
                      className={`w-full p-2.5 rounded-xl bg-slate-50 dark:bg-zinc-950 border border-slate-300 dark:border-zinc-700 text-sm font-bold text-slate-900 dark:text-white focus:border-orange-600 outline-none transition ${noSpinnerClass}`}
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-600 dark:text-zinc-400 mb-1 font-bold">
                      1 Día - Transf. ($)
                    </label>
                    <input
                      type="number"
                      inputMode="numeric"
                      min="0"
                      placeholder="0"
                      value={newCategoryForm.price_1day_transfer}
                      onChange={(e) => setNewCategoryForm({ ...newCategoryForm, price_1day_transfer: e.target.value })}
                      className={`w-full p-2.5 rounded-xl bg-slate-50 dark:bg-zinc-950 border border-slate-300 dark:border-zinc-700 text-sm font-bold text-slate-900 dark:text-white focus:border-orange-600 outline-none transition ${noSpinnerClass}`}
                    />
                  </div>
                </div>

                <div className="pt-2 border-t border-slate-100 dark:border-zinc-800">
                  <label className="block text-xs text-slate-700 dark:text-zinc-300 mb-1 font-semibold">
                    Código Único de la 1° Unidad Física
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Ej. EB2, CASCO-1 o TANDEM-1"
                    value={newCategoryForm.internal_code}
                    onChange={(e) => setNewCategoryForm({ ...newCategoryForm, internal_code: e.target.value })}
                    className="w-full p-3 rounded-xl bg-slate-50 dark:bg-zinc-950 border border-slate-300 dark:border-zinc-700 text-sm font-bold text-slate-900 dark:text-white focus:border-orange-600 outline-none transition"
                  />
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-100 dark:border-zinc-800">
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="px-4 py-2.5 rounded-xl bg-slate-100 dark:bg-zinc-800 hover:bg-slate-200 text-slate-700 dark:text-zinc-200 text-xs font-bold transition"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="px-5 py-2.5 rounded-xl bg-orange-600 hover:bg-orange-500 text-white text-xs font-extrabold uppercase tracking-wider transition shadow-md"
              >
                {submitting
                  ? 'Guardando...'
                  : addMode === 'existing'
                  ? 'Agregar Unidad'
                  : 'Crear Producto y Unidad'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}