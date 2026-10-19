import { supabase } from '@/lib/supabase';

export async function fetchRentalsAndStock() {
  const [rentalsRes, bikesRes, catsRes] = await Promise.all([
    supabase
      .from('rentals')
      .select(`
        *,
        rental_items (
          id,
          category_id,
          bike_id,
          price_applied,
          catalog_categories ( name, wheel_size, frame_size, price_per_day ),
          bikes_inventory ( internal_code )
        )
      `)
      .in('status', ['pending', 'active', 'reserved'])
      .order('created_at', { ascending: false }),

    supabase
      .from('bikes_inventory')
      .select('id, category_id, internal_code, status')
      .order('internal_code', { ascending: true }),

    supabase
      .from('catalog_categories')
      .select('id, name, wheel_size, frame_size, price_per_day')
      .eq('active', true)
      .order('name', { ascending: true }),
  ]);

  return {
    rentals: rentalsRes.data || [],
    allBikes: bikesRes.data || [],
    categories: catsRes.data || [],
  };
}

export async function updateRentalItemBike(rentalItemId: string, bikeId: string | null) {
  return await supabase
    .from('rental_items')
    .update({ bike_id: bikeId })
    .eq('id', rentalItemId);
}

export async function updateRentalPaidStatus(rentalId: string, isPaid: boolean) {
  return await supabase
    .from('rentals')
    .update({ is_paid: isPaid })
    .eq('id', rentalId);
}

export async function updateRentalStatus(rentalId: string, status: string, extraFields = {}) {
  return await supabase
    .from('rentals')
    .update({ status, ...extraFields })
    .eq('id', rentalId);
}

export async function updateRentalNotes(rentalId: string, notes: string) {
  return await supabase
    .from('rentals')
    .update({ notes })
    .eq('id', rentalId);
}