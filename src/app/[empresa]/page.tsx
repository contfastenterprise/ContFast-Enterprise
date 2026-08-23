import Link from 'next/link';
import { ArrowRight, ShoppingCart, ShieldCheck, Clock, Settings, Package } from 'lucide-react';
import { Button } from '@/components/storefront/ui/client-button';

export default async function StorefrontHomePage({ params }: { params: Promise<{ empresa: string }> }) {
  const resolvedParams = await params;
  const empresaSlug = resolvedParams.empresa;

  return (
    <div className="flex flex-col min-h-screen">
      {/* Hero Section */}
      <section className="relative bg-[#001e40] overflow-hidden py-20 lg:py-32">
        <div className="absolute inset-0 opacity-20">
          <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px]"></div>
        </div>
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 relative z-10 text-center">
          <h1 className="text-4xl md:text-5xl lg:text-7xl font-extrabold text-white mb-6 tracking-tight">
            Fabricamos soluciones para <br className="hidden md:block" />
            <span className="text-[#c5a059]">tu espacio</span>
          </h1>
          <p className="text-lg md:text-xl text-slate-300 max-w-2xl mx-auto mb-10">
            Descubre nuestro catálogo de puertas, ventanas, closets y gabinetes. Cotiza en línea rápida y fácilmente.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link href={`/${empresaSlug}/productos`}>
              <Button size="lg" className="bg-[#c5a059] hover:bg-[#b08c4a] text-slate-950 font-bold h-12 px-8">
                Ver productos
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
            </Link>
            <Link href={`/${empresaSlug}/mi-cotizacion`}>
              <Button size="lg" variant="outline" className="text-white border-slate-600 hover:bg-slate-800 h-12 px-8">
                <ShoppingCart className="mr-2 h-5 w-5" />
                Mi cotización
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-20 bg-white">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-[#001e40] mb-4">¿Por qué elegirnos?</h2>
            <p className="text-slate-500 max-w-2xl mx-auto">Nuestro compromiso es brindarte productos excepcionales y un servicio de primera calidad en cada proyecto.</p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-10">
            <div className="flex flex-col items-center text-center p-6 rounded-2xl bg-slate-50 border border-slate-100">
              <div className="h-14 w-14 rounded-full bg-[#001e40]/5 flex items-center justify-center mb-6 text-[#001e40]">
                <ShieldCheck className="h-7 w-7" />
              </div>
              <h3 className="text-xl font-bold text-slate-900 mb-3">Calidad Garantizada</h3>
              <p className="text-slate-600">Materiales seleccionados y acabados perfectos para asegurar la durabilidad de tus espacios.</p>
            </div>
            <div className="flex flex-col items-center text-center p-6 rounded-2xl bg-slate-50 border border-slate-100">
              <div className="h-14 w-14 rounded-full bg-[#c5a059]/10 flex items-center justify-center mb-6 text-[#c5a059]">
                <Settings className="h-7 w-7" />
              </div>
              <h3 className="text-xl font-bold text-slate-900 mb-3">Diseños a Medida</h3>
              <p className="text-slate-600">Soluciones adaptadas a tus necesidades. Cotiza tus productos estándar y solicita ajustes especiales.</p>
            </div>
            <div className="flex flex-col items-center text-center p-6 rounded-2xl bg-slate-50 border border-slate-100">
              <div className="h-14 w-14 rounded-full bg-[#001e40]/5 flex items-center justify-center mb-6 text-[#001e40]">
                <Clock className="h-7 w-7" />
              </div>
              <h3 className="text-xl font-bold text-slate-900 mb-3">Tiempos de Entrega</h3>
              <p className="text-slate-600">Compromiso real con los plazos acordados para la fabricación e instalación.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Categorías Principales */}
      <section className="py-20 bg-slate-50">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-[#001e40] mb-4">Nuestras Categorías</h2>
            <p className="text-slate-500 max-w-2xl mx-auto">
              Explora nuestra selección de productos diseñados para cada rincón de tu hogar o proyecto.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {/* Categoría Placeholder */}
            {[
              { title: 'Puertas', desc: 'Interiores y principales', id: 'puertas' },
              { title: 'Ventanas', desc: 'Corredizas y de aluminio', id: 'ventanas' },
              { title: 'Closets', desc: 'Organización a medida', id: 'closets' },
              { title: 'Gabinetes', desc: 'Cocinas y baños', id: 'gabinetes' },
            ].map((cat, i) => (
              <Link key={i} href={`/${empresaSlug}/productos?categoria=${cat.id}`} className="group relative rounded-2xl overflow-hidden aspect-[4/5] bg-white shadow-sm border border-slate-200">
                <div className="absolute inset-0 bg-slate-100 group-hover:scale-105 transition-transform duration-500 flex items-center justify-center text-slate-300">
                   {/* Imagen Placeholder */}
                   <Package className="h-20 w-20 opacity-20" />
                </div>
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
                <div className="absolute bottom-0 left-0 p-6">
                  <h3 className="text-2xl font-bold text-white mb-1">{cat.title}</h3>
                  <p className="text-white/80 text-sm">{cat.desc}</p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
