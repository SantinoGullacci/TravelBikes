'use client';

import { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { Bike, Plus, RefreshCw, Wrench, CheckCircle, Clock, Trash2, Search } from 'lucide-react';

interface Category {
  id: string;
  name: string;
  type: 'bike' | 'ebike' | 'accessory';
  wheel_size: string | null;
  frame_size: string | null;
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
  };
}

export default function FleetDashboardPage() {
  const [bikes, setBikes] = useState<PhysicalBike[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');

  // Modal para agregar nueva unidad
  const [showAddModal, setShowAddModal] = useState(false);
  const [newBikeForm, setNewBikeForm] = useState({
    category_id: '',
    internal_code: '',
  });
  const [submitting, setSubmitting] = useState(false);

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
          catalog_categories ( name, type, wheel_size, frame_size )
        `)
        .order('internal_code', { ascending: true }),

      supabase
        .from('catalog_categories')
        .select('id, name, type, wheel_size, frame_size')
        .eq('active', true)
        .order('name', { ascending: true }),
    ]);

    if (bikesRes.data) setBikes(bikesRes.data as unknown as PhysicalBike[]);
    if (catsRes.data) {
      setCategories(catsRes.data as Category[]);
      if (catsRes.data.length > 0) {
        setNewBikeForm((prev) => ({ ...prev, category_id: catsRes.data[0].id }));
      }
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Cambiar estado entre disponible y mantenimiento
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

  // Eliminar unidad
  const handleDeleteBike = async (bikeId: string, internalCode: string) => {
    if (!confirm(`¿Eliminar la unidad "${internalCode}" del inventario?`)) return;

    const { error } = await supabase.from('bikes_inventory').delete().eq('id', bikeId);
    if (error) {
      alert('No se pudo eliminar: ' + error.message);
    } else {
      fetchData();
    }
  };

  // Crear unidad
  const handleAddBike = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBikeForm.category_id || !newBikeForm.internal_code.trim()) return;

    setSubmitting(true);
    const { error } = await supabase.from('bikes_inventory').insert({
      category_id: newBikeForm.category_id,
      internal_code: newBikeForm.internal_code.trim(),
      status: 'available',
    });

    setSubmitting(false);

    if (error) {
      alert('Error al crear unidad (verificá que el código no esté repetido): ' + error.message);
    } else {
      setShowAddModal(false);
      setNewBikeForm({ category_id: categories[0]?.id || '', internal_code: '' });
      fetchData();
    }
  };

  // Filtrar bicis por búsqueda y estado
  const filteredBikes = bikes.filter((b) => {
    const matchesSearch = b.internal_code.toLowerCase().includes(searchTerm.toLowerCase()) ||
      b.catalog_categories?.name.toLowerCase().includes(searchTerm.toLowerCase());
    
    if (filterStatus === 'all') return matchesSearch;
    if (filterStatus === 'in_rental') {
      return matchesSearch && (b.status === 'rented' || b.status === 'reserved');
    }
    return matchesSearch && b.status === filterStatus;
  });

  // Agrupar por categoría/modelo
  const groupedByModel = useMemo(() => {
    const groups: Record<string, { modelName: string; details: string; items: PhysicalBike[] }> = {};
    
    filteredBikes.forEach((bike) => {
      const cat = bike.catalog_categories;
      const key = bike.category_id;
      if (!groups[key]) {
        groups[key] = {
          modelName: cat?.name || 'Sin modelo',
          details: [cat?.wheel_size, cat?.frame_size ? `Talle ${cat.frame_size}` : null].filter(Boolean).join(' • '),
          items: [],
        };
      }
      groups[key].items.push(bike);
    });

    return groups;
  }, [filteredBikes]);

  return (
    <div className="space-y-6">
      {/* Cabecera */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-white">Estado de Flota</h1>
          <p className="text-sm text-slate-400">Control visual de disponibilidad y mantenimiento de unidades</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={fetchData}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-900 border border-slate-800 hover:bg-slate-800 text-sm font-semibold transition"
          >
            <RefreshCw className="w-4 h-4" /> Actualizar
          </button>
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-sm font-bold transition shadow-lg shadow-sky-950"
          >
            <Plus className="w-4 h-4" /> Nueva Unidad
          </button>
        </div>
      </div>

      {/* Barra de Búsqueda y Filtros Rápidos */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-slate-900 p-3 rounded-2xl border border-slate-800">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-3.5" />
          <input
            type="text"
            placeholder="Buscar por código (ej. MOU-1) o modelo..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white focus:border-sky-500 outline-none"
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
              className={`px-3 py-2 rounded-xl text-xs font-bold transition ${
                filterStatus === tab.id
                  ? 'bg-sky-600 text-white shadow'
                  : 'text-slate-400 hover:text-white bg-slate-950 border border-slate-800'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <p className="text-slate-400 py-12 text-center">Cargando flota...</p>
      ) : Object.keys(groupedByModel).length === 0 ? (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-12 text-center text-slate-400">
          No se encontraron unidades con los filtros seleccionados.
        </div>
      ) : (
        <div className="space-y-4">
          {Object.entries(groupedByModel).map(([catId, group]) => (
            <div key={catId} className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3">
                <div>
                  <h3 className="text-lg font-bold text-white">{group.modelName}</h3>
                  <p className="text-xs text-sky-400 font-medium">{group.details}</p>
                </div>
                <span className="text-xs font-bold bg-slate-950 px-3 py-1 rounded-full border border-slate-800 text-slate-300">
                  Total unidades: {group.items.length}
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                {group.items.map((bike) => {
                  let badgeStyle = 'bg-emerald-950/70 border-emerald-800 text-emerald-300';
                  let statusLabel = 'Disponible';
                  let StatusIcon = CheckCircle;

                  if (bike.status === 'rented' || bike.status === 'reserved') {
                    badgeStyle = 'bg-sky-950/70 border-sky-800 text-sky-300';
                    statusLabel = 'En alquiler';
                    StatusIcon = Bike;
                  } else if (bike.status === 'maintenance') {
                    badgeStyle = 'bg-rose-950/70 border-rose-800 text-rose-300';
                    statusLabel = 'Mantenimiento';
                    StatusIcon = Wrench;
                  }

                  const isInUse = bike.status === 'rented' || bike.status === 'reserved';

                  return (
                    <div
                      key={bike.id}
                      className={`p-3 rounded-2xl border flex flex-col justify-between space-y-2 transition shadow-sm ${badgeStyle}`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-extrabold text-sm tracking-wide text-white">
                          {bike.internal_code}
                        </span>
                        <StatusIcon className="w-4 h-4 shrink-0" />
                      </div>

                      <div className="text-[11px] font-semibold text-slate-200">
                        {statusLabel}
                      </div>

                      <div className="flex items-center justify-between pt-1 border-t border-white/10 text-[11px]">
                        {!isInUse ? (
                          <button
                            onClick={() =>
                              handleUpdateStatus(
                                bike.id,
                                bike.status === 'maintenance' ? 'available' : 'maintenance'
                              )
                            }
                            className="font-semibold underline hover:text-white"
                          >
                            {bike.status === 'maintenance' ? 'Marcar disponible' : 'Enviar a mantenimiento'}
                          </button>
                        ) : (
                          <span className="italic text-slate-400">Ocupada</span>
                        )}

                        <button
                          onClick={() => handleDeleteBike(bike.id, bike.internal_code)}
                          className="text-slate-400 hover:text-rose-300 p-0.5"
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

      {/* Modal: Nueva Unidad */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4">
          <form
            onSubmit={handleAddBike}
            className="bg-slate-900 border border-slate-800 rounded-2xl p-6 w-full max-w-md space-y-5 shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <Bike className="w-5 h-5 text-sky-400" /> Nueva Unidad Física
              </h3>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs text-slate-400 mb-1 font-semibold">
                  Modelo del Catálogo
                </label>
                <select
                  required
                  value={newBikeForm.category_id}
                  onChange={(e) => setNewBikeForm({ ...newBikeForm, category_id: e.target.value })}
                  className="w-full p-3 rounded-xl bg-slate-950 border border-slate-700 text-sm font-semibold text-white focus:border-sky-500 outline-none"
                >
                  {categories.map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {cat.name} {[cat.wheel_size, cat.frame_size ? `Talle ${cat.frame_size}` : null].filter(Boolean).join(' • ')}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1 font-semibold">
                  Código Único Interno
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ej. MOU-R29-M-3"
                  value={newBikeForm.internal_code}
                  onChange={(e) => setNewBikeForm({ ...newBikeForm, internal_code: e.target.value })}
                  className="w-full p-3 rounded-xl bg-slate-950 border border-slate-700 text-sm font-bold text-white focus:border-sky-500 outline-none"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="px-4 py-2.5 rounded-xl bg-slate-800 text-xs font-semibold"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="px-5 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold transition"
              >
                {submitting ? 'Guardando...' : 'Crear Unidad'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}