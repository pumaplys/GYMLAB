import { useMemo } from 'react';
import { Redirect, useLocalSearchParams } from 'expo-router';
import { ApiError } from '@gymlab/api-client';
import { ContextoDeSesion, type Sesion } from '../../src/auth/sesion';
import { CASOS, type Caso } from '../../src/vista-previa/casos';
import { Arranque } from '../../src/componentes/arranque';
import ElegirGimnasio from '../elegir-gimnasio';
import Entrar from '../entrar';
import NoAdmitido from '../no-admitido';
import Problema from '../problema';
import SesionLista from '../sesion-lista';

/**
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ VISTA PREVIA VISUAL. NO ES PARTE DEL PRODUCTO.                          │
 * │                                                                          │
 * │ Existe porque la validacion en iPhone esta bloqueada por la instalacion   │
 * │ de Expo Go SDK 57, y hace falta PODER MIRAR las pantallas antes de        │
 * │ decidir cambios de diseño.                                              │
 * │                                                                          │
 * │ Lo unico que se sustituye es el VALOR del contexto de sesion. Las         │
 * │ pantallas que se montan aqui son las de verdad, importadas de `app/`,    │
 * │ con sus componentes, sus tokens y sus textos: si el diseño cambia, esto  │
 * │ cambia con el, porque no hay una segunda copia que pueda divergir.       │
 * │                                                                          │
 * │ Aislamiento: sin `EXPO_PUBLIC_VISTA_PREVIA=1` esta ruta no pinta nada y   │
 * │ manda a la puerta. En un build de produccion la variable no existe, asi   │
 * │ que no hay forma de llegar. Y nada de aqui toca token, SecureStore, red   │
 * │ ni switchGym: las funciones de sesion son inertes a proposito.           │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
const HABILITADA = process.env.EXPO_PUBLIC_VISTA_PREVIA === '1';

export default function VistaPrevia() {
  const { caso: nombre } = useLocalSearchParams<{ caso: string }>();
  const caso = typeof nombre === 'string' ? CASOS[nombre] : undefined;

  const sesion = useMemo(() => (caso ? sesionDeMuestra(caso) : null), [caso]);

  if (!HABILITADA || !caso || !sesion) return <Redirect href="/" />;

  return (
    <ContextoDeSesion.Provider value={sesion}>
      <Cuerpo caso={caso} />
    </ContextoDeSesion.Provider>
  );
}

function Cuerpo({ caso }: { caso: Caso }) {
  switch (caso.pantalla) {
    case 'entrar':
      return <Entrar />;
    case 'arranque':
      return <Arranque />;
    case 'sesion-lista':
      return <SesionLista />;
    case 'no-admitido':
      return <NoAdmitido />;
    case 'problema':
      return <Problema />;
    case 'elegir-gimnasio':
      return <ElegirGimnasio />;
  }
}

/**
 * Un valor de sesion de mentira.
 *
 * `entrar` es lo unico que hace algo, y solo para poder VER dos estados que
 * viven dentro de la pantalla de login y no en el contexto: el error y la
 * espera. Se provocan por el camino de verdad —escribiendo y pulsando— asi que
 * el mensaje que sale lo genera `mensajeDeEntrada`, no esta escrito a mano.
 */
function sesionDeMuestra(caso: Caso): Sesion {
  const inerte = async () => undefined;

  const entrar =
    caso.entrada === 'falla401'
      ? async () => {
          throw new ApiError(401, 'Unauthorized');
        }
      : caso.entrada === 'nunca-termina'
        ? () => new Promise<void>(() => undefined)
        : inerte;

  return {
    estado: caso.estado,
    entrar,
    salir: inerte,
    elegirGimnasio: inerte,
    revisar: inerte,
  };
}
