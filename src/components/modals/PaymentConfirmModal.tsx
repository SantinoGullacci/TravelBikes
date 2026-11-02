'use client';

import { useState } from 'react';
import { AlertTriangle, Banknote, ArrowRightLeft, CreditCard, Clock } from 'lucide-react';

interface PaymentConfirmModalProps {
  customerName: string;
  totalAmount: number;
  cashAmount?: number;
  transferAmount?: number;
  isLateFee?: boolean;
  initialMethod: string;
  onClose: () => void;
  onConfirm: (method: string) => void;
}

export default function PaymentConfirmModal({
  customerName,
  totalAmount,
  cashAmount,
  transferAmount,
  isLateFee = false,
  initialMethod,
  onClose,
  onConfirm,
}: PaymentConfirmModalProps) {
  const [method, setMethod] = useState<string>(initialMethod || 'cash');
  const [submitting, setSubmitting] = useState(false);

  const displayedAmount =
    method === 'cash'
      ? (cashAmount !== undefined ? cashAmount : totalAmount)
      : (transferAmount !== undefined ? transferAmount : totalAmount);

  const handleConfirm = async () => {
    setSubmitting(true);
    await onConfirm(method);
    setSubmitting(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
      <div className={`bg-slate-900 border rounded-2xl p-6 max-w-md w-full space-y-5 shadow-2xl ${
        isLateFee ? 'border-amber-500/50' : 'border-pink-500/40'
      }`}>
        <div className="flex items-start gap-3">
          <div className={`p-2 rounded-xl shrink-0 mt-0.5 ${
            isLateFee ? 'bg-amber-500/10 text-amber-500' : 'bg-pink-500/10 text-pink-500'
          }`}>
            {isLateFee ? <Clock className="w-6 h-6" /> : <AlertTriangle className="w-6 h-6" />}
          </div>
          <div>
            <h3 className="text-lg font-extrabold text-white">
              {isLateFee ? 'Devolución con Demora' : 'Pago Pendiente de Confirmación'}
            </h3>
            <p className={`text-xs font-semibold mt-0.5 ${
              isLateFee ? 'text-amber-400' : 'text-pink-400'
            }`}>
              {isLateFee
                ? 'Se aplica la tarifa por día debido a la demora en la entrega.'
                : 'Este alquiler figura como PENDIENTE DE PAGO.'}
            </p>
          </div>
        </div>

        <div className="bg-slate-950/90 border border-slate-800 rounded-xl p-4 space-y-1.5">
          <p className="text-sm text-slate-300">
            Cliente: <strong className="text-white">{customerName}</strong>
          </p>
          <p className="text-sm text-slate-300 flex items-center justify-between">
            <span>Total a cobrar:</span>
            <span className="text-xl font-black text-emerald-400 transition-all">
              ${Number(displayedAmount).toLocaleString('es-AR')}
            </span>
          </p>
        </div>

        <div className="space-y-2">
          <p className="text-xs text-slate-400 font-medium">
            Confirmá con qué medio de pago abonó el cliente:
          </p>
          <div className="grid grid-cols-3 gap-2">
            {[
              { id: 'cash', label: 'Efectivo', icon: Banknote },
              { id: 'transfer', label: 'Transferencia', icon: ArrowRightLeft },
              { id: 'bank', label: 'Débito', icon: CreditCard },
            ].map((m) => {
              const Icon = m.icon;
              const active = method === m.id;
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setMethod(m.id)}
                  className={`flex flex-col items-center justify-center gap-1.5 py-3 px-2 rounded-xl text-xs font-extrabold transition border ${
                    active
                      ? 'bg-sky-500 border-sky-400 text-white shadow-md shadow-sky-500/20'
                      : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700 hover:text-white'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span>{m.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 pt-2">
          <button
            type="button"
            disabled={submitting}
            onClick={onClose}
            className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold transition"
          >
            Volver atrás
          </button>
          <button
            type="button"
            disabled={submitting}
            onClick={handleConfirm}
            className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-extrabold transition shadow-lg shadow-emerald-600/30"
          >
            {submitting ? 'Confirmando...' : 'Confirmar Pago y Registrar Devolución'}
          </button>
        </div>
      </div>
    </div>
  );
}