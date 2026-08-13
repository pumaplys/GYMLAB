'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { RutaPrivada } from '@/componentes/ruta-privada';
import { inicioPara } from '@/lib/areas';
import { useSesion } from '@/lib/sesion';

/**
 * La raiz no tiene contenido propio: reparte.
 *
 * Va envuelta en `RutaPrivada` para no duplicar aqui los estados de sesion —sin
 * conexion, sin gimnasios, elegir gimnasio—, que son los mismos.
 */
export default function Inicio() {
  return (
    <RutaPrivada>
      <ASuArea />
    </RutaPrivada>
  );
}

/**
 * Cada rol a su area, y el rol es el de la pertenencia ACTIVA.
 *
 * Antes esto llevaba a `/socios` a fuego, que era correcto cuando el panel era
 * la unica aplicacion que existia. Ahora hay tres, y quien entra puede ser
 * entrenador o socio — o las dos cosas en gimnasios distintos.
 */
function ASuArea() {
  const router = useRouter();
  const { rol } = useSesion();

  useEffect(() => {
    // `RutaPrivada` ya garantiza que hay gimnasio activo, asi que aqui hay rol.
    if (rol) router.replace(inicioPara(rol));
  }, [rol, router]);

  return null;
}
