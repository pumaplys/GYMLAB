'use client';

import { useEffect, useId, useState } from 'react';
import {
  CAN_INVITE,
  createInvitationSchema,
  type GymStaffMember,
  type Invitation,
  type Role,
} from '@gymlab/contracts';
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
 * El personal del gimnasio.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ DOS SECCIONES, Y LA SEPARACION ES LO QUE COSTO ENTENDER.                 │
 * │                                                                          │
 * │   Personal activo -> un HECHO: quien tiene acceso ahora mismo.          │
 * │   Invitaciones    -> PROMESAS: pueden caducar, revocarse o no aceptarse. │
 * │                                                                          │
 * │ No son la misma lista con distinto filtro. Alguien puede tener una       │
 * │ invitacion "aceptada" y ya no trabajar aqui, porque se le retiro el      │
 * │ acceso despues. Deducir el presente a partir del historial de            │
 * │ invitaciones era justo el error que dejaba al panel sin saber a quien    │
 * │ retirar: `invitationSchema` ni siquiera lleva `userId`.                  │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Los socios no salen en ninguna de las dos: se les invita desde su ficha, que
 * ademas vincula la invitacion con ella. Mezclarlos llenaria la pantalla de
 * gente que no es personal.
 *
 * Retirar el acceso solo se le ofrece al dueno. El servidor lo impone igual con
 * un 403; aqui solo se evita ensenar un boton que va a fallar.
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

  const [personal, setPersonal] = useState<GymStaffMember[] | null>(null);
  const [invitaciones, setInvitaciones] = useState<Invitation[] | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reciente, setReciente] = useState<Invitation | null>(null);

  /** Recarga tras invitar o retirar. La primera carga la hace el efecto. */
  const cargar = async () => {
    if (!gymId) return;
    const [quienEsta, todas] = await Promise.all([
      api.staff.list(gymId),
      api.invitations.list(gymId),
    ]);
    setPersonal(quienEsta);
    // Solo personal: los socios se invitan desde su ficha.
    setInvitaciones(todas.filter((i) => ROLES_DE_PERSONAL.includes(i.role)));
  };

  useEffect(() => {
    if (!gymId) return;
    const control = new AbortController();
    setCargando(true);
    setError(null);

    Promise.all([
      api.staff.list(gymId, { signal: control.signal }),
      api.invitations.list(gymId, { signal: control.signal }),
    ])
      .then(([quienEsta, todas]) => {
        setPersonal(quienEsta);
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
            Quien trabaja en el gimnasio y a quien has invitado. Los socios no salen aqui: se les
            invita desde su ficha.
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
          Cargando…
        </p>
      ) : (
        <>
          {/*
            Dos secciones, y la separacion es la que costo entender: una
            invitacion es una PROMESA —puede caducar, revocarse o no aceptarse—
            y el personal activo es un HECHO. Alguien puede tener una invitacion
            aceptada y ya no trabajar aqui.
          */}
          <PersonalActivo
            gymId={gymId}
            personal={personal ?? []}
            puedeRetirar={rol === 'owner'}
            onCambio={() => void cargar().catch((p: unknown) => setError(mensajeDeError(p)))}
          />

          <Listado
            gymId={gymId}
            invitaciones={invitaciones ?? []}
            onCambio={() => void cargar().catch((p: unknown) => setError(mensajeDeError(p)))}
          />
        </>
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

/**
 * Quien forma parte del gimnasio ahora mismo.
 *
 * `puedeRetirar` NO es la autorizacion: el servidor rechaza con 403 a quien no
 * sea el dueno. Aqui solo evita ofrecer un boton que va a fallar — recepcion ve
 * la lista, que es lo que necesita para no reinvitar a alguien que ya esta.
 */
function PersonalActivo({
  gymId,
  personal,
  puedeRetirar,
  onCambio,
}: {
  gymId: string;
  personal: GymStaffMember[];
  puedeRetirar: boolean;
  onCambio: () => void;
}) {
  const [retirando, setRetirando] = useState<string | null>(null);
  const [confirmando, setConfirmando] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const retirar = (userId: string) => {
    setRetirando(userId);
    setError(null);
    void api.staff
      .revoke(gymId, userId)
      .then(onCambio)
      .catch((problema: unknown) => setError(mensajeDeError(problema)))
      .finally(() => {
        setRetirando(null);
        setConfirmando(null);
      });
  };

  return (
    <section className={estilos.seccion}>
      <h2 className={estilos.tituloSeccion}>Personal activo</h2>
      <p className={estilos.explicacion}>
        Quien tiene acceso al gimnasio ahora mismo.{' '}
        {puedeRetirar
          ? 'Al retirar el acceso, esa persona deja de entrar de inmediato.'
          : 'Retirar el acceso es cosa del propietario.'}
      </p>

      {error && (
        <div className={estilos.avisos}>
          <Aviso>{error}</Aviso>
        </div>
      )}

      <div className={estilos.panel}>
        <table className={estilos.tabla}>
          <thead>
            <tr>
              <th scope="col">Nombre</th>
              <th scope="col">Correo</th>
              <th scope="col">Rol</th>
              <th scope="col">Desde</th>
              <th scope="col">
                <span className="solo-lectores">Acciones</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {personal.map((persona) => (
              <tr key={persona.userId}>
                <td className={estilos.nombre}>{persona.name}</td>
                <td className={estilos.correo}>{persona.email}</td>
                <td>{NOMBRE_DEL_ROL[persona.role]}</td>
                <td className={estilos.desde}>{comoFecha(persona.joinedAt)}</td>
                <td className={estilos.acciones}>
                  {puedeRetirar &&
                    (confirmando === persona.userId ? (
                      <span className={estilos.confirmar}>
                        ¿Retirar el acceso?
                        <Boton
                          variante="sutil"
                          cargando={retirando === persona.userId}
                          onClick={() => retirar(persona.userId)}
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
                        disabled={retirando !== null}
                        onClick={() => setConfirmando(persona.userId)}
                      >
                        Retirar acceso
                      </Boton>
                    ))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
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

  const cabecera = (
    <>
      <h2 className={estilos.tituloSeccion}>Invitaciones</h2>
      <p className={estilos.explicacion}>
        Lo que has enviado y en qué ha quedado. Una invitación aceptada no significa que esa persona
        siga aquí: eso lo dice la lista de arriba.
      </p>
    </>
  );

  if (invitaciones.length === 0) {
    return (
      <section className={estilos.seccion}>
        {cabecera}
        <div className={estilos.panel}>
          <div className={estilos.vacio}>
            <p className={estilos.vacioTitulo}>Todavia no has invitado a nadie</p>
            <p className={estilos.vacioTexto}>
              Las invitaciones que envies apareceran aqui con su estado.
            </p>
          </div>
        </div>
      </section>
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
    <section className={estilos.seccion}>
      {cabecera}

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
    </section>
  );
}
