import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { HealthConsentStatus } from '@gymlab/contracts';
import { recordBodyMetricSchema } from '@gymlab/contracts';
import { Aviso } from '../componentes/aviso';
import { Boton } from '../componentes/boton';
import { Campo } from '../componentes/campo';
import { laSesionYaNoVale } from '../auth/politica';
import { MEDIDAS } from './logica';
import {
  aEnvio,
  borradorVacio,
  erroresDe,
  estadoDelConsentimiento,
  type Borrador,
} from './registro';
import { registrarMedicion } from '../entrenador/fuente';
import { tema } from '../tema';

/**
 * Registrar el peso y las medidas de un socio.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ EL ENTRENADOR RESPETA EL CONSENTIMIENTO. NO LO CONCEDE.                  │
 * │                                                                          │
 * │ Son datos de salud (RGPD art. 9) y su base legal es el consentimiento    │
 * │ EXPLICITO del interesado. La API deja tecnicamente que el personal lo    │
 * │ registre —esta pensada para recogerlo en el mostrador con el socio       │
 * │ delante— pero desde aqui no hay boton para hacerlo, igual que en el      │
 * │ panel web: un consentimiento que otorga otro en tu nombre, sin que tu    │
 * │ estes, no es consentimiento. El socio lo concede y lo retira en su       │
 * │ propia pantalla de privacidad.                                           │
 * │                                                                          │
 * │ Aqui solo caben dos cosas: leer lo que ya existe, y escribir cuando el   │
 * │ socio ya ha autorizado.                                                  │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Y esconder el formulario NO es la barrera: la barrera es que el servicio
 * rechaza toda escritura sin consentimiento vigente, venga de donde venga.
 * Esto solo evita ofrecer un boton que va a fallar.
 */
export function RegistroDeMedicion({
  gymId,
  socioId,
  nombre,
  /** `null` es «no se pudo consultar», distinto de «no lo ha aceptado». */
  consentimiento,
  alRegistrar,
  alCaducarSesion,
}: {
  gymId: string | null;
  socioId: string;
  nombre: string;
  consentimiento: HealthConsentStatus | null;
  alRegistrar: () => void;
  alCaducarSesion: () => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const [borrador, setBorrador] = useState<Borrador>(borradorVacio);
  const [intentado, setIntentado] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hecho, setHecho] = useState(false);

  if (consentimiento === null) {
    return <Text style={estilos.texto}>No hemos podido comprobar su consentimiento.</Text>;
  }

  const estado = estadoDelConsentimiento(consentimiento);
  const errores = intentado ? erroresDe(borrador) : {};

  function cerrar() {
    setAbierto(false);
    setBorrador(borradorVacio());
    setIntentado(false);
    setError(null);
  }

  async function guardar() {
    if (!gymId || guardando) return;
    setIntentado(true);
    setError(null);
    if (Object.keys(erroresDe(borrador)).length > 0) return;

    const revisado = recordBodyMetricSchema.safeParse(aEnvio(borrador));
    if (!revisado.success) return;

    setGuardando(true);
    try {
      await registrarMedicion(gymId, socioId, revisado.data);
      // Solo al ir bien se limpia. Si falla, lo escrito sigue donde estaba.
      cerrar();
      setHecho(true);
      alRegistrar();
    } catch (problema) {
      if (laSesionYaNoVale([problema])) {
        alCaducarSesion();
        return;
      }
      setError(
        problema instanceof Error && problema.message
          ? problema.message
          : 'No pudimos registrar la medición. Inténtalo de nuevo.',
      );
    } finally {
      setGuardando(false);
    }
  }

  /*
   * Sin consentimiento se explica QUE falta y A QUIEN le toca, sin convertir
   * la pantalla en un texto legal ni ofrecer una forma de saltarselo.
   */
  if (estado === 'sin-texto') {
    return (
      <Aviso tono="informacion">
        Este gimnasio todavía no tiene publicado el texto del consentimiento de datos de salud, así
        que no se puede registrar peso ni medidas de nadie. No es algo que se resuelva desde aquí.
      </Aviso>
    );
  }

  if (estado === 'sin-aceptar') {
    return (
      <Aviso tono="informacion">
        {`${nombre} no ha autorizado el tratamiento de sus datos de salud, así que no se pueden registrar mediciones. Tiene que autorizarlo la propia persona.`}
      </Aviso>
    );
  }

  if (!abierto) {
    return (
      <View style={estilos.bloque}>
        {hecho ? <Aviso tono="exito">Medición registrada.</Aviso> : null}
        <Boton
          onPress={() => {
            setAbierto(true);
            // El «registrada» de la vez anterior se va al empezar otra: dejarlo
            // encima de un formulario en blanco dice que ya se guardo algo que
            // todavia no se ha escrito.
            setHecho(false);
          }}
        >
          Registrar medición
        </Boton>
      </View>
    );
  }

  return (
    <View style={estilos.bloque}>
      {error ? <Aviso tono="peligro">{error}</Aviso> : null}
      {errores.general ? <Aviso tono="peligro">{errores.general}</Aviso> : null}

      {MEDIDAS.map((medida) => (
        <Campo
          key={medida.campo}
          etiqueta={`${medida.etiqueta} (${medida.unidad})`}
          ayuda="Opcional."
          valor={borrador.medidas[medida.campo]}
          alCambiar={(valor) =>
            setBorrador((actual) => ({
              ...actual,
              medidas: { ...actual.medidas, [medida.campo]: valor },
            }))
          }
          error={errores[medida.campo]}
          keyboardType="decimal-pad"
          deshabilitado={guardando}
        />
      ))}

      <Campo
        etiqueta="Fecha de la medición"
        ayuda="Opcional. AAAA-MM-DD. Si se deja en blanco, se guarda con la de hoy. No se admite el futuro."
        valor={borrador.fecha}
        alCambiar={(valor) => setBorrador((actual) => ({ ...actual, fecha: valor }))}
        error={errores.fecha}
        autoCapitalize="none"
        autoCorrect={false}
        deshabilitado={guardando}
      />

      <Campo
        etiqueta="Notas"
        ayuda="Opcional."
        valor={borrador.notas}
        alCambiar={(valor) => setBorrador((actual) => ({ ...actual, notas: valor }))}
        error={errores.notas}
        deshabilitado={guardando}
      />

      <Boton
        variante="primario"
        onPress={() => void guardar()}
        cargando={guardando}
        deshabilitado={guardando}
      >
        Guardar medición
      </Boton>
      <Boton onPress={cerrar} deshabilitado={guardando}>
        Cancelar
      </Boton>
    </View>
  );
}

const estilos = StyleSheet.create({
  bloque: { gap: tema.espacio.md },
  texto: { ...tema.texto.secundario, color: tema.color.textoSecundario },
});
