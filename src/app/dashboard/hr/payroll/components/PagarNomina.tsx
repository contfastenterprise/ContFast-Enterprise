'use client';

/**
 * Lote 295: pagar una nomina aprobada. El boton y su ventana: de donde sale el
 * dinero (un banco por transferencia o cheque, o la caja), la fecha del pago,
 * la referencia (obligatoria fuera del efectivo, lote 172) y la confirmacion
 * con el neto.
 *
 * La regla es la del servidor (`services/nomina/pagoDeNomina.ts`): la ventana
 * valida con `validarPeticionDePago` antes de mandar, y lo que solo sabe el
 * servidor (que tenga asiento de devengo, que haya caja abierta, el periodo)
 * llega como 409 y se enseña dentro de la ventana, que no se cierra.
 *
 * Uso (el principal lo conecta en `payroll/page.tsx`):
 *   <PagarNomina payrollId={p.id} neto={totalNeto} status={p.status} alPagar={recargar} />
 * `neto` en pesos (la suma del neto del detalle); `alPagar` recarga la lista y el detalle.
 */
import { useRef, useState } from 'react';
import { Banknote, Wallet } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/dialog';
import { AccionesDeFormulario } from '@/components/ui/acciones-de-formulario';
import { leerRespuesta } from '@/utils/leerRespuesta';
import { diaRD } from '@/utils/fechasLocales';
import {
  NOMBRE_DEL_METODO,
  sePuedePagar,
  saleDelBanco,
  validarPeticionDePago,
  type MetodoDePago,
} from '@/services/nomina/pagoDeNomina';

export interface BancoParaPagar {
  id: string;
  bankName: string;
  accountNumber: string;
}

export interface DatosDelPago {
  metodo: MetodoDePago;
  bankAccountId: string;
  fecha: string;
  referencia: string;
}

const campo = 'w-full h-8 px-3 py-1.5 text-xs rounded-lg border border-slate-200 bg-slate-50 focus:outline-none focus:border-[#c5a059] focus:ring-1 focus:ring-[#c5a059]/20 text-slate-800';
const etiqueta = 'block text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1';
const pesos = (n: number) => `RD$ ${n.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const METODOS: MetodoDePago[] = ['transfer', 'check', 'cash'];

/** El formulario de la ventana: solo pinta (el banco lo dibuja con datos fijos). */
export function FormularioDePagoDeNomina({
  datos, bancos, errorBancos, neto, motivo, cambiar,
}: {
  datos: DatosDelPago;
  bancos: BancoParaPagar[];
  errorBancos: string | null;
  neto: number;
  motivo: string | null;
  cambiar: (parcial: Partial<DatosDelPago>) => void;
}) {
  const porBanco = saleDelBanco(datos.metodo);
  return (
    <div className="space-y-3">
      <fieldset>
        <legend className={etiqueta}>De dónde sale el dinero</legend>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {METODOS.map((m) => (
            <label key={m} htmlFor={`pago-metodo-${m}`} className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold cursor-pointer ${datos.metodo === m ? 'border-[#003366] bg-[#003366]/5 text-[#003366]' : 'border-slate-200 text-slate-700'}`}>
              <input
                id={`pago-metodo-${m}`}
                type="radio"
                name="pago-metodo"
                value={m}
                checked={datos.metodo === m}
                onChange={() => cambiar({ metodo: m, bankAccountId: m === 'cash' ? '' : datos.bankAccountId })}
              />
              {NOMBRE_DEL_METODO[m]}
            </label>
          ))}
        </div>
      </fieldset>

      {porBanco && (
        <div>
          <label htmlFor="pago-banco" className={etiqueta}>Cuenta bancaria</label>
          <select id="pago-banco" className={campo} value={datos.bankAccountId} onChange={(e) => cambiar({ bankAccountId: e.target.value })}>
            <option value="">Seleccione la cuenta de la que sale el pago</option>
            {bancos.map((b) => (
              <option key={b.id} value={b.id}>{b.bankName} {b.accountNumber}</option>
            ))}
          </select>
          {errorBancos && <p role="status" className="mt-1 text-[11px] text-rose-700">{errorBancos}</p>}
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="pago-fecha" className={etiqueta}>Fecha del pago</label>
          <input id="pago-fecha" type="date" className={campo} value={datos.fecha} onChange={(e) => cambiar({ fecha: e.target.value })} />
        </div>
        {porBanco && (
          <div>
            <label htmlFor="pago-referencia" className={etiqueta}>{datos.metodo === 'check' ? 'Número del cheque' : 'Referencia de la transferencia'}</label>
            <input id="pago-referencia" type="text" maxLength={100} className={campo} value={datos.referencia} onChange={(e) => cambiar({ referencia: e.target.value })} />
          </div>
        )}
      </div>

      <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
        Se pagará el neto de la nómina, <strong className="text-slate-900">{pesos(neto)}</strong>,{' '}
        {porBanco ? 'desde la cuenta bancaria elegida; el retiro queda en su libro, pendiente de conciliar.' : 'desde la caja: sale de la sesión de caja abierta.'}{' '}
        El asiento salda Sueldos por Pagar. La TSS, el ISR y el Infotep se pagan aparte, desde Bancos.
      </p>

      {motivo && (
        <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-800">{motivo}</p>
      )}
    </div>
  );
}

