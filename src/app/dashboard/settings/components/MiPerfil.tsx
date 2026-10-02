/**
 * Configuracion > Mi Perfil: la foto y los datos del usuario.
 * Sale de `settings/page.tsx` en el lote 238, movido tal cual: solo pinta.
 */
import { User } from 'lucide-react';
import AvatarUploader from '@/components/ui/AvatarUploader';
import type { Ajustes } from '../hooks/useAjustes';

export function MiPerfil({ a, usuario }: { a: Ajustes; usuario: NonNullable<Ajustes['currentUser']> }) {
  return (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-1">
              <h3 className="text-lg font-bold text-[#003366] mb-4">Foto de Perfil</h3>
              <AvatarUploader
                userId={usuario.id}
                userName={usuario.name}
                currentAvatarUrl={usuario.avatarUrl}
                currentAvatarPath={usuario.avatarPath}
                onUploadSuccess={(url, path) => {
                  a.setCurrentUser(prev => prev ? { ...prev, avatarUrl: url, avatarPath: path } : null);
                  // Actualizar localStorage o forzar actualización si es necesario
                  if (typeof window !== 'undefined') {
                    const stored = localStorage.getItem('cf_user');
                    if (stored) {
                      try {
                        const parsed = JSON.parse(stored);
                        parsed.avatarUrl = url;
                        parsed.avatarPath = path;
                        localStorage.setItem('cf_user', JSON.stringify(parsed));
                      } catch (e) { }
                    }
                  }
                }}
                onDeleteSuccess={() => {
                  a.setCurrentUser(prev => prev ? { ...prev, avatarUrl: null, avatarPath: null } : null);
                  if (typeof window !== 'undefined') {
                    const stored = localStorage.getItem('cf_user');
                    if (stored) {
                      try {
                        const parsed = JSON.parse(stored);
                        parsed.avatarUrl = null;
                        parsed.avatarPath = null;
                        localStorage.setItem('cf_user', JSON.stringify(parsed));
                      } catch (e) { }
                    }
                  }
                }}
              />
            </div>

            <div className="md:col-span-2 bg-white rounded-xl shadow-sm border border-slate-200 p-4 space-y-4">
              <h3 className="text-lg font-bold text-slate-800 border-b pb-2 flex items-center gap-2">
                <User className="w-5 h-5 text-[#003366]" /> Datos del Usuario
              </h3>
              <div className="space-y-3">
                <div>
                  <span className="block text-xs font-bold text-slate-400 uppercase tracking-wider">Nombre</span>
                  <span className="text-sm font-semibold text-slate-800">{usuario.name}</span>
                </div>
                <div>
                  <span className="block text-xs font-bold text-slate-400 uppercase tracking-wider">Correo Electrónico</span>
                  <span className="text-sm font-semibold text-slate-800">{usuario.email}</span>
                </div>
                <div>
                  <span className="block text-xs font-bold text-slate-400 uppercase tracking-wider">Rol de Sistema</span>
                  <span className="text-sm font-semibold uppercase text-[#003366] bg-[#003366]/5 px-2.5 py-1 rounded-md inline-block mt-1">
                    {a.userRole}
                  </span>
                </div>
              </div>
            </div>
          </div>
  );
}
