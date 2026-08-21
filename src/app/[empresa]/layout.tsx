import Link from 'next/link';
import { Package, User, ShoppingCart, LogIn, Phone, Mail, MapPin } from 'lucide-react';
import { Button } from '@/components/storefront/ui/client-button';
import CartBadgeClient from '@/components/storefront/CartBadgeClient';
import HeaderAuthClient from '@/components/storefront/HeaderAuthClient';
import { StorefrontCompanyService } from '@/services/storefront/companyService';
import { StorefrontProductService } from '@/services/storefront/productService';
import { notFound } from 'next/navigation';
import { Metadata } from 'next';

export async function generateMetadata({ params }: { params: Promise<{ empresa: string }> }): Promise<Metadata> {
  const resolvedParams = await params;
  const company = await StorefrontCompanyService.resolveCompanyBySlug(resolvedParams.empresa);
  return {
    title: company ? `${company.name} | Tienda en Línea` : 'Tienda en Línea',
    description: company ? `Catálogo de productos de ${company.name}` : 'Catálogo de productos',
  };
}

export default async function StorefrontLayout({ 
  children,
  params
}: { 
  children: React.ReactNode,
  params: Promise<{ empresa: string }>
}) {
  const resolvedParams = await params;
  const empresaSlug = resolvedParams.empresa;

  const company = await StorefrontCompanyService.resolveCompanyBySlug(empresaSlug);
  if (!company) {
    notFound();
  }

  const categories = await StorefrontProductService.getActiveCategories(company.id);

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 font-sans">
      {/* Header */}
      <header className="sticky top-0 z-50 w-full border-b border-slate-200 bg-white/80 backdrop-blur-md shadow-sm">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16 md:h-20">
            {/* Logo */}
            <div className="flex-shrink-0 flex items-center gap-2">
              <Link href={`/${empresaSlug}`} className="flex items-center gap-2 hover:opacity-90 transition-opacity">
                {company.logoUrl ? (
                  <img src={company.logoUrl} alt={company.name} className="h-12 md:h-14 w-auto object-contain" />
                ) : (
                  <>
                    <div className="bg-[#001e40] text-white p-2 rounded-lg">
                      <Package className="h-6 w-6" />
                    </div>
                    <span className="font-bold text-xl tracking-tight text-[#001e40] hidden sm:block max-w-[200px] truncate" title={company.name}>
                      {company.name}
                    </span>
                  </>
                )}
              </Link>
            </div>

            {/* Navigation Desktop */}
            <nav className="hidden md:flex items-center gap-8 font-medium text-slate-600">
              <Link href={`/${empresaSlug}`} className="hover:text-[#001e40] transition-colors">Inicio</Link>
              <Link href={`/${empresaSlug}/productos`} className="hover:text-[#001e40] transition-colors">Productos</Link>
              <Link href={`/${empresaSlug}/promociones`} className="hover:text-[#c5a059] transition-colors">Promociones</Link>
            </nav>

            {/* Actions */}
            <div className="flex items-center gap-3">
              <Link href={`/${empresaSlug}/mi-cotizacion`}>
                <Button variant="ghost" className="relative text-slate-600 hover:text-[#001e40] hover:bg-slate-100">
                  <ShoppingCart className="h-5 w-5 mr-2" />
                  <span className="hidden sm:inline">Mi Cotización</span>
                  <CartBadgeClient />
                </Button>
              </Link>
              <div className="h-6 w-px bg-slate-200 hidden sm:block mx-2"></div>
              <HeaderAuthClient empresaSlug={empresaSlug} />
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-grow">
        {children}
      </main>

      {/* Footer */}
      <footer className="bg-[#001e40] text-slate-300 py-12 border-t border-[#00142a]">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <div className="bg-white/10 p-2 rounded-lg">
                  <Package className="h-6 w-6 text-white" />
                </div>
                <span className="font-bold text-xl text-white tracking-tight line-clamp-1">{company.name}</span>
              </div>
              <p className="text-sm text-slate-400">
                Fabricamos soluciones de alta calidad para tu espacio. RNC: {company.rnc}
              </p>
              
              <div className="space-y-2 mt-4 text-sm text-slate-400">
                {company.phone && (
                  <div className="flex items-center gap-2">
                    <Phone className="h-4 w-4" />
                    <span>{company.phone}</span>
                  </div>
                )}
                {company.email && (
                  <div className="flex items-center gap-2">
                    <Mail className="h-4 w-4" />
                    <span>{company.email}</span>
                  </div>
                )}
                {company.address && (
                  <div className="flex items-center gap-2">
                    <MapPin className="h-4 w-4 shrink-0" />
                    <span className="line-clamp-2">{company.address}</span>
                  </div>
                )}
              </div>
            </div>
            
            <div>
              <h3 className="font-semibold text-white mb-4">Catálogo</h3>
              <ul className="space-y-2 text-sm">
                <li><Link href={`/${empresaSlug}/productos`} className="hover:text-[#c5a059] transition-colors">Todos los Productos</Link></li>
                {categories.slice(0, 5).map(cat => (
                  <li key={cat.id}>
                    <Link href={`/${empresaSlug}/productos?categoria=${cat.id}`} className="hover:text-[#c5a059] transition-colors line-clamp-1" title={cat.name}>
                      {cat.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <h3 className="font-semibold text-white mb-4">Soporte</h3>
              <ul className="space-y-2 text-sm">
                <li><Link href={`/${empresaSlug}/contacto`} className="hover:text-[#c5a059] transition-colors">Contacto</Link></li>
                <li><Link href={`/${empresaSlug}/preguntas-frecuentes`} className="hover:text-[#c5a059] transition-colors">Preguntas Frecuentes</Link></li>
                <li><Link href={`/${empresaSlug}/terminos`} className="hover:text-[#c5a059] transition-colors">Términos y Condiciones</Link></li>
              </ul>
            </div>

            <div>
              <h3 className="font-semibold text-white mb-4">Administración</h3>
              <ul className="space-y-2 text-sm">
                <li>
                  <Link href="/dashboard" className="flex items-center text-slate-500 hover:text-white transition-colors" target="_blank" rel="noopener noreferrer">
                    <LogIn className="h-4 w-4 mr-2" />
                    Portal Administrativo
                  </Link>
                </li>
              </ul>
            </div>
          </div>
          
          <div className="border-t border-[#00142a] mt-12 pt-8 text-center text-sm text-slate-500 flex justify-between items-center">
            <p>&copy; {new Date().getFullYear()} {company.name}. Todos los derechos reservados.</p>
            <p>Powered by <span className="font-bold text-white">ContFast</span></p>
          </div>
        </div>
      </footer>
    </div>
  );
}
