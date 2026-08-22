'use client';

import { useState, useEffect } from 'react';
import { QrCode, Store, Loader2 } from 'lucide-react';
import QRControls from './components/QRControls';
import QRPreview from './components/QRPreview';
import QRPrintStand from './components/QRPrintStand';

export interface CompanyInfo {
  name: string;
  rnc: string | null;
  address: string | null;
  phone: string;
  logoUrl: string | null;
  slug: string;
}

export interface QRConfig {
  targetPath: string;
  customParams: string;
  fgColor: string;
  bgColor: string;
  includeLogo: boolean;
  size: number;
  errorLevel: 'L' | 'M' | 'Q' | 'H';
}

const DEFAULT_CONFIG: QRConfig = {
  targetPath: '',
  customParams: '',
  fgColor: '#001e40',
  bgColor: '#ffffff',
  includeLogo: false,
  size: 512,
  errorLevel: 'H',
};

function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '');
}

export default function QRStoreClient() {
  const [company, setCompany] = useState<CompanyInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [config, setConfig] = useState<QRConfig>(DEFAULT_CONFIG);
  const [view, setView] = useState<'editor' | 'stand' | 'stickers'>('editor');

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch('/api/v1/company/settings');
        if (res.ok) {
          const json = await res.json();
          const data = json.data;
          const slug = generateSlug(data.companyName || 'empresa');
          const info: CompanyInfo = {
            name: data.companyName || 'Mi Empresa',
            rnc: data.rnc || null,
            address: data.address || null,
            phone: data.phone || '',
            logoUrl: data.logoUrl || null,
            slug,
          };
          setCompany(info);
          setConfig(prev => ({
            ...prev,
            targetPath: '/' + slug,
            includeLogo: !!data.logoUrl,
          }));
        }
      } catch (e) {
        console.error('Error loading company data', e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const qrUrl = company
    ? origin + config.targetPath + (config.customParams ? '?' + config.customParams : '')
    : '';

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-3 text-slate-500">
          <Loader2 className="h-8 w-8 animate-spin text-[#001e40]" />
          <p className="text-sm font-medium">Cargando información de la empresa…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50/70 text-slate-800 font-sans pb-16 w-full">
      {/* Top bar */}
      <div className="bg-[#001e40] w-full px-6 py-2 flex justify-between items-center shadow-sm">
        <span className="text-white/80 text-[10px] uppercase font-bold tracking-widest flex items-center gap-2">
          <Store className="h-3.5 w-3.5 text-[#C5A059]" />
          Herramientas de Marketing / QR Tienda Online
        </span>
      </div>

      <div className="p-6 w-full max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="p-2 bg-[#001e40]/5 rounded-xl text-[#001e40]">
                <QrCode className="h-6 w-6" />
              </span>
              <h1 className="text-2xl font-bold text-[#001e40] tracking-tight">QR Tienda Online</h1>
            </div>
            <p className="text-slate-500 text-sm pl-12">
              Genera, personaliza e imprime el código QR de tu tienda digital.
              {company && (
                <span className="ml-2 font-semibold text-[#001e40]">{company.name}</span>
              )}
            </p>
          </div>

          {/* View Tabs */}
          <div className="flex items-center gap-2 bg-slate-100 p-1 rounded-xl">
            {(['editor', 'stand', 'stickers'] as const).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={[
                  'px-4 py-2 rounded-lg text-sm font-semibold transition-all',
                  view === v ? 'bg-white text-[#001e40] shadow-sm' : 'text-slate-500 hover:text-slate-700',
                ].join(' ')}
              >
                {v === 'editor' ? '✏️ Editor' : v === 'stand' ? '🖨️ Stand' : '🏷️ Stickers'}
              </button>
            ))}
          </div>
        </div>

        {/* Main Content */}
        {view === 'editor' && company && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            <div className="lg:col-span-4">
              <QRControls
                company={company}
                config={config}
                onChange={setConfig}
              />
            </div>
            <div className="lg:col-span-8">
              <QRPreview company={company} config={config} qrUrl={qrUrl} />
            </div>
          </div>
        )}

        {(view === 'stand' || view === 'stickers') && company && (
          <QRPrintStand
            company={company}
            config={config}
            qrUrl={qrUrl}
            mode={view}
          />
        )}
      </div>
    </div>
  );
}
