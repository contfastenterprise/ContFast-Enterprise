'use client';

import { useState, useEffect, useCallback } from 'react';
import { Users, Search, Edit2, Trash2, RefreshCw, AlertTriangle, Building2, Briefcase, Mail, Phone, Calendar, UserCheck } from 'lucide-react';
import { toast } from 'sonner';
import { ErrorDeCarga, motivoDeCarga } from '@/components/ui/estado-carga';
import { useConfirm } from '@/providers/confirm-provider';
import { SearchBar } from '@/components/ui/search-bar';
import { PestanasDeRegistro, PanelDeRegistro } from '@/components/ui/pestanas-de-registro';
import { Pagination } from '@/components/ui/pagination';
import { leerRespuesta } from '@/utils/leerRespuesta';

interface Employee {
  id: string;
  employeeCode: string;
  firstName: string;
  lastName: string;
  cedula: string;
  birthDate: string;
  email?: string;
  phone?: string;
  address?: string;
  gender?: string;
  civilStatus?: string;
  nationality?: string;
  departmentId?: string;
  positionId?: string | null;
  paymentFrequency: string;
  department?: { id: string; name: string } | null;
  contractType: string;
  salary: string;
  hireDate: string;
  terminationDate?: string;
  status: string;
}

export default function EmployeesPage() {
  const h = useEmpleados();
  const { search, setSearch, showModal, setShowModal, editId, fetchData, handleOpenCreate } = h;

  return (

    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-800 flex items-center gap-2">
            <Users className="h-6 w-6 text-[#c5a059]" /> Colaboradores / Empleados
          </h1>
          <p className="text-sm text-slate-500">
            Administración de ficha de datos personales y laborales del personal.
          </p>
        </div>
        {/* Lote 249: en la cabecera, SOLO las pestanas (como en Compras). */}
        <PestanasDeRegistro
          enFormulario={showModal}
          lista="Empleados"
          editando={!!editId}
          alVerLista={() => setShowModal(false)}
          alRegistrar={handleOpenCreate}
        />
      </div>

      {!showModal && (<>

      {/* Filters */}
      <div className="flex items-center gap-3 bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
        <SearchBar
          placeholder="Buscar por nombre, código o cédula..."
          value={search}
          onChange={setSearch}
        />
        <button
          type="button"
          onClick={fetchData}
          title="Recargar"
          aria-label="Recargar"
          className="flex items-center justify-center h-8 w-8 border border-slate-200 hover:bg-slate-50 rounded-lg transition text-slate-700"
        >
          <RefreshCw className="h-4.5 w-4.5" />
        </button>
      </div>

      <TablaDeEmpleados h={h} />
      </>)}

      <FormularioDeEmpleado h={h} />
    </div>

  );
}