export function PagarNomina({
  payrollId, neto, status, alPagar,
}: {
  payrollId: string;
  /** El neto total de la nomina, en pesos. */
  neto: number;
  status: string;
  /** Tras pagar: recargar la lista y el detalle. */
  alPagar: () => void;
}) {
  const [abierta, setAbierta] = useState(false);
  const [datos, setDatos] = useState<DatosDelPago>({ metodo: 'transfer', bankAccountId: '', fecha: '', referencia: '' });
  const [bancos, setBancos] = useState<BancoParaPagar[]>([]);
  const [errorBancos, setErrorBancos] = useState<string | null>(null);
  const [motivo, setMotivo] = useState<string | null>(null);
  const [pagando, setPagando] = useState(false);
  // Dos clics seguidos llegan antes de volver a pintar: la guarda no puede ser el estado.
  const enVuelo = useRef(false);

  if (!sePuedePagar(status, Math.round(neto * 100))) return null;

  const abrir = async () => {
    setDatos({ metodo: 'transfer', bankAccountId: '', fecha: diaRD(), referencia: '' });
    setMotivo(null);
    setAbierta(true);
    // Los bancos se piden al abrir, no en un efecto.
    try {
      const leido = await leerRespuesta<{ data: BancoParaPagar[] }>(await fetch('/api/v1/bank/accounts'));
      if (leido.bien) {
        setBancos(leido.cuerpo.data ?? []);
        setErrorBancos(null);
      } else {
        setBancos([]);
        setErrorBancos(leido.mensaje ?? 'No se pudieron leer las cuentas bancarias: puede pagar desde la caja.');
      }
    } catch {
      setBancos([]);
      setErrorBancos('No se pudieron leer las cuentas bancarias (error de red): puede pagar desde la caja.');
    }
  };

  const cerrar = () => {
    if (enVuelo.current) return;
    setAbierta(false);
  };

  const pagar = async () => {
    if (enVuelo.current) return;
    const valido = validarPeticionDePago(datos, diaRD());
    if (!valido.ok) {
      setMotivo(valido.motivo);
      return;
    }
    enVuelo.current = true;
    setPagando(true);
    setMotivo(null);
    try {
      const res = await fetch(`/api/v1/hr/payroll/${payrollId}/pay`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(valido.pago),
      });
      const leido = await leerRespuesta(res);
      if (leido.bien) {
        toast.success('Nómina pagada: el asiento y el movimiento quedaron registrados.');
        setAbierta(false);
        alPagar();
      } else {
        setMotivo(leido.mensaje ?? `No se pudo pagar la nómina (error ${leido.estado}).`);
      }
    } catch {
      setMotivo('No se pudo pagar la nómina: error de red. Compruebe la conexión y vuelva a intentarlo.');
    } finally {
      enVuelo.current = false;
      setPagando(false);
    }
  };

  return (
    <>
      <Button type="button" variant="success" size="sm" onClick={abrir}>
        <Banknote aria-hidden="true" />
        Pagar nómina
      </Button>
      <Modal
        isOpen={abierta}
        onClose={cerrar}
        title="Pagar nómina"
        description="El neto, de una vez, desde un banco o desde la caja."
        icono={<Wallet className="h-4 w-4" aria-hidden="true" />}
        maxWidth="lg"
        bloqueada={pagando}
        cerrarAlPulsarFuera={false}
        footer={
          <AccionesDeFormulario
            textoPrincipal={`Pagar ${pesos(neto)}`}
            tipoPrincipal="button"
            alPrincipal={pagar}
            alCancelar={cerrar}
            guardando={pagando}
            separada={false}
          />
        }
      >
        <FormularioDePagoDeNomina
          datos={datos}
          bancos={bancos}
          errorBancos={errorBancos}
          neto={neto}
          motivo={motivo}
          cambiar={(p) => setDatos((d) => ({ ...d, ...p }))}
        />
      </Modal>
    </>
  );
}
