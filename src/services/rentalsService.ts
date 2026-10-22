import { supabase } from '@/lib/supabase';

// Obtener todos los alquileres e inventario disponible
export async function fetchRentalsAndStock() {
  const [rentalsRes, bikesRes, catsRes] = await Promise.all([
    supabase
      .from('rentals')
      .select(`
        *,
        rental_items (
          id,
          rental_id,
          category_id,
          bike_id,
          price_applied,
          catalog_categories ( name, wheel_size, frame_size ),
          bikes_inventory ( internal_code, status )
        )
      `)
      .in('status', ['pending', 'active', 'reserved'])
      .order('created_at', { ascending: false }),

    supabase
      .from('bikes_inventory')
      .select('id, category_id, internal_code, status'),

    supabase
      .from('catalog_categories')
      .select('id, name, wheel_size, frame_size')
      .eq('active', true)
      .order('name', { ascending: true }),
  ]);

  return {
    rentals: rentalsRes.data || [],
    allBikes: bikesRes.data || [],
    categories: catsRes.data || [],
  };
}

// Asignar o desasignar una bicicleta física a un ítem de alquiler
export async function updateRentalItemBike(itemId: string, bikeId: string | null) {
  // Solo guardamos la asignación en el ítem, sin bloquear prematuramente el inventario global de fechas pasadas
  const { error } = await supabase
    .from('rental_items')
    .update({ bike_id: bikeId })
    .eq('id', itemId);

  if (error) {
    console.error('Error al asignar bicicleta al ítem:', error.message);
    throw error;
  }
}

// Actualizar si el alquiler está pagado o pendiente
export async function updateRentalPaidStatus(rentalId: string, isPaid: boolean) {
  const { error } = await supabase
    .from('rentals')
    .update({ is_paid: isPaid })
    .eq('id', rentalId);

  if (error) {
    console.error('Error al actualizar estado de pago:', error.message);
  }
}

// Actualizar estado general del alquiler y gestionar inventario según la vigencia
export async function updateRentalStatus(rentalId: string, newStatus: string, extra = {}) {
  // 1. Actualizar estado del alquiler
  const { error } = await supabase
    .from('rentals')
    .update({ status: newStatus, ...extra })
    .eq('id', rentalId);

  if (error) throw error;

  // 2. Si el alquiler pasa a activo, marcar las bicis físicas como ocupadas ('rented')
  if (newStatus === 'active') {
    const { data: items } = await supabase
      .from('rental_items')
      .select('bike_id')
      .eq('rental_id', rentalId);

    if (items) {
      const bikeIds = items.map((i) => i.bike_id).filter(Boolean);
      if (bikeIds.length > 0) {
        // Marcar como alquiladas en inventario físico
        await supabase
          .from('bikes_inventory')
          .update({ status: 'rented' })
          .in('id', bikeIds);

        // Desasignar automáticamente estas mismas bicis de cualquier otro alquiler pendiente o reserva
        const { data: otherRentals } = await supabase
          .from('rentals')
          .select('id')
          .in('status', ['pending', 'reserved'])
          .neq('id', rentalId);

        if (otherRentals && otherRentals.length > 0) {
          const otherIds = otherRentals.map(r => r.id);
          await supabase
            .from('rental_items')
            .update({ bike_id: null })
            .in('rental_id', otherIds)
            .in('bike_id', bikeIds);
        }
      }
    }
  }

  // 3. Si pasa a reservado, solo actualizamos el estado del alquiler (la bici sigue libre para días anteriores hasta que llegue su fecha)
  if (newStatus === 'reserved') {
    // Las reservas guardan su bike_id asignado sin bloquear el inventario actual de los días previos
  }

  // 4. Si el alquiler se completa o cancela, liberar las bicis físicas de vuelta a 'available'
  if (newStatus === 'completed' || newStatus === 'cancelled') {
    const { data: items } = await supabase
      .from('rental_items')
      .select('bike_id')
      .eq('rental_id', rentalId);

    if (items) {
      const bikeIds = items.map((i) => i.bike_id).filter(Boolean);
      if (bikeIds.length > 0) {
        await supabase
          .from('bikes_inventory')
          .update({ status: 'available' })
          .in('id', bikeIds);
      }
    }
  }
}

// Actualizar notas de un alquiler
export async function updateRentalNotes(rentalId: string, notes: string | null) {
  const { error } = await supabase
    .from('rentals')
    .update({ notes })
    .eq('id', rentalId);

  if (error) {
    console.error('Error al actualizar nota:', error.message);
  }
}