'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { updateMemberSchema, type Invitation, type Member } from '@gymlab/contracts';
import { Aviso } from '@/componentes/aviso';
import { Boton } from '@/componentes/boton';
import { Campo } from '@/componentes/campo';
import { Etiqueta } from '@/componentes/etiqueta';
import { Marco } from '@/componentes/marco';
import { RutaPrivada } from '@/componentes/ruta-privada';
import { api } from '@/lib/api';
import { mensajeDeError } from '@/lib/errores';
import { comoFecha } from '@/lib/formato';
import { ROLES_DEL_PANEL } from '@/lib/roles';
import { esSesionCaducada, useSesion } from '@/lib/sesion';
import { Cuota } from './cuota';
import estilos from './ficha.module.css';

/**
 * La ficha de un socio.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ POR QUE `?id=` Y NO `/socios/[id]`                                        │
 * │                                                                          │
 * │ El panel se exporta estatico (ADR del frontend): `next build` genera un  │
 * │ fichero por ruta y no hay servidor que resuelva segmentos dinamicos. Una │
 * │ ruta `[id]` exigiria enumerar en construccion los identificadores de     │
 * │ todos los socios de todos los gimnasios, que ademas cambian cada dia.    │
 * │                                                                          │
 * │ Con la busqueda en la URL, la direccion sigue siendo compartible y       │
 * │ marcable, que es lo que de verdad se queria. No es un apaño: es la forma │
 * │ que tiene una aplicacion estatica de tener detalle.                      │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export default function FichaPage() {
  return (
    <RutaPrivada roles={ROLES_DEL_PANEL}>
      <Marco>
        <Suspense fallback={<p className={estilos.cargando}>Abriendo la ficha…</p>}>
          <Ficha />
        </Suspense>
      </Marco>
    </RutaPrivada>
  );
}

function Ficha() {
  const id = useSearchParams().get('id');
  const { gymId, revisar } = useSesion();

  const [socio, setSocio] = useState<Member | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editando, setEditando] = useState(false);

  useEffect(() => {
    if (!gymId || !id) {
      setCargando(false);
      return;
    }

    const control = new AbortController();
    setCargando(true);
    setError(null);

    api.members
      .getById(gymId, id, { signal: control.signal })
      .then((ficha) => {
        setSocio(ficha);
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
  }, [gymId, id, revisar]);

  if (!id) {
    return (
      <>
        <Volver />
        <Aviso>Falta el identificador del socio en la direccion.</Aviso>
      </>
    );
  }

  if (cargando) {
    return (
      <p className={estilos.cargando} role="status">
        Cargando la ficha…
      </p>
    );
  }

  if (error || !socio) {
    return (
      <>
        <Volver />
        <Aviso>{error ?? 'No se ha encontrado esa ficha.'}</Aviso>
      </>
    );
  }

  return (
    <>
      <Volver />

      <div className={estilos.encabezado}>
        <div className={estilos.identidad}>
          <h1>
            {socio.firstName} {socio.lastName}
          </h1>
          <span className={estilos.numero}>N.º {socio.memberNumber}</span>
          <Etiqueta tono={socio.status === 'active' ? 'exito' : 'neutro'}>
            {socio.status === 'active' ? 'Activo' : 'De baja'}
          </Etiqueta>
        </div>

        {!editando && (
          <Acciones socio={socio} onCambio={setSocio} onEditar={() => setEditando(true)} />
        )}
      </div>

      <div className={estilos.tarjeta}>
        {editando ? (
          <Edicion
            socio={socio}
            onGuardado={(actualizado) => {
              setSocio(actualizado);
              setEditando(false);
            }}
            onCancelar={() => setEditando(false)}
          />
        ) : (
          <Datos socio={socio} />
        )}
      </div>

      {/*
        La cuota va debajo de la ficha y no en otra pantalla: recepcion abre
        esto para responder "¿este puede entrar?" y "¿me debe algo?", y esas dos
        preguntas viven juntas.
      */}
      <Cuota memberId={socio.id} />
    </>
  );
}

function Volver() {
  return (
    <Link className={estilos.volver} href="/socios">
      ← Volver al listado
    </Link>
  );
}

