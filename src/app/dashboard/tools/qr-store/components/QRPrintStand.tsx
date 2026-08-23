'use client';

import { useEffect, useRef } from 'react';
import QRCode from 'qrcode';
import { Printer } from 'lucide-react';
import { toast } from 'sonner';
import { QRConfig, CompanyInfo } from '../QRStoreClient';

interface QRPrintStandProps {
  company: CompanyInfo;
  config: QRConfig;
  qrUrl: string;
  mode: 'stand' | 'stickers';
}

export default function QRPrintStand({ company, config, qrUrl, mode }: QRPrintStandProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stickerRefs = useRef<(HTMLCanvasElement | null)[]>([]);

  const renderCanvas = async (canvas: HTMLCanvasElement | null, size: number) => {
    if (!canvas || !qrUrl) return;
    try {
      await QRCode.toCanvas(canvas, qrUrl, {
        width: size,
        margin: 2,
        color: { dark: config.fgColor, light: config.bgColor },
        errorCorrectionLevel: config.errorLevel,
      });

      if (config.includeLogo && company.logoUrl) {
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        const img = new Image();
        img.crossOrigin = 'anonymous';
        await new Promise<void>((resolve) => {
          img.onload = () => resolve();
          img.onerror = () => resolve();
          img.src = company.logoUrl as string;
        });
        const maxLogoSize = size * 0.22;
        const padding = maxLogoSize * 0.15;

        const ratio = img.naturalWidth / img.naturalHeight;
        let drawW: number, drawH: number;
        if (ratio >= 1) {
          drawW = maxLogoSize;
          drawH = maxLogoSize / ratio;
        } else {
          drawH = maxLogoSize;
          drawW = maxLogoSize * ratio;
        }

        const bgW = drawW + padding * 2;
        const bgH = drawH + padding * 2;
        const cx = (size - bgW) / 2;
        const cy = (size - bgH) / 2;

        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.roundRect(cx, cy, bgW, bgH, Math.min(bgW, bgH) * 0.12);
        ctx.fill();
        ctx.drawImage(img, cx + padding, cy + padding, drawW, drawH);
      }
    } catch (e) {
      console.error('QR render error', e);
    }
  };

  useEffect(() => {
    if (mode === 'stand') {
      renderCanvas(canvasRef.current, 400);
    } else {
      stickerRefs.current.forEach((c) => renderCanvas(c, 180));
    }
  }, [qrUrl, config, company.logoUrl, mode]);

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-4">
      {/* Print Action Bar */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm px-6 py-4 flex items-center justify-between">
        <div>
          <h3 className="font-bold text-slate-800 text-sm">
            {mode === 'stand' ? '🖨️ Stand de Mostrador Comercial' : '🏷️ Hoja de Stickers / Etiquetas'}
          </h3>
          <p className="text-[11px] text-slate-500 mt-0.5">
            {mode === 'stand'
              ? 'Plantilla profesional lista para imprimir y colocar en tu mostrador o mesa de atención al cliente.'
              : 'Cuadrícula de 9 códigos QR para imprimir en papel adhesivo o recortar.'}
          </p>
        </div>
        <button
          onClick={handlePrint}
          className="flex items-center gap-2 px-5 py-2.5 bg-[#001e40] hover:bg-[#002c59] text-white rounded-xl font-bold text-sm transition shadow-sm"
        >
          <Printer className="h-4 w-4" /> Imprimir
        </button>
      </div>

      {/* STAND template */}
      {mode === 'stand' && (
        <div
          id="print-area"
          className="bg-white rounded-2xl border border-slate-200 shadow-sm mx-auto overflow-hidden print:shadow-none print:border-none print:rounded-none"
          style={{ maxWidth: 600 }}
        >
          {/* Stand header */}
          <div className="px-8 pt-8 pb-4 text-center" style={{ background: config.fgColor }}>
            {company.logoUrl && (
              <div className="inline-flex items-center justify-center bg-white rounded-2xl px-6 py-3.5 mb-4 shadow-sm">
                <img
                  src={company.logoUrl}
                  alt={company.name}
                  className="h-20 w-auto object-contain"
                  onError={(e) => { (e.target as HTMLImageElement).parentElement!.style.display = 'none'; }}
                />
              </div>
            )}
            <h1 className="text-2xl font-extrabold tracking-tight text-white">{company.name}</h1>
          </div>

          {/* CTA */}
          <div className="px-8 py-6 text-center bg-white">
            <p className="text-xl font-extrabold text-slate-800 leading-tight">
              ¡Cotiza y ordena<br />desde tu celular!
            </p>
            <p className="text-slate-500 text-sm mt-2 font-medium">
              Escanea el código con la cámara de tu teléfono
            </p>
          </div>

          {/* QR */}
          <div className="flex justify-center pb-4">
            <div className="p-4 border-4 rounded-2xl" style={{ borderColor: config.fgColor }}>
              <canvas ref={canvasRef} style={{ width: 220, height: 220 }} />
            </div>
          </div>

          {/* Steps */}
          <div className="px-8 pb-6">
            <div className="grid grid-cols-3 gap-4 text-center">
              {[
                { step: '1', icon: '📷', text: 'Abre la cámara de tu teléfono' },
                { step: '2', icon: '🔍', text: 'Apunta al código QR' },
                { step: '3', icon: '✅', text: 'Cotiza y ordena al instante' },
              ].map((s) => (
                <div key={s.step} className="flex flex-col items-center gap-2">
                  <div
                    className="w-10 h-10 rounded-full flex items-center justify-center font-extrabold text-white text-sm"
                    style={{ background: config.fgColor }}
                  >
                    {s.step}
                  </div>
                  <span className="text-2xl">{s.icon}</span>
                  <p className="text-[11px] text-slate-600 font-medium leading-tight">{s.text}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Footer */}
          <div className="px-8 pb-8 pt-4 border-t border-slate-100 text-center space-y-1">
            {company.phone && (
              <p className="text-[11px] text-slate-500">📞 {company.phone}</p>
            )}
            {company.address && (
              <p className="text-[11px] text-slate-400">📍 {company.address}</p>
            )}
            {company.rnc && (
              <p className="text-[10px] text-slate-300">RNC: {company.rnc}</p>
            )}
          </div>
        </div>
      )}

      {/* STICKERS template */}
      {mode === 'stickers' && (
        <div
          id="print-area"
          className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 print:shadow-none print:border-none print:rounded-none print:p-2"
        >
          <p className="text-center text-xs text-slate-400 mb-4 font-medium print:hidden">
            Cuadrícula de 9 códigos QR — Ideal para papel adhesivo (carta/A4)
          </p>
          <div className="grid grid-cols-3 gap-4">
            {Array.from({ length: 9 }).map((_, i) => (
              <div
                key={i}
                className="flex flex-col items-center gap-1 border border-dashed border-slate-200 rounded-xl p-3"
              >
                <canvas
                  ref={(el) => { stickerRefs.current[i] = el; }}
                  style={{ width: 120, height: 120 }}
                />
                <p className="text-[8px] font-bold text-slate-500 uppercase tracking-widest truncate max-w-full text-center">
                  {company.name}
                </p>
                <p className="text-[7px] text-slate-400 font-mono truncate max-w-full text-center">
                  {company.slug}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Print Styles - isolate print area */}
      <style dangerouslySetInnerHTML={{ __html: `
        @media print {
          body > *:not(#__next) { display: none !important; }
          #print-area, #print-area * { display: revert !important; }
          nav, header, aside, footer { display: none !important; }
        }
      ` }} />
    </div>
  );
}
