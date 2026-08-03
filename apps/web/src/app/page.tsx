'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { RutaPrivada } from '@/componentes/ruta-privada';

/**
 * La raiz no tiene contenido propio: reparte.
 *
 * Va envuelta en `RutaPrivada` para no duplicar aqui los estados de sesion —sin
 * conexion, sin gimnasios, elegir gimnasio—, que son los mismos. Cuando todo
 * esta en orden, lleva a la primera seccion.
 */
export default function Inicio() {
  return (
    <RutaPrivada>
      <ALaPrimeraSeccion />
    </RutaPrivada>
  );
}

function ALaPrimeraSeccion() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/socios');
  }, [router]);

  return null;
}
