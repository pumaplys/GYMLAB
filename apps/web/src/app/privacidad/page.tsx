import type { Metadata } from 'next';
import Link from 'next/link';
import estilos from './privacidad.module.css';

export const metadata: Metadata = {
  title: 'Política de privacidad · RINDA',
  description: 'Qué datos trata RINDA, para qué, y qué derechos tienes.',
};

/**
 * La política de privacidad de RINDA.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ ESTO ES UN BORRADOR, Y LO DICE EN LA PRIMERA LÍNEA DE LA PÁGINA.        │
 * │                                                                          │
 * │ Todo lo que hay aquí sale de auditar el producto: el esquema de la base  │
 * │ de datos, los permisos de los binarios y los endpoints de la API. Nada   │
 * │ está inventado.                                                          │
 * │                                                                          │
 * │ Lo que NO está es todo lo que exige una decisión humana: la identidad    │
 * │ del responsable, los plazos de conservación, los encargados del          │
 * │ tratamiento y la base jurídica de cada finalidad. Esos huecos están      │
 * │ enumerados en `docs/19-legal-review-pack.md` y NO se rellenan aquí       │
 * │ inventándolos.                                                           │
 * │                                                                          │
 * │ El aviso de arriba no es decorativo: mientras esté, esta URL no puede    │
 * │ darse a ninguna tienda como política definitiva.                         │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export default function PrivacidadPage() {
  return (
    <main className={estilos.pagina}>
      <p className={estilos.borrador} role="status">
        <strong>Borrador.</strong> Este texto describe lo que RINDA hace hoy, verificado sobre el
        producto. Está pendiente de revisión jurídica y todavía no es la política definitiva.
      </p>

      <h1 className={estilos.titulo}>Política de privacidad</h1>

      <section className={estilos.seccion}>
        <h2>Qué es RINDA y quién trata tus datos</h2>
        <p>
          RINDA es la aplicación con la que un gimnasio gestiona a sus socios y con la que cada
          socio lleva su carné, su rutina y su progreso.
        </p>
        <p>
          <strong>Tu gimnasio decide qué datos tuyos se tratan y para qué.</strong> RINDA se los
          trata a él. Por eso el documento de consentimiento que ves dentro de la aplicación lleva
          el nombre de tu gimnasio y no el nuestro.
        </p>
      </section>

      <section className={estilos.seccion}>
        <h2>Qué datos se recogen</h2>
        <ul>
          <li>
            <strong>Tu identidad y tu contacto:</strong> nombre, apellidos, correo electrónico,
            teléfono y fecha de nacimiento.
          </li>
          <li>
            <strong>Tu acceso:</strong> la contraseña, guardada cifrada, y las sesiones que tienes
            abiertas, con la dirección IP y el navegador o la aplicación desde los que entras.
          </li>
          <li>
            <strong>Tu actividad en el gimnasio:</strong> las entradas que registra el escáner de
            carnés, con la fecha y si se te dejó pasar.
          </li>
          <li>
            <strong>Tus cuotas y tus pagos:</strong> el concepto, el importe, la fecha y si se pagó
            en efectivo, por transferencia o con tarjeta. <strong>No se guarda ningún número de
            tarjeta ni ningún dato bancario:</strong> RINDA no cobra, sólo anota que tu gimnasio
            cobró.
          </li>
          <li>
            <strong>Tu entrenamiento:</strong> las rutinas que te asignan y los ejercicios que
            incluyen.
          </li>
          <li>
            <strong>Tus datos de salud:</strong> peso, porcentaje de grasa corporal y perímetros
            corporales, con la fecha de cada medición y las notas de tu entrenador.{' '}
            <strong>Sólo si das tu permiso explícito</strong>, y puedes retirarlo cuando quieras.
          </li>
          <li>
            <strong>Un registro de actividad</strong> de lo que hace el personal del gimnasio sobre
            tu ficha, para poder saber quién hizo qué.
          </li>
        </ul>
      </section>

      <section className={estilos.seccion}>
        <h2>Qué NO se recoge</h2>
        <p>
          Verificado sobre los binarios que se publican en las tiendas: RINDA{' '}
          <strong>no recoge tu ubicación</strong>, no accede a tus contactos, no accede a tus fotos
          y no usa el micrófono.
        </p>
        <p>
          <strong>No hay publicidad, ni analítica, ni seguimiento.</strong> La aplicación no
          incorpora ninguna herramienta de medición de terceros ni ningún identificador
          publicitario, y no comparte tu actividad con nadie con fines comerciales.
        </p>
        <p>
          <strong>La cámara sólo lee códigos QR.</strong> Se usa para escanear carnés en la puerta.
          No se guarda ninguna imagen ni se envía ninguna foto a ningún sitio.
        </p>
      </section>

      <section className={estilos.seccion}>
        <h2>Tus derechos</h2>
        <p>
          Puedes pedir acceso a tus datos, su rectificación, su supresión, la limitación de su
          tratamiento, oponerte a él y pedir que te los entreguemos para llevártelos. También
          puedes reclamar ante la autoridad de control.
        </p>
        <p>
          <strong>Puedes eliminar tu cuenta tú misma</strong>, desde la aplicación o desde{' '}
          <Link href="/eliminar-cuenta">esta página</Link>. Se elimina tu identidad entera, no sólo
          tu relación con un gimnasio.
        </p>
        <p>
          Algunos registros se conservan <strong>sin tu nombre</strong> después de eliminar la
          cuenta, porque el gimnasio los necesita como hecho: los pagos quedan como importes y
          fechas, y las entradas como marcas de tiempo, sin quedar ligados a ti.
        </p>
        <p>
          Tus datos de salud, tus consentimientos, las notas sobre ti y tus mediciones{' '}
          <strong>se eliminan</strong>.
        </p>
      </section>

      <section className={estilos.seccion}>
        <h2>Lo que falta en este borrador</h2>
        <p>
          Este texto todavía no dice quién es el responsable del tratamiento, cuánto tiempo se
          conserva cada cosa, qué proveedores intervienen ni cuál es la base jurídica de cada
          finalidad. Son decisiones que no puede tomar quien escribe el código.
        </p>
      </section>

      <p className={estilos.pie}>
        ¿Dudas? <Link href="/soporte">Escríbenos</Link>.
      </p>
    </main>
  );
}
