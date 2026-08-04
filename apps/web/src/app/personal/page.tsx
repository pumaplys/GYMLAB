'use client';

import { useEffect, useId, useState } from 'react';
import { CAN_INVITE, createInvitationSchema, type Invitation, type Role } from '@gymlab/contracts';
import { Aviso } from '@/componentes/aviso';
import { Boton } from '@/componentes/boton';
import { Campo } from '@/componentes/campo';
import { Marco } from '@/componentes/marco';
import { RutaPrivada } from '@/componentes/ruta-privada';
import { api } from '@/lib/api';
import { mensajeDeError } from '@/lib/errores';
import { comoFecha } from '@/lib/formato';
import { NOMBRE_DEL_ROL, ROLES_DEL_PANEL } from '@/lib/roles';
import { esSesionCaducada, useSesion } from '@/lib/sesion';
import estilos from './personal.module.css';

/**
 * El personal del gimnasio: a quien se ha invitado y en que ha quedado.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ ES UNA PANTALLA DE INVITACIONES, NO UN CENSO — Y ESO ES DELIBERADO.      │
 * │                                                                          │
 * │ La API no tiene ningun endpoint que liste el personal de un gimnasio:    │
 * │ `memberships` no se expone (ADR-0006: `identity` no tiene servicio de    │
 * │ aplicacion). Comprobado pidiendo las rutas plausibles —memberships,      │
 * │ staff, personal, users—: 404 las cuatro.                                 │
 * │                                                                          │
 * │ Lo que si se puede seguir entero es el ciclo de la invitacion, y resulta │
 * │ que basta: quien acepta aparece aqui como "aceptada", con su fecha. No   │
 * │ es la misma pantalla que un censo, pero responde la pregunta que hoy     │
 * │ obliga a llamar a la API a mano.                                        │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Los socios NO salen aqui aunque compartan tabla: se les invita desde su
 * ficha, que ademas vincula la invitacion con ella. Mezclarlos llenaria esta
 * lista de gente que no es personal.
 */
const ROLES_DE_PERSONAL: readonly Role[] = ['owner', 'receptionist', 'trainer'];

export default function PersonalPage() {
  return (
    <RutaPrivada roles={ROLES_DEL_PANEL}>
      <Marco>
        <Personal />
      </Marco>
    </RutaPrivada>
  );
}

function Personal() {
  const { gymId, rol, revisar } = useSesion();

  const [invitaciones, setInvitaciones] = useState<Invitation[] | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reciente, setReciente] = useState<Invitation | null>(null);

  /** Recarga tras invitar o revocar. La primera carga la hace el efecto. */
  const cargar = async () => {
    if (!gymId) return;
    const todas = await api.invitations.list(gymId);
    // Solo personal: los socios se invitan desde su ficha.
    setInvitaciones(todas.filter((i) => ROLES_DE_PERSONAL.includes(i.role)));
  };

  useEffect(() => {
    if (!gymId) return;
    const control = new AbortController();
    setCargando(true);
    setError(null);

    api.invitations
      .list(gymId, { signal: control.signal })
      .then((todas) => {
        setInvitaciones(todas.filter((i) => ROLES_DE_PERSONAL.includes(i.role)));
        setCargando(false);
      })
      .catch((problema: unknown) => {
        if (control.signal.aborted) return;
        if (esSesionCaducada(problema)) {
          void revisar();
          return;
        }
        setError(mensajeDeError(problema));
        setCargando(false);
      });

    return () => control.abort();
  }, [gymId, revisar]);

  if (!gymId || !rol) return null;

  return (
    <>
      <div className={estilos.encabezado}>
        <div>
          <h1>Personal</h1>
          <p className={estilos.entradilla}>
            Aqui se invita al personal y se ve en que ha quedado cada invitacion. Los socios se
            invitan desde su ficha.
          </p>
        </div>
      </div>

      <div className={estilos.avisos}>
        {error && <Aviso>{error}</Aviso>}
        {reciente && (
          <Aviso tono="exito">
            Invitacion enviada a {reciente.email} como {NOMBRE_DEL_ROL[reciente.role].toLowerCase()}
            . Caduca el {comoFecha(reciente.expiresAt)}.
          </Aviso>
        )}
      </div>

      <Invitar
        gymId={gymId}
        rol={rol}
        onInvitado={(invitacion) => {
          setReciente(invitacion);
          setError(null);
          void cargar().catch((problema: unknown) => setError(mensajeDeError(problema)));
        }}
      />

      {cargando ? (
        <p className={estilos.cargando} role="status">
          Cargando invitaciones…
        </p>
      ) : (
        <Listado
          gymId={gymId}
          invitaciones={invitaciones ?? []}
          onCambio={() => void cargar().catch((p: unknown) => setError(mensajeDeError(p)))}
        />
      )}
    </>
  );
}

/**
 * El formulario de invitar.
 *
 * El desplegable se pinta con `CAN_INVITE`, la misma matriz que aplica el
 * servidor: un recepcionista solo ve "entrenador", porque no puede crear duenos
 * ni otros recepcionistas. Es control de escalada de privilegios, y por eso la
 * regla vive en `contracts` y no aqui — el servidor la comprueba igual.
 */
