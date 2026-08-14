'use client';

import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import type { Me, Role } from '@gymlab/contracts';
import { Aviso } from '@/componentes/aviso';
import { Boton } from '@/componentes/boton';
import { PantallaCentrada } from '@/componentes/pantalla-centrada';
import { destinoSegunArea } from '@/lib/areas';
import { mensajeDeError } from '@/lib/errores';
import { NOMBRE_DEL_ROL } from '@/lib/roles';
import { useSesion } from '@/lib/sesion';
import estilos from './ruta-privada.module.css';

interface Props {
  /**
   * Restriccion FINA dentro de un area, no entre areas.
   *
   * El area la deduce este componente de la propia ruta, asi que una pantalla
   * no tiene que declarar a cual pertenece. Esto es para el caso distinto: los
   * planes son del panel, pero dentro del panel solo del dueno. Recepcion no
   * se va a otra aplicacion por eso — se queda en la suya y se le dice que no.
   */
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
  const ruta = usePathname();

  /*
   * A donde hay que mandar a esta persona, si es que hay que mandarla.
   *
   * Sale de una funcion pura que solo recibe el rol de la pertenencia ACTIVA y
   * la ruta. Ni el usuario ni sus otras pertenencias entran aqui: quien es
   * entrenadora en un gimnasio y socia en otro cambia de area al cambiar de
   * gimnasio, y eso funciona solo porque la decision no mira mas que el rol de
   * donde esta ahora.
   */
  const aOtraArea = rol ? destinoSegunArea(rol, ruta) : null;

  useEffect(() => {
    if (estado.fase === 'anonimo') router.replace('/login');
  }, [estado.fase, router]);

  useEffect(() => {
    if (aOtraArea) router.replace(aOtraArea);
  }, [aOtraArea, router]);

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

  /*
   * Area equivocada: se lleva a la suya en lugar de dar un callejon sin salida.
   *
   * Antes esto pintaba "esta seccion no es para tu rol" con un boton de cerrar
   * sesion, que era la unica respuesta posible cuando entrenador y socio no
   * tenian ningun sitio donde estar. Ahora lo tienen, asi que teclear la URL
   * del panel siendo entrenador no es un error: es ir a un sitio que no es el
   * tuyo, y lo razonable es llevarte al tuyo.
   */
  if (aOtraArea) return <Esperando texto="Llevandote a tu area…" />;

  // Restriccion fina DENTRO del area, que si es un no: recepcion en planes.
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
 * Una seccion restringida DENTRO del area propia.
 *
 * Ya no cubre a entrenadores ni socios —esos tienen su area y se les lleva a
 * ella—, sino el caso que queda: recepcion abriendo los planes, que son del
 * panel pero decision del dueno. Por eso el boton no es "cerrar sesion" sino
 * volver a su propia seccion: esta persona esta en su aplicacion, solo que en
 * una puerta que no es suya.
 */
function SinAcceso({ rol }: { rol: Role | null }) {
  const router = useRouter();
  return (
    <PantallaCentrada
      titulo="Esta seccion no es para tu rol"
      entradilla={
        rol
          ? `Has entrado como ${NOMBRE_DEL_ROL[rol].toLowerCase()}, y esta seccion la lleva el propietario.`
          : 'Tu rol no permite abrir esta seccion.'
      }
    >
      <div className={estilos.acciones}>
        <Boton variante="primario" bloque onClick={() => router.replace('/socios')}>
          Volver a Socios
        </Boton>
      </div>
    </PantallaCentrada>
  );
}
