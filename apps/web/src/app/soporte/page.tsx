import type { Metadata } from 'next';
import Link from 'next/link';
import { CORREO_DE_SOPORTE } from '@/lib/contacto';
import estilos from '../privacidad/privacidad.module.css';

export const metadata: Metadata = {
  title: 'Soporte · RINDA',
  description: 'Cómo pedir ayuda con RINDA y qué puedes resolver tú.',
};

/**
 * La página de soporte, que las dos tiendas piden como URL pública.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ EL BUZÓN QUE APARECE AQUÍ EXISTE DE VERDAD (creado el 2026-09-16).      │
 * │                                                                          │
 * │ Durante un tiempo esta página no llevó ninguna dirección a propósito:    │
 * │ publicar un `soporte@…` que nadie lee es peor que no ponerlo, porque     │
 * │ quien escriba se queda esperando. Ahora está creado y atendido, y por    │
 * │ eso se muestra. Sale de `lib/contacto.ts`, que es el único sitio donde   │
 * │ se escribe.                                                              │
 * │                                                                          │
 * │ La página sigue resolviendo antes lo que puede resolver sola: a quién    │
 * │ preguntar cuando el problema es del gimnasio, y los dos caminos que no   │
 * │ necesitan a nadie —recuperar la contraseña y eliminar la cuenta—. El     │
 * │ correo es el último recurso, no el primero.                              │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Reutiliza los estilos de la política de privacidad: son la misma clase de
 * página —texto para leer— y darle una hoja propia sería copiarla entera para
 * que se separen a la primera de cambio.
 */
export default function SoportePage() {
  return (
    <main className={estilos.pagina}>
      <h1 className={estilos.titulo}>Soporte</h1>

      <section className={estilos.seccion}>
        <h2>Empieza por tu gimnasio</h2>
        <p>
          Casi todo lo que ves en RINDA lo gestiona <strong>tu gimnasio</strong>, no nosotros: tu
          cuota, tus pagos, tu rutina, tu entrenador asignado y tu acceso a la puerta.
        </p>
        <p>
          Si tu carné no abre, si una cuota no cuadra o si necesitas que alguien cambie tus datos,
          habla con la recepción de tu gimnasio: son quienes pueden resolverlo.
        </p>
      </section>

      <section className={estilos.seccion}>
        <h2>Lo que puedes resolver tú</h2>
        <ul>
          <li>
            <strong>No recuerdas tu contraseña:</strong>{' '}
            <Link href="/forgot-password">pide un enlace para cambiarla</Link>. Nadie puede
            reponértela, ni el dueño de tu gimnasio.
          </li>
          <li>
            <strong>Quieres que tus datos desaparezcan:</strong>{' '}
            <Link href="/eliminar-cuenta">elimina tu cuenta</Link>. Funciona también si ya
            desinstalaste la aplicación.
          </li>
          <li>
            <strong>Quieres saber qué datos se tratan:</strong> está en la{' '}
            <Link href="/privacidad">política de privacidad</Link>. Quién presta el servicio, en el{' '}
            <Link href="/aviso-legal">aviso legal</Link>.
          </li>
        </ul>
      </section>

      <section className={estilos.seccion}>
        <h2>Si el problema es de la aplicación</h2>
        <p>
          Si RINDA falla —una pantalla que no carga, algo que no se guarda, el escáner que no lee—,
          eso sí es nuestro. Escríbenos a <strong>{CORREO_DE_SOPORTE}</strong> contando qué hacías y
          qué esperabas que pasara.
        </p>
      </section>
    </main>
  );
}
