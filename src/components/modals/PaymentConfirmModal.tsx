'use client';

import { useState } from 'react';
import { AlertTriangle } from 'lucide-react';

interface PaymentConfirmModalProps {
  customerName: string;
  totalAmount: number;
  initialMethod: 'cash' | 'transfer' | 'bank';
  onClose: () => void;
  onConfirm: (method: 'cash' | 'transfer' | 'bank') => void;
}

export default function PaymentConfirmModal({
  customerName,
  totalAmount,
  initialMethod,
  onClose,
  onConfirm,
}: PaymentConfirmModalProps) {
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'transfer' | 'bank'>(initialMethod);

  return (
    <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-rose-800/80 rounded-2xl p-6 w-full max-w-md space-y-5 shadow-2xl">
        <div className="flex items-center gap-3 text-rose-400">
          <AlertTriangle className="w-8 h-8 shrink-0" />
          <div>
            <h3 className="text-lg font-extrabold text-white">Pago Pendiente de Confirmación</h3>
            <p className="text-xs text-rose-300">Este alquiler figura como PENDIENTE DE PAGO.</p>
          </div>
        </div>

        <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-2 text-sm">
          <p className="text-slate-300">
            Cliente: <strong className="text-white">{customerName}</strong>
          </p>
          <p className="text-slate-300">
            Total a cobrar:{' '}
            <strong className="text-emerald-400 text-lg">
              ${Number(totalAmount).toLocaleString('es-AR')}
            </strong>
          </p>
        </div>

        <div>
          <label className="block text-xs text-slate-400 mb-2">
            Confirmá con qué medio de pago abonó el cliente:
          </label>
          <div className="grid grid-cols-3 gap-2">
            {[
              { id: 'cash', label: 'Efectivo' },
              { id: 'transfer', label: 'Transferencia' },
              { id: 'bank', label: 'Tarjeta / Banco' },
            ].map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => setPaymentMethod(m.id as any)}
                className={`p-2.5 rounded-xl text-xs font-bold border transition ${
                  paymentMethod === m.id
                    ? 'bg-sky-600 border-sky-400 text-white'
                    : 'bg-slate-950 border-slate-800 text-slate-400'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 rounded-xl bg-slate-800 text-xs font-semibold"
          >
            Volver atrás
          </button>
          <button
            type="button"
            onClick={() => onConfirm(paymentMethod)}
            className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold"
          >
            Confirmar Pago y Registrar Devolución
          </button>
        </div>
      </div>
    </div>
  );
}