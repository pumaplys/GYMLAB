import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import type { Member } from '@gymlab/contracts';
import { updateMemberSchema } from '@gymlab/contracts';
import { Aviso } from '../../../../src/componentes/aviso';
import { Boton } from '../../../../src/componentes/boton';
import { CabeceraDeVuelta } from '../../../../src/componentes/cabecera-de-vuelta';
import { Pantalla } from '../../../../src/componentes/pantalla';
import { laSesionYaNoVale } from '../../../../src/auth/politica';
import { useSesion } from '../../../../src/auth/sesion';
import { FormularioDeSocio } from '../../../../src/socios/formulario';
import { edicionAEnvio, type DatosDeSocio } from '../../../../src/socios/gestion';
import { actualizarSocio } from '../../../../src/socios/fuente';
import { cargarSocio } from '../../../../src/panel/fuente';
import { RUTAS_INTERNAS } from '../../../../src/navegacion/destinos';
import { tema } from '../../../../src/tema';

/**
 * Editar los datos de un socio.
 *
 * Se carga la ficha antes de pintar el formulario: montarlo con los campos
 * vacios y rellenarlos despues haria que quien escribe rapido perdiera lo
 * tecleado en cuanto llegara la respuesta.
 */
export default function EditarSocio() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { estado: sesion, revisar } = useSesion();
  const [socio, setSocio] = useState<Member | null>(null);
  const [fallo, setFallo] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const gymId = sesion.tipo === 'autenticado' ? sesion.gymId : null;

  const pedir = useCallback(async () => {
    if (!gymId || !id) return;
    setFallo(false);
    try {
      setSocio(await cargarSocio(gymId, id));
    } catch (problema) {
      if (laSesionYaNoVale([problema])) {
        void revisar();
        return;
      }
      setFallo(true);
    }
  }, [gymId, id, revisar]);

  useEffect(() => {
    void pedir();
  }, [pedir]);

  async function guardar(datos: DatosDeSocio) {
    if (!gymId || !id || guardando) return;
    const revisado = updateMemberSchema.safeParse(edicionAEnvio(datos));
    if (!revisado.success) {
      setError('Revisa los datos: algo no tiene el formato correcto.');
      return;
    }
    setGuardando(true);
    setError(null);
    try {
      await actualizarSocio(gymId, id, revisado.data);
      router.replace(RUTAS_INTERNAS.socioDelPanel(id));
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

  return (
    <Pantalla>
      <CabeceraDeVuelta
        titulo={socio ? `${socio.firstName} ${socio.lastName}` : 'Editar socio'}
        descriptor={socio ? `nº ${socio.memberNumber}` : undefined}
        volverA={id ? RUTAS_INTERNAS.socioDelPanel(id) : '/buscar'}
        etiquetaDeVuelta="Ficha"
      />

      {fallo ? (
        <>
          <Aviso tono="peligro">No pudimos cargar la ficha.</Aviso>
          <Boton onPress={() => void pedir()}>Reintentar</Boton>
        </>
      ) : null}

      {socio === null && !fallo ? (
        <View style={estilos.centrado}>
          <ActivityIndicator color={tema.color.acento} />
        </View>
      ) : null}

      {socio !== null ? (
        <FormularioDeSocio
          socio={socio}
          guardando={guardando}
          etiqueta="Guardar cambios"
          error={error}
          onGuardar={(datos) => void guardar(datos)}
        />
      ) : null}
    </Pantalla>
  );
}

const estilos = StyleSheet.create({
  centrado: { paddingVertical: tema.espacio.xl, alignItems: 'center' },
});
