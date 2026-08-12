'use client';

import { useEffect, useState } from 'react';
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
import { Cargando } from '@/componentes/cargando';
import { ConfirmacionEnLinea } from '@/componentes/confirmacion-en-linea';
import { EncabezadoDePagina } from '@/componentes/encabezado-de-pagina';
import { EstadoVacio } from '@/componentes/estado-vacio';
import { Etiqueta, type TonoDeEtiqueta } from '@/componentes/etiqueta';
import { Dato, FilaApilada, ListaApilada } from '@/componentes/lista-apilada';
import { Marco } from '@/componentes/marco';
import { RutaPrivada } from '@/componentes/ruta-privada';
import { Selector } from '@/componentes/selector';
import { Tabla, celda } from '@/componentes/tabla';
import { Tarjeta } from '@/componentes/tarjeta';
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
      <EncabezadoDePagina
        titulo="Personal"
        entradilla="Quien trabaja en el gimnasio y a quien has invitado. Los socios no salen aqui: se les invita desde su ficha."
      />

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
        <Cargando>Cargando…</Cargando>
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
  const puedeInvitarA = CAN_INVITE[rol].filter((r) => ROLES_DE_PERSONAL.includes(r));

  const [email, setEmail] = useState('');
  const [rolElegido, setRolElegido] = useState<Role | ''>(puedeInvitarA[0] ?? '');
  const [errorEmail, setErrorEmail] = useState<string | undefined>();
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  // Sin cabecera, a diferencia del formulario: esto es un aviso de que la
  // seccion no aplica. Ponerle el titulo "Invitar a alguien" a un texto que
  // dice justo que no se puede invitar promete un formulario que no esta.
  if (puedeInvitarA.length === 0) {
    return (
      <Tarjeta className={estilos.tarjeta}>
        <p className={estilos.explicacion}>
          Tu rol no puede invitar a personal. Puedes ver las invitaciones, pero crearlas es del
          propietario.
        </p>
      </Tarjeta>
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
    <Tarjeta className={estilos.tarjeta}>
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

          <Selector
            etiqueta="Rol"
            valor={rolElegido}
            alCambiar={(valor) => setRolElegido(valor as Role)}
          >
            {puedeInvitarA.map((r) => (
              <option key={r} value={r}>
                {NOMBRE_DEL_ROL[r]}
              </option>
            ))}
          </Selector>
        </div>

        <div className={estilos.pie}>
          <Boton type="submit" variante="primario" cargando={enviando}>
            Enviar invitacion
          </Boton>
        </div>
      </form>
    </Tarjeta>
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

      <Tarjeta variante="lista" className={estilos.panel}>
        <Tabla conListaEstrecha>
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
                <td className={celda.tenue}>{comoFecha(persona.joinedAt)}</td>
                <td className={celda.acciones}>
                  {puedeRetirar &&
                    (confirmando === persona.userId ? (
                      <ConfirmacionEnLinea
                        pregunta="¿Retirar el acceso?"
                        confirmando={retirando === persona.userId}
                        onConfirmar={() => retirar(persona.userId)}
                        onCancelar={() => setConfirmando(null)}
                      />
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
        </Tabla>

        {/*
          Sin `href`: aqui la tarjeta NO lleva a ningun sitio —no hay ficha de
          personal— y lo unico pulsable es su boton. El tipo de `FilaApilada`
          impide pasar los dos, que es lo que evita la tarjeta que parece
          navegable y no lo es.

          El rol NO es una pastilla de estado: describe el puesto, no una
          situacion que cambie. Va como par dato/valor, igual que en la tabla.
        */}
        <ListaApilada etiqueta="Personal activo">
          {personal.map((persona) => (
            <FilaApilada
              key={persona.userId}
              titulo={persona.name}
              acciones={
                puedeRetirar &&
                (confirmando === persona.userId ? (
                  <ConfirmacionEnLinea
                    pregunta="¿Retirar el acceso?"
                    confirmando={retirando === persona.userId}
                    onConfirmar={() => retirar(persona.userId)}
                    onCancelar={() => setConfirmando(null)}
                  />
                ) : (
                  <Boton
                    variante="sutil"
                    disabled={retirando !== null}
                    onClick={() => setConfirmando(persona.userId)}
                  >
                    Retirar acceso
                  </Boton>
                ))
              }
            >
              <Dato etiqueta="Correo">{persona.email}</Dato>
              <Dato etiqueta="Rol">{NOMBRE_DEL_ROL[persona.role]}</Dato>
              <Dato etiqueta="Desde">{comoFecha(persona.joinedAt)}</Dato>
            </FilaApilada>
          ))}
        </ListaApilada>
      </Tarjeta>
    </section>
  );
}

/** En que ha quedado cada invitacion. El orden importa: revocada gana a caducada. */
function estadoDe(invitacion: Invitation): { texto: string; tono: TonoDeEtiqueta } {
  if (invitacion.revokedAt) return { texto: 'Revocada', tono: 'neutro' };
  if (invitacion.acceptedAt) return { texto: 'Aceptada', tono: 'exito' };
  if (new Date(invitacion.expiresAt) <= new Date()) return { texto: 'Caducada', tono: 'aviso' };
  return { texto: 'Pendiente', tono: 'acento' };
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
        <Tarjeta variante="lista" className={estilos.panel}>
          <EstadoVacio
            titulo="Todavia no has invitado a nadie"
            texto="Las invitaciones que envies apareceran aqui con su estado."
          />
        </Tarjeta>
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

      <Tarjeta variante="lista" className={estilos.panel}>
        <Tabla conListaEstrecha>
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
                    <Etiqueta tono={estado.tono}>{estado.texto}</Etiqueta>
                  </td>
                  <td>{comoFecha(invitacion.expiresAt)}</td>
                  <td className={celda.acciones}>
                    {/*
                      Revocar solo aparece en las pendientes. La API rechaza las
                      demas con un 404, pero ofrecer el boton para que falle es
                      hacer perder el tiempo.
                    */}
                    {pendiente &&
                      (confirmando === invitacion.id ? (
                        <ConfirmacionEnLinea
                          pregunta="¿Revocar?"
                          confirmando={revocando === invitacion.id}
                          onConfirmar={() => revocar(invitacion.id)}
                          onCancelar={() => setConfirmando(null)}
                        />
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
        </Tabla>

        {/*
          Una invitacion NO es una persona, y por eso esta lista es suya y no
          la misma que la de arriba con otros campos: una invitacion es una
          PROMESA —caduca, se revoca, puede no aceptarse— y el personal activo
          es un HECHO. El identificador tambien es distinto: alli el nombre,
          aqui el correo, porque hasta que no se acepta no hay nombre.

          Aqui la etiqueta de estado SI es una pastilla: pendiente, aceptada,
          caducada y revocada son situaciones, y es lo que se mira primero.
        */}
        <ListaApilada etiqueta="Invitaciones">
          {invitaciones.map((invitacion) => {
            const estado = estadoDe(invitacion);
            const pendiente = estado.texto === 'Pendiente';

            return (
              <FilaApilada
                key={invitacion.id}
                titulo={invitacion.email}
                etiqueta={<Etiqueta tono={estado.tono}>{estado.texto}</Etiqueta>}
                acciones={
                  pendiente &&
                  (confirmando === invitacion.id ? (
                    <ConfirmacionEnLinea
                      pregunta="¿Revocar?"
                      confirmando={revocando === invitacion.id}
                      onConfirmar={() => revocar(invitacion.id)}
                      onCancelar={() => setConfirmando(null)}
                    />
                  ) : (
                    <Boton
                      variante="sutil"
                      disabled={revocando !== null}
                      onClick={() => setConfirmando(invitacion.id)}
                    >
                      Revocar
                    </Boton>
                  ))
                }
              >
                <Dato etiqueta="Rol">{NOMBRE_DEL_ROL[invitacion.role]}</Dato>
                <Dato etiqueta="Caduca">{comoFecha(invitacion.expiresAt)}</Dato>
              </FilaApilada>
            );
          })}
        </ListaApilada>
      </Tarjeta>
    </section>
  );
}
