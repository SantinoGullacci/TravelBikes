'use client';

import { useState } from 'react';
import { Calendar, X } from 'lucide-react';

interface ReserveModalProps {
  customerName: string;
  initialDate: string;
  onClose: () => void;
  onConfirm: (pickupDate: string) => void;
}

export default function ReserveModal({ customerName, initialDate, onClose, onConfirm }: ReserveModalProps) {
  const [pickupDate, setPickupDate] = useState(initialDate);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!pickupDate) return;
    onConfirm(pickupDate);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4">
      <form
        onSubmit={handleSubmit}
        className="bg-slate-900 border border-slate-800 rounded-2xl p-6 w-full max-w-md space-y-5 shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <h3 className="text-lg font-bold text-white flex items-center gap-2">
            <Calendar className="w-5 h-5 text-amber-400" /> Guardar como Reserva
          </h3>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <p className="text-sm text-slate-300">
          Especificá la fecha en la que <strong>{customerName}</strong> va a retirar las bicicletas:
        </p>

        <div>
          <label className="block text-xs text-slate-400 mb-1">Fecha de retiro</label>
          <input
            type="date"
            required
            value={pickupDate}
            onChange={(e) => setPickupDate(e.target.value)}
            className="w-full p-3 rounded-xl bg-slate-950 border border-slate-700 text-white font-semibold focus:border-amber-400 outline-none"
          />
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-800 text-xs font-semibold"
          >
            Cancelar
          </button>
          <button
            type="submit"
            className="px-5 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold"
          >
            Confirmar Reserva
          </button>
        </div>
      </form>
    </div>
  );
}