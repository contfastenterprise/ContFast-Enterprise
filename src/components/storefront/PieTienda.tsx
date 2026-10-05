/**
 * El pie de la tienda, al estilo de Spree (lote 231): blanco, con columnas
 * (la empresa, la tienda, la cuenta) y la linea de derechos debajo. Antes era
 * un bloque azul marino; en Spree el color lo llevan los productos, no el marco.
 */
import Link from 'next/link';
import { Phone, Mail, MapPin, LogIn } from 'lucide-react';
import type { EnlaceDelMenu } from './CabeceraTienda';
import { FOCO_TIENDA } from './botonTiendaVariantes';

const titulo = 'mb-4 text-[12px] font-semibold uppercase tracking-[0.18em] text-slate-900';
const enlace = `rounded-sm text-sm text-slate-600 hover:text-slate-900 hover:underline underline-offset-4 ${FOCO_TIENDA}`;

export default function PieTienda({ empresaSlug, empresa, enlaces }: {
  empresaSlug: string;
  empresa: { name: string; rnc: string; phone?: string | null; email?: string | null; address?: string | null };
  enlaces: EnlaceDelMenu[];
}) {
  return (
    <footer className="border-t border-slate-200 bg-white print:hidden">
      <div className="mx-auto grid max-w-[1400px] grid-cols-1 gap-10 px-4 py-14 sm:grid-cols-2 sm:px-6 lg:grid-cols-4 lg:px-10">
        <div>
          <p className="mb-4 text-base font-semibold uppercase tracking-[0.15em] text-slate-900">{empresa.name}</p>
          <p className="text-sm text-slate-500">RNC {empresa.rnc}</p>
          <ul className="mt-4 space-y-2 text-sm text-slate-600">
            {empresa.phone && (
              <li className="flex items-center gap-2"><Phone className="h-4 w-4 shrink-0" aria-hidden="true" />
                <a href={`tel:${empresa.phone.replace(/[^\d+]/g, '')}`} className={`rounded-sm hover:underline underline-offset-4 ${FOCO_TIENDA}`}>{empresa.phone}</a></li>
            )}
            {empresa.email && (
              <li className="flex items-center gap-2"><Mail className="h-4 w-4 shrink-0" aria-hidden="true" />
                <a href={`mailto:${empresa.email}`} className={`break-all rounded-sm hover:underline underline-offset-4 ${FOCO_TIENDA}`}>{empresa.email}</a></li>
            )}
            {empresa.address && (
              <li className="flex items-start gap-2"><MapPin className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /><span>{empresa.address}</span></li>
            )}
          </ul>
        </div>

        <div>
          <p className={titulo}>Tienda</p>
          <ul className="space-y-2.5">
            {enlaces.map((e) => <li key={e.href}><Link href={e.href} className={enlace}>{e.etiqueta}</Link></li>)}
          </ul>
        </div>

        <div>
          {/* Lote 233: sin cuentas; lo del visitante vive en su navegador. */}
          <p className={titulo}>Lo tuyo</p>
          <ul className="space-y-2.5">
            <li><Link href={`/${empresaSlug}/mi-cotizacion`} className={enlace}>Mi cotización</Link></li>
            <li><Link href={`/${empresaSlug}/favoritos`} className={enlace}>Favoritos</Link></li>
          </ul>
        </div>

        <div>
          <p className={titulo}>Empresa</p>
          <ul className="space-y-2.5">
            <li>
              <Link href="/dashboard" className={`${enlace} inline-flex items-center gap-2`} target="_blank" rel="noopener noreferrer">
                <LogIn className="h-4 w-4" aria-hidden="true" />
                Portal administrativo
              </Link>
            </li>
          </ul>
        </div>
      </div>

      <div className="border-t border-slate-200">
        <div className="mx-auto flex max-w-[1400px] flex-col items-center justify-between gap-2 px-4 py-6 text-xs text-slate-500 sm:flex-row sm:px-6 lg:px-10">
          <p>&copy; {new Date().getFullYear()} {empresa.name}. Todos los derechos reservados.</p>
          <p>Con la tecnología de <span className="font-semibold text-slate-900">ContFast Enterprise</span></p>
        </div>
      </div>
    </footer>
  );
}
