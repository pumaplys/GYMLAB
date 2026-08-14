'use client';

import { Boton } from '@/componentes/boton';
import { NOMBRE_DEL_ROL } from '@/lib/roles';
import { useSesion } from '@/lib/sesion';
import estilos from './banda-de-contexto.module.css';

/**
 * Donde estoy y quien soy. Lo comparten las tres areas.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ SE EXTRAJO DE `Marco` PARA QUE NO HUBIERA TRES COPIAS.                   │
 * │                                                                          │
 * │ El panel, el area de entrenador y la de socio necesitan lo mismo: marca, │
 * │ gimnasio activo, quien eres y salir. Lo que NO comparten es lo que va    │
 * │ debajo — el panel lleva una fila de destinos, el entrenador todavia no y │
 * │ el socio sera otra cosa.                                                 │
 * │                                                                          │
 * │ Asi que se comparte la banda y no el layout: cada area la coloca y luego │
 * │ hace lo suyo. Es lo contrario de un `Marco` con banderas para decidir    │
 * │ cual de las tres aplicaciones esta pintando.                             │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Cambiar de gimnasio puede cambiar de AREA —quien es entrenadora en uno puede
 * ser socia en otro— y por eso el selector no navega a mano a ningun sitio:
 * `elegirGimnasio` vuelve a preguntar al servidor y la redireccion la decide
 * `RutaPrivada` con el rol nuevo. Suponerlo aqui es como se desincroniza.
 */
export function BandaDeContexto() {
  const { estado, rol, gymId, salir, elegirGimnasio } = useSesion();

  const yo = estado.fase === 'identificado' ? estado.yo : null;
  if (!yo) return null;

  const actual = yo.memberships.find((m) => m.gymId === gymId);

  return (
    <div className={estilos.contexto}>
      <span className={estilos.marca}>GYMLAB</span>
      <span className={estilos.division} aria-hidden="true" />

      {yo.memberships.length > 1 ? (
        // Un desplegable y no un menu propio: cambiar de gimnasio es elegir
        // entre opciones excluyentes, que es exactamente lo que un `select`
        // hace ya con teclado, lector de pantalla y movil.
        <>
          <label className="solo-lectores" htmlFor="gimnasio-activo">
            Gimnasio activo
          </label>
          <select
            id="gimnasio-activo"
            className={estilos.selector}
            value={gymId ?? ''}
            onChange={(evento) => void elegirGimnasio(evento.target.value)}
          >
            {yo.memberships.map((pertenencia) => (
              <option key={pertenencia.gymId} value={pertenencia.gymId}>
                {pertenencia.gymName}
              </option>
            ))}
          </select>
        </>
      ) : (
        <span className={estilos.gimnasio}>{actual?.gymName}</span>
      )}

      <div className={estilos.cuenta}>
        <span className={estilos.identidad}>
          <span className={estilos.nombre}>{yo.user.name}</span>
          {rol && <span className={estilos.rol}>{NOMBRE_DEL_ROL[rol]}</span>}
        </span>
        <Boton variante="sutil" onClick={() => void salir()}>
          Salir
        </Boton>
      </div>
    </div>
  );
}
