'use client';

import { QRConfig, CompanyInfo } from '../QRStoreClient';
import { Store, Package, Tag, ShoppingCart, Link, ChevronDown } from 'lucide-react';

interface QRControlsProps {
  company: CompanyInfo;
  config: QRConfig;
  onChange: (cfg: QRConfig) => void;
}

const PRESET_COLORS = [
  { label: 'Azul Marino', value: '#001e40' },
  { label: 'Negro', value: '#000000' },
  { label: 'Café', value: '#7c2d12' },
  { label: 'Verde', value: '#14532d' },
  { label: 'Morado', value: '#3b0764' },
  { label: 'Dorado', value: '#78350f' },
];

const ROUTE_OPTIONS = (slug: string) => [
  { label: '🏪 Portada / Inicio de Tienda', value: '/' + slug, icon: Store },
  { label: '📦 Catálogo de Productos', value: '/' + slug + '/productos', icon: Package },
  { label: '🔥 Sección de Promociones', value: '/' + slug + '/promociones', icon: Tag },
  { label: '🛒 Mi Cotización / Carrito', value: '/' + slug + '/mi-cotizacion', icon: ShoppingCart },
];

export default function QRControls({ company, config, onChange }: QRControlsProps) {
  const update = (patch: Partial<QRConfig>) => onChange({ ...config, ...patch });
  const routes = ROUTE_OPTIONS(company.slug);

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
      <div className="bg-slate-50 px-5 py-4 border-b border-slate-100">
        <h2 className="font-bold text-slate-800 text-sm">Personalización del Código QR</h2>
        <p className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold mt-0.5">Configura el destino y estilo</p>
      </div>

      <div className="p-5 space-y-6">
        {/* Destino */}
        <div className="space-y-2">
          <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider block">
            Destino del Código QR
          </label>
          <div className="space-y-2">
            {routes.map((r) => (
              <button
                key={r.value}
                type="button"
                onClick={() => update({ targetPath: r.value })}
                className={[
                  'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border text-sm font-medium transition-all text-left',
                  config.targetPath === r.value
                    ? 'bg-[#001e40] border-[#001e40] text-white shadow-sm'
                    : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50 hover:border-slate-300',
                ].join(' ')}
              >
                <span className="text-base">{r.label.split(' ')[0]}</span>
                <span>{r.label.split(' ').slice(1).join(' ')}</span>
              </button>
            ))}
          </div>

          {/* Parámetros UTM */}
          <div className="space-y-1 mt-3">
            <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1">
              <Link className="h-3 w-3" /> Parámetro UTM (opcional)
            </label>
            <input
              type="text"
              placeholder="src=mostrador&campaña=agosto"
              value={config.customParams}
              onChange={(e) => update({ customParams: e.target.value })}
              className="w-full h-10 px-3 text-xs font-medium rounded-xl border border-slate-200 focus:border-[#001e40] focus:ring-2 focus:ring-[#001e40]/10 bg-white text-slate-700 transition-all placeholder:text-slate-300"
            />
          </div>
        </div>

        {/* Separador */}
        <div className="border-t border-slate-100" />

        {/* Colores */}
        <div className="space-y-2">
          <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider block">
            Color del Código QR
          </label>
          <div className="grid grid-cols-3 gap-2">
            {PRESET_COLORS.map((c) => (
              <button
                key={c.value}
                type="button"
                onClick={() => update({ fgColor: c.value })}
                title={c.label}
                className={[
                  'h-9 rounded-xl border-2 transition-all',
                  config.fgColor === c.value ? 'border-[#C5A059] scale-95' : 'border-transparent hover:scale-95',
                ].join(' ')}
                style={{ backgroundColor: c.value }}
              />
            ))}
          </div>
          <div className="flex items-center gap-3 mt-2">
            <div className="flex-1 space-y-1">
              <label className="text-[10px] text-slate-500 font-semibold uppercase">Módulos</label>
              <div className="flex items-center gap-2 h-10 px-3 rounded-xl border border-slate-200 bg-white">
                <div className="w-5 h-5 rounded-md border border-slate-200" style={{ backgroundColor: config.fgColor }} />
                <input
                  type="text"
                  value={config.fgColor}
                  onChange={(e) => update({ fgColor: e.target.value })}
                  className="flex-1 text-xs font-mono bg-transparent border-none outline-none text-slate-700"
                />
              </div>
            </div>
            <div className="flex-1 space-y-1">
              <label className="text-[10px] text-slate-500 font-semibold uppercase">Fondo</label>
              <div className="flex items-center gap-2 h-10 px-3 rounded-xl border border-slate-200 bg-white">
                <div className="w-5 h-5 rounded-md border border-slate-200" style={{ backgroundColor: config.bgColor }} />
                <input
                  type="text"
                  value={config.bgColor}
                  onChange={(e) => update({ bgColor: e.target.value })}
                  className="flex-1 text-xs font-mono bg-transparent border-none outline-none text-slate-700"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Separador */}
        <div className="border-t border-slate-100" />

        {/* Opciones */}
        <div className="space-y-3">
          <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider block">
            Opciones
          </label>

          {/* Logo */}
          {company.logoUrl && (
            <label className="flex items-center justify-between cursor-pointer">
              <div>
                <p className="text-sm font-semibold text-slate-700">Incrustar Logotipo</p>
                <p className="text-[10px] text-slate-400">Añade el logo corporativo en el centro del QR</p>
              </div>
              <div
                onClick={() => update({ includeLogo: !config.includeLogo })}
                className={[
                  'relative w-11 h-6 rounded-full transition-colors cursor-pointer',
                  config.includeLogo ? 'bg-[#001e40]' : 'bg-slate-200',
                ].join(' ')}
              >
                <div className={[
                  'absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform',
                  config.includeLogo ? 'translate-x-5' : 'translate-x-0.5',
                ].join(' ')} />
              </div>
            </label>
          )}

          {/* Tamaño */}
          <div className="space-y-1">
            <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex justify-between">
              <span>Resolución de Exportación</span>
              <span className="text-[#001e40]">{config.size}px</span>
            </label>
            <input
              type="range"
              min={256}
              max={2048}
              step={128}
              value={config.size}
              onChange={(e) => update({ size: Number(e.target.value) })}
              className="w-full accent-[#001e40]"
            />
            <div className="flex justify-between text-[9px] text-slate-400 font-semibold">
              <span>256 (Web)</span>
              <span>1024 (Redes)</span>
              <span>2048 (Imprenta)</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