/** El estado y las acciones de la pagina, movidos TAL CUAL desde el componente. */
function useEmpleados() {
  const confirm = useConfirm();
  const [employeesList, setEmployeesList] = useState<Employee[]>([]);
  const [departments, setDepartments] = useState<any[]>([]);
  const [positions, setPositions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  // P2-37: el fallo de carga NO se limpia solo. Mientras este puesto, la lista
  // enseña el error en vez de su mensaje de vacio.
  const [errorCarga, setErrorCarga] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [showModal, setShowModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);

  const itemsPerPage = 15;
  const totalPages = Math.ceil(employeesList.length / itemsPerPage);
  const pagedEmployees = employeesList.slice((page - 1) * itemsPerPage, page * itemsPerPage);

  const [formData, setFormData] = useState({
    employeeCode: '',
    firstName: '',
    lastName: '',
    cedula: '',
    birthDate: '',
    email: '',
    phone: '',
    address: '',
    gender: 'masculino',
    civilStatus: 'soltero',
    nationality: 'Dominicana',
    departmentId: '',
    positionId: '',
    contractType: 'indefinido',
    salary: 25000,
    paymentFrequency: 'mensual',
    hireDate: new Date().toISOString().split('T')[0],
    terminationDate: '',
    status: 'active'
  });

  //  Lote 252: una funcion estable que mira el ESTADO antes de leer el cuerpo, y las tres
  //  lecturas a la vez (no dependen una de otra). El efecto solo la llama.
  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setErrorCarga(null);
      const [empRes, deptRes, posRes] = await Promise.all([
        fetch(`/api/v1/hr/employees?search=${encodeURIComponent(search)}`),
        fetch('/api/v1/hr/departments'),
        fetch('/api/v1/hr/positions'),
      ]);
      const empleados = await leerRespuesta<{ data: Employee[] }>(empRes);
      if (empleados.bien) {
        setEmployeesList(empleados.cuerpo.data);
      } else {
        setEmployeesList([]);
        setErrorCarga(motivoDeCarga(null, empleados.mensaje));
      }

      const departamentos = await leerRespuesta<{ data: any[] }>(deptRes);
      if (departamentos.bien) setDepartments(departamentos.cuerpo.data);

      const puestos = await leerRespuesta<{ data: any[] }>(posRes);
      if (puestos.bien) setPositions(puestos.cuerpo.data);

    } catch (err: any) {
      // El mensaje de vacio invita a "agregar tu primer colaborador": al fallar
      // la carga le decia a quien lleva la nomina que empezara de cero, con sus
      // empleados guardados en la base.
      setEmployeesList([]);
      setErrorCarga(motivoDeCarga(err));
      toast.error('Error al cargar información de empleados');
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    setPage(1);
    fetchData();
  }, [fetchData]);

  const handleOpenCreate = () => {
    setEditId(null);
    setFormData({
      employeeCode: 'EMP-' + Math.floor(1000 + Math.random() * 9000),
      firstName: '',
      lastName: '',
      cedula: '',
      birthDate: '1990-01-01',
      email: '',
      phone: '',
      address: '',
      gender: 'masculino',
      civilStatus: 'soltero',
      nationality: 'Dominicana',
      departmentId: departments[0]?.id || '',
      positionId: positions[0]?.id || '',
      contractType: 'indefinido',
      paymentFrequency: 'mensual',
      salary: 25000,
      hireDate: new Date().toISOString().split('T')[0],
      terminationDate: '',
      status: 'active'
    });
    setShowModal(true);
  };

  const handleOpenEdit = (emp: Employee) => {
    setEditId(emp.id);
    setFormData({
      employeeCode: emp.employeeCode,
      firstName: emp.firstName,
      lastName: emp.lastName,
      cedula: emp.cedula,
      birthDate: new Date(emp.birthDate).toISOString().split('T')[0],
      email: emp.email || '',
      phone: emp.phone || '',
      address: emp.address || '',
      gender: emp.gender || 'masculino',
      civilStatus: emp.civilStatus || 'soltero',
      nationality: emp.nationality || 'Dominicana',
      departmentId: emp.departmentId || '',
      positionId: emp.positionId || '',
      contractType: emp.contractType || 'indefinido',
      salary: parseFloat(emp.salary),
      paymentFrequency: emp.paymentFrequency || 'mensual',
      hireDate: new Date(emp.hireDate).toISOString().split('T')[0],
      terminationDate: emp.terminationDate ? new Date(emp.terminationDate).toISOString().split('T')[0] : '',
      status: emp.status
    });
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      const url = editId ? `/api/v1/hr/employees?id=${editId}` : '/api/v1/hr/employees';
      const method = editId ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          departmentId: formData.departmentId || null,
          positionId: formData.positionId || null,
          terminationDate: formData.terminationDate || null,
        }),
      });

      const leido = await leerRespuesta(res);
      if (leido.bien) {
        toast.success(editId ? 'Empleado actualizado correctamente' : 'Empleado creado correctamente');
        setShowModal(false);
        fetchData();
      } else {
        toast.error(leido.mensaje || 'Error al procesar la solicitud');
      }
    } catch (err: any) {
      toast.error('Error al guardar datos');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    await confirm({
      title: 'Confirmar eliminación',
      description: '¿Está seguro de que desea eliminar este empleado? Esta acción no se puede deshacer.',
      action: async () => {
        const res = await fetch(`/api/v1/hr/employees?id=${id}`, { method: 'DELETE' });
        const leido = await leerRespuesta(res);
        if (!leido.bien) {
          throw new Error(leido.mensaje || 'Error al eliminar');
        }
        fetchData();
      },
      onSuccessMessage: 'Empleado eliminado correctamente.',
      onErrorMessage: 'No fue posible eliminar el empleado.',
    });
  };

  return { confirm, employeesList, setEmployeesList, departments, setDepartments, positions, setPositions, loading, setLoading, errorCarga, setErrorCarga, search, setSearch, page, setPage, showModal, setShowModal, submitting, setSubmitting, editId, setEditId, itemsPerPage, totalPages, pagedEmployees, formData, setFormData, fetchData, handleOpenCreate, handleOpenEdit, handleSubmit, handleDelete };
}

