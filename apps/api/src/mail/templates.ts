import { EMAIL_QUEUES, type EmailJob, type RolInvitado } from '@gymlab/db';
import type { MailMessage } from './mailer';

/**
 * Plantillas de correo.
 *
 * Literales de plantilla, sin motor de plantillas. Son tres correos cortos: una
 * dependencia mas para esto seria peor que el problema que resuelve. Cuando haya
 * diez y con diseño, se reconsidera.
 *
 * Cada correo lleva HTML **y texto plano**, no por purismo: hay clientes que
 * bloquean el HTML, y un correo con enlace de recuperacion que llega vacio es un
 * usuario que no puede entrar.
 */

const MARCA = 'GYMLAB';

function envoltura(titulo: string, cuerpo: string, boton: { texto: string; url: string }): string {
  return `<!DOCTYPE html>
<html lang="es"><head><meta charset="utf-8"><title>${titulo}</title></head>
<body style="margin:0;padding:24px;background:#f6f6f6;font-family:system-ui,-apple-system,Segoe UI,sans-serif;color:#1a1a1a">
  <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:12px;padding:32px">
    <p style="margin:0 0 24px;font-size:18px;font-weight:700;letter-spacing:-0.02em">${MARCA}</p>
    <h1 style="margin:0 0 16px;font-size:20px;line-height:1.3">${titulo}</h1>
    <div style="font-size:15px;line-height:1.6;color:#3a3a3a">${cuerpo}</div>
    <p style="margin:28px 0 0">
      <a href="${boton.url}" style="display:inline-block;background:#1a1a1a;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;font-size:15px">${boton.texto}</a>
    </p>
    <p style="margin:28px 0 0;font-size:13px;color:#8a8a8a">
      Si el boton no funciona, copia esta direccion en tu navegador:<br>
      <span style="word-break:break-all">${boton.url}</span>
    </p>
  </div>
</body></html>`;
}

/**
 * Que va a poder hacer quien acepta, segun para que se le invita.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ SOLO SE DESCRIBE LO QUE EXISTE HOY.                                      │
 * │                                                                          │
 * │ Este correo le decia a TODO EL MUNDO que podria "consultar tus rutinas   │
 * │ y tu progreso desde el movil". Se detecto al invitar a un recepcionista  │
 * │ real en produccion: es lo primero que lee alguien al entrar en GYMLAB, y │
 * │ le prometia dos cosas que no le tocan y una app que no existe.           │
 * │                                                                          │
 * │ Para entrenador y socio el texto es DELIBERADAMENTE ESCUETO: sus         │
 * │ pantallas todavia no existen, asi que lo unico cierto es que la cuenta   │
 * │ queda creada y vinculada. Cuando exista su portal, se amplia aqui.       │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
const QUE_PODRA_HACER: Record<RolInvitado, string> = {
  owner:
    'Al aceptar crearas tu cuenta y podras gestionar el gimnasio: socios, cuotas y cobros, tu equipo y tus precios.',
  receptionist:
    'Al aceptar crearas tu cuenta y podras dar de alta socios, ponerles su cuota y registrar los cobros del mostrador.',
  trainer: 'Al aceptar crearas tu cuenta y quedaras vinculado al gimnasio como entrenador.',
  member: 'Al aceptar crearas tu cuenta y quedaras vinculado al gimnasio como socio.',
};

/** Cuando el trabajo viene sin rol — colas encoladas antes de este cambio. */
const SIN_ROL = 'Al aceptar crearas tu cuenta y quedaras vinculado al gimnasio.';

/** Invitacion a unirse a un gimnasio. */
function invitacion(job: EmailJob): MailMessage {
  const queHara = job.role ? QUE_PODRA_HACER[job.role] : SIN_ROL;

  const cuerpo = `<p>Te han invitado a unirte a un gimnasio en ${MARCA}.</p>
    <p>${queHara}</p>
    <p><strong>La invitacion caduca en 7 dias.</strong></p>`;

  return {
    to: job.to,
    subject: `Te han invitado a ${MARCA}`,
    html: envoltura('Te han invitado a un gimnasio', cuerpo, {
      texto: 'Aceptar invitacion',
      url: job.url,
    }),
    text: [
      `Te han invitado a unirte a un gimnasio en ${MARCA}.`,
      '',
      queHara,
      '',
      'Acepta la invitacion y crea tu cuenta aqui:',
      job.url,
      '',
      'La invitacion caduca en 7 dias.',
    ].join('\n'),
  };
}

/** Restablecer contrasena. */
function restablecerContrasena(job: EmailJob): MailMessage {
  // El aviso final no es relleno: quien recibe esto sin haberlo pedido tiene que
  // saber que su contrasena sigue intacta y que no hay nada que hacer.
  const cuerpo = `<p>Has pedido restablecer tu contrasena de ${MARCA}.</p>
    <p><strong>El enlace caduca en 1 hora y solo se puede usar una vez.</strong></p>
    <p>Al cambiarla se cerraran todas tus sesiones abiertas.</p>`;

  return {
    to: job.to,
    subject: `Restablecer tu contrasena de ${MARCA}`,
    html: envoltura('Restablecer tu contrasena', cuerpo, {
      texto: 'Elegir contrasena nueva',
      url: job.url,
    }),
    text: [
      `Has pedido restablecer tu contrasena de ${MARCA}.`,
      '',
      'Elige una contrasena nueva aqui:',
      job.url,
      '',
      'El enlace caduca en 1 hora y solo se puede usar una vez.',
      'Al cambiarla se cerraran todas tus sesiones abiertas.',
      '',
      'Si no has pedido esto, puedes ignorar este correo:',
      'tu contrasena no ha cambiado.',
    ].join('\n'),
  };
}

/** Verificar la direccion de correo. */
function verificarEmail(job: EmailJob): MailMessage {
  const cuerpo = `<p>Confirma que esta direccion es tuya para terminar de activar tu cuenta de ${MARCA}.</p>`;

  return {
    to: job.to,
    subject: `Confirma tu correo en ${MARCA}`,
    html: envoltura('Confirma tu correo', cuerpo, { texto: 'Confirmar correo', url: job.url }),
    text: [
      `Confirma que esta direccion es tuya para activar tu cuenta de ${MARCA}.`,
      '',
      job.url,
    ].join('\n'),
  };
}

/**
 * Construye el mensaje de una cola.
 *
 * El `switch` es exhaustivo sobre las colas de correo: si se anade una y se
 * olvida la plantilla, TypeScript no lo detecta —los nombres son cadenas— pero
 * esto lanza en lugar de enviar un correo vacio.
 */
export function renderizar(cola: string, job: EmailJob): MailMessage {
  switch (cola) {
    case EMAIL_QUEUES.invitation:
      return invitacion(job);
    case EMAIL_QUEUES.resetPassword:
      return restablecerContrasena(job);
    case EMAIL_QUEUES.verifyEmail:
      return verificarEmail(job);
    default:
      throw new Error(`[mail] No hay plantilla para la cola "${cola}".`);
  }
}
