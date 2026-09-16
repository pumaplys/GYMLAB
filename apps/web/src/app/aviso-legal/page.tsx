import type { Metadata } from 'next';
import Link from 'next/link';
import { CORREO_DE_PRIVACIDAD, CORREO_DE_SOPORTE } from '@/lib/contacto';
import { PRESTADOR, hayIdentidad } from '@/lib/prestador';
import estilos from '../privacidad/privacidad.module.css';

export const metadata: Metadata = {
  title: 'Aviso legal · RINDA',
  description: 'Quién presta el servicio RINDA y cómo contactar.',
};

/**
 * El aviso legal: quien esta detras del servicio y donde encontrarle.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LOS DATOS NO ESTAN AQUI. Vienen de `lib/prestador.ts`, que los lee del   │
 * │ entorno de construccion. Esta pagina sabe MAQUETARLOS, no cuales son.    │
 * │                                                                          │
 * │ Y si faltan, lo dice. No hay texto de relleno, ni un NIF de ejemplo, ni  │
 * │ una razon social inventada: una pagina legal que miente es peor que una  │
 * │ que falta, porque la primera nadie la corrige.                            │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export default function AvisoLegalPage() {
  const identidad = hayIdentidad();

  return (
    <main className={estilos.pagina}>
      {!identidad && (
        <p className={estilos.borrador} role="status">
          <strong>Sin configurar.</strong> Este despliegue no lleva la identidad del prestador. No
          es una página válida todavía.
        </p>
      )}

      <h1 className={estilos.titulo}>Aviso legal</h1>

      <section className={estilos.seccion}>
        <h2>Quién presta el servicio</h2>
        {identidad ? (
          <>
            <p>
              RINDA es un servicio prestado por <strong>{PRESTADOR.nombre}</strong>, persona física.
            </p>
            <address className={estilos.domicilio}>
              {PRESTADOR.domicilio.map((linea) => (
                <span key={linea}>
                  {linea}
                  <br />
                </span>
              ))}
            </address>
            {PRESTADOR.nif ? (
              <p>
                Identificador fiscal: <strong>{PRESTADOR.nif}</strong>.
              </p>
            ) : (
              <p className={estilos.borrador}>
                <strong>Falta el identificador fiscal del prestador.</strong> Este aviso legal no
                está completo mientras esta línea siga aquí.
              </p>
            )}
          </>
        ) : (
          <p>Pendiente de configurar en el despliegue.</p>
        )}
        <p>
          Contacto: <strong>{CORREO_DE_SOPORTE}</strong> para cualquier cuestión sobre el servicio,
          y <strong>{CORREO_DE_PRIVACIDAD}</strong> para las relativas a datos personales.
        </p>
      </section>

      <section className={estilos.seccion}>
        <h2>Qué es RINDA</h2>
        <p>
          RINDA es una aplicación de gestión para gimnasios. El gimnasio la usa para llevar sus
          socios, sus cuotas, sus accesos y sus rutinas; cada socio la usa para su carné, su rutina
          y su progreso.
        </p>
        <p>
          <strong>RINDA no vende ni cobra nada dentro de la aplicación.</strong> No hay compras
          integradas, ni publicidad, ni pasarela de pago: cuando la aplicación registra un cobro, lo
          ha hecho el gimnasio por su cuenta y RINDA sólo lo anota.
        </p>
        <p>
          El acceso es <strong>por invitación del gimnasio</strong>. No hay registro libre.
        </p>
      </section>

      <section className={estilos.seccion}>
        <h2>Uso del servicio</h2>
        <p>
          RINDA está <strong>dirigida a personas mayores de 18 años</strong>. Quien usa la
          aplicación se compromete a no intentar acceder a datos de otras personas, a no alterar su
          funcionamiento y a no usarla para fines distintos de la gestión del gimnasio.
        </p>
        <p>
          Las cuentas son personales. Quien comparte sus credenciales responde de lo que se haga con
          ellas.
        </p>
      </section>

      <section className={estilos.seccion}>
        <h2>Responsabilidad</h2>
        <p>
          El prestador mantiene el servicio con diligencia, pero{' '}
          <strong>no garantiza que esté disponible sin interrupciones</strong>: hay mantenimientos,
          incidencias y cortes de terceros que no dependen de él.
        </p>
        <p>
          <strong>Los datos que introduce cada gimnasio son suyos y son su responsabilidad</strong>,
          incluido que sean exactos y que tenga derecho a tratarlos. RINDA los trata siguiendo sus
          instrucciones.
        </p>
      </section>

      <section className={estilos.seccion}>
        <h2>Propiedad</h2>
        <p>
          El software, el nombre RINDA y su imagen pertenecen al prestador. Los datos de cada
          gimnasio y de cada socio, no: son de quien corresponda, y pueden recuperarse o eliminarse
          cuando se pidan.
        </p>
      </section>

      <section className={estilos.seccion}>
        <h2>Dónde seguir</h2>
        <p>
          Cómo se tratan los datos personales está en la{' '}
          <Link href="/privacidad">política de privacidad</Link>. Para eliminar una cuenta, en{' '}
          <Link href="/eliminar-cuenta">esta página</Link>. Para pedir ayuda,{' '}
          <Link href="/soporte">soporte</Link>.
        </p>
      </section>
    </main>
  );
}