type EstadoEmployeesPage = ReturnType<typeof useEmpleados>;

function TablaDeEmpleados({ h }: { h: EstadoEmployeesPage }) {
  const { employeesList, departments, positions, loading, errorCarga, page, setPage, itemsPerPage, totalPages, pagedEmployees, fetchData, handleOpenEdit, handleDelete } = h;
  return (
    <>
      {/* Table View */}
      {loading ? (
        <div className="flex h-[30vh] items-center justify-center">
          <RefreshCw className="h-7 w-7 animate-spin text-[#c5a059]" />
        </div>
      ) : errorCarga ? (
        <ErrorDeCarga mensaje={errorCarga} onReintentar={fetchData} />
      ) : employeesList.length === 0 ? (
        <div className="text-center py-12 border border-dashed border-slate-200 rounded-xl bg-white p-4">
          <Users className="mx-auto h-12 w-12 text-slate-300" />
          <h3 className="mt-4 text-sm font-semibold text-slate-800">No se encontraron empleados</h3>
          <p className="mt-1 text-xs text-slate-500">Comienza agregando tu primer colaborador administrativo o de taller.</p>
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden">
          <>
            {/* Mobile View */}
            <div className="md:hidden flex flex-col divide-y divide-slate-100 bg-white">
              {pagedEmployees.map((emp) => (
                <div key={emp.id} className="flex flex-col p-4 hover:bg-slate-50 transition-colors gap-3">
                  <div className="flex justify-between items-start">
                    <div className="flex flex-col">
                      <span className="font-semibold text-sm text-slate-800">{emp.firstName} {emp.lastName}</span>
                      <span className="font-mono font-bold text-xs text-[#003366]">{emp.employeeCode}</span>
                    </div>
                    <span className={`inline-flex px-2 py-0.5 rounded text-[9px] font-bold uppercase ${emp.status === 'active' 
                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' 
                      : 'bg-slate-50 text-slate-500 border border-slate-200'
                      }`}>
                      {emp.status === 'active' ? 'Activo' : 'Inactivo'}
                    </span>
                  </div>
                  
                  <div className="flex flex-col gap-1 text-xs text-slate-600">
                    <div className="flex justify-between">
                      <span className="text-slate-400">Cédula:</span>
                      <span className="font-mono">{emp.cedula.replace(/(\d{3})(\d{7})(\d{1})/, '$1-$2-$3')}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Cargo:</span>
                      <span className="font-semibold">{positions.find(p => p.id === emp.positionId)?.name || 'Sin Puesto'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Salario:</span>
                      <span className="font-bold text-[#003366] font-mono">{parseFloat(emp.salary).toLocaleString('es-DO', { style: 'currency', currency: 'DOP' })}</span>
                    </div>
                  </div>
                  
                  <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                    <button
                      onClick={() => handleOpenEdit(emp)}
                      className="p-2 rounded-lg bg-slate-100 text-slate-600 hover:text-[#003366] hover:bg-[#003366]/10 flex items-center justify-center"
                      title="Editar"
                    >
                      <Edit2 className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(emp.id)}
                      className="p-2 rounded-lg bg-slate-100 text-slate-600 hover:text-rose-600 hover:bg-rose-50 flex items-center justify-center"
                      title="Eliminar"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop View */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-slate-50/80 border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-2.5 text-[10px] font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap">Código</th>
                    <th className="px-4 py-2.5 text-[10px] font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap">Nombre</th>
                    <th className="px-4 py-2.5 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Cédula</th>
                    <th className="px-4 py-2.5 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Departamento / Cargo</th>
                    <th className="px-4 py-2.5 text-[10px] font-bold text-slate-500 uppercase tracking-wider text-right">Salario</th>
                    <th className="px-4 py-2.5 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Contrato</th>
                    <th className="px-4 py-2.5 text-[10px] font-bold text-slate-500 uppercase tracking-wider text-center">Estado</th>
                    <th className="px-4 py-2.5 text-[10px] font-bold text-slate-500 uppercase tracking-wider text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {pagedEmployees.map((emp) => (
                    <tr key={emp.id} className="hover:bg-[#C5A059]/5 transition-colors group">
                      <td className="px-4 py-2.5 align-middle text-xs font-mono font-bold text-[#003366]">{emp.employeeCode}</td>
                      <td className="px-4 py-2.5 align-middle text-xs font-semibold text-slate-700">{emp.firstName} {emp.lastName}</td>
                      <td className="px-4 py-2.5 align-middle text-xs font-mono text-slate-600">{emp.cedula.replace(/(\d{3})(\d{7})(\d{1})/, '$1-$2-$3')}</td>
                      <td className="px-4 py-2.5 align-middle text-xs">
                        <div className="flex flex-col text-[11px] text-slate-600">
                          <span className="font-semibold text-[#003366]">{departments.find(d => d.id === emp.departmentId)?.name || 'General'}</span>
                          <span className="text-[10px] text-slate-400">{positions.find(p => p.id === emp.positionId)?.name || 'Sin Puesto'}</span>
                        </div>
                      </td>
                      <td className="px-4 py-2.5 align-middle text-right text-xs font-bold text-[#003366] font-mono">{parseFloat(emp.salary).toLocaleString('es-DO', { style: 'currency', currency: 'DOP' })}</td>
                      <td className="px-4 py-2.5 align-middle text-xs text-slate-600 capitalize">{emp.contractType}</td>
                      <td className="px-4 py-2.5 align-middle text-center">
                        <span className={`inline-flex px-2 py-0.5 rounded text-[10px] font-bold uppercase ${emp.status === 'active' 
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' 
                          : 'bg-slate-50 text-slate-500 border border-slate-200'
                          }`}>
                          {emp.status === 'active' ? 'Activo' : 'Inactivo'}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 align-middle text-right">
                        <div className="flex gap-1 justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => handleOpenEdit(emp)}
                            className="p-1.5 rounded-lg transition-colors flex items-center justify-center text-slate-500 hover:text-[#003366] hover:bg-[#003366]/10"
                            title="Editar"
                          >
                            <Edit2 className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => handleDelete(emp.id)}
                            className="p-1.5 rounded-lg transition-colors flex items-center justify-center text-slate-500 hover:text-rose-600 hover:bg-rose-50"
                            title="Eliminar"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Paginacion: el componente comun (P3-45, lote 128) */}
            <Pagination
              currentPage={page}
              totalPages={totalPages}
              totalItems={employeesList.length}
              pageSize={itemsPerPage}
              onPageChange={setPage}
              itemLabel="empleados"
              hideControlsWhenSinglePage
            />
          </>
        </div>
      )}
    </>
  );
}

function FormularioDeEmpleado({ h }: { h: EstadoEmployeesPage }) {
  const { departments, positions, showModal, setShowModal, submitting, editId, formData, setFormData, handleSubmit } = h;
  return (
    <>
      {/* Alta / edicion: era un modal con su propia barra de desplazamiento; desde el lote 249 es la segunda pestana. */}
      {showModal && (
        <PanelDeRegistro titulo={editId ? 'Editar Empleado' : 'Registrar Nuevo Empleado'}>
          <form onSubmit={handleSubmit} className="space-y-4 max-w-3xl">
            {/* Personal Section */}
            <div className="space-y-3">
              <h3 className="text-[10px] font-bold text-[#c5a059] uppercase tracking-wider">1. Datos Personales</h3>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label htmlFor="emp-1" className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Nombre</label>
                  <input id="emp-1"
                    type="text"
                    required
                    value={formData.firstName}
                    onChange={e => setFormData({ ...formData, firstName: e.target.value })}
                    className="w-full h-8 px-3 py-1.5 text-xs rounded-lg border border-slate-200 bg-slate-50 focus:border-[#c5a059] focus:ring-1 focus:ring-[#c5a059]/20 outline-none text-slate-800"
                  />
                </div>
                <div className="space-y-1">
                  <label htmlFor="emp-2" className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Apellido</label>
                  <input id="emp-2"
                    type="text"
                    required
                    value={formData.lastName}
                    onChange={e => setFormData({ ...formData, lastName: e.target.value })}
                    className="w-full h-8 px-3 py-1.5 text-xs rounded-lg border border-slate-200 bg-slate-50 focus:border-[#c5a059] focus:ring-1 focus:ring-[#c5a059]/20 outline-none text-slate-800"
                  />
                </div>
                <div className="space-y-1">
                  <label htmlFor="emp-3" className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Cédula Dominicana</label>
                  <input id="emp-3"
                    type="text"
                    required
                    placeholder="Ej. 00112345678"
                    value={formData.cedula}
                    onChange={e => setFormData({ ...formData, cedula: e.target.value })}
                    className="w-full h-8 px-3 py-1.5 text-xs font-mono rounded-lg border border-slate-200 bg-slate-50 focus:border-[#c5a059] focus:ring-1 focus:ring-[#c5a059]/20 outline-none text-slate-800"
                  />
                </div>
                <div className="space-y-1">
                  <label htmlFor="emp-4" className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Fecha de Nacimiento</label>
                  <input id="emp-4"
                    type="date"
                    required
                    value={formData.birthDate}
                    onChange={e => setFormData({ ...formData, birthDate: e.target.value })}
                    className="w-full h-8 px-3 py-1.5 text-xs rounded-lg border border-slate-200 bg-slate-50 focus:border-[#c5a059] focus:ring-1 focus:ring-[#c5a059]/20 outline-none text-slate-800"
                  />
                </div>
                <div className="space-y-1">
                  <label htmlFor="emp-5" className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Género</label>
                  <select id="emp-5"
                    value={formData.gender}
                    onChange={e => setFormData({ ...formData, gender: e.target.value })}
                    className="w-full h-8 px-3 py-1.5 text-xs rounded-lg border border-slate-200 bg-slate-50 focus:border-[#c5a059] focus:ring-1 focus:ring-[#c5a059]/20 outline-none text-slate-800"
                  >
                    <option value="masculino">Masculino</option>
                    <option value="femenino">Femenino</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label htmlFor="emp-6" className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Estado Civil</label>
                  <select id="emp-6"
                    value={formData.civilStatus}
                    onChange={e => setFormData({ ...formData, civilStatus: e.target.value })}
                    className="w-full h-8 px-3 py-1.5 text-xs rounded-lg border border-slate-200 bg-slate-50 focus:border-[#c5a059] focus:ring-1 focus:ring-[#c5a059]/20 outline-none text-slate-800"
                  >
                    <option value="soltero">Soltero/a</option>
                    <option value="casado">Casado/a</option>
                    <option value="divorciado">Divorciado/a</option>
                    <option value="viudo">Viudo/a</option>
                    <option value="union_libre">Unión Libre</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label htmlFor="emp-7" className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Correo Electrónico</label>
                  <input id="emp-7"
                    type="email"
                    value={formData.email}
                    onChange={e => setFormData({ ...formData, email: e.target.value })}
                    className="w-full h-8 px-3 py-1.5 text-xs rounded-lg border border-slate-200 bg-slate-50 focus:border-[#c5a059] focus:ring-1 focus:ring-[#c5a059]/20 outline-none text-slate-800"
                  />
                </div>
                <div className="space-y-1">
                  <label htmlFor="emp-8" className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Teléfono</label>
                  <input id="emp-8"
                    type="text"
                    value={formData.phone}
                    onChange={e => setFormData({ ...formData, phone: e.target.value })}
                    className="w-full h-8 px-3 py-1.5 text-xs rounded-lg border border-slate-200 bg-slate-50 focus:border-[#c5a059] focus:ring-1 focus:ring-[#c5a059]/20 outline-none text-slate-800"
                  />
                </div>
              </div>
              <div className="space-y-1">
                <label htmlFor="emp-9" className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Dirección Completa</label>
                <textarea id="emp-9"
                  rows={2}
                  value={formData.address}
                  onChange={e => setFormData({ ...formData, address: e.target.value })}
                  className="w-full min-h-[60px] px-3 py-2 text-xs rounded-lg border border-slate-200 bg-slate-50 focus:border-[#c5a059] focus:ring-1 focus:ring-[#c5a059]/20 outline-none text-slate-800"
                />
              </div>
            </div>

            {/* Job Section */}
            <div className="space-y-3 pt-2 border-t border-slate-200">
              <h3 className="text-[10px] font-bold text-[#c5a059] uppercase tracking-wider">2. Datos Laborales</h3>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label htmlFor="emp-10" className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Código Empleado</label>
                  <input id="emp-10"
                    type="text"
                    required
                    value={formData.employeeCode}
                    onChange={e => setFormData({ ...formData, employeeCode: e.target.value })}
                    className="w-full h-8 px-3 py-1.5 text-xs rounded-lg border border-slate-200 bg-slate-50 focus:border-[#c5a059] focus:ring-1 focus:ring-[#c5a059]/20 outline-none text-slate-800"
                  />
                </div>
                <div className="space-y-1">
                  <label htmlFor="emp-11" className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Tipo Contrato</label>
                  <select id="emp-11"
                    value={formData.contractType}
                    onChange={e => setFormData({ ...formData, contractType: e.target.value })}
                    className="w-full h-8 px-3 py-1.5 text-xs rounded-lg border border-slate-200 bg-slate-50 focus:border-[#c5a059] focus:ring-1 focus:ring-[#c5a059]/20 outline-none text-slate-800"
                  >
                    <option value="fijo">Fijo</option>
                    <option value="indefinido">Indefinido</option>
                    <option value="temporal">Temporal</option>
                    <option value="por_obra">Por Obra</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label htmlFor="emp-12" className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Departamento</label>
                  <select id="emp-12"
                    value={formData.departmentId}
                    onChange={e => setFormData({ ...formData, departmentId: e.target.value })}
                    className="w-full h-8 px-3 py-1.5 text-xs rounded-lg border border-slate-200 bg-slate-50 focus:border-[#c5a059] focus:ring-1 focus:ring-[#c5a059]/20 outline-none text-slate-800"
                  >
                    <option value="">Ninguno / General</option>
                    {departments.map(d => (
                      <option key={d.id} value={d.id}>{d.name}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <label htmlFor="emp-13" className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Cargo / Puesto</label>
                  <select id="emp-13"
                    value={formData.positionId}
                    onChange={e => setFormData({ ...formData, positionId: e.target.value })}
                    className="w-full h-8 px-3 py-1.5 text-xs rounded-lg border border-slate-200 bg-slate-50 focus:border-[#c5a059] focus:ring-1 focus:ring-[#c5a059]/20 outline-none text-slate-800"
                  >
                    <option value="">Ninguno / General</option>
                    {positions.map(p => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <label htmlFor="emp-14" className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Salario Base Mensual (DOP)</label>
                  <input id="emp-14"
                    type="number"
                    required
                    value={formData.salary}
                    onChange={e => setFormData({ ...formData, salary: parseFloat(e.target.value) || 0 })}
                    className="w-full h-8 px-3 py-1.5 text-xs rounded-lg border border-slate-200 bg-slate-50 focus:border-[#c5a059] focus:ring-1 focus:ring-[#c5a059]/20 outline-none text-slate-800"
                  />
                </div>
                <div className="space-y-1">
                  <label htmlFor="emp-15" className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Frecuencia de Pago</label>
                  <select id="emp-15"
                    value={formData.paymentFrequency}
                    onChange={e => setFormData({ ...formData, paymentFrequency: e.target.value })}
                    className="w-full h-8 px-3 py-1.5 text-xs rounded-lg border border-slate-200 bg-slate-50 focus:border-[#c5a059] focus:ring-1 focus:ring-[#c5a059]/20 outline-none text-slate-800"
                  >
                    <option value="mensual">Mensual</option>
                    <option value="quincenal">Quincenal</option>
                    <option value="semanal">Semanal</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label htmlFor="emp-16" className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Fecha de Ingreso</label>
                  <input id="emp-16"
                    type="date"
                    required
                    value={formData.hireDate}
                    onChange={e => setFormData({ ...formData, hireDate: e.target.value })}
                    className="w-full h-8 px-3 py-1.5 text-xs rounded-lg border border-slate-200 bg-slate-50 focus:border-[#c5a059] focus:ring-1 focus:ring-[#c5a059]/20 outline-none text-slate-800"
                  />
                </div>
                <div className="space-y-1">
                  <label htmlFor="emp-17" className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Estado Laboral</label>
                  <select id="emp-17"
                    value={formData.status}
                    onChange={e => setFormData({ ...formData, status: e.target.value })}
                    className="w-full h-8 px-3 py-1.5 text-xs rounded-lg border border-slate-200 bg-slate-50 focus:border-[#c5a059] focus:ring-1 focus:ring-[#c5a059]/20 outline-none text-slate-800"
                  >
                    <option value="active">Activo</option>
                    <option value="inactive">Inactivo</option>
                    <option value="suspended">Suspendido</option>
                    <option value="cancelled">Cancelado</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="flex items-center gap-2 bg-white text-slate-700 border border-slate-300 hover:bg-slate-50 hover:text-slate-900 px-4 py-2 h-9 rounded-lg font-bold shadow-sm transition disabled:opacity-50 disabled:cursor-not-allowed justify-center text-sm"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="flex items-center gap-2 bg-[#C5A059] hover:bg-[#b08c4a] text-slate-950 px-4 py-2 h-9 rounded-lg font-bold shadow-sm hover:shadow-md transition disabled:opacity-50 disabled:cursor-not-allowed justify-center text-sm"
              >
                {submitting ? 'Guardando...' : 'Guardar Empleado'}
              </button>
            </div>
          </form>
        </PanelDeRegistro>
      )}
    </>
  );
}
