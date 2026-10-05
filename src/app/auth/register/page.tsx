'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { CheckCircle, ArrowRight } from 'lucide-react';
import { motion } from 'framer-motion';
import { esquemaDelFormularioDeRegistro, type ValoresDelFormularioDeRegistro } from '@/services/auth/registroDeEmpresa';
import { RNC_INVALIDO, rncDeLaEmpresa } from '@/services/empresas/rncDeLaEmpresa';
import { motivoDelFallo } from '@/services/auth/accesoDelUsuario';
import { leerRespuesta } from '@/utils/leerRespuesta';
import { FormularioDeRegistro, type AvisoDelRnc } from './components/FormularioDeRegistro';

/**
 * Registro publico: una empresa nueva y su primer usuario.
 *
 * Lote 287: pide la razon social y el RNC de la empresa (antes la creaba siempre
 * como "Empresa Demo S.R.L." con RNC 101001001), con "Buscar DGII" para traer la
 * razon social del padron. El formulario vive en `components/FormularioDeRegistro`;
 * aqui quedan la red y el estado.
 */
interface DelPadron { nombre: string; actividad: string | null; aviso: string | null }

export default function RegisterPage() {
  const [enviando, setEnviando] = useState(false);
  const [registrado, setRegistrado] = useState(false);
  const [motivoDelError, setMotivoDelError] = useState<string | null>(null);
  const [buscandoRnc, setBuscandoRnc] = useState(false);
  const [avisoRnc, setAvisoRnc] = useState<AvisoDelRnc | null>(null);
  //  Dos clics seguidos llegan antes de volver a pintar: la guarda es un ref.
  const enVuelo = useRef(false);

  const form = useForm<ValoresDelFormularioDeRegistro>({
    resolver: zodResolver(esquemaDelFormularioDeRegistro),
    defaultValues: { rncEmpresa: '', razonSocial: '', actividad: '', fullName: '', email: '', password: '', confirmPassword: '' },
  });

  const buscarRnc = async () => {
    const rnc = rncDeLaEmpresa(form.getValues('rncEmpresa'));
    setAvisoRnc(null);
    if (!rnc) {
      form.setError('rncEmpresa', { message: RNC_INVALIDO });
      return;
    }
    setBuscandoRnc(true);
    try {
      const leido = await leerRespuesta<{ data: DelPadron }>(await fetch(`/api/v1/auth/register/rnc/${rnc}`));
      if (leido.bien) {
        const { nombre, actividad, aviso } = leido.cuerpo.data;
        form.setValue('razonSocial', nombre, { shouldValidate: true });
        if (actividad && !form.getValues('actividad')) form.setValue('actividad', actividad);
        setAvisoRnc(aviso ? { tipo: 'aviso', texto: aviso } : { tipo: 'ok', texto: 'Encontrado en el padrón de la DGII.' });
      } else {
        setAvisoRnc({ tipo: 'aviso', texto: leido.mensaje || 'No se pudo consultar el padrón. Escriba la razón social a mano.' });
      }
    } catch {
      setAvisoRnc({ tipo: 'aviso', texto: 'No se pudo consultar el padrón. Escriba la razón social a mano.' });
    } finally {
      setBuscandoRnc(false);
    }
  };

  const alEnviar = async (v: ValoresDelFormularioDeRegistro) => {
    if (enVuelo.current) return;
    enVuelo.current = true;
    setEnviando(true);
    setMotivoDelError(null);
    try {
      const res = await fetch('/api/v1/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rncEmpresa: v.rncEmpresa,
          razonSocial: v.razonSocial,
          actividad: v.actividad,
          fullName: v.fullName,
          email: v.email,
          password: v.password,
        }),
      });
      const leido = await leerRespuesta(res);
      if (leido.bien) {
        setRegistrado(true);
      } else {
        setMotivoDelError(motivoDelFallo(leido.mensaje));
      }
    } catch (err: unknown) {
      setMotivoDelError(motivoDelFallo(err instanceof Error ? err.message : ''));
    } finally {
      enVuelo.current = false;
      setEnviando(false);
    }
  };

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-background py-12 px-4 sm:px-6 lg:px-8">
      {/* Decorative Glowing Gradients */}
      <div className="absolute top-0 -left-4 w-96 h-96 bg-blue-900/20 rounded-full blur-3xl" aria-hidden="true" />
      <div className="absolute bottom-0 -right-4 w-96 h-96 bg-[#c5a059]/10 rounded-full blur-3xl" aria-hidden="true" />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="w-full max-w-md space-y-8 z-10"
      >
        <div className="text-center">
          <img src="/Icono.svg" alt="" className="mx-auto h-16 w-16 object-contain drop-shadow-xl mb-2" />
          <h1 className="mt-6 text-3xl font-display font-bold tracking-tight text-primary">
            Registra tu empresa
          </h1>
          <p className="mt-2 text-sm text-on-surface-variant">
            ContFast Enterprise — facturación electrónica e-CF
          </p>
        </div>

        <div className="bg-surface-container-low/60 backdrop-blur-xl border border-outline-variant/30 rounded-lg p-8 shadow-2xl">
          {registrado ? (
            <div className="flex flex-col items-center text-center space-y-6">
              <div className="w-16 h-16 bg-emerald-500/10 border border-emerald-500 text-emerald-600 rounded-full flex items-center justify-center">
                <CheckCircle className="h-10 w-10" aria-hidden="true" />
              </div>
              <div role="status">
                <h2 className="text-xl font-bold text-primary">Empresa registrada</h2>
                <p className="text-sm text-on-surface-variant mt-2">
                  Tu empresa y tu cuenta están creadas. Ya puedes iniciar sesión.
                </p>
              </div>
              <Link
                href="/auth/login"
                className="flex w-full justify-center items-center gap-2 rounded-md bg-[#c5a059] px-3 py-2.5 text-sm font-semibold text-[#001e40] shadow-sm hover:bg-[#b18f4d] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#c5a059]"
              >
                Ir al inicio de sesión
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </div>
          ) : (
            <FormularioDeRegistro
              form={form}
              alEnviar={alEnviar}
              enviando={enviando}
              buscandoRnc={buscandoRnc}
              alBuscarRnc={buscarRnc}
              avisoRnc={avisoRnc}
              motivoDelError={motivoDelError}
            />
          )}

          <div className="mt-6 pt-6 border-t border-outline-variant/30 text-center">
            <p className="text-sm text-on-surface-variant">
              ¿Ya tienes una cuenta?{' '}
              <Link
                href="/auth/login"
                className="font-bold text-oro-texto hover:underline rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-[#c5a059]"
              >
                Inicia sesión
              </Link>
            </p>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
