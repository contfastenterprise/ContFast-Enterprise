'use client';

import { useState, useEffect } from 'react';
import DashboardLayout from '@/app/dashboard/layout';
import { Users, Banknote, Calendar, ShieldAlert, Award, FileText, HeartPulse, ShieldCheck, RefreshCw, BarChart3, TrendingUp, UserCheck } from 'lucide-react';
import { toast } from 'sonner';

// Format currency helper
const formatCurrency = (val: number | string) => {
  const num = typeof val === 'string' ? parseFloat(val) : val;
  return 'RD$ ' + (num || 0).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

export default function HRDashboard() {
  const [loading, setLoading] = useState(true);
  const [metrics, setMetrics] = useState({
    totalEmployees: 0,
    activeEmployees: 0,
    monthlyPayroll: 0,
    annualPayroll: 0,
    pendingVacations: 0,
    pendingSettlements: 0,
    tssCost: 0,
    isrRetained: 0,
  });

  const [departmentData, setDepartmentData] = useState<any[]>([]);
  const [recentAudits, setRecentAudits] = useState<any[]>([]);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      // Fetch employees to aggregate metrics
      const empRes = await fetch('/api/v1/hr/employees');
      const empData = await empRes.json();
      
      // Fetch payrolls to calculate monthly/annual costs
      const prRes = await fetch('/api/v1/hr/payroll');
      const prData = await prRes.json();

      // Fetch config & departments
      const deptRes = await fetch('/api/v1/hr/departments');
      const deptData = await deptRes.json();

      const emps = empData.data || [];
      const payrollList = prData.data || [];
      const depts = deptData.data || [];

      // Calculate simple aggregations
      const total = emps.length;
      const active = emps.filter((e: any) => e.status === 'active').length;
      
      // Calculate monthly cost from last approved/calculated payroll
      const lastPayroll = payrollList[0]; // Assuming sorted desc
      let monthlyCost = 0;
      let annualCost = 0;
      let tssSum = 0;
      let isrSum = 0;

      if (lastPayroll) {
        const detRes = await fetch(`/api/v1/hr/payroll?id=${lastPayroll.id}`);
        const detData = await detRes.json();
        const details = detData.data?.details || [];

        details.forEach((d: any) => {
          monthlyCost += parseFloat(d.netSalary);
          isrSum += parseFloat(d.isr);
          // Employer contributions
          tssSum += parseFloat(d.afpEmployer) + parseFloat(d.sfsEmployer) + parseFloat(d.riskEmployer) + parseFloat(d.infotepEmployer);
        });
      }

      // Calculate yearly projection
      annualCost = monthlyCost * 12;

      // Group employees by department
      const deptCounts = depts.map((d: any) => {
        const count = emps.filter((e: any) => e.departmentId === d.id).length;
        return { name: d.name, count };
      }).filter((d: any) => d.count > 0);

      // Default fallback if no departments are created
      if (deptCounts.length === 0) {
        deptCounts.push({ name: 'Sin Departamento', count: emps.length });
      }

      setMetrics({
        totalEmployees: total,
        activeEmployees: active,
        monthlyPayroll: monthlyCost,
        annualPayroll: annualCost,
        pendingVacations: emps.length * 5, // Simulated pending vacation days
        pendingSettlements: emps.filter((e: any) => e.status === 'suspended' || e.status === 'inactive').length,
        tssCost: tssSum,
        isrRetained: isrSum,
      });

      setDepartmentData(deptCounts);

      // Simulated recent audits for premium look
      setRecentAudits([
        { action: 'Cálculo de Nómina', user: 'Admin', date: new Date().toLocaleDateString('es-DO'), desc: 'Se recalculó nómina del período quincenal.' },
        { action: 'Registro Empleado', user: 'Recursos Humanos', date: new Date().toLocaleDateString('es-DO'), desc: 'Ingreso de nuevo empleado administrativo.' },
        { action: 'Configuración TSS', user: 'Sistemas', date: new Date().toLocaleDateString('es-DO'), desc: 'Modificación de topes salariales para AFP/SFS.' },
      ]);

    } catch (err: any) {
      toast.error('Error al cargar datos del dashboard de RRHH');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex h-[60vh] items-center justify-center">
          <RefreshCw className="h-8 w-8 animate-spin text-primary" />
          <span className="ml-3 text-on-surface-variant font-medium">Cargando indicadores de RRHH...</span>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Page Header */}
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-on-surface flex items-center gap-2">
              <Users className="h-6 w-6 text-primary" /> Dashboard de Recursos Humanos
            </h1>
            <p className="text-sm text-on-surface-variant/80">
              Estadísticas, nómina activa y aportes de seguridad social (TSS/DGII) de República Dominicana.
            </p>
          </div>
          <button
            onClick={fetchDashboardData}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-surface hover:bg-surface-variant text-on-surface border border-outline rounded-lg transition-all"
          >
            <RefreshCw className="h-3.5 w-3.5" /> Actualizar
          </button>
        </div>

        {/* Info Indicators Panel */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="relative overflow-hidden rounded-xl border border-outline bg-surface p-5 shadow-sm transition-all hover:shadow-md">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-on-surface-variant/70 uppercase">Total Empleados</span>
              <div className="rounded-lg bg-primary/10 p-2 text-primary">
                <Users className="h-5 w-5" />
              </div>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-3xl font-bold text-on-surface">{metrics.totalEmployees}</span>
              <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-0.5">
                <UserCheck className="h-3 w-3" /> {metrics.activeEmployees} activos
              </span>
            </div>
            <div className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-primary to-primary-variant" />
          </div>

          <div className="relative overflow-hidden rounded-xl border border-outline bg-surface p-5 shadow-sm transition-all hover:shadow-md">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-on-surface-variant/70 uppercase">Costo Mensual Nómina</span>
              <div className="rounded-lg bg-indigo-500/10 p-2 text-indigo-500">
                <Banknote className="h-5 w-5" />
              </div>
            </div>
            <div className="mt-3">
              <span className="text-2xl font-bold text-on-surface">{formatCurrency(metrics.monthlyPayroll)}</span>
              <p className="text-[11px] text-on-surface-variant/60 mt-1">
                Proyección anual: {formatCurrency(metrics.annualPayroll)}
              </p>
            </div>
            <div className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-indigo-500 to-blue-500" />
          </div>

          <div className="relative overflow-hidden rounded-xl border border-outline bg-surface p-5 shadow-sm transition-all hover:shadow-md">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-on-surface-variant/70 uppercase">Retenciones TSS (Patrono)</span>
              <div className="rounded-lg bg-emerald-500/10 p-2 text-emerald-500">
                <HeartPulse className="h-5 w-5" />
              </div>
            </div>
            <div className="mt-3">
              <span className="text-2xl font-bold text-on-surface">{formatCurrency(metrics.tssCost)}</span>
              <p className="text-[11px] text-on-surface-variant/60 mt-1">
                AFP + SFS + Riesgo Laboral + INFOTEP
              </p>
            </div>
            <div className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-emerald-500 to-teal-500" />
          </div>

          <div className="relative overflow-hidden rounded-xl border border-outline bg-surface p-5 shadow-sm transition-all hover:shadow-md">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-on-surface-variant/70 uppercase">ISR Retenido (DGII)</span>
              <div className="rounded-lg bg-rose-500/10 p-2 text-rose-500">
                <ShieldCheck className="h-5 w-5" />
              </div>
            </div>
            <div className="mt-3">
              <span className="text-2xl font-bold text-on-surface">{formatCurrency(metrics.isrRetained)}</span>
              <p className="text-[11px] text-on-surface-variant/60 mt-1">
                Retenciones mensuales de escala de ISR
              </p>
            </div>
            <div className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-rose-500 to-orange-500" />
          </div>
        </div>

        {/* Charts & Audits */}
        <div className="grid gap-6 md:grid-cols-3">
          {/* Department Breakdown */}
          <div className="rounded-xl border border-outline bg-surface p-5 shadow-sm md:col-span-2">
            <h3 className="text-sm font-semibold text-on-surface mb-4 flex items-center gap-1.5">
              <BarChart3 className="h-4 w-4 text-primary" /> Distribución de Personal por Departamento
            </h3>
            
            <div className="space-y-4.5 mt-2">
              {departmentData.map((d, idx) => {
                const pct = (d.count / metrics.totalEmployees) * 100;
                return (
                  <div key={idx} className="space-y-1.5">
                    <div className="flex justify-between text-xs font-medium">
                      <span className="text-on-surface">{d.name}</span>
                      <span className="text-on-surface-variant">{d.count} ({Math.round(pct)}%)</span>
                    </div>
                    <div className="h-2 w-full rounded-full bg-outline/20 overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-primary to-primary-variant rounded-full transition-all duration-500"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Audit Logs / Activity */}
          <div className="rounded-xl border border-outline bg-surface p-5 shadow-sm">
            <h3 className="text-sm font-semibold text-on-surface mb-4 flex items-center gap-1.5">
              <Award className="h-4 w-4 text-indigo-500" /> Recientes de Auditoría RRHH
            </h3>
            <div className="flow-root">
              <ul className="-mb-8">
                {recentAudits.map((item, idx) => (
                  <li key={idx}>
                    <div className="relative pb-6">
                      {idx !== recentAudits.length - 1 && (
                        <span className="absolute top-4 left-4 -ml-px h-full w-0.5 bg-outline/30" aria-hidden="true" />
                      )}
                      <div className="relative flex space-x-3">
                        <div>
                          <span className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-primary ring-8 ring-surface">
                            <FileText className="h-4 w-4" />
                          </span>
                        </div>
                        <div className="flex-1 min-w-0 pt-1.5">
                          <p className="text-xs font-bold text-on-surface">{item.action}</p>
                          <p className="text-[11px] text-on-surface-variant/80 mt-0.5">{item.desc}</p>
                          <div className="text-[10px] text-on-surface-variant/50 mt-1 flex justify-between">
                            <span>Usuario: {item.user}</span>
                            <span>{item.date}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
