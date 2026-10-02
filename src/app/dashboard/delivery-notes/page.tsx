'use client';

/**
 * Conduces de entrega.
 *
 * LOTE 226: la pagina tenia 844 lineas y React Doctor la marcaba por
 * complejidad. Se partio sin cambiar lo que hace: aqui queda la LISTA -- cargarla,
 * su estado de error, aprobar y anular con su confirmacion, la paginacion --, y
 * salen a ficheros propios la barra de aplicar por codigo (`AplicarPorCodigo`),
 * la tabla (`TablaDeConduces`), el alta (`FormularioDeConduce` y
 * `BuscadorDeFacturas`) y su estado (`useFormularioConduce`). El estado del alta
 * se crea AQUI y no dentro del formulario: lo escrito (chofer, placa, fecha)
 * sobrevivia a cancelar, y asi sigue.
 */
import { useState, useEffect, useCallback } from 'react';
import { PestanasDeRegistro } from '@/components/ui/pestanas-de-registro';
import { Plus, RefreshCw, Truck } from 'lucide-react';
import { Pagination } from '@/components/ui/pagination';
//  Lote 227: `m` dentro de `LazyMotion` y no `motion` (aviso de React Doctor):
//  las animaciones cargan solo lo que usan.
import { LazyMotion, domAnimation, m, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { ErrorDeCarga, motivoDeCarga } from '@/components/ui/estado-carga';
import { useConfirm } from '@/providers/confirm-provider';
import { VerConduce, useVerConduce } from './components/VerConduce';
import { AplicarPorCodigo } from './components/AplicarPorCodigo';
import { TablaDeConduces } from './components/TablaDeConduces';
import { FormularioDeConduce } from './components/FormularioDeConduce';
import { BuscadorDeFacturas } from './components/BuscadorDeFacturas';
import { useFormularioConduce } from './hooks/useFormularioConduce';
import { leerRespuesta } from '@/utils/leerRespuesta';
import { FiltrosDeConduces } from './components/FiltrosDeConduces';
import { hayFiltros, parametrosDeFiltros, SIN_FILTROS, type FiltrosEscritos } from '@/services/inventario/filtrosDeConduces';

/** Imprimir no depende de nada del componente (lote 227: al ambito del modulo). */
function imprimirConduce(noteId: string) {
  window.open(`/api/v1/delivery-notes/${noteId}/print`, '_blank');
}

export default function DeliveryNotesPage() {
  const confirm = useConfirm();
  const [loading, setLoading] = useState(true);
  //  Lote 223: el visor del conduce. Desde el 224 el conduce se pide al pulsar
  //  el ojo (`visor.abrir`), no en un efecto.
  const visor = useVerConduce();
  // P2-37: el fallo de carga NO se limpia solo. Mientras este puesto, la lista
  // enseña el error en vez de su mensaje de vacio.
  const [errorCarga, setErrorCarga] = useState<string | null>(null);
  const [notes, setNotes] = useState<any[]>([]);

  // Pagination & Filters for List
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  // El total lo manda la API y no se guardaba: se decia "Mostrando 15
  // conduces", que es cuantos caben, no cuantos hay (lote 131).
  const [totalItems, setTotalItems] = useState(0);
  const itemsPerPage = 15;
  //  Lote 245: filtros por estado y por rango de fecha de entrega. Cambiar un filtro vuelve a la
  //  pagina 1: quedarse en la 4 de una lista que ahora tiene dos paginas ensenaria una tabla vacia.
  const [filtros, setFiltros] = useState<FiltrosEscritos>(SIN_FILTROS);
  const cambiarFiltros = (cambio: Partial<FiltrosEscritos>) => { setFiltros((f) => ({ ...f, ...cambio })); setPage(1); };
  const limpiarFiltros = () => { setFiltros(SIN_FILTROS); setPage(1); };

  // Creation Flow
  const [showForm, setShowForm] = useState(false);

  // Load Conduces List
  const loadDeliveryNotes = useCallback(async () => {
    setLoading(true);
    setErrorCarga(null);
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        per_page: String(itemsPerPage),
        ...parametrosDeFiltros(filtros),
      });
      const res = await fetch(`/api/v1/delivery-notes?${params.toString()}`);
      const leido = await leerRespuesta<{ data: any[]; meta?: { total_pages?: number; total?: number } }>(res);
      if (leido.bien) {
        setNotes(leido.cuerpo.data || []);
        setTotalPages(leido.cuerpo.meta?.total_pages || 1);
        setTotalItems(leido.cuerpo.meta?.total || 0);
      } else {
        setNotes([]);
        setErrorCarga(motivoDeCarga(null, leido.mensaje));
        toast.error('Error al cargar conduces');
      }
    } catch (err) {
      setNotes([]);
      setErrorCarga(motivoDeCarga(err));
      toast.error('Error al cargar conduces');
    } finally {
      setLoading(false);
    }
  }, [page, filtros]);

  useEffect(() => {
    loadDeliveryNotes();
  }, [loadDeliveryNotes]);

  const formulario = useFormularioConduce({
    onCreado: () => {
      setShowForm(false);
      loadDeliveryNotes();
    },
  });

  /** "Volver al listado" y "Cancelar": como antes, solo se suelta la factura. */
  const salirDelFormulario = () => {
    setShowForm(false);
    formulario.descartarFactura();
  };

  // Approve Conduce (Exits stock)
  const handleApproveNote = async (noteId: string) => {
    if (
      !(await confirm({
        title: 'Aprobar conduce',
        description: 'Esta acción descontará el inventario físico y cambiará el estado de la factura.',
      }))
    ) {
      return;
    }
    try {
      toast.loading('Aprobando y procesando despacho...');
      const res = await fetch(`/api/v1/delivery-notes/${noteId}/approve`, {
        method: 'POST',
      });
      const leido = await leerRespuesta<{ message?: string }>(res);
      toast.dismiss();

      if (leido.bien) {
        toast.success(leido.cuerpo.message || 'Conduce aprobado correctamente.');
        loadDeliveryNotes();
      } else {
        toast.error(leido.mensaje || 'Error al aprobar conduce.');
      }
    } catch (err: any) {
      toast.dismiss();
      toast.error('Error de red', { description: err.message });
    }
  };

  // Void Conduce (Returns stock)
  const handleVoidNote = async (noteId: string) => {
    if (
      !(await confirm({
        title: 'Anular conduce',
        description: 'Esta acción retornará la mercancía al inventario y revertirá el estado logístico.',
        variant: 'destructive',
      }))
    ) {
      return;
    }
    try {
      toast.loading('Anulando conduce y retornando stock...');
      const res = await fetch(`/api/v1/delivery-notes/${noteId}`, {
        method: 'DELETE',
      });
      const leido = await leerRespuesta<{ message?: string }>(res);
      toast.dismiss();

      if (leido.bien) {
        toast.success(leido.cuerpo.message || 'Conduce anulado correctamente.');
        loadDeliveryNotes();
      } else {
        toast.error(leido.mensaje || 'Error al anular conduce.');
      }
    } catch (err: any) {
      toast.dismiss();
      toast.error('Error de red', { description: err.message });
    }
  };

  return (
    <LazyMotion features={domAnimation}>
      <div className="min-h-full bg-slate-50 text-slate-900 font-sans pb-20 max-w-7xl mx-auto w-full">
        {/* Header Ribbon */}
        <div className="bg-[#003366] w-full px-8 py-1.5 flex justify-end items-center shadow-inner">
          <span className="text-white text-[10px] uppercase font-bold tracking-widest opacity-80 flex items-center gap-2">
            <Truck className="h-3 w-3" /> Control de Despacho Logístico (WMS)
          </span>
        </div>

        <div className="p-4 md:p-8 max-w-6xl mx-auto space-y-6">
          <AnimatePresence mode="wait">
            {!showForm ? (
              /* LIST VIEW */
              <m.div
                key="list"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                className="space-y-6"
              >
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                  <div>
                    <h1 className="text-2xl md:text-3xl font-display font-bold text-[#003366] flex items-center gap-2">
                      Conduces de Entrega
                    </h1>
                    <p className="text-slate-500 text-sm mt-1">
                      Controle la salida física de mercancías asociadas a facturas de venta.
                    </p>
                  </div>
                  <PestanasDeRegistro enFormulario={showForm} lista="Conduces" alVerLista={salirDelFormulario} alRegistrar={() => setShowForm(true)} />
                </div>

                {/* Quick Action: Apply Delivery Note or Invoice Stock Deduction */}
                <AplicarPorCodigo onAplicado={loadDeliveryNotes} />

                {/* Table list */}
                <div className="bg-white rounded-xl shadow-xl border border-slate-200 overflow-hidden">
                  <FiltrosDeConduces filtros={filtros} alCambiar={cambiarFiltros} alLimpiar={limpiarFiltros} />
                  {loading ? (
                    <div className="flex justify-center py-16">
                      <RefreshCw className="h-8 w-8 animate-spin text-[#C5A059]" />
                    </div>
                  ) : errorCarga ? (
                    <ErrorDeCarga mensaje={errorCarga} onReintentar={loadDeliveryNotes} />
                  ) : notes.length === 0 ? (
                    <div className="flex flex-col items-center py-20 text-slate-400 gap-3">
                      <Truck className="h-12 w-12 opacity-30" />
                      <span className="text-sm">{hayFiltros(filtros) ? 'Ningún conduce cumple esos filtros.' : 'No se encontraron conduces registrados.'}</span>
                    </div>
                  ) : (
                    <TablaDeConduces
                      notes={notes}
                      onVer={visor.abrir}
                      onImprimir={imprimirConduce}
                      onAprobar={handleApproveNote}
                      onAnular={handleVoidNote}
                    />
                  )}

                  {/* Paginacion: el componente comun (P3-45, lote 131) */}
                  <Pagination
                    currentPage={page}
                    totalPages={totalPages}
                    totalItems={totalItems}
                    pageSize={itemsPerPage}
                    onPageChange={setPage}
                    itemLabel="conduces"
                    hideControlsWhenSinglePage
                  />
                </div>
              </m.div>
            ) : (
              /* CREATION FLOW */
              <m.div
                key="form"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                className="space-y-6"
              >
                {/* Las mismas pestanas que en la lista (lote 241): desde aqui se vuelve con "Conduces". */}
                <div className="flex justify-end">
                  <PestanasDeRegistro enFormulario={showForm} lista="Conduces" alVerLista={salirDelFormulario} alRegistrar={() => setShowForm(true)} />
                </div>
                <FormularioDeConduce formulario={formulario} onSalir={salirDelFormulario} />
              </m.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* MODAL: Invoice Search Popup */}
      <BuscadorDeFacturas formulario={formulario} />

      <VerConduce visor={visor} onDespachado={loadDeliveryNotes} />
    </LazyMotion>
  );
}
