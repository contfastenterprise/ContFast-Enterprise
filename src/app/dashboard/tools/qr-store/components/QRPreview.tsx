'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import QRCode from 'qrcode';
import { Download, Copy, ExternalLink, Check, ImageIcon } from 'lucide-react';
import { toast } from 'sonner';
import { QRConfig, CompanyInfo } from '../QRStoreClient';

interface QRPreviewProps {
  company: CompanyInfo;
  config: QRConfig;
  qrUrl: string;
}

export default function QRPreview({ company, config, qrUrl }: QRPreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [copied, setCopied] = useState(false);
  const [generating, setGenerating] = useState(false);

  const renderQR = useCallback(async () => {
    const canvas = canvasRef.current;
    if (!canvas || !qrUrl) return;
    setGenerating(true);

    try {
      // Render QR to an offscreen canvas first
      const offscreen = document.createElement('canvas');
      await QRCode.toCanvas(offscreen, qrUrl, {
        width: config.size,
        margin: 2,
        color: { dark: config.fgColor, light: config.bgColor },
        errorCorrectionLevel: config.errorLevel,
      });

      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      canvas.width = config.size;
      canvas.height = config.size;
      ctx.drawImage(offscreen, 0, 0);

      // Draw logo if enabled
      if (config.includeLogo && company.logoUrl) {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        await new Promise<void>((resolve) => {
          img.onload = () => resolve();
          img.onerror = () => resolve(); // graceful fallback
          img.src = company.logoUrl as string;
        });

        // Determine the max logo area (square container occupying ~22% of QR)
        const maxLogoSize = config.size * 0.22;
        const padding = maxLogoSize * 0.15;

        // Preserve aspect ratio: scale to fit within maxLogoSize x maxLogoSize
        const ratio = img.naturalWidth / img.naturalHeight;
        let drawW: number, drawH: number;
        if (ratio >= 1) {
          // Wider than tall (rectangular logo — most common)
          drawW = maxLogoSize;
          drawH = maxLogoSize / ratio;
        } else {
          // Taller than wide
          drawH = maxLogoSize;
          drawW = maxLogoSize * ratio;
        }

        const bgW = drawW + padding * 2;
        const bgH = drawH + padding * 2;
        const cx = (config.size - bgW) / 2;
        const cy = (config.size - bgH) / 2;

        // White rounded background sized to actual logo dimensions
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.roundRect(cx, cy, bgW, bgH, Math.min(bgW, bgH) * 0.15);
        ctx.fill();

        // Draw logo centered and with correct proportions
        ctx.drawImage(img, cx + padding, cy + padding, drawW, drawH);
      }
    } catch (err) {
      console.error('QR render error', err);
      toast.error('Error al generar el QR');
    } finally {
      setGenerating(false);
    }
  }, [qrUrl, config, company.logoUrl]);

  useEffect(() => {
    renderQR();
  }, [renderQR]);

  const downloadPNG = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const link = document.createElement('a');
    link.download = `qr-tienda-${company.slug}-${config.size}px.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
    toast.success('Imagen PNG descargada');
  };

  const downloadSVG = async () => {
    try {
      const svgStr = await new Promise<string>((resolve, reject) => {
        QRCode.toString(qrUrl, {
          type: 'svg',
          margin: 2,
          color: { dark: config.fgColor, light: config.bgColor },
          errorCorrectionLevel: config.errorLevel as any,
          width: config.size,
        }, (err, string) => {
          if (err) reject(err);
          else resolve(string);
        });
      });
      const blob = new Blob([svgStr], { type: 'image/svg+xml' });
      const link = document.createElement('a');
      link.download = `qr-tienda-${company.slug}.svg`;
      link.href = URL.createObjectURL(blob);
      link.click();
      toast.success('Archivo SVG descargado');
    } catch (err) {
      toast.error('Error al exportar SVG');
    }
  };

  const copyImage = async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    try {
      canvas.toBlob(async (blob) => {
        if (!blob) return;
        await navigator.clipboard.write([
          new ClipboardItem({ 'image/png': blob }),
        ]);
        setCopied(true);
        toast.success('Imagen copiada al portapapeles');
        setTimeout(() => setCopied(false), 2000);
      });
    } catch {
      toast.error('No se pudo copiar la imagen');
    }
  };

  const copyLink = () => {
    navigator.clipboard.writeText(qrUrl).then(() => {
      setCopied(true);
      toast.success('Enlace copiado al portapapeles');
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
      <div className="bg-slate-50 px-5 py-4 border-b border-slate-100 flex items-center justify-between">
        <div>
          <h2 className="font-bold text-slate-800 text-sm">Vista Previa del QR</h2>
          <p className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold mt-0.5">
            {config.size}px · Corrección de error {config.errorLevel}
          </p>
        </div>
        <a
          href={qrUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 text-xs font-semibold text-[#001e40] hover:underline"
        >
          <ExternalLink className="h-3.5 w-3.5" /> Probar Enlace
        </a>
      </div>

      <div className="p-6 flex flex-col items-center gap-6">
        {/* QR Canvas */}
        <div className="relative">
          {generating && (
            <div className="absolute inset-0 flex items-center justify-center bg-white/70 rounded-xl z-10">
              <div className="h-6 w-6 border-2 border-[#001e40]/30 border-t-[#001e40] rounded-full animate-spin" />
            </div>
          )}
          <canvas
            ref={canvasRef}
            className="rounded-xl border border-slate-200 shadow-sm"
            style={{ width: 280, height: 280 }}
          />
        </div>

        {/* URL Display */}
        <div className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 flex items-center gap-2 overflow-hidden">
          <span className="text-[10px] font-bold text-slate-400 uppercase whitespace-nowrap">URL</span>
          <span className="text-xs font-mono text-slate-600 truncate flex-1">{qrUrl}</span>
        </div>

        {/* Action Buttons */}
        <div className="grid grid-cols-2 gap-3 w-full">
          <button
            onClick={downloadPNG}
            className="flex items-center justify-center gap-2 h-11 bg-[#001e40] hover:bg-[#002c59] text-white rounded-xl font-bold text-sm transition-all shadow-sm"
          >
            <Download className="h-4 w-4" /> Descargar PNG
          </button>
          <button
            onClick={downloadSVG}
            className="flex items-center justify-center gap-2 h-11 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl font-bold text-sm transition-all"
          >
            <ImageIcon className="h-4 w-4" /> Descargar SVG
          </button>
          <button
            onClick={copyImage}
            className="flex items-center justify-center gap-2 h-11 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl font-bold text-sm transition-all"
          >
            {copied ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
            Copiar Imagen
          </button>
          <button
            onClick={copyLink}
            className="flex items-center justify-center gap-2 h-11 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl font-bold text-sm transition-all"
          >
            <Copy className="h-4 w-4" /> Copiar Enlace
          </button>
        </div>

        {/* Info panel */}
        <div className="w-full grid grid-cols-3 divide-x divide-slate-100 bg-slate-50 rounded-xl border border-slate-100 text-center text-xs py-3">
          <div className="px-3">
            <p className="text-slate-400 text-[9px] uppercase font-bold">Empresa</p>
            <p className="font-semibold text-slate-700 mt-0.5 truncate">{company.name}</p>
          </div>
          <div className="px-3">
            <p className="text-slate-400 text-[9px] uppercase font-bold">Slug</p>
            <p className="font-mono font-semibold text-[#001e40] mt-0.5">{company.slug}</p>
          </div>
          <div className="px-3">
            <p className="text-slate-400 text-[9px] uppercase font-bold">Corrección</p>
            <p className="font-semibold text-slate-700 mt-0.5">Nivel {config.errorLevel} ({config.errorLevel === 'H' ? '30%' : config.errorLevel === 'Q' ? '25%' : '15%'})</p>
          </div>
        </div>
      </div>
    </div>
  );
}
