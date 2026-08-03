'use client';

import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import type { Me, Role } from '@gymlab/contracts';
import { Aviso } from '@/componentes/aviso';
import { Boton } from '@/componentes/boton';
import { PantallaCentrada } from '@/componentes/pantalla-centrada';
import { mensajeDeError } from '@/lib/errores';
import { NOMBRE_DEL_ROL } from '@/lib/roles';
import { useSesion } from '@/lib/sesion';
import estilos from './ruta-privada.module.css';

interface Props {
  /** Roles que pueden ver esta pantalla. Sin lista, basta con tener sesion. */
  roles?: readonly Role[];
  children: ReactNode;
}

/**
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ ESTO NO PROTEGE NADA, Y CONVIENE TENERLO MUY CLARO.                      │
 * │                                                                          │
 * │ El panel se sirve como ficheros estaticos: cualquiera puede descargarlos │
 * │ y saltarse este componente. Lo que impide leer datos ajenos son las      │
 * │ cuatro barreras del servidor —sesion, rol, contexto de tenant y RLS—, y  │
 * │ ninguna de ellas esta aqui.                                              │
 * │                                                                          │
 * │ Lo que hace este componente es no pintar pantallas que la API va a       │
 * │ rechazar. Es cortesia, no seguridad. Si algun dia una comprobacion vive  │
 * │ SOLO aqui, es que hay un agujero en el servidor.                         │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export function RutaPrivada({ roles, children }: Props) {
  const { estado, rol, revisar } = useSesion();
  const router = useRouter();

  useEffect(() => {
    if (estado.fase === 'anonimo') router.replace('/login');
  }, [estado.fase, router]);

  // Mientras se pregunta al servidor no se decide nada. Pintar el panel y
  // quitarlo, o mandar a entrar a quien ya tiene sesion, es el parpadeo que
  // hace que una aplicacion parezca rota.
  if (estado.fase === 'cargando') return <Esperando texto="Comprobando la sesion…" />;
  if (estado.fase === 'anonimo') return <Esperando texto="Llevandote a la pantalla de entrada…" />;

  if (estado.fase === 'incomunicado') {
    return (
      <PantallaCentrada
        titulo="Sin conexion con el servidor"
        entradilla="No se ha podido comprobar tu sesion. Puede ser tu conexion o el servidor."
      >
        <div className={estilos.acciones}>
          <Boton variante="primario" bloque onClick={() => void revisar()}>
            Reintentar
          </Boton>
        </div>
      </PantallaCentrada>
    );
  }

  if (estado.yo.memberships.length === 0) return <SinGimnasios />;
  if (!estado.yo.activeGymId) return <ElegirGimnasio yo={estado.yo} />;
  if (roles && (rol === null || !roles.includes(rol))) return <SinAcceso rol={rol} />;

  return <>{children}</>;
}

function Esperando({ texto }: { texto: string }) {
  // `aria-live` porque este texto aparece sin que nadie lo haya pedido: quien
  // no ve la pantalla no tiene forma de saber que hay algo en marcha.
  return (
    <div className={estilos.esperando} role="status" aria-live="polite">
      {texto}
    </div>
  );
}

/**
 * Hay sesion pero no hay gimnasio activo.
 *
 * Pasa cuando la persona pertenece a varios: el login no elige por ella, porque
 * adivinar cual quiere seria peor que preguntar.
 */
function ElegirGimnasio({ yo }: { yo: Me }) {
  const { elegirGimnasio } = useSesion();
  const [eligiendo, setEligiendo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const elegir = (gymId: string) => {
    setEligiendo(gymId);
    setError(null);
    void elegirGimnasio(gymId)
      .catch((problema: unknown) => setError(mensajeDeError(problema)))
      .finally(() => setEligiendo(null));
  };

  return (
    <PantallaCentrada
      titulo="Elige un gimnasio"
      entradilla="Tu cuenta trabaja en varios. Puedes cambiar de gimnasio cuando quieras."
      ancha
    >
      {error && <Aviso>{error}</Aviso>}

      <div className={estilos.gimnasios}>
        {yo.memberships.map((pertenencia) => (
          <button
            key={pertenencia.gymId}
            type="button"
            className={estilos.gimnasio}
            disabled={eligiendo !== null}
            onClick={() => elegir(pertenencia.gymId)}
          >
            <span className={estilos.nombre}>{pertenencia.gymName}</span>
            <span className={estilos.rol}>
              {eligiendo === pertenencia.gymId ? 'Entrando…' : NOMBRE_DEL_ROL[pertenencia.role]}
            </span>
          </button>
        ))}
      </div>
    </PantallaCentrada>
  );
}

/** Sesion valida sin ninguna pertenencia: se la han retirado, o aun no se la han dado. */
function SinGimnasios() {
  const { salir } = useSesion();
  return (
    <PantallaCentrada
      titulo="Tu cuenta no pertenece a ningun gimnasio"
      entradilla="Puede que te hayan retirado el acceso o que la invitacion aun no se haya aceptado. Habla con el propietario del gimnasio."
    >
      <div className={estilos.acciones}>
        <Boton bloque onClick={() => void salir()}>
          Cerrar sesion
        </Boton>
      </div>
    </PantallaCentrada>
  );
}

/**
 * Rol sin sitio en este panel: entrenador o socio.
 *
 * No es un error ni un fallo de permisos que haya que reportar: son cuentas
 * validas cuyas pantallas viven en otra aplicacion.
 */
function SinAcceso({ rol }: { rol: Role | null }) {
  const { salir } = useSesion();
  return (
    <PantallaCentrada
      titulo="Esta seccion no es para tu rol"
      entradilla={
        rol
          ? `Has entrado como ${NOMBRE_DEL_ROL[rol].toLowerCase()}, y el panel de gestion es para el propietario y recepcion.`
          : 'Tu rol no permite abrir esta seccion.'
      }
    >
      <div className={estilos.acciones}>
        <Boton bloque onClick={() => void salir()}>
          Cerrar sesion
        </Boton>
      </div>
    </PantallaCentrada>
  );
}
