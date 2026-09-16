import type { Metadata } from 'next';
import Link from 'next/link';
import { CORREO_DE_PRIVACIDAD } from '@/lib/contacto';
import { PRESTADOR, hayIdentidad } from '@/lib/prestador';
import estilos from './privacidad.module.css';

export const metadata: Metadata = {
  title: 'Política de privacidad · RINDA',
  description: 'Qué datos trata RINDA, para qué, con qué base y durante cuánto tiempo.',
};

/**
 * La politica de privacidad de RINDA — VERSION DE LANZAMIENTO.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ TODO LO QUE DESCRIBE SALE DE AUDITAR EL PRODUCTO: el esquema de la base  │
 * │ de datos, los permisos de los binarios y los endpoints de la API. Los    │
 * │ plazos y el reparto de papeles son DECISIONES DEL RESPONSABLE, adoptadas │
 * │ el 2026-09-16, no un texto genérico copiado de ningún sitio.             │
 * │                                                                          │
 * │ NO DICE, Y NO PUEDE DECIR, que esto «cumple el RGPD», que esté           │
 * │ certificado ni que lo haya aprobado un abogado. Dice qué se hace y bajo  │
 * │ qué base. Esa es la diferencia entre un documento honesto y un adorno.   │
 * │                                                                          │
 * │ La identidad del responsable NO esta escrita aqui: viene de             │
 * │ `lib/prestador.ts`, que la lee de la configuracion de release.           │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export default function PrivacidadPage() {
  const identidad = hayIdentidad();

  return (
    <main className={estilos.pagina}>
      {!identidad && (
        <p className={estilos.borrador} role="status">
          <strong>Sin configurar.</strong> Este despliegue no lleva la identidad del responsable.
        </p>
      )}

      <h1 className={estilos.titulo}>Política de privacidad</h1>
      <p className={estilos.fecha}>En vigor desde el 16 de septiembre de 2026.</p>

      <section className={estilos.seccion}>
        <h2>Lo importante, en cuatro líneas</h2>
        <ul>
          <li>
            <strong>Tu gimnasio decide</strong> qué datos tuyos trata para gestionarte como socio.
            RINDA se los trata a él, siguiendo sus instrucciones.
          </li>
          <li>
            <strong>Tu cuenta es tuya</strong>, no del gimnasio: de la cuenta, la contraseña y las
            sesiones responde RINDA.
          </li>
          <li>
            <strong>No hay publicidad, ni analítica, ni seguimiento</strong>, ni venta de datos a
            nadie.
          </li>
          <li>
            <strong>Tus datos de salud sólo se tratan si das tu permiso explícito</strong>, y al
            retirarlo se eliminan.
          </li>
        </ul>
      </section>

      <section className={estilos.seccion}>
        <h2>Quién responde de qué</h2>
        {identidad ? (
          <>
            <p>
              RINDA la presta <strong>{PRESTADOR.nombre}</strong>, persona física, con domicilio de
              contacto en:
            </p>
            <address className={estilos.domicilio}>
              {PRESTADOR.domicilio.map((linea) => (
                <span key={linea}>
                  {linea}
                  <br />
                </span>
              ))}
            </address>
          </>
        ) : (
          <p>La identidad del prestador está pendiente de configurar en este despliegue.</p>
        )}
        <p>
          Para cualquier cuestión sobre tus datos: <strong>{CORREO_DE_PRIVACIDAD}</strong>. Más
          datos de identificación, en el <Link href="/aviso-legal">aviso legal</Link>.
        </p>

        <p>
          <strong>Hay dos papeles distintos, y conviene no mezclarlos:</strong>
        </p>
        <ul>
          <li>
            <strong>RINDA es responsable</strong> de tu identidad y tu cuenta, de la autenticación y
            las sesiones, de recuperar el acceso, de la seguridad y la prevención de abuso, del
            soporte, de la administración técnica de la plataforma y de atender tus derechos sobre
            la propia cuenta.
          </li>
          <li>
            <strong>Tu gimnasio es responsable</strong>, y RINDA actúa como encargado siguiendo sus
            instrucciones, de tu ficha de socio y tus datos de contacto, tus cuotas y los pagos que
            él gestiona, tus accesos, tus rutinas y asignaciones, tu entrenador, tu progreso y tus
            mediciones, las notas de salud y entrenamiento, y el consentimiento y el documento de
            salud que él publica.
          </li>
        </ul>
        <p>
          Por eso el documento de consentimiento que ves dentro de la aplicación lleva el nombre de{' '}
          <strong>tu gimnasio</strong> y no el nuestro.
        </p>
        <p>
          <strong>Las invitaciones</strong> siguen esa misma línea: mientras sólo hay una invitación
          pendiente, el correo al que se envió se trata por cuenta del gimnasio que invita. Cuando
          aceptas y creas tu cuenta, tu identidad pasa al ámbito propio de RINDA.
        </p>
      </section>

      <section className={estilos.seccion}>
        <h2>Qué datos se tratan, con qué base y cuánto tiempo</h2>
        <table className={estilos.tabla}>
          <thead>
            <tr>
              <th>Datos</th>
              <th>Para qué</th>
              <th>Base jurídica</th>
              <th>Cuánto</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Nombre, correo, teléfono y fecha de nacimiento</td>
              <td>Tu cuenta y tu ficha de socio</td>
              <td>Prestación del servicio y relación contractual</td>
              <td>Mientras exista la cuenta o la ficha</td>
            </tr>
            <tr>
              <td>Contraseña cifrada y sesiones abiertas</td>
              <td>Entrar y seguir dentro</td>
              <td>Prestación del servicio</td>
              <td>Mientras exista la cuenta</td>
            </tr>
            <tr>
              <td>Intentos de acceso, con IP y navegador</td>
              <td>Seguridad y prevención de abuso</td>
              <td>Interés legítimo en proteger las cuentas</td>
              <td>12 meses</td>
            </tr>
            <tr>
              <td>Entradas al gimnasio</td>
              <td>Control de acceso</td>
              <td>Instrucción del gimnasio, que es el responsable</td>
              <td>12 meses</td>
            </tr>
            <tr>
              <td>Cuotas y pagos anotados por el gimnasio</td>
              <td>Gestión económica del gimnasio</td>
              <td>Instrucción del gimnasio; él valora sus obligaciones fiscales</td>
              <td>6 años</td>
            </tr>
            <tr>
              <td>Rutinas, ejercicios y asignaciones</td>
              <td>Tu entrenamiento</td>
              <td>Instrucción del gimnasio</td>
              <td>Mientras exista la ficha</td>
            </tr>
            <tr>
              <td>
                <strong>Peso, grasa corporal, perímetros y notas de tu entrenador</strong>
              </td>
              <td>Seguimiento de tu evolución y personalización del entrenamiento</td>
              <td>
                <strong>Tu consentimiento explícito</strong>, separado y revocable
              </td>
              <td>Hasta que lo retires; entonces se eliminan</td>
            </tr>
            <tr>
              <td>Registro de lo que hace el personal sobre tu ficha</td>
              <td>Poder saber quién hizo qué</td>
              <td>Interés legítimo y responsabilidad demostrada</td>
              <td>3 años</td>
            </tr>
            <tr>
              <td>Invitaciones</td>
              <td>Crear cuentas por invitación</td>
              <td>Instrucción del gimnasio</td>
              <td>12 meses desde que se acepta, se revoca o caduca</td>
            </tr>
          </tbody>
        </table>
        <p className={estilos.nota}>
          Estos plazos son <strong>política de RINDA</strong>, decidida para no guardar las cosas
          indefinidamente. No todos vienen impuestos literalmente por una ley concreta: los de pagos
          siguen los plazos habituales de conservación contable y fiscal, que valora cada gimnasio,
          y los demás son el criterio propio del prestador.
        </p>
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
        <p>
          <strong>No se guarda ningún número de tarjeta ni ningún dato bancario.</strong> RINDA no
          cobra: sólo anota que tu gimnasio cobró.
        </p>
      </section>

      <section className={estilos.seccion}>
        <h2>Tus datos de salud</h2>
        <p>
          Peso, porcentaje de grasa corporal, perímetros de pecho, cintura, cadera, brazo y muslo, la
          fecha de cada medición y las notas que tu entrenador escribe sobre tu estado físico son{' '}
          <strong>datos de salud</strong>, y se tratan de forma distinta al resto.
        </p>
        <ul>
          <li>
            <strong>Sólo con tu consentimiento explícito</strong>, que se pide aparte, no va dentro
            de ninguna otra aceptación y <strong>no condiciona tu pertenencia al gimnasio</strong>.
          </li>
          <li>
            <strong>Cada gimnasio, por separado.</strong> Aceptar en uno no dice nada del otro.
          </li>
          <li>
            Los ven <strong>tú, tu entrenador y la dirección</strong> del gimnasio.{' '}
            <strong>Recepción no accede.</strong>
          </li>
          <li>
            <strong>Puedes retirarlo cuando quieras.</strong> Al hacerlo se bloquea de inmediato
            cualquier medición o nota nueva, y las que haya <strong>se eliminan</strong>, como muy
            tarde en 30 días.
          </li>
        </ul>
        <p>
          Al eliminarlas se conserva sólo la <strong>constancia del hecho</strong> —qué versión
          aceptaste, cuándo la aceptaste y cuándo la retiraste— durante 3 años, para poder demostrar
          que el tratamiento estuvo amparado y que lo retiraste. Esa constancia{' '}
          <strong>no guarda ninguna medida corporal ni ninguna nota</strong>.
        </p>
      </section>

      <section className={estilos.seccion}>
        <h2>Quién más interviene</h2>
        <p>
          Para prestar el servicio intervienen proveedores. Los que pueden tratar datos personales
          son:
        </p>
        <ul>
          <li>
            <strong>Hostinger</strong> — el servidor donde vive la aplicación y la base de datos,{' '}
            <strong>en Fráncfort (Alemania)</strong>, y los buzones de correo de contacto.
          </li>
          <li>
            <strong>Backblaze B2</strong> — las copias de seguridad, <strong>en Ámsterdam</strong>,
            y <strong>cifradas</strong> de modo que el proveedor no puede leerlas.
          </li>
          <li>
            <strong>Resend</strong> — el envío de los correos de invitación, restablecimiento de
            contraseña y verificación. Recibe tu dirección de correo y un enlace con un código; no
            recibe tu nombre ni el del gimnasio. Su tratamiento puede implicar operaciones
            internacionales según su propia documentación.
          </li>
        </ul>
        <p>
          <strong>Apple y Google</strong> distribuyen la aplicación en sus tiendas y tratan los
          datos de esa descarga por su cuenta y bajo sus propias políticas: ahí no actúan por
          instrucción de RINDA.
        </p>
        <p>
          El detalle completo, con países y qué recibe cada uno, está en el registro de proveedores
          que mantiene el prestador y puede pedirse a {CORREO_DE_PRIVACIDAD}.
        </p>
      </section>

      <section className={estilos.seccion}>
        <h2>Copias de seguridad</h2>
        <p>
          Se hacen copias cifradas a diario. Cuando algo se elimina, puede seguir existiendo dentro
          de una copia durante <strong>un máximo aproximado de 31 días</strong>, hasta que esa copia
          caduca y se destruye sola. Las copias no se consultan salvo para restaurar el servicio
          tras un incidente.
        </p>
      </section>

      <section className={estilos.seccion}>
        <h2>Quién puede usar RINDA</h2>
        <p>
          RINDA está <strong>dirigida a personas mayores de 18 años</strong>.
        </p>
        <p>
          Cuando tu gimnasio registra tu fecha de nacimiento, el sistema no permite crear ni editar
          una ficha de una persona menor de esa edad. Ahora bien, esa fecha es{' '}
          <strong>opcional</strong>: un gimnasio puede dar de alta a alguien sin ella, y entonces
          RINDA no conoce su edad. <strong>No comprobamos la edad de todas las personas usuarias</strong>,
          y no afirmamos lo contrario.
        </p>
      </section>

      <section className={estilos.seccion}>
        <h2>Tus derechos</h2>
        <p>
          Puedes pedir acceso a tus datos, su rectificación, su supresión, la limitación de su
          tratamiento, oponerte a él y pedir que te los entreguemos para llevártelos. Escríbenos a{' '}
          <strong>{CORREO_DE_PRIVACIDAD}</strong>. También puedes reclamar ante la autoridad de
          control; en España, la Agencia Española de Protección de Datos.
        </p>
        <p>
          Si tu petición se refiere a lo que gestiona tu gimnasio —tu ficha, tus cuotas, tus
          accesos— se la trasladaremos a él, que es quien decide, y te lo diremos.
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
        <h2>Cambios</h2>
        <p>
          Si esta política cambia de forma relevante, se avisa dentro de la aplicación. El
          consentimiento de datos de salud es aparte: cambiar su texto{' '}
          <strong>obliga a pedirlo otra vez</strong>, y el anterior deja de amparar nada.
        </p>
      </section>

      <p className={estilos.pie}>
        ¿Dudas? <Link href="/soporte">Escríbenos</Link>.
      </p>
    </main>
  );
}
