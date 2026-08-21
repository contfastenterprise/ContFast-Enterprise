import Link from 'next/link';
import { Package, User, ShoppingCart, LogIn } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function StorefrontLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col bg-slate-50 font-sans">
      {/* Header */}
      <header className="sticky top-0 z-50 w-full border-b border-slate-200 bg-white/80 backdrop-blur-md shadow-sm">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16 md:h-20">
            {/* Logo */}
            <div className="flex-shrink-0 flex items-center gap-2">
              <Link href="/" className="flex items-center gap-2 hover:opacity-90 transition-opacity">
                <div className="bg-[#001e40] text-white p-2 rounded-lg">
                  <Package className="h-6 w-6" />
                </div>
                <span className="font-bold text-xl tracking-tight text-[#001e40] hidden sm:block">
                  ContFast
                </span>
                <span className="font-semibold text-[#c5a059] text-xl hidden sm:block">
                  Store
                </span>
              </Link>
            </div>

            {/* Navigation Desktop */}
            <nav className="hidden md:flex items-center gap-8 font-medium text-slate-600">
              <Link href="/" className="hover:text-[#001e40] transition-colors">Inicio</Link>
              <Link href="/productos" className="hover:text-[#001e40] transition-colors">Productos</Link>
              <Link href="/promociones" className="hover:text-[#c5a059] transition-colors">Promociones</Link>
            </nav>

            {/* Actions */}
            <div className="flex items-center gap-3">
              <Link href="/mi-cotizacion">
                <Button variant="ghost" className="relative text-slate-600 hover:text-[#001e40] hover:bg-slate-100">
                  <ShoppingCart className="h-5 w-5 mr-2" />
                  <span className="hidden sm:inline">Mi Cotización</span>
                  {/* Badge para el carrito, se implementará luego */}
                </Button>
              </Link>
              <div className="h-6 w-px bg-slate-200 hidden sm:block mx-2"></div>
              <Link href="/login">
                <Button className="bg-[#001e40] hover:bg-[#00142a] text-white">
                  <User className="h-4 w-4 mr-2" />
                  Mi Cuenta
                </Button>
              </Link>
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
                <span className="font-bold text-xl text-white tracking-tight">ContFast</span>
              </div>
              <p className="text-sm text-slate-400">
                Fabricamos soluciones de alta calidad para tu espacio. Puertas, ventanas, closets y gabinetes.
              </p>
            </div>
            
            <div>
              <h3 className="font-semibold text-white mb-4">Categorías</h3>
              <ul className="space-y-2 text-sm">
                <li><Link href="/productos?categoria=puertas" className="hover:text-[#c5a059] transition-colors">Puertas</Link></li>
                <li><Link href="/productos?categoria=ventanas" className="hover:text-[#c5a059] transition-colors">Ventanas</Link></li>
                <li><Link href="/productos?categoria=closets" className="hover:text-[#c5a059] transition-colors">Closets</Link></li>
                <li><Link href="/productos?categoria=gabinetes" className="hover:text-[#c5a059] transition-colors">Gabinetes</Link></li>
              </ul>
            </div>

            <div>
              <h3 className="font-semibold text-white mb-4">Soporte</h3>
              <ul className="space-y-2 text-sm">
                <li><Link href="/contacto" className="hover:text-[#c5a059] transition-colors">Contacto</Link></li>
                <li><Link href="/preguntas-frecuentes" className="hover:text-[#c5a059] transition-colors">Preguntas Frecuentes</Link></li>
                <li><Link href="/terminos" className="hover:text-[#c5a059] transition-colors">Términos y Condiciones</Link></li>
              </ul>
            </div>

            <div>
              <h3 className="font-semibold text-white mb-4">Administración</h3>
              <ul className="space-y-2 text-sm">
                <li>
                  {/* Este es el enlace discreto que solicitó el usuario */}
                  <Link href="/dashboard" className="flex items-center hover:text-[#c5a059] transition-colors">
                    <LogIn className="h-4 w-4 mr-2" />
                    Portal Administrativo
                  </Link>
                </li>
              </ul>
            </div>
          </div>
          
          <div className="border-t border-white/10 mt-12 pt-8 flex flex-col md:flex-row justify-between items-center text-xs text-slate-500">
            <p>&copy; {new Date().getFullYear()} ContFast Enterprise. Todos los derechos reservados.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
