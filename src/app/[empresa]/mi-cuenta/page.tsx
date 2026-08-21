import { StorefrontCompanyService } from '@/services/storefront/companyService';
import { notFound } from 'next/navigation';
import { Metadata } from 'next';
import { db } from '@/db';
import { quotes } from '@/db/schema/invoices';
import { eq, and, desc } from 'drizzle-orm';
import { Package, FileText, Clock, CheckCircle, XCircle } from 'lucide-react';
import { Button } from '@/components/storefront/ui/client-button';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ empresa: string }> }): Promise<Metadata> {
  const resolvedParams = await params;
  const company = await StorefrontCompanyService.resolveCompanyBySlug(resolvedParams.empresa);
  return {
    title: `Mi Cuenta | ${company?.name || 'Tienda en Línea'}`,
  };
}

export default async function MiCuentaPage({ params }: { params: Promise<{ empresa: string }> }) {
  const resolvedParams = await params;
  const empresaSlug = resolvedParams.empresa;
  
  const company = await StorefrontCompanyService.resolveCompanyBySlug(empresaSlug);
  if (!company) notFound();

  // Validate session (this should ideally be protected by middleware but doing it here for simplicity)
  // Workaround since `getSession` requires a request, in Server Components we can use `cookies()` directly or mock it
  // But wait, the standard Next.js way to protect Server Component is to check auth inside it.
  // The system uses a JWT cookie `cf_access_token`. 
  // Wait, I can't easily read `req` here. I'll read from `cookies()`.
  
  const { cookies } = await import('next/headers');
  const cookieStore = await cookies();
  const token = cookieStore.get('accessToken')?.value;

  if (!token) {
    return (
      <div className="bg-slate-50 min-h-[60vh] py-20 flex flex-col items-center justify-center">
        <Package className="h-16 w-16 text-slate-300 mb-4" />
        <h2 className="text-2xl font-bold text-[#001e40] mb-2">Inicia Sesión</h2>
        <p className="text-slate-500 mb-6 text-center max-w-md">Para ver tus cotizaciones y el estado de tus órdenes, debes iniciar sesión.</p>
        <Link href={`/${empresaSlug}/login`}>
          <Button className="bg-[#001e40] hover:bg-[#00142a] text-white">Iniciar Sesión</Button>
        </Link>
      </div>
    );
  }

  // Parse token manually since we don't have the req object for the middleware
  let userId: string | null = null;
  let userName: string = 'Usuario';
  try {
    const [header, payload, sig] = token.split('.');
    const decoded = JSON.parse(Buffer.from(payload, 'base64').toString('utf8'));
    userId = decoded.userId;
    // user name might not be in the token, but we have userId
  } catch (e) {
    // Token invalido
  }

  if (!userId) {
    return (
      <div className="bg-slate-50 min-h-[60vh] py-20 flex flex-col items-center justify-center">
        <h2 className="text-2xl font-bold text-[#001e40] mb-2">Sesión Inválida</h2>
        <Link href={`/${empresaSlug}/login`}>
          <Button className="bg-[#001e40] text-white">Volver a Iniciar Sesión</Button>
        </Link>
      </div>
    );
  }

  // Load User Details
  const { users } = await import('@/db/schema/auth');
  const [userDb] = await db.select({ name: users.name }).from(users).where(eq(users.id, userId)).limit(1);
  if (userDb) {
    userName = userDb.name.split(' ')[0]; // Primer nombre
  }

  // Obtener cotizaciones del usuario
  const userQuotes = await db
    .select({
      id: quotes.id,
      sequenceNumber: quotes.sequenceNumber,
      status: quotes.status,
      total: quotes.total,
      createdAt: quotes.createdAt,
    })
    .from(quotes)
    .where(
      and(
        eq(quotes.companyId, company.id),
        eq(quotes.userId, userId)
      )
    )
    .orderBy(desc(quotes.createdAt));

  const getStatusBadge = (status: string) => {
    switch(status) {
      case 'pending':
        return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800"><Clock className="w-3 h-3 mr-1" /> Pendiente</span>;
      case 'invoiced':
        return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800"><CheckCircle className="w-3 h-3 mr-1" /> Facturada</span>;
      case 'cancelled':
        return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800"><XCircle className="w-3 h-3 mr-1" /> Cancelada</span>;
      default:
        return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-800">{status}</span>;
    }
  };

  return (
    <div className="bg-slate-50 min-h-screen py-10">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-5xl">
        <div className="flex flex-col md:flex-row md:items-end justify-between mb-8 gap-4">
          <div>
            <h1 className="text-3xl font-bold text-[#001e40]">Mi Cuenta</h1>
            <p className="text-slate-500 mt-1">Hola, <span className="font-medium text-[#c5a059]">{userName}</span>. Aquí puedes ver tu historial.</p>
          </div>
          <Link href={`/${empresaSlug}/productos`}>
            <Button variant="outline" className="border-slate-300 text-slate-700">Explorar más productos</Button>
          </Link>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="px-6 py-5 border-b border-slate-200 bg-slate-50/50">
            <h3 className="text-lg font-bold text-[#001e40] flex items-center">
              <FileText className="h-5 w-5 mr-2 text-[#c5a059]" />
              Mis Cotizaciones
            </h3>
          </div>
          
          {userQuotes.length === 0 ? (
            <div className="p-12 text-center">
              <FileText className="h-12 w-12 text-slate-300 mx-auto mb-3" />
              <p className="text-slate-500">Aún no has solicitado ninguna cotización.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm whitespace-nowrap">
                <thead className="bg-slate-50 text-slate-500 border-b border-slate-200">
                  <tr>
                    <th className="px-6 py-4 font-medium">Referencia</th>
                    <th className="px-6 py-4 font-medium">Fecha</th>
                    <th className="px-6 py-4 font-medium">Estado</th>
                    <th className="px-6 py-4 font-medium text-right">Total Estimado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {userQuotes.map((q) => (
                    <tr key={q.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-6 py-4 font-medium text-[#001e40]">{q.sequenceNumber}</td>
                      <td className="px-6 py-4 text-slate-500">
                        {new Date(q.createdAt).toLocaleDateString('es-DO', { year: 'numeric', month: 'long', day: 'numeric' })}
                      </td>
                      <td className="px-6 py-4">{getStatusBadge(q.status)}</td>
                      <td className="px-6 py-4 text-right font-bold text-slate-700">
                        RD$ {Number(q.total).toLocaleString('es-DO', { minimumFractionDigits: 2 })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
