import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { ProveedorSesion } from '@/lib/sesion';
import './globals.css';

export const metadata: Metadata = {
  title: 'GYMLAB',
  description: 'Gestion de gimnasios',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es">
      <body>
        {/*
          La sesion se comprueba una vez, aqui arriba, y no en cada pantalla:
          asi al navegar entre secciones no se vuelve a preguntar al servidor ni
          parpadea el panel. Es lo unico que envuelve a toda la aplicacion.
        */}
        <ProveedorSesion>{children}</ProveedorSesion>
      </body>
    </html>
  );
}
