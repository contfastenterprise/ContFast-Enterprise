'use client';

import React from 'react';
import { 
  Upload, 
  FileText, 
  Loader2, 
  RefreshCw, 
  Check, 
  AlertCircle, 
  DollarSign, 
  Calendar, 
  User, 
  Hash, 
  FileSpreadsheet,
  Globe
} from 'lucide-react';
import { OcrInvoiceData } from '@/utils/ocrParser';
import { useInvoiceOcr } from '@/hooks/useInvoiceOcr';

interface InvoiceImageUploaderProps {
  // Use any to allow easy integration with react-hook-form's UseFormSetValue
  setValue?: (name: any, value: any, options?: any) => void;
  onOcrComplete?: (data: OcrInvoiceData) => void;
}

export default function InvoiceImageUploader({ 
  setValue, 
  onOcrComplete 
}: InvoiceImageUploaderProps) {
  const {
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
  } = useInvoiceOcr({ setValue, onOcrComplete });

  return (
    <div className="w-full max-w-2xl mx-auto space-y-6">
      
      <div className="text-center space-y-1">
        <h2 className="text-base font-extrabold text-primary flex items-center justify-center gap-2 uppercase tracking-wider">
          <FileText className="w-4 h-4" />
          Lector de Facturas Inteligente (OCR)
        </h2>
        <p className="text-xs text-on-surface-variant">
          Carga una foto de tu factura física o e-CF para autocompleta el formulario.
        </p>
      </div>

      {/* Drag & Drop Area */}
      {!image && (
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-2xl p-8 flex flex-col items-center justify-center cursor-pointer transition-all duration-300 min-h-[180px] ${
            isDragActive 
              ? 'border-primary bg-primary/5' 
              : 'border-on-surface-variant/20 hover:border-primary hover:bg-surface-container-low'
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleFileChange}
          />
          <div className="bg-primary/10 p-3 rounded-full mb-3 text-primary">
            <Upload className="w-5 h-5 animate-pulse" />
          </div>
          <span className="font-bold text-primary text-xs">
            Arrastra tu imagen aquí o haz clic para explorar
          </span>
          <span className="text-[10px] text-on-surface-variant mt-1">
            Formatos soportados: JPG, PNG, WEBP (Máx. 8MB)
          </span>
        </div>
      )}

      {/* Processing State */}
      {isProcessing && (
        <div className="bg-surface-container-low rounded-2xl p-6 flex flex-col items-center justify-center space-y-3 border border-on-surface-variant/10">
          <Loader2 className="w-6 h-6 text-primary animate-spin" />
          <div className="text-center space-y-1">
            <span className="text-xs font-bold text-primary">
              {progressStatus}
            </span>
            <div className="w-40 bg-surface-container-high h-1 rounded-full overflow-hidden mx-auto mt-2">
              <div 
                className="bg-primary h-full transition-all duration-300 rounded-full" 
                style={{ width: `${progress}%` }}
              />
            </div>
            <span className="text-[10px] text-on-surface-variant block mt-1">{progress}%</span>
          </div>
        </div>
      )}

      {/* Error State */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 flex gap-3 text-red-700">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <div className="text-xs">
            <span className="font-bold block mb-0.5">Ocurrió un inconveniente</span>
            {error}
          </div>
        </div>
      )}

      {/* Image Preview & Output */}
      {image && !isProcessing && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
          {/* Preview Container */}
          <div className="relative group rounded-2xl overflow-hidden border border-on-surface-variant/10 bg-surface-container flex items-center justify-center aspect-[4/3] max-h-[220px]">
            <img 
              src={image} 
              alt="Factura subida" 
              className="max-h-full max-w-full object-contain"
            />
            <button
              onClick={handleReset}
              className="absolute top-3 right-3 bg-red-600 hover:bg-red-700 text-white rounded-xl p-1.5 shadow-md transition-all text-[10px] flex items-center gap-1 font-bold animate-fade-in"
            >
              <RefreshCw className="w-3 h-3" /> Cambiar
            </button>
          </div>

          {/* Validation Form */}
          {extractedData && (
            <div className="space-y-4">
              <h3 className="font-bold text-primary uppercase tracking-wider text-xs flex items-center gap-1.5 mb-2">
                <Check className="w-3.5 h-3.5" /> Verificar Datos
              </h3>
              
              <div className="grid grid-cols-1 gap-3 text-xs">
                
                {/* Proveedor */}
                <div>
                  <label className="block text-[10px] font-bold text-on-surface-variant/70 mb-1 flex items-center gap-1 uppercase tracking-wider">
                    <User className="w-3 h-3 text-primary" /> Proveedor
                  </label>
                  <input
                    type="text"
                    value={extractedData.supplier}
                    onChange={(e) => handleFieldChange('supplier', e.target.value)}
                    className="w-full bg-surface-container-high border-none rounded-xl px-3 py-2 text-xs font-medium focus:ring-2 focus:ring-primary outline-none"
                  />
                </div>

                {/* RNC & NCF */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-bold text-on-surface-variant/70 mb-1 flex items-center gap-1 uppercase tracking-wider">
                      <Hash className="w-3 h-3 text-primary" /> RNC
                    </label>
                    <input
                      type="text"
                      value={extractedData.rnc}
                      onChange={(e) => handleFieldChange('rnc', e.target.value)}
                      placeholder="Sin guiones"
                      className="w-full bg-surface-container-high border-none rounded-xl px-3 py-2 text-xs font-medium focus:ring-2 focus:ring-primary outline-none font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-on-surface-variant/70 mb-1 flex items-center gap-1 uppercase tracking-wider">
                      <FileSpreadsheet className="w-3 h-3 text-primary" /> NCF {extractedData.ecf && <span className="text-[9px] bg-emerald-100 text-emerald-800 px-1 py-0.5 rounded font-mono font-bold">e-CF</span>}
                    </label>
                    <input
                      type="text"
                      value={extractedData.ncf}
                      onChange={(e) => handleFieldChange('ncf', e.target.value)}
                      className="w-full bg-surface-container-high border-none rounded-xl px-3 py-2 text-xs font-medium focus:ring-2 focus:ring-primary outline-none uppercase font-mono"
                    />
                  </div>
                </div>

                {/* Fecha & Moneda */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-bold text-on-surface-variant/70 mb-1 flex items-center gap-1 uppercase tracking-wider">
                      <Calendar className="w-3 h-3 text-primary" /> Fecha
                    </label>
                    <input
                      type="date"
                      value={extractedData.date}
                      onChange={(e) => handleFieldChange('date', e.target.value)}
                      className="w-full bg-surface-container-high border-none rounded-xl px-3 py-2 text-xs font-medium focus:ring-2 focus:ring-primary outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-on-surface-variant/70 mb-1 flex items-center gap-1 uppercase tracking-wider">
                      <Globe className="w-3 h-3 text-primary" /> Moneda
                    </label>
                    <select
                      value={extractedData.currency}
                      onChange={(e) => handleFieldChange('currency', e.target.value)}
                      className="w-full bg-surface-container-high border-none rounded-xl px-3 py-2 text-xs font-medium focus:ring-2 focus:ring-primary outline-none"
                    >
                      <option value="DOP">DOP - Pesos</option>
                      <option value="USD">USD - Dólares</option>
                      <option value="EUR">EUR - Euros</option>
                    </select>
                  </div>
                </div>

                {/* Foreign Currency Exchange Details */}
                {extractedData.currency !== 'DOP' && (
                  <div className="grid grid-cols-2 gap-3 p-2.5 bg-primary/5 rounded-xl border border-primary/10">
                    <div>
                      <label className="block text-[9px] font-bold text-primary mb-1 uppercase tracking-wider">
                        Tasa de Cambio (TC)
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        value={extractedData.exchangeRate}
                        onChange={(e) => handleFieldChange('exchangeRate', parseFloat(e.target.value) || 1)}
                        className="w-full bg-surface-container-high border-none rounded-lg px-2 py-1 text-xs font-medium focus:ring-1 focus:ring-primary outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[9px] font-bold text-primary mb-1 uppercase tracking-wider">
                        Total en DOP (Calculado)
                      </label>
                      <div className="h-7 flex items-center text-xs font-black text-primary font-mono">
                        RD$ {extractedData.totalDOP.toLocaleString('es-DO', { minimumFractionDigits: 2 })}
                      </div>
                    </div>
                  </div>
                )}

                {/* Subtotal, ITBIS & Total */}
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="block text-[10px] font-bold text-on-surface-variant/70 mb-1 uppercase tracking-wider">
                      Subtotal
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={extractedData.subtotal}
                      onChange={(e) => handleFieldChange('subtotal', parseFloat(e.target.value) || 0)}
                      className="w-full bg-surface-container-high border-none rounded-xl px-2 py-2 text-xs font-medium focus:ring-2 focus:ring-primary outline-none font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-on-surface-variant/70 mb-1 uppercase tracking-wider">
                      ITBIS
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={extractedData.itbis}
                      onChange={(e) => handleFieldChange('itbis', parseFloat(e.target.value) || 0)}
                      className="w-full bg-surface-container-high border-none rounded-xl px-2 py-2 text-xs font-medium focus:ring-2 focus:ring-primary outline-none font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-primary mb-1 uppercase tracking-wider flex items-center gap-0.5">
                      <DollarSign className="w-3.5 h-3.5" /> Total
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={extractedData.total}
                      onChange={(e) => handleFieldChange('total', parseFloat(e.target.value) || 0)}
                      className="w-full bg-surface-container-high border-none rounded-xl px-2 py-2 text-xs font-bold focus:ring-2 focus:ring-primary outline-none text-primary font-mono"
                    />
                  </div>
                </div>

              </div>

              {/* Action Button */}
              <button
                type="button"
                onClick={handleApplyData}
                className="w-full bg-primary text-on-primary font-bold py-2.5 px-4 rounded-xl shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2 text-xs mt-3 active:scale-95 cursor-pointer"
              >
                <Check className="w-3.5 h-3.5" /> Importar al Formulario
              </button>

            </div>
          )}
        </div>
      )}

    </div>
  );
}
