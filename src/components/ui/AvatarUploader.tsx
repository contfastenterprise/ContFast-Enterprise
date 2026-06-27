'use client';

import React, { useState, useRef } from 'react';
import { UploadCloud, X, RefreshCw, AlertCircle, CheckCircle } from 'lucide-react';
import { toast } from 'sonner';
import { createClient } from '@supabase/supabase-js';
import clsx from 'clsx';
import Avatar from './Avatar';

// Inicializar el cliente de Supabase para subidas directas desde frontend (usando RLS)
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
// Creamos el cliente condicionalmente para evitar errores en SSR
const supabase = (supabaseUrl && supabaseAnonKey) ? createClient(supabaseUrl, supabaseAnonKey) : null;

interface AvatarUploaderProps {
  currentAvatarUrl?: string | null;
  currentAvatarPath?: string | null;
  userName: string;
  userId: string;
  onUploadSuccess: (url: string, path: string) => void;
  onDeleteSuccess: () => void;
  skipDatabaseUpdate?: boolean;
}

export default function AvatarUploader({
  currentAvatarUrl,
  currentAvatarPath,
  userName,
  userId,
  onUploadSuccess,
  onDeleteSuccess,
  skipDatabaseUpdate = false,
}: AvatarUploaderProps) {
  const [dragActive, setDragActive] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Validaciones y procesamiento
  const processImage = async (file: File): Promise<Blob> => {
    // 1. Validaciones
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      throw new Error('Formato no permitido. Solo se aceptan JPG, JPEG, PNG y WEBP.');
    }

    const maxSize = 3 * 1024 * 1024; // 3 MB
    if (file.size > maxSize) {
      throw new Error('La imagen supera el tamaño permitido (3 MB).');
    }

    // 2. Compresión y redimensionamiento en cliente (Canvas)
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.src = URL.createObjectURL(file);
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        // Mantener proporción redimensionando a un máximo de 400x400
        const MAX_WIDTH = 400;
        const MAX_HEIGHT = 400;

        if (width > height) {
          if (width > MAX_WIDTH) {
            height *= MAX_WIDTH / width;
            width = MAX_WIDTH;
          }
        } else {
          if (height > MAX_HEIGHT) {
            width *= MAX_HEIGHT / height;
            height = MAX_HEIGHT;
          }
        }

        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('No se pudo inicializar el contexto de imagen.'));
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);

        // Convertir a WEBP con calidad de 80% (0.8)
        canvas.toBlob(
          (blob) => {
            if (blob) {
              resolve(blob);
            } else {
              reject(new Error('No se pudo comprimir la imagen.'));
            }
          },
          'image/webp',
          0.8
        );
      };
      img.onerror = () => {
        reject(new Error('Error al cargar la imagen.'));
      };
    });
  };

  const handleFile = async (file: File) => {
    setErrorMessage(null);
    setStatusMessage(null);
    try {
      // Validar y comprimir localmente para vista previa
      const webpBlob = await processImage(file);
      const preview = URL.createObjectURL(webpBlob);
      
      // Creamos un nuevo objeto File a partir del blob
      const convertedFile = new File([webpBlob], 'avatar.webp', { type: 'image/webp' });
      setSelectedFile(convertedFile);
      setPreviewUrl(preview);
    } catch (err: any) {
      setErrorMessage(err.message || 'Error al procesar la imagen.');
      toast.error(err.message || 'Error al procesar la imagen.');
    }
  };

  // Eventos de Drag & Drop
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.preventDefault();
    if (e.target.files && e.target.files[0]) {
      handleFile(e.target.files[0]);
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) return;
    if (!supabase) {
      setErrorMessage('Error de configuración. El cliente de almacenamiento no está disponible.');
      return;
    }

    setUploading(true);
    setProgress(10);
    setErrorMessage(null);
    setStatusMessage('Comprimiendo y preparando subida...');

    try {
      // Definir la ruta interna avatars/user-id/avatar.webp
      // Usamos timestamp para que cada subida tenga una ruta única o sobrescriba
      const folderPath = `${userId}`;
      const filePath = `${folderPath}/avatar_${Date.now()}.webp`;

      // Simular progreso de subida
      const progressInterval = setInterval(() => {
        setProgress((prev) => {
          if (prev >= 90) {
            clearInterval(progressInterval);
            return 90;
          }
          return prev + 15;
        });
      }, 200);

      // Eliminar el avatar anterior si existe
      if (currentAvatarPath) {
        setStatusMessage('Eliminando imagen anterior...');
        await supabase.storage.from('avatars').remove([currentAvatarPath]);
      }

      setStatusMessage('Subiendo imagen a Supabase Storage...');
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, selectedFile, {
          contentType: 'image/webp',
          upsert: true,
        });

      clearInterval(progressInterval);

      if (uploadError) {
        throw new Error(`No se pudo subir la imagen: ${uploadError.message}`);
      }

      setProgress(100);
      setStatusMessage('Imagen subida correctamente.');

      // Obtener URL Pública
      const { data: { publicUrl } } = supabase.storage
        .from('avatars')
        .getPublicUrl(filePath);

      // Llamar al endpoint local para guardar en base de datos
      if (!skipDatabaseUpdate) {
        const res = await fetch('/api/v1/auth/profile', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            avatarUrl: publicUrl,
            avatarPath: filePath,
          }),
        });

        const resData = await res.json();
        if (!res.ok || !resData.success) {
          throw new Error(resData.error?.message || 'Error al guardar la información en base de datos.');
        }
      }

      toast.success('Avatar actualizado con éxito');
      onUploadSuccess(publicUrl, filePath);
      setSelectedFile(null);
      setPreviewUrl(null);
    } catch (err: any) {
      console.error(err);
      setErrorMessage(err.message || 'Error de conexión.');
      toast.error(err.message || 'Error al subir el avatar.');
    } finally {
      setUploading(false);
    }
  };

  const handleCancelSelection = () => {
    setSelectedFile(null);
    setPreviewUrl(null);
    setErrorMessage(null);
    setStatusMessage(null);
  };

  const handleDeleteAvatar = async () => {
    if (!supabase) return;
    if (!confirm('¿Estás seguro de que deseas eliminar tu foto de perfil?')) return;

    setUploading(true);
    try {
      if (currentAvatarPath) {
        await supabase.storage.from('avatars').remove([currentAvatarPath]);
      }

      if (!skipDatabaseUpdate) {
        // Actualizar base de datos a null
        const res = await fetch('/api/v1/auth/profile', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            avatarUrl: null,
            avatarPath: null,
          }),
        });

        const resData = await res.json();
        if (!res.ok || !resData.success) {
          throw new Error(resData.error?.message || 'Error al actualizar base de datos.');
        }
      }

      toast.success('Foto de perfil eliminada.');
      onDeleteSuccess();
    } catch (err: any) {
      toast.error(err.message || 'Error al eliminar el avatar.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="flex flex-col items-center gap-3 w-full max-w-[240px] mx-auto p-3 bg-white dark:bg-zinc-950 rounded-2xl border border-slate-200 dark:border-zinc-800 shadow-sm">
      <div className="relative group">
        {/* Componente Avatar central */}
        <Avatar 
          src={previewUrl || currentAvatarUrl} 
          name={userName} 
          size={80} 
          className="shadow-sm ring-2 ring-primary/10 transition-transform group-hover:scale-[1.02]"
        />

        {/* Botón para eliminar foto activa directamente */}
        {currentAvatarUrl && !previewUrl && !uploading && (
          <button
            type="button"
            onClick={handleDeleteAvatar}
            className="absolute -top-1 -right-1 p-1 bg-rose-500 hover:bg-rose-600 text-white rounded-full shadow-lg transition-transform hover:scale-110"
            title="Eliminar foto actual"
            aria-label="Eliminar foto actual"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Selector / Dropzone */}
      {!previewUrl ? (
        <div
          onDragEnter={handleDrag}
          onDragOver={handleDrag}
          onDragLeave={handleDrag}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={clsx(
            "w-full h-24 flex flex-col items-center justify-center border border-dashed rounded-xl cursor-pointer transition-all p-2 text-center",
            dragActive
              ? "border-primary bg-primary/5 dark:bg-primary/10"
              : "border-slate-300 dark:border-zinc-700 hover:bg-slate-50 dark:hover:bg-zinc-900"
          )}
        >
          <UploadCloud className="w-6 h-6 text-on-surface-variant/70 mb-1" />
          <p className="text-[11px] font-semibold text-on-surface leading-tight">Arrastrar aquí o clic para subir</p>
          <p className="text-[9px] text-on-surface-variant/60 mt-0.5">Soporta WEBP, PNG, JPG (3MB)</p>
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            accept="image/jpeg,image/jpg,image/png,image/webp"
            onChange={handleChange}
          />
        </div>
      ) : (
        <div className="flex flex-col gap-3 w-full">
          <div className="flex justify-between items-center bg-slate-50 dark:bg-zinc-900 p-3 rounded-lg border border-slate-200 dark:border-zinc-800">
            <span className="text-xs font-semibold text-on-surface-variant truncate max-w-[200px]">
              {selectedFile?.name || 'Imagen seleccionada'}
            </span>
            <button
              type="button"
              disabled={uploading}
              onClick={handleCancelSelection}
              className="text-xs text-rose-500 hover:text-rose-600 font-bold flex items-center gap-1 cursor-pointer disabled:opacity-50"
            >
              <X className="w-3.5 h-3.5" /> Cancelar
            </button>
          </div>

          <button
            type="button"
            onClick={handleUpload}
            disabled={uploading}
            className="w-full bg-primary hover:bg-primary/95 text-white font-bold py-2.5 px-4 rounded-xl shadow-md transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {uploading ? <RefreshCw className="w-4 h-4 animate-spin" /> : null}
            Guardar Foto
          </button>
        </div>
      )}

      {/* Progreso de subida */}
      {uploading && (
        <div className="w-full space-y-2">
          <div className="flex justify-between text-xs font-bold text-on-surface-variant">
            <span>{statusMessage || 'Subiendo...'}</span>
            <span>{progress}%</span>
          </div>
          <div className="w-full bg-slate-100 dark:bg-zinc-800 h-2.5 rounded-full overflow-hidden">
            <div 
              className="bg-primary h-full transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      {/* Mensajes de error o éxito */}
      {errorMessage && (
        <div className="flex items-center gap-2 p-3 bg-rose-50 dark:bg-rose-950/20 text-rose-600 dark:text-rose-400 rounded-lg border border-rose-100 dark:border-rose-950/30 text-xs font-medium w-full">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}
      
      {progress === 100 && !uploading && (
        <div className="flex items-center gap-2 p-3 bg-emerald-50 dark:bg-emerald-950/20 text-emerald-600 dark:text-emerald-400 rounded-lg border border-emerald-100 dark:border-emerald-950/30 text-xs font-medium w-full animate-fade-in">
          <CheckCircle className="w-4 h-4 shrink-0" />
          <span>Imagen subida correctamente.</span>
        </div>
      )}
    </div>
  );
}
