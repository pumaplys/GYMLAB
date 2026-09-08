import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import type { Plan } from '@gymlab/contracts';
import { Aviso } from '../../../src/componentes/aviso';
import { Boton } from '../../../src/componentes/boton';
import { CabeceraDeVuelta } from '../../../src/componentes/cabecera-de-vuelta';
import { FilaDeAccion } from '../../../src/componentes/fila-de-accion';
import { Pantalla } from '../../../src/componentes/pantalla';
import { laSesionYaNoVale } from '../../../src/auth/politica';
import { useSesion } from '../../../src/auth/sesion';
import { importe } from '../../../src/perfil/logica';
import { lineaDePlan, ordenarPlanes } from '../../../src/cobros/logica';
import { puedeEditarPlanes } from '../../../src/socios/permisos';
import { cargarPlanes } from '../../../src/socios/fuente';
import { RUTAS_INTERNAS } from '../../../src/navegacion/destinos';
import { tema } from '../../../src/tema';

/**
 * Los planes del gimnasio.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ VERLOS ES DE LOS DOS; CAMBIARLOS, DEL DUEÑO.                            │
 * │                                                                          │
 * │ `PlansController` lleva `@Roles('owner')` en la clase y baja a           │
 * │ `@Roles('owner', 'receptionist')` SOLO en el `GET`. Tiene sentido:       │
 * │ recepcion necesita la lista para dar de alta una cuota, no para cambiar  │
 * │ los precios. Por eso esta pantalla la ven los dos y los botones de       │
 * │ crear y editar solo aparecen para el dueño.                              │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Los archivados se quedan abajo: siguen sosteniendo suscripciones vivas, y en
 * V1 no se desarchivan. Esconderlos haria pensar que se han borrado.
 */
type Carga = { fase: 'cargando' } | { fase: 'ok'; planes: Plan[] } | { fase: 'fallo' };

export default function Planes() {
  const { estado: sesion, revisar } = useSesion();
  const [carga, setCarga] = useState<Carga>({ fase: 'cargando' });

  const gymId = sesion.tipo === 'autenticado' ? sesion.gymId : null;
  const puedeEditar = sesion.tipo === 'autenticado' && puedeEditarPlanes(sesion.rol);

  const pedir = useCallback(async () => {
    if (!gymId) return;
    setCarga({ fase: 'cargando' });
    try {
      setCarga({ fase: 'ok', planes: ordenarPlanes(await cargarPlanes(gymId)) });
    } catch (problema) {
      if (laSesionYaNoVale([problema])) {
        void revisar();
        return;
      }
      setCarga({ fase: 'fallo' });
    }
  }, [gymId, revisar]);

  useEffect(() => {
    void pedir();
  }, [pedir]);

  return (
    <Pantalla alRefrescar={carga.fase === 'ok' ? () => void pedir() : undefined}>
      <CabeceraDeVuelta titulo="Planes" volverA="/panel" etiquetaDeVuelta="Panel" />

      {puedeEditar ? (
        <Boton variante="primario" onPress={() => router.push(RUTAS_INTERNAS.planNuevo)}>
          Nuevo plan
        </Boton>
      ) : null}

      {carga.fase === 'cargando' ? (
        <View style={estilos.centrado}>
          <ActivityIndicator color={tema.color.acento} />
        </View>
      ) : null}

      {carga.fase === 'fallo' ? (
        <>
          <Aviso tono="peligro">No pudimos cargar los planes.</Aviso>
          <Boton onPress={() => void pedir()}>Reintentar</Boton>
        </>
      ) : null}

      {carga.fase === 'ok' ? (
        <View style={estilos.lista}>
          {carga.planes.map((plan) => (
            <FilaDeAccion
              key={plan.id}
              titulo={plan.name}
              detalle={lineaDePlan(plan, importe)}
              icono="pagos"
              alPulsar={() => router.push(RUTAS_INTERNAS.plan(plan.id))}
              accessibilityHint={puedeEditar ? 'Abre el plan para editarlo' : 'Abre el plan'}
            />
          ))}
          {carga.planes.length === 0 ? (
            <Text style={estilos.vacio}>
              {puedeEditar
                ? 'Todavía no hay ningún plan. Crea el primero para poder dar de alta cuotas.'
                : 'Todavía no hay ningún plan. Quien lleva el gimnasio los crea desde el panel.'}
            </Text>
          ) : null}
        </View>
      ) : null}
    </Pantalla>
  );
}

const estilos = StyleSheet.create({
  centrado: { paddingVertical: tema.espacio.xl, alignItems: 'center' },
  lista: { gap: tema.espacio.sm },
  vacio: { ...tema.texto.secundario, color: tema.color.textoSecundario, lineHeight: 22 },
});
