import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';

interface BarcodeRendererProps {
  value: string;
  type: string; // 'code128' | 'ean13' | 'ean8' | 'upca' | 'qrcode'
  width?: number;
  height?: number;
  showText?: boolean;
}

export default function BarcodeRenderer({
  value,
  type,
  width = 2,
  height = 40,
  showText = true,
}: BarcodeRendererProps) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!value) {
      setError('Código vacío');
      return;
    }

    setError(null);

    if (type === 'qrcode') {
      if (canvasRef.current) {
        QRCode.toCanvas(
          canvasRef.current,
          value,
          {
            width: height * 2.5,
            margin: 1,
            errorCorrectionLevel: 'M',
          },
          (err) => {
            if (err) {
              console.error(err);
              setError('QR inválido');
            }
          }
        );
      }
      return;
    }

    // Dynamic import to prevent SSR issues with document reference in JsBarcode
    import('jsbarcode').then((JsBarcodeModule) => {
      const JsBarcode = JsBarcodeModule.default;
      if (svgRef.current) {
        try {
          let format = 'CODE128';
          if (type === 'ean13') format = 'EAN13';
          else if (type === 'ean8') format = 'EAN8';
          else if (type === 'upca') format = 'UPC';

          // Basic checks to warn user
          const isNumeric = /^\d+$/.test(value);

          if (type === 'ean13') {
            if (!isNumeric) {
              setError('EAN-13 requiere solo números');
              return;
            }
            if (value.length !== 13 && value.length !== 12) {
              setError('EAN-13 requiere 12 o 13 dígitos');
              return;
            }
          }
          if (type === 'ean8') {
            if (!isNumeric) {
              setError('EAN-8 requiere solo números');
              return;
            }
            if (value.length !== 8 && value.length !== 7) {
              setError('EAN-8 requiere 7 u 8 dígitos');
              return;
            }
          }
          if (type === 'upca') {
            if (!isNumeric) {
              setError('UPC-A requiere solo números');
              return;
            }
            if (value.length !== 12 && value.length !== 11) {
              setError('UPC-A requiere 11 o 12 dígitos');
              return;
            }
          }

          JsBarcode(svgRef.current, value, {
            format,
            width,
            height,
            displayValue: showText,
            fontSize: 12,
            background: 'transparent',
            lineColor: '#000000',
            margin: 4,
          });
        } catch (e: any) {
          console.error('JsBarcode failed', e);
          setError('Formato inválido');
        }
      }
    });
  }, [value, type, width, height, showText]);

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center p-3 border border-dashed border-slate-300 rounded bg-slate-50 text-slate-400 text-xs font-mono select-none h-[80px] w-full max-w-[240px]">
        <span>[ {error} ]</span>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center bg-white p-1 rounded shadow-sm border border-slate-100 max-w-full overflow-hidden">
      {type === 'qrcode' ? (
        <canvas ref={canvasRef} />
      ) : (
        <svg ref={svgRef} className="max-w-full block" />
      )}
    </div>
  );
}