function Invitar({
  gymId,
  rol,
  onInvitado,
}: {
  gymId: string;
  rol: Role;
  onInvitado: (invitacion: Invitation) => void;
}) {
  const idRol = useId();
  const puedeInvitarA = CAN_INVITE[rol].filter((r) => ROLES_DE_PERSONAL.includes(r));

  const [email, setEmail] = useState('');
  const [rolElegido, setRolElegido] = useState<Role | ''>(puedeInvitarA[0] ?? '');
  const [errorEmail, setErrorEmail] = useState<string | undefined>();
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  if (puedeInvitarA.length === 0) {
    return (
      <div className={estilos.tarjeta}>
        <p className={estilos.vacioTexto}>
          Tu rol no puede invitar a personal. Puedes ver las invitaciones, pero crearlas es del
          propietario.
        </p>
      </div>
    );
  }

  const enviar = () => {
    if (enviando || !rolElegido) return;
    setError(null);

    const analisis = createInvitationSchema.safeParse({ email: email.trim(), role: rolElegido });
    if (!analisis.success) {
      const problema = analisis.error.issues.find((i) => i.path[0] === 'email');
      setErrorEmail(problema?.message ?? 'Revisa los datos');
      return;
    }
    setErrorEmail(undefined);

    setEnviando(true);
    void api.invitations
      .create(gymId, analisis.data)
      .then((invitacion) => {
        setEmail('');
        onInvitado(invitacion);
      })
      .catch((problema: unknown) => setError(mensajeDeError(problema)))
      .finally(() => setEnviando(false));
  };

  return (
    <div className={estilos.tarjeta}>
      <form
        className={estilos.formulario}
        noValidate
        onSubmit={(evento) => {
          evento.preventDefault();
          enviar();
        }}
      >
        {error && <Aviso>{error}</Aviso>}

        <div className={estilos.pareja}>
          <Campo
            etiqueta="Correo electronico"
            tipo="email"
            autoComplete="off"
            ayuda="Le llegara un enlace para crear su cuenta. Si ya tiene una, podra anadir este gimnasio sin cambiar su contrasena."
            valor={email}
            error={errorEmail}
            alCambiar={(valor) => {
              setEmail(valor);
              setErrorEmail(undefined);
            }}
          />

          <div className={estilos.campoSelector}>
            <label className={estilos.etiquetaCampo} htmlFor={idRol}>
              Rol
            </label>
            <select
              id={idRol}
              className={estilos.selector}
              value={rolElegido}
              onChange={(evento) => setRolElegido(evento.target.value as Role)}
            >
              {puedeInvitarA.map((r) => (
                <option key={r} value={r}>
                  {NOMBRE_DEL_ROL[r]}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className={estilos.pie}>
          <Boton type="submit" variante="primario" cargando={enviando}>
            Enviar invitacion
          </Boton>
        </div>
      </form>
    </div>
  );
}

/** En que ha quedado cada invitacion. El orden importa: revocada gana a caducada. */
function estadoDe(invitacion: Invitation): { texto: string; clase: string | undefined } {
  if (invitacion.revokedAt) return { texto: 'Revocada', clase: estilos.revocada };
  if (invitacion.acceptedAt) return { texto: 'Aceptada', clase: estilos.aceptada };
  if (new Date(invitacion.expiresAt) <= new Date())
    return { texto: 'Caducada', clase: estilos.caducada };
  return { texto: 'Pendiente', clase: estilos.pendiente };
}

function Listado({
  gymId,
  invitaciones,
  onCambio,
}: {
  gymId: string;
  invitaciones: Invitation[];
  onCambio: () => void;
}) {
  const [revocando, setRevocando] = useState<string | null>(null);
  const [confirmando, setConfirmando] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (invitaciones.length === 0) {
    return (
      <div className={estilos.panel}>
        <div className={estilos.vacio}>
          <p className={estilos.vacioTitulo}>Todavia no has invitado a nadie</p>
          <p className={estilos.vacioTexto}>
            Las invitaciones que envies apareceran aqui con su estado.
          </p>
        </div>
      </div>
    );
  }

  const revocar = (id: string) => {
    setRevocando(id);
    setError(null);
    void api.invitations
      .revoke(gymId, id)
      .then(onCambio)
      .catch((problema: unknown) => setError(mensajeDeError(problema)))
      .finally(() => {
        setRevocando(null);
        setConfirmando(null);
      });
  };

  return (
    <>
      {error && (
        <div className={estilos.avisos}>
          <Aviso>{error}</Aviso>
        </div>
      )}

      <div className={estilos.panel}>
        <table className={estilos.tabla}>
          <thead>
            <tr>
              <th scope="col">Correo</th>
              <th scope="col">Rol</th>
              <th scope="col">Estado</th>
              <th scope="col">Caduca</th>
              <th scope="col">
                <span className="solo-lectores">Acciones</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {invitaciones.map((invitacion) => {
              const estado = estadoDe(invitacion);
              const pendiente = estado.texto === 'Pendiente';

              return (
                <tr key={invitacion.id}>
                  <td className={estilos.correo}>{invitacion.email}</td>
                  <td>{NOMBRE_DEL_ROL[invitacion.role]}</td>
                  <td>
                    <span className={`${estilos.etiqueta} ${estado.clase}`}>{estado.texto}</span>
                  </td>
                  <td>{comoFecha(invitacion.expiresAt)}</td>
                  <td className={estilos.acciones}>
                    {/*
                      Revocar solo aparece en las pendientes. La API rechaza las
                      demas con un 404, pero ofrecer el boton para que falle es
                      hacer perder el tiempo.
                    */}
                    {pendiente &&
                      (confirmando === invitacion.id ? (
                        <span className={estilos.confirmar}>
                          ¿Revocar?
                          <Boton
                            variante="sutil"
                            cargando={revocando === invitacion.id}
                            onClick={() => revocar(invitacion.id)}
                          >
                            Si
                          </Boton>
                          <Boton variante="sutil" onClick={() => setConfirmando(null)}>
                            No
                          </Boton>
                        </span>
                      ) : (
                        <Boton
                          variante="sutil"
                          disabled={revocando !== null}
                          onClick={() => setConfirmando(invitacion.id)}
                        >
                          Revocar
                        </Boton>
                      ))}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