function Datos({ socio }: { socio: Member }) {
  return (
    <dl className={estilos.datos}>
      <dt>Correo</dt>
      <dd>{socio.email ?? <span className={estilos.vacio}>Sin correo</span>}</dd>

      <dt>Telefono</dt>
      <dd>{socio.phone ?? <span className={estilos.vacio}>Sin telefono</span>}</dd>

      <dt>Fecha de nacimiento</dt>
      <dd>
        {socio.birthDate ? (
          comoFecha(`${socio.birthDate}T00:00:00Z`)
        ) : (
          <span className={estilos.vacio}>Sin fecha</span>
        )}
      </dd>

      <dt>Alta</dt>
      <dd>{comoFecha(socio.joinedAt)}</dd>

      {socio.leftAt && (
        <>
          <dt>Baja</dt>
          <dd>{comoFecha(socio.leftAt)}</dd>
        </>
      )}

      <dt>Cuenta</dt>
      <dd>
        {socio.hasAccount ? (
          'Tiene cuenta para entrar en GYMLAB'
        ) : (
          <span className={estilos.vacio}>Todavia no tiene cuenta</span>
        )}
      </dd>
    </dl>
  );
}

/**
 * Editar, invitar y dar de baja.
 *
 * Cada accion lleva su propio estado: si invitar falla, la baja no tiene por
 * que enterarse, y al reves. Un unico "cargando" para las tres las acopla sin
 * necesidad.
 */
function Acciones({
  socio,
  onCambio,
  onEditar,
}: {
  socio: Member;
  onCambio: (socio: Member) => void;
  onEditar: () => void;
}) {
  const { gymId } = useSesion();
  const [trabajando, setTrabajando] = useState<'baja' | 'alta' | 'invitacion' | null>(null);
  const [confirmandoBaja, setConfirmandoBaja] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [invitacion, setInvitacion] = useState<Invitation | null>(null);

  if (!gymId) return null;

  const ejecutar = (
    accion: 'baja' | 'alta' | 'invitacion',
    llamada: () => Promise<Member | Invitation>,
  ) => {
    setTrabajando(accion);
    setError(null);
    setInvitacion(null);
    void llamada()
      .then((resultado) => {
        if (accion === 'invitacion') setInvitacion(resultado as Invitation);
        else onCambio(resultado as Member);
      })
      .catch((problema: unknown) => setError(mensajeDeError(problema)))
      .finally(() => {
        setTrabajando(null);
        setConfirmandoBaja(false);
      });
  };

  return (
    <div>
      <div className={estilos.acciones}>
        <Boton onClick={onEditar} disabled={trabajando !== null}>
          Editar
        </Boton>

        {/*
          Invitar solo aparece cuando puede funcionar. La API tambien lo
          rechaza —sin correo, con cuenta ya vinculada o de baja— pero ofrecer
          un boton que solo sirve para dar un error es hacerle perder el tiempo
          a quien esta en el mostrador.
        */}
        {socio.status === 'active' && socio.email && !socio.hasAccount && (
          <Boton
            cargando={trabajando === 'invitacion'}
            disabled={trabajando !== null}
            onClick={() => ejecutar('invitacion', () => api.members.invite(gymId, socio.id))}
          >
            Invitar a crear cuenta
          </Boton>
        )}

        {socio.status === 'active' ? (
          confirmandoBaja ? (
            <span className={estilos.confirmar}>
              ¿Dar de baja?
              <Boton
                variante="sutil"
                cargando={trabajando === 'baja'}
                onClick={() => ejecutar('baja', () => api.members.deactivate(gymId, socio.id))}
              >
                Si, dar de baja
              </Boton>
              <Boton variante="sutil" onClick={() => setConfirmandoBaja(false)}>
                No
              </Boton>
            </span>
          ) : (
            // Dos pasos porque la baja le corta el acceso al gimnasio a una
            // persona. Es reversible, asi que no merece un dialogo modal con
            // su trampa de foco; un paso mas si.
            <Boton disabled={trabajando !== null} onClick={() => setConfirmandoBaja(true)}>
              Dar de baja
            </Boton>
          )
        ) : (
          <Boton
            cargando={trabajando === 'alta'}
            disabled={trabajando !== null}
            onClick={() => ejecutar('alta', () => api.members.reactivate(gymId, socio.id))}
          >
            Reactivar
          </Boton>
        )}
      </div>

      {(error || invitacion) && (
        <div className={estilos.avisos} style={{ marginTop: 'var(--e3)' }}>
          {error && <Aviso>{error}</Aviso>}
          {invitacion && (
            <Aviso tono="exito">
              Invitacion enviada a {invitacion.email}. Caduca el {comoFecha(invitacion.expiresAt)}.
            </Aviso>
          )}
        </div>
      )}
    </div>
  );
}

/** Campos que la ficha deja editar, y que ademas se pueden dejar en blanco. */
const OPCIONALES = ['email', 'phone', 'birthDate'] as const;

