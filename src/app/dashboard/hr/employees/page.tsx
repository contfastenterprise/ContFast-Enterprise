'use client';

import { useState, useEffect } from 'react';
import DashboardLayout from '@/app/dashboard/layout';
import { Users, Search, Plus, Edit2, Trash2, X, RefreshCw, AlertTriangle, Building2, Briefcase, Mail, Phone, Calendar, UserCheck } from 'lucide-react';
import { toast } from 'sonner';
import { SearchBar } from '@/components/ui/search-bar';

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
  const [employeesList, setEmployeesList] = useState<Employee[]>([]);
  const [departments, setDepartments] = useState<any[]>([]);
  const [positions, setPositions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
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

  useEffect(() => {
    setPage(1);
    fetchData();
  }, [search]);

  const fetchData = async () => {
    try {
      setLoading(true);
      const empRes = await fetch(`/api/v1/hr/employees?search=${encodeURIComponent(search)}`);
      const empData = await empRes.json();
      if (empData.success) {
        setEmployeesList(empData.data);
      }

      const deptRes = await fetch('/api/v1/hr/departments');
      const deptData = await deptRes.json();
      if (deptData.success) setDepartments(deptData.data);

      const posRes = await fetch('/api/v1/hr/positions');
      const posData = await posRes.json();
      if (posData.success) setPositions(posData.data);

    } catch (err: any) {
      toast.error('Error al cargar información de empleados');
    } finally {
      setLoading(false);
    }
  };

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

      const data = await res.json();
      if (data.success) {
        toast.success(editId ? 'Empleado actualizado correctamente' : 'Empleado creado correctamente');
        setShowModal(false);
        fetchData();
      } else {
        toast.error(data.error?.message || 'Error al procesar la solicitud');
      }
    } catch (err: any) {
      toast.error('Error al guardar datos');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('¿Está seguro de que desea eliminar este empleado?')) return;
    try {
      const res = await fetch(`/api/v1/hr/employees?id=${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        toast.success('Empleado eliminado correctamente');
        fetchData();
      } else {
        toast.error(data.error?.message || 'Error al eliminar');
      }
    } catch (err) {
      toast.error('Error de conexión');
    }
  };

  return (

    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-on-surface flex items-center gap-2">
            <Users className="h-6 w-6 text-primary" /> Colaboradores / Empleados
          </h1>
          <p className="text-sm text-on-surface-variant/80">
            Administración de ficha de datos personales y laborales del personal.
          </p>
        </div>
        <button
          onClick={handleOpenCreate}
          className="flex items-center gap-2 px-4 py-2 text-sm font-semibold bg-primary hover:bg-primary-variant text-on-primary rounded-xl shadow-md shadow-primary/10 transition-all shrink-0 self-start md:self-auto"
        >
          <Plus className="h-4 w-4" /> Agregar Empleado
        </button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 bg-surface p-4 rounded-xl border border-outline shadow-sm">
        <SearchBar
          placeholder="Buscar por nombre, código o cédula..."
          value={search}
          onChange={setSearch}
        />
        <button
          onClick={fetchData}
          className="p-2 border border-outline hover:bg-surface-variant rounded-lg transition-all text-on-surface"
        >
          <RefreshCw className="h-4.5 w-4.5" />
        </button>
      </div>

      {/* Table View */}
      {loading ? (
        <div className="flex h-[30vh] items-center justify-center">
          <RefreshCw className="h-7 w-7 animate-spin text-primary" />
        </div>
      ) : employeesList.length === 0 ? (
        <div className="text-center py-12 border border-dashed border-outline rounded-xl bg-surface p-8">
          <Users className="mx-auto h-12 w-12 text-on-surface-variant/30" />
          <h3 className="mt-4 text-sm font-semibold text-on-surface">No se encontraron empleados</h3>
          <p className="mt-1 text-xs text-on-surface-variant/70">Comienza agregando tu primer colaborador administrativo o de taller.</p>
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden">
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-slate-50/80 border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-2.5 text-[10px] font-bold text-slate-500 uppercase tracking-widest whitespace-nowrap">Código</th>
                    <th className="px-4 py-2.5 text-[10px] font-bold text-slate-500 uppercase tracking-widest whitespace-nowrap">Nombre</th>
                    <th className="px-4 py-2.5 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Cédula</th>
                    <th className="px-4 py-2.5 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Departamento / Cargo</th>
                    <th className="px-4 py-2.5 text-[10px] font-bold text-slate-500 uppercase tracking-widest text-right">Salario</th>
                    <th className="px-4 py-2.5 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Contrato</th>
                    <th className="px-4 py-2.5 text-[10px] font-bold text-slate-500 uppercase tracking-widest text-center">Estado</th>
                    <th className="px-4 py-2.5 text-[10px] font-bold text-slate-500 uppercase tracking-widest text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {pagedEmployees.map((emp) => (
                    <tr key={emp.id} className="hover:bg-[#C5A059]/5 transition-colors group">
                      <td className="px-4 py-2 align-middle text-xs font-mono font-bold text-[#003366]">{emp.employeeCode}</td>
                      <td className="px-4 py-2 align-middle text-xs font-semibold text-slate-700">{emp.firstName} {emp.lastName}</td>
                      <td className="px-4 py-2 align-middle text-xs font-mono text-slate-600">{emp.cedula.replace(/(\d{3})(\d{7})(\d{1})/, '$1-$2-$3')}</td>
                      <td className="px-4 py-2 align-middle text-xs">
                        <div className="flex flex-col text-[11px] text-slate-600">
                          <span className="font-semibold text-[#003366]">{departments.find(d => d.id === emp.departmentId)?.name || 'General'}</span>
                          <span className="text-[10px] text-slate-400">{positions.find(p => p.id === emp.positionId)?.name || 'Sin Puesto'}</span>
                        </div>
                      </td>
                      <td className="px-4 py-2 align-middle text-right text-xs font-bold text-[#003366] font-mono">{parseFloat(emp.salary).toLocaleString('es-DO', { style: 'currency', currency: 'DOP' })}</td>
                      <td className="px-4 py-2 align-middle text-xs text-slate-600 capitalize">{emp.contractType}</td>
                      <td className="px-4 py-2 align-middle text-center">
                        <span className={`inline-flex px-2 py-0.5 rounded text-[10px] font-bold uppercase ${emp.status === 'active' 
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' 
                          : 'bg-slate-50 text-slate-500 border border-slate-200'
                          }`}>
                          {emp.status === 'active' ? 'Activo' : 'Inactivo'}
                        </span>
                      </td>
                      <td className="px-4 py-2 align-middle text-right">
                        <div className="flex gap-1 justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => handleOpenEdit(emp)}
                            className="p-1.5 text-slate-500 hover:text-[#003366] hover:bg-[#003366]/5 rounded-lg transition-colors"
                            title="Editar"
                          >
                            <Edit2 className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => handleDelete(emp.id)}
                            className="p-1.5 text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
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

            {/* Pagination Toolbar */}
            <div className="p-4 border-t border-slate-200 flex items-center justify-between bg-slate-50/50">
              <p className="text-xs text-slate-500 font-medium">
                Mostrando <span className="font-bold text-slate-800">{pagedEmployees.length}</span> de <span className="font-bold text-slate-800">{employeesList.length}</span> empleados
              </p>
              {totalPages > 1 && (
                <div className="flex items-center gap-2">
                  <button
                    disabled={page <= 1}
                    onClick={() => setPage(page - 1)}
                    type="button"
                    className="px-3 py-1.5 bg-[#003366]/10 hover:bg-[#003366]/20 text-[#003366] text-xs font-bold rounded-lg disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer"
                  >
                    Anterior
                  </button>
                  <span className="text-xs text-slate-500 font-bold px-2">
                    Pág. {page} de {totalPages}
                  </span>
                  <button
                    disabled={page >= totalPages}
                    onClick={() => setPage(page + 1)}
                    type="button"
                    className="px-3 py-1.5 bg-[#003366]/10 hover:bg-[#003366]/20 text-[#003366] text-xs font-bold rounded-lg disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer"
                  >
                    Siguiente
                  </button>
                </div>
              )}
            </div>
          </>
        </div>
      )}

      {/* Modal Form */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs overflow-y-auto">
          <div className="bg-surface border border-outline rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl p-6 relative">
            <button
              onClick={() => setShowModal(false)}
              className="absolute right-4 top-4 p-1 rounded-full hover:bg-surface-variant transition-colors text-on-surface-variant"
            >
              <X className="h-5 w-5" />
            </button>

            <h2 className="text-lg font-bold text-on-surface mb-4 flex items-center gap-2 border-b border-outline/50 pb-2">
              <Users className="h-5 w-5 text-primary" /> {editId ? 'Editar Empleado' : 'Registrar Nuevo Empleado'}
            </h2>

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Personal Section */}
              <div className="space-y-3">
                <h3 className="text-xs font-semibold text-primary uppercase tracking-wider">1. Datos Personales</h3>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-on-surface-variant">Nombre</label>
                    <input
                      type="text"
                      required
                      value={formData.firstName}
                      onChange={e => setFormData({ ...formData, firstName: e.target.value })}
                      className="w-full bg-surface border border-outline rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-primary text-on-surface"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-on-surface-variant">Apellido</label>
                    <input
                      type="text"
                      required
                      value={formData.lastName}
                      onChange={e => setFormData({ ...formData, lastName: e.target.value })}
                      className="w-full bg-surface border border-outline rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-primary text-on-surface"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-on-surface-variant">Cédula Dominicana</label>
                    <input
                      type="text"
                      required
                      placeholder="Ej. 00112345678"
                      value={formData.cedula}
                      onChange={e => setFormData({ ...formData, cedula: e.target.value })}
                      className="w-full bg-surface border border-outline rounded-lg px-3 py-1.5 text-sm font-mono focus:outline-none focus:border-primary text-on-surface"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-on-surface-variant">Fecha de Nacimiento</label>
                    <input
                      type="date"
                      required
                      value={formData.birthDate}
                      onChange={e => setFormData({ ...formData, birthDate: e.target.value })}
                      className="w-full bg-surface border border-outline rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-primary text-on-surface"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-on-surface-variant">Género</label>
                    <select
                      value={formData.gender}
                      onChange={e => setFormData({ ...formData, gender: e.target.value })}
                      className="w-full bg-surface border border-outline rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-primary text-on-surface"
                    >
                      <option value="masculino">Masculino</option>
                      <option value="femenino">Femenino</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-on-surface-variant">Estado Civil</label>
                    <select
                      value={formData.civilStatus}
                      onChange={e => setFormData({ ...formData, civilStatus: e.target.value })}
                      className="w-full bg-surface border border-outline rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-primary text-on-surface"
                    >
                      <option value="soltero">Soltero/a</option>
                      <option value="casado">Casado/a</option>
                      <option value="divorciado">Divorciado/a</option>
                      <option value="viudo">Viudo/a</option>
                      <option value="union_libre">Unión Libre</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-on-surface-variant">Correo Electrónico</label>
                    <input
                      type="email"
                      value={formData.email}
                      onChange={e => setFormData({ ...formData, email: e.target.value })}
                      className="w-full bg-surface border border-outline rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-primary text-on-surface"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-on-surface-variant">Teléfono</label>
                    <input
                      type="text"
                      value={formData.phone}
                      onChange={e => setFormData({ ...formData, phone: e.target.value })}
                      className="w-full bg-surface border border-outline rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-primary text-on-surface"
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-on-surface-variant">Dirección Completa</label>
                  <textarea
                    rows={2}
                    value={formData.address}
                    onChange={e => setFormData({ ...formData, address: e.target.value })}
                    className="w-full bg-surface border border-outline rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-primary text-on-surface"
                  />
                </div>
              </div>

              {/* Job Section */}
              <div className="space-y-3 pt-2 border-t border-outline/40">
                <h3 className="text-xs font-semibold text-primary uppercase tracking-wider">2. Datos Laborales</h3>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-on-surface-variant">Código Empleado</label>
                    <input
                      type="text"
                      required
                      value={formData.employeeCode}
                      onChange={e => setFormData({ ...formData, employeeCode: e.target.value })}
                      className="w-full bg-surface border border-outline rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-primary text-on-surface"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-on-surface-variant">Tipo Contrato</label>
                    <select
                      value={formData.contractType}
                      onChange={e => setFormData({ ...formData, contractType: e.target.value })}
                      className="w-full bg-surface border border-outline rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-primary text-on-surface"
                    >
                      <option value="fijo">Fijo</option>
                      <option value="indefinido">Indefinido</option>
                      <option value="temporal">Temporal</option>
                      <option value="por_obra">Por Obra</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-on-surface-variant">Departamento</label>
                    <select
                      value={formData.departmentId}
                      onChange={e => setFormData({ ...formData, departmentId: e.target.value })}
                      className="w-full bg-surface border border-outline rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-primary text-on-surface"
                    >
                      <option value="">Ninguno / General</option>
                      {departments.map(d => (
                        <option key={d.id} value={d.id}>{d.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-on-surface-variant">Cargo / Puesto</label>
                    <select
                      value={formData.positionId}
                      onChange={e => setFormData({ ...formData, positionId: e.target.value })}
                      className="w-full bg-surface border border-outline rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-primary text-on-surface"
                    >
                      <option value="">Ninguno / General</option>
                      {positions.map(p => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-on-surface-variant">Salario Base Mensual (DOP)</label>
                    <input
                      type="number"
                      required
                      value={formData.salary}
                      onChange={e => setFormData({ ...formData, salary: parseFloat(e.target.value) || 0 })}
                      className="w-full bg-surface border border-outline rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-primary text-on-surface"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-on-surface-variant">Frecuencia de Pago</label>
                    <select
                      value={formData.paymentFrequency}
                      onChange={e => setFormData({ ...formData, paymentFrequency: e.target.value })}
                      className="w-full bg-surface border border-outline rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-primary text-on-surface"
                    >
                      <option value="mensual">Mensual</option>
                      <option value="quincenal">Quincenal</option>
                      <option value="semanal">Semanal</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-on-surface-variant">Fecha de Ingreso</label>
                    <input
                      type="date"
                      required
                      value={formData.hireDate}
                      onChange={e => setFormData({ ...formData, hireDate: e.target.value })}
                      className="w-full bg-surface border border-outline rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-primary text-on-surface"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-on-surface-variant">Estado Laboral</label>
                    <select
                      value={formData.status}
                      onChange={e => setFormData({ ...formData, status: e.target.value })}
                      className="w-full bg-surface border border-outline rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-primary text-on-surface"
                    >
                      <option value="active">Activo</option>
                      <option value="inactive">Inactivo</option>
                      <option value="suspended">Suspendido</option>
                      <option value="cancelled">Cancelado</option>
                    </select>
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-outline/40">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 border border-outline hover:bg-surface-variant rounded-lg text-sm text-on-surface"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 bg-primary hover:bg-primary-variant text-on-primary font-semibold rounded-lg text-sm transition-all"
                >
                  {submitting ? 'Guardando...' : 'Guardar Empleado'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>

  );
}
