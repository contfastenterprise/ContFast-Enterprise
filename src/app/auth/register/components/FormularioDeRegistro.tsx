'use client';

import type { ReactNode } from 'react';
import type { UseFormReturn } from 'react-hook-form';
import { AlertCircle, Briefcase, Building2, CheckCircle, Hash, Loader2, Lock, Mail, User, UserPlus } from 'lucide-react';
import { BotonBuscarDgii } from '@/components/ui/boton-buscar-dgii';
import type { ValoresDelFormularioDeRegistro } from '@/services/auth/registroDeEmpresa';

/**
 * El formulario del registro publico (lote 287), aparte de la pagina para poder
 * dibujarlo en el banco sin router ni red: solo pinta lo que le pasan.
 *
 * Con el estilo de la pantalla de acceso (lote 173): el dorado de la marca
 * (#c5a059, no `amber-500`), sin `required` (el aviso nativo del navegador, en
 * ingles, tapaba los mensajes de zod), cada campo dice si esta mal y a que mensaje
 * apunta, y el motivo de un rechazo sale DENTRO del formulario con `role="alert"`.
 */

type Valores = ValoresDelFormularioDeRegistro;
type Nombre = keyof Valores;

export interface AvisoDelRnc {
  tipo: 'ok' | 'aviso';
  texto: string;
}

const CLASE_CAMPO =
  'block w-full rounded-md border-0 bg-background py-2 pl-10 pr-3 text-primary ring-1 ring-inset ring-outline-variant/30 placeholder:text-on-surface-variant/80 focus:ring-2 focus:ring-inset focus:ring-[#c5a059] sm:text-sm sm:leading-6 transition duration-200 outline-none';

function Campo({
  form, nombre, etiqueta, icono, tipo = 'text', ejemplo, autocompletar, junto,
}: {
  form: UseFormReturn<Valores>;
  nombre: Nombre;
  etiqueta: string;
  icono: ReactNode;
  tipo?: string;
  ejemplo?: string;
  autocompletar?: string;
  junto?: ReactNode;
}) {
  const error = form.formState.errors[nombre];
  const idError = `error-${nombre}`;
  return (
    <div className="space-y-1">
      <label htmlFor={nombre} className="block text-xs font-semibold text-on-surface-variant uppercase tracking-wider">
        {etiqueta}
      </label>
      <div className="flex items-center gap-2">
        <div className="relative flex-1 rounded-md shadow-sm">
          <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-on-surface-variant/70" aria-hidden="true">
            {icono}
          </div>
          <input
            id={nombre}
            type={tipo}
            autoComplete={autocompletar}
            aria-invalid={!!error}
            aria-describedby={error ? idError : undefined}
            {...form.register(nombre)}
            className={CLASE_CAMPO}
            placeholder={ejemplo}
          />
        </div>
        {junto}
      </div>
      {error && <p id={idError} className="text-xs text-red-600 mt-1">{error.message}</p>}
    </div>
  );
}

export function FormularioDeRegistro({
  form, alEnviar, enviando, buscandoRnc, alBuscarRnc, avisoRnc, motivoDelError,
}: {
  form: UseFormReturn<Valores>;
  alEnviar: (v: Valores) => void;
  enviando: boolean;
  buscandoRnc: boolean;
  alBuscarRnc: () => void;
  avisoRnc: AvisoDelRnc | null;
  motivoDelError: string | null;
}) {
  return (
    <form className="space-y-4" onSubmit={form.handleSubmit(alEnviar)} noValidate>
      {motivoDelError && (
        <div role="alert" className="flex items-start gap-2 rounded-md border border-red-300/60 bg-red-50 px-3 py-2 text-sm text-red-800">
          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" aria-hidden="true" />
          <span>{motivoDelError}</span>
        </div>
      )}

      <fieldset className="space-y-4">
        <legend className="text-sm font-bold text-primary mb-1">Tu empresa</legend>
        <Campo
          form={form}
          nombre="rncEmpresa"
          etiqueta="RNC o cédula"
          icono={<Hash className="h-5 w-5" />}
          ejemplo="101001001"
          junto={<BotonBuscarDgii onClick={alBuscarRnc} buscando={buscandoRnc} />}
        />
        {avisoRnc && (
          <p
            role="status"
            className={`flex items-start gap-1.5 text-xs ${avisoRnc.tipo === 'ok' ? 'text-emerald-700' : 'text-on-surface-variant'}`}
          >
            {avisoRnc.tipo === 'ok' && <CheckCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" aria-hidden="true" />}
            {avisoRnc.texto}
          </p>
        )}
        <Campo
          form={form}
          nombre="razonSocial"
          etiqueta="Razón social"
          icono={<Building2 className="h-5 w-5" />}
          ejemplo="Mi Empresa S.R.L."
          autocompletar="organization"
        />
        <Campo
          form={form}
          nombre="actividad"
          etiqueta="Actividad económica (opcional)"
          icono={<Briefcase className="h-5 w-5" />}
          ejemplo="Venta de materiales de construcción"
        />
      </fieldset>

      <fieldset className="space-y-4 pt-2 border-t border-outline-variant/30">
        <legend className="text-sm font-bold text-primary mb-1 pt-3">Tu cuenta</legend>
        <Campo form={form} nombre="fullName" etiqueta="Nombre completo" icono={<User className="h-5 w-5" />} ejemplo="Juan Pérez" autocompletar="name" />
        <Campo form={form} nombre="email" etiqueta="Correo electrónico" icono={<Mail className="h-5 w-5" />} tipo="email" ejemplo="juan.perez@empresa.do" autocompletar="email" />
        <Campo form={form} nombre="password" etiqueta="Contraseña" icono={<Lock className="h-5 w-5" />} tipo="password" ejemplo="••••••••" autocompletar="new-password" />
        <Campo form={form} nombre="confirmPassword" etiqueta="Confirmar contraseña" icono={<Lock className="h-5 w-5" />} tipo="password" ejemplo="••••••••" autocompletar="new-password" />
      </fieldset>

      <button
        type="submit"
        disabled={enviando}
        className="mt-6 flex w-full justify-center items-center gap-2 rounded-md bg-[#c5a059] px-3 py-2.5 text-sm font-semibold text-[#001e40] shadow-sm hover:bg-[#b18f4d] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#c5a059] disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200"
      >
        {enviando ? (
          <>
            <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
            Creando la empresa...
          </>
        ) : (
          <>
            <UserPlus className="h-5 w-5" aria-hidden="true" />
            Crear empresa y cuenta
          </>
        )}
      </button>
    </form>
  );
}
