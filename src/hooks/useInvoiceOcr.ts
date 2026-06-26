import { useState, useRef, DragEvent } from 'react';
import { OcrInvoiceData } from '@/utils/ocrParser';

interface UseInvoiceOcrProps {
  setValue?: (name: any, value: any, options?: any) => void;
  onOcrComplete?: (data: OcrInvoiceData) => void;
}

export function useInvoiceOcr({ setValue, onOcrComplete }: UseInvoiceOcrProps = {}) {
  const [image, setImage] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressStatus, setProgressStatus] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [extractedData, setExtractedData] = useState<OcrInvoiceData | null>(null);
  const [isDragActive, setIsDragActive] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Handle Drag Over
  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(true);
  };

  // Handle Drag Leave
  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);
  };

  // Helper to compress and resize large images using Canvas to avoid memory issues and speed up OCR
  const compressImage = (file: File, maxWidth = 1200, maxHeight = 1200, quality = 0.8): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = (event) => {
        const img = new Image();
        img.src = event.target?.result as string;
        img.onload = () => {
          let width = img.width;
          let height = img.height;

          // Calculate aspect ratio and new dimensions
          if (width > height) {
            if (width > maxWidth) {
              height = Math.round((height * maxWidth) / width);
              width = maxWidth;
            }
          } else {
            if (height > maxHeight) {
              width = Math.round((width * maxHeight) / height);
              height = maxHeight;
            }
          }

          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;

          const ctx = canvas.getContext('2d');
          if (!ctx) {
            reject(new Error('No se pudo inicializar Canvas para la compresión.'));
            return;
          }

          // Draw image to canvas and get compressed JPEG base64 data url
          ctx.drawImage(img, 0, 0, width, height);
          const dataUrl = canvas.toDataURL('image/jpeg', quality);
          resolve(dataUrl);
        };
        img.onerror = (err) => reject(err);
      };
      reader.onerror = (err) => reject(err);
    });
  };

  // Run Tesseract OCR via server-side child_process execution
  const runOcr = async (imageSrc: string) => {
    setIsProcessing(true);
    setProgress(15);
    setProgressStatus('Enviando factura al servidor...');

    try {
      setProgress(40);
      setProgressStatus('Procesando OCR en servidor...');

      const response = await fetch('/api/v1/ocr', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ image: imageSrc }),
      });

      setProgress(75);
      setProgressStatus('Interpretando respuesta contable...');

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error?.message || 'Error al procesar la imagen en el servidor');
      }

      setExtractedData(result.data);
      setProgress(100);
      setProgressStatus('Procesamiento completado.');
    } catch (err: any) {
      const resolvedError = err instanceof Error ? err : new Error(typeof err === 'string' ? err : 'Error al procesar el comprobante.');
      console.error('OCR Error:', resolvedError);
      setError(resolvedError.message || 'Error al procesar el comprobante. Verifique la imagen e intente de nuevo.');
    } finally {
      setIsProcessing(false);
    }
  };

  // Validate, compress and read file
  const processFile = async (file: File) => {
    setError(null);
    setExtractedData(null);

    // Validate file type
    const validTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/bmp'];
    if (!validTypes.includes(file.type)) {
      setError('Formato de archivo no válido. Cargue una imagen JPG, PNG, WEBP o BMP.');
      return;
    }

    setIsProcessing(true);
    setProgress(5);
    setProgressStatus('Optimizando tamaño de imagen...');

    try {
      const compressedBase64 = await compressImage(file);
      setImage(compressedBase64);
      // Run OCR with the optimized compressed base64
      runOcr(compressedBase64);
    } catch (err: any) {
      const resolvedError = err instanceof Error ? err : new Error(typeof err === 'string' ? err : 'Error al optimizar la imagen antes del OCR.');
      console.error('Compression Error:', resolvedError);
      setError(resolvedError.message || 'Error al optimizar la imagen antes del OCR. Intente con otra foto.');
      setIsProcessing(false);
    }
  };

  // Handle Drop
  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      processFile(file);
    }
  };

  // Handle File Input Selection
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      processFile(file);
    }
  };

  // Apply parsed data to react-hook-form and callbacks
  const handleApplyData = () => {
    if (!extractedData) return;

    // Apply values to react-hook-form if register / setValue is provided
    if (setValue) {
      setValue('supplier', extractedData.supplier);
      setValue('rnc', extractedData.rnc);
      setValue('ncf', extractedData.ncf);
      setValue('date', extractedData.date);
      setValue('currency', extractedData.currency);
      setValue('exchangeRate', extractedData.exchangeRate);
      setValue('subtotal', extractedData.subtotal);
      setValue('itbis', extractedData.itbis);
      setValue('total', extractedData.total);
    }

    // Trigger callback for parent component custom needs
    if (onOcrComplete) {
      onOcrComplete(extractedData);
    }
  };

  // Update specific field manually in the correction form before applying
  const handleFieldChange = (key: keyof OcrInvoiceData, val: any) => {
    if (!extractedData) return;

    const updated = { ...extractedData, [key]: val };

    // Recalculate DOP total if currency or exchange rate changes
    if (key === 'total' || key === 'exchangeRate') {
      updated.totalDOP = Number(updated.total) * Number(updated.exchangeRate);
    }

    setExtractedData(updated);
  };

  const handleReset = () => {
    setImage(null);
    setExtractedData(null);
    setError(null);
  };

  return {
    image,
    isProcessing,
    progress,
    progressStatus,
    error,
    extractedData,
    isDragActive,
    fileInputRef,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    handleFileChange,
    handleApplyData,
    handleFieldChange,
    handleReset,
  };
}
export type UseInvoiceOcrReturn = ReturnType<typeof useInvoiceOcr>;
