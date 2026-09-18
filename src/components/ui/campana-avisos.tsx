'use client';

/**
 * La campana de avisos (lote 160).
 *
 * POR QUE EXISTE. Los avisos del sistema -- comprobantes rechazados, cheques en
 * garantia por cobrar, periodos contables que se acaban, la caja sin cerrar, el
 * 606/607 sin presentar -- solo se veian en el panel de inicio. Quien entraba
 * directo a facturar no se enteraba de ninguno. Ahora se guardan
 * (`services/avisos/sincronizarAvisos.ts`) y se ven desde cualquier pantalla.
 *
 * QUE NO HACE: marcar leido NO resuelve nada. El cheque sigue por cobrar y el
 * 607 sin presentar; lo unico que cambia es que deja de destacarse. El aviso se
 * cierra solo cuando el panel deja de calcularlo.
 */
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Bell, AlertCircle, Clock, Info, CheckCheck } from 'lucide-react';
import clsx from 'clsx';
import { formatDateTimeDisplay } from '@/utils/fechasLocales';

interface Aviso {
  id: string;
  clave: string;
  title: string;
  message: string;
  type: string;
  actionText: string | null;
  actionLink: string | null;
  readAt: string | null;
  createdAt: string;
}

const ICONO = {
  error: AlertCircle,
  warning: Clock,
  info: Info,
} as const;

export default function CampanaAvisos() {
  const router = useRouter();
  const [abierta, setAbierta] = useState(false);
  const [avisos, setAvisos] = useState<Aviso[]>([]);
  const [sinLeer, setSinLeer] = useState(0);

  const cargar = async () => {
    try {
      const res = await fetch('/api/v1/notifications');
      const data = await res.json();
      if (!res.ok || !data.success) return;
      setAvisos(data.data || []);
      setSinLeer(data.meta?.sinLeer ?? 0);
    } catch {
      //  Que no se puedan leer los avisos no rompe la aplicacion: la campana
      //  se queda como estaba.
    }
  };

  useEffect(() => {
    cargar();
    //  Cada cinco minutos. Los avisos los recalcula el panel, asi que esto solo
    //  refresca lo que ya esta guardado: no hace falta mas.
    const reloj = setInterval(cargar, 5 * 60 * 1000);
    return () => clearInterval(reloj);
  }, []);

  const marcarTodos = async () => {
    await fetch('/api/v1/notifications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    await cargar();
  };

  const abrir = async (aviso: Aviso) => {
    if (!aviso.readAt) {
      await fetch('/api/v1/notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: [aviso.id] }),
      });
    }
    setAbierta(false);
    if (aviso.actionLink) router.push(aviso.actionLink);
    else await cargar();
  };

  return (
    <div className="relative">
      <button
        onClick={() => setAbierta((v) => !v)}
        className="relative p-2 rounded-lg transition hover:bg-slate-200/50 text-inherit"
        title={sinLeer > 0 ? `${sinLeer} aviso(s) sin leer` : 'Avisos'}
        aria-label="Avisos"
      >
        <Bell className="h-5 w-5" strokeWidth={1.5} />
        {sinLeer > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-red-600 text-white text-[10px] font-bold flex items-center justify-center">
            {sinLeer > 9 ? '9+' : sinLeer}
          </span>
        )}
      </button>

      {abierta && (
        <>
          {/* Capa para cerrar al pulsar fuera */}
          <div className="fixed inset-0 z-[60]" onClick={() => setAbierta(false)} />
          <div className="absolute right-0 mt-2 w-[22rem] max-h-[70vh] overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-xl z-[61] text-slate-900">
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
              <span className="font-bold text-sm">Avisos</span>
              {sinLeer > 0 && (
                <button onClick={marcarTodos} className="text-xs font-semibold text-[#003366] hover:underline flex items-center gap-1">
                  <CheckCheck className="h-3.5 w-3.5" /> Marcar todo leído
                </button>
              )}
            </div>

            {avisos.length === 0 ? (
              <p className="px-4 py-6 text-sm text-slate-500">No hay avisos pendientes.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {avisos.map((a) => {
                  const Icono = ICONO[a.type as keyof typeof ICONO] ?? Info;
                  return (
                    <li key={a.id}>
                      <button
                        onClick={() => abrir(a)}
                        className={clsx('w-full text-left px-4 py-3 hover:bg-slate-50 transition flex gap-3', !a.readAt && 'bg-amber-50/60')}
                      >
                        <Icono className={clsx('h-5 w-5 shrink-0 mt-0.5', a.type === 'error' ? 'text-red-600' : a.type === 'warning' ? 'text-amber-600' : 'text-slate-500')} />
                        <span className="min-w-0">
                          <span className="block font-semibold text-sm leading-snug">{a.title}</span>
                          <span className="block text-xs text-slate-600 mt-0.5 leading-snug">{a.message}</span>
                          <span className="block text-[10px] text-slate-400 mt-1">
                            {formatDateTimeDisplay(a.createdAt)}
                            {a.actionText ? ` · ${a.actionText}` : ''}
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
}
