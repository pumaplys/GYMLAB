import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import type { Plan } from '@gymlab/contracts';
import { updatePlanSchema } from '@gymlab/contracts';
import { Aviso } from '../../../src/componentes/aviso';
import { Boton } from '../../../src/componentes/boton';
import { CabeceraDeVuelta } from '../../../src/componentes/cabecera-de-vuelta';
import { Etiqueta } from '../../../src/componentes/etiqueta';
import { Pantalla } from '../../../src/componentes/pantalla';
import { laSesionYaNoVale } from '../../../src/auth/politica';
import { useSesion } from '../../../src/auth/sesion';
import { importe } from '../../../src/perfil/logica';
import { FormularioDePlan } from '../../../src/cobros/formulario-de-plan';
import { lineaDePlan, tieneSentidoArchivarPlan } from '../../../src/cobros/logica';
import { puedeEditarPlanes } from '../../../src/socios/permisos';
import { actualizarPlan, archivarPlan, cargarPlanes } from '../../../src/socios/fuente';
import { RUTAS_INTERNAS } from '../../../src/navegacion/destinos';
import { tema } from '../../../src/tema';

/**
 * Un plan: editarlo o archivarlo.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ NO HAY ENDPOINT PARA UN PLAN SUELTO.                                    │
 * │                                                                          │
 * │ La API ofrece la lista entera y nada mas. Se carga y se busca dentro; no │
 * │ es caro —la lista viaja de una vez— y no se inventa un endpoint que no   │
 * │ existe. Es lo mismo que se hace con un ejercicio de la biblioteca.       │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Recepcion puede VER esta pantalla pero no cambiar nada: el formulario y el
 * archivado solo aparecen para el dueño.
 */
type Carga = { fase: 'cargando' } | { fase: 'ok'; plan: Plan } | { fase: 'noEsta' } | { fase: 'fallo' };

export default function PlanDelGimnasio() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { estado: sesion, revisar } = useSesion();
  const [carga, setCarga] = useState<Carga>({ fase: 'cargando' });
  const [guardando, setGuardando] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const gymId = sesion.tipo === 'autenticado' ? sesion.gymId : null;
  const puedeEditar = sesion.tipo === 'autenticado' && puedeEditarPlanes(sesion.rol);

  const pedir = useCallback(async () => {
    if (!gymId || !id) return;
    setCarga({ fase: 'cargando' });
    try {
      const encontrado = (await cargarPlanes(gymId)).find((p) => p.id === id);
      setCarga(encontrado ? { fase: 'ok', plan: encontrado } : { fase: 'noEsta' });
    } catch (problema) {
      if (laSesionYaNoVale([problema])) {
        void revisar();
        return;
      }
      setCarga({ fase: 'fallo' });
    }
  }, [gymId, id, revisar]);

  useEffect(() => {
    void pedir();
  }, [pedir]);

  async function guardar(datos: { nombre: string; descripcion: string; centimos: number }) {
    if (!gymId || !id || guardando) return;
    const revisado = updatePlanSchema.safeParse({
      name: datos.nombre.trim(),
      priceCents: datos.centimos,
      ...(datos.descripcion.trim() ? { description: datos.descripcion.trim() } : {}),
    });
    if (!revisado.success) {
      setError('Revisa los datos: algo no tiene el formato correcto.');
      return;
    }
    setGuardando(true);
    setError(null);
    try {
      await actualizarPlan(gymId, id, revisado.data);
      router.replace(RUTAS_INTERNAS.planes);
    } catch (problema) {
      if (laSesionYaNoVale([problema])) {
        void revisar();
        return;
      }
      setError(
        problema instanceof Error && problema.message
          ? problema.message
          : 'No pudimos guardar los cambios. Inténtalo de nuevo.',
      );
      setGuardando(false);
    }
  }

  async function archivar() {
    if (!gymId || !id) return;
    setGuardando(true);
    setError(null);
    try {
      setCarga({ fase: 'ok', plan: await archivarPlan(gymId, id) });
      setConfirmando(false);
    } catch (problema) {
      if (laSesionYaNoVale([problema])) {
        void revisar();
        return;
      }
      setError(
        problema instanceof Error && problema.message
          ? problema.message
          : 'No pudimos archivarlo. Inténtalo de nuevo.',
      );
      setConfirmando(false);
    } finally {
      setGuardando(false);
    }
  }

  const plan = carga.fase === 'ok' ? carga.plan : null;

  return (
    <Pantalla>
      <CabeceraDeVuelta
        titulo={plan?.name ?? 'Plan'}
        descriptor={plan ? lineaDePlan(plan, importe) : undefined}
        volverA={RUTAS_INTERNAS.planes}
        etiquetaDeVuelta="Planes"
      />

      {error ? <Aviso tono="peligro">{error}</Aviso> : null}

      {carga.fase === 'cargando' ? (
        <View style={estilos.centrado}>
          <ActivityIndicator color={tema.color.acento} />
        </View>
      ) : null}

      {carga.fase === 'noEsta' ? <Aviso tono="aviso">Ese plan ya no existe.</Aviso> : null}

      {carga.fase === 'fallo' ? (
        <>
          <Aviso tono="peligro">No pudimos cargar el plan.</Aviso>
          <Boton onPress={() => void pedir()}>Reintentar</Boton>
        </>
      ) : null}

      {plan ? (
        <>
          {plan.status !== 'active' ? <Etiqueta tono="neutro">Archivado</Etiqueta> : null}

          {puedeEditar ? (
            <FormularioDePlan
              plan={plan}
              guardando={guardando}
              etiqueta="Guardar cambios"
              error={null}
              onGuardar={(datos) => void guardar(datos)}
            />
          ) : (
            <Text style={estilos.soloLectura}>
              {plan.description ?? 'Sin descripción.'}
            </Text>
          )}

          {puedeEditar && tieneSentidoArchivarPlan(plan.status) ? (
            confirmando ? (
              <View style={estilos.confirmar}>
                <Text style={estilos.pregunta}>
                  ¿Archivarlo? Dejará de poder contratarse. Las suscripciones que ya lo usan
                  siguen igual, y en esta versión no se puede desarchivar.
                </Text>
                <Boton
                  variante="peligro"
                  onPress={() => void archivar()}
                  cargando={guardando}
                  deshabilitado={guardando}
                >
                  Sí, archivarlo
                </Boton>
                <Boton onPress={() => setConfirmando(false)} deshabilitado={guardando}>
                  Dejarlo como está
                </Boton>
              </View>
            ) : (
              <Boton onPress={() => setConfirmando(true)}>Archivar</Boton>
            )
          ) : null}
        </>
      ) : null}
    </Pantalla>
  );
}

const estilos = StyleSheet.create({
  centrado: { paddingVertical: tema.espacio.xl, alignItems: 'center' },
  soloLectura: { ...tema.texto.secundario, color: tema.color.textoSecundario, lineHeight: 22 },
  confirmar: { gap: tema.espacio.md },
  pregunta: { ...tema.texto.secundario, color: tema.color.texto, lineHeight: 22 },
});
