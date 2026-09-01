import type { ReactNode } from 'react';
import { ProveedorDeSesion } from '../auth/sesion';

/**
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LA VERSION NATIVA: NO HAY VISTA PREVIA. ES EL PROVEEDOR DE VERDAD.      │
 * │                                                                          │
 * │ Metro elige `proveedor.web.tsx` al compilar para web y ESTE fichero para │
 * │ iOS y Android. Aqui no hay ni condicion que evaluar: en un telefono la    │
 * │ raiz monta `ProveedorDeSesion` y punto. El codigo de la vista previa y    │
 * │ sus datos de muestra no se empaquetan.                                   │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export function ProveedorRaiz({ children }: { children: ReactNode }) {
  return <ProveedorDeSesion>{children}</ProveedorDeSesion>;
}