function Edicion({
  socio,
  onGuardado,
  onCancelar,
}: {
  socio: Member;
  onGuardado: (socio: Member) => void;
  onCancelar: () => void;
}) {
  const { gymId } = useSesion();

  const [valores, setValores] = useState({
    firstName: socio.firstName,
    lastName: socio.lastName,
    email: socio.email ?? '',
    phone: socio.phone ?? '',
    birthDate: socio.birthDate ?? '',
  });
  const [errores, setErrores] = useState<Partial<Record<keyof typeof valores, string>>>({});
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  /**
   * Campos que tenian valor y se han dejado en blanco.
   *
   * ┌──────────────────────────────────────────────────────────────────────┐
   * │ NO SE PUEDE VACIAR UN CAMPO, Y ESO ES DEL CONTRATO, NO DE ESTA        │
   * │ PANTALLA.                                                             │
   * │                                                                      │
   * │ `updateMemberSchema` hace opcionales los campos, no anulables: omitir  │
   * │ uno significa "no lo toques", y no hay forma de decir "borralo". Si    │
   * │ esta pantalla se limitara a no enviarlo, borrar un telefono y guardar  │
   * │ pareceria funcionar y no cambiaria nada — que es peor que no dejar.    │
   * │                                                                      │
   * │ Asi que se dice. Ampliar el contrato es una decision del backend y no  │
   * │ se toma desde aqui.                                                   │
   * └──────────────────────────────────────────────────────────────────────┘
   */
  const vaciados = OPCIONALES.filter((campo) => socio[campo] && valores[campo].trim() === '');

  const cambiar = (campo: keyof typeof valores, valor: string) => {
    setValores((previos) => ({ ...previos, [campo]: valor }));
    setErrores((previos) => ({ ...previos, [campo]: undefined }));
  };

  const guardar = () => {
    if (!gymId || guardando || vaciados.length > 0) return;
    setErrorGeneral(null);

    // Solo lo que ha cambiado. Mandar la ficha entera pisaria con valores
    // viejos cualquier campo que otra persona acabe de tocar.
    const cambios: Record<string, string> = {};
    for (const [campo, valor] of Object.entries(valores)) {
      const recortado = valor.trim();
      const antes = socio[campo as keyof typeof valores] ?? '';
      if (recortado !== '' && recortado !== antes) cambios[campo] = recortado;
    }

    if (Object.keys(cambios).length === 0) {
      onCancelar();
      return;
    }

    const analisis = updateMemberSchema.safeParse(cambios);
    if (!analisis.success) {
      const porCampo: Partial<Record<keyof typeof valores, string>> = {};
      for (const problema of analisis.error.issues) {
        const campo = String(problema.path[0] ?? '') as keyof typeof valores;
        if (campo && porCampo[campo] === undefined) porCampo[campo] = problema.message;
      }
      setErrores(porCampo);
      return;
    }

    setGuardando(true);
    void api.members
      .update(gymId, socio.id, analisis.data)
      .then(onGuardado)
      .catch((problema: unknown) => setErrorGeneral(mensajeDeError(problema)))
      .finally(() => setGuardando(false));
  };

  return (
    <form
      className={estilos.formulario}
      noValidate
      onSubmit={(evento) => {
        evento.preventDefault();
        guardar();
      }}
    >
      {errorGeneral && <Aviso>{errorGeneral}</Aviso>}

      {vaciados.length > 0 && (
        <Aviso>
          Todavia no se puede dejar en blanco un campo que ya tenia valor. Vuelve a escribirlo o
          cancela la edicion.
        </Aviso>
      )}

      <div className={estilos.pareja}>
        <Campo
          etiqueta="Nombre"
          autoComplete="given-name"
          foco
          valor={valores.firstName}
          error={errores.firstName}
          alCambiar={(valor) => cambiar('firstName', valor)}
        />
        <Campo
          etiqueta="Apellidos"
          autoComplete="family-name"
          valor={valores.lastName}
          error={errores.lastName}
          alCambiar={(valor) => cambiar('lastName', valor)}
        />
      </div>

      <Campo
        etiqueta="Correo electronico"
        tipo="email"
        opcional
        valor={valores.email}
        error={errores.email}
        alCambiar={(valor) => cambiar('email', valor)}
      />

      <Campo
        etiqueta="Telefono"
        tipo="tel"
        opcional
        valor={valores.phone}
        error={errores.phone}
        alCambiar={(valor) => cambiar('phone', valor)}
      />

      <Campo
        etiqueta="Fecha de nacimiento"
        tipo="date"
        opcional
        valor={valores.birthDate}
        error={errores.birthDate}
        alCambiar={(valor) => cambiar('birthDate', valor)}
      />

      <div className={estilos.pie}>
        <Boton
          type="submit"
          variante="primario"
          cargando={guardando}
          disabled={vaciados.length > 0}
        >
          Guardar cambios
        </Boton>
        <Boton onClick={onCancelar} disabled={guardando}>
          Cancelar
        </Boton>
      </div>
    </form>
  );
}
