import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import type { LegalData, PrivacyDocumentStatus } from '@gymlab/contracts';
import { updateLegalDataSchema } from '@gymlab/contracts';
import { Aviso } from '../../src/componentes/aviso';
import { Boton } from '../../src/componentes/boton';
import { CabeceraDeVuelta } from '../../src/componentes/cabecera-de-vuelta';
import { Campo } from '../../src/componentes/campo';
import { Etiqueta } from '../../src/componentes/etiqueta';
import { Pantalla } from '../../src/componentes/pantalla';
import { Tarjeta } from '../../src/componentes/tarjeta';
import { laSesionYaNoVale, motivosDeFallo } from '../../src/auth/politica';
import { useSesion } from '../../src/auth/sesion';
import { fechaCivil } from '../../src/formato/fecha';
import {
  CAMPOS,
  cambiosDe,
  desdeDatos,
  explicarDocumento,
  faltantesLegibles,
  hayCambios,
  type Borrador,
} from '../../src/legal/logica';
import { puedeConfigurarLoLegal } from '../../src/legal/permisos';
import { cargarDocumento, cargarLegal, guardarLegal } from '../../src/legal/fuente';
import { tema } from '../../src/tema';

/**
 * Datos legales y privacidad. **Solo el dueño.**
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ SIN ESTA PANTALLA, UN GIMNASIO NUEVO NO PUEDE RECOGER NI UN PESO.       │
 * │                                                                          │
 * │ Publicar el documento de privacidad exige la identidad del responsable   │
 * │ —razon social, NIF, domicilio y un contacto—, y sin ella no se recoge    │
 * │ ningun consentimiento de datos de salud. Es la misma pantalla que        │
 * │ `/configuracion` en el panel web, con las mismas tres llamadas.          │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ EL GATE DEL GRUPO NO BASTA, Y POR ESO SE COMPRUEBA EL ROL AQUI DENTRO.  │
 * │                                                                          │
 * │ `(panel)` deja entrar a recepcion —comparten area— y estos dos           │
 * │ controladores son `@Roles('owner')` en la clase. Es el mismo caso que    │
 * │ retirar el acceso del personal: la fila no se pinta y, ademas, la        │
 * │ pantalla no llama a nada si el rol no es el que toca.                    │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Dos bloques separados a proposito: lo que el dueño RELLENA y lo que el
 * sistema HACE con ello. No hay boton de publicar porque no lo hay en el
 * producto: el documento se publica solo, cuando el primer socio lo necesita.
 */
interface Datos {
  legal: LegalData;
  documento: PrivacyDocumentStatus | null;
}

type Carga = { fase: 'cargando' } | { fase: 'ok'; datos: Datos } | { fase: 'fallo' };

export default function Configuracion() {
  const { estado: sesion, revisar } = useSesion();
  const [carga, setCarga] = useState<Carga>({ fase: 'cargando' });
  const [borrador, setBorrador] = useState<Borrador | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hecho, setHecho] = useState<string | null>(null);

  const gymId = sesion.tipo === 'autenticado' ? sesion.gymId : null;
  const miRol = sesion.tipo === 'autenticado' ? sesion.rol : null;
  const puedeConfigurar = miRol !== null && puedeConfigurarLoLegal(miRol);

  const pedir = useCallback(async () => {
    if (!gymId || !puedeConfigurar) return;
    const [legal, documento] = await Promise.allSettled([
      cargarLegal(gymId),
      cargarDocumento(gymId),
    ]);

    if (laSesionYaNoVale(motivosDeFallo([legal, documento]))) {
      void revisar();
      return;
    }
    if (legal.status === 'rejected') {
      setCarga({ fase: 'fallo' });
      return;
    }
    // El estado del documento es informativo: si falla, el formulario se
    // enseña igual. Lo imprescindible es poder rellenar los datos.
    setCarga({
      fase: 'ok',
      datos: {
        legal: legal.value,
        documento: documento.status === 'fulfilled' ? documento.value : null,
      },
    });
    setBorrador(desdeDatos(legal.value));
  }, [gymId, puedeConfigurar, revisar]);

  useEffect(() => {
    void pedir();
  }, [pedir]);

  async function guardar() {
    if (!gymId || guardando || carga.fase !== 'ok' || !borrador) return;

    const original = desdeDatos(carga.datos.legal);
    if (!hayCambios(borrador, original)) {
      setError(null);
      setHecho('No hay cambios que guardar.');
      return;
    }

    // El mismo contrato que valida el servidor: un correo mal escrito se
    // señala aqui en vez de gastar una peticion para que la rechacen.
    const revisado = updateLegalDataSchema.safeParse(cambiosDe(borrador, original));
    if (!revisado.success) {
      setHecho(null);
      setError('Revisa los datos: el email de privacidad no tiene un formato válido.');
      return;
    }

    setGuardando(true);
    setError(null);
    setHecho(null);
    try {
      const actualizado = await guardarLegal(gymId, revisado.data);
      /*
       * NO se reescribe el borrador con la respuesta: el dueño acaba de
       * teclearlo y verlo parpadear sugiere que algo se ha perdido. Lo que si
       * se actualiza es lo que el servidor dice que falta.
       */
      setHecho('Datos guardados.');
      /*
       * Y se vuelve a preguntar por el documento: completar el ultimo campo
       * que faltaba cambia su estado de «pendiente» a «listo para publicar», y
       * enseñar el anterior diria que sigue faltando algo que ya esta.
       *
       * Si esa segunda lectura falla no pasa nada: guardar ya salio bien, y
       * decir lo contrario seria mentir sobre lo que acaba de ocurrir.
       */
      const estado = await cargarDocumento(gymId).catch(() => null);
      setCarga({
        fase: 'ok',
        datos: { legal: actualizado, documento: estado ?? carga.datos.documento },
      });
    } catch (problema) {
      if (laSesionYaNoVale([problema])) {
        void revisar();
        return;
      }
      // Lo tecleado se queda: perderlo por un fallo del servidor obliga a
      // reescribir cuatro campos para reintentar.
      setError(
        problema instanceof Error && problema.message
          ? problema.message
          : 'No pudimos guardar los datos. Inténtalo de nuevo.',
      );
    } finally {
      setGuardando(false);
    }
  }

  if (!puedeConfigurar) {
    return (
      <Pantalla>
        <CabeceraDeVuelta titulo="Configuración" volverA="/panel" etiquetaDeVuelta="Panel" />
        <Aviso tono="informacion">
          Los datos legales del gimnasio los configura su propietario.
        </Aviso>
      </Pantalla>
    );
  }

  return (
    <Pantalla alRefrescar={carga.fase === 'ok' ? () => void pedir() : undefined}>
      <CabeceraDeVuelta
        titulo="Configuración"
        descriptor="Datos legales y privacidad"
        volverA="/panel"
        etiquetaDeVuelta="Panel"
      />

      {carga.fase === 'cargando' ? (
        <View style={estilos.centro}>
          <ActivityIndicator color={tema.color.acento} />
        </View>
      ) : carga.fase === 'fallo' ? (
        <Aviso tono="peligro">No hemos podido cargar la configuración.</Aviso>
      ) : (
        <>
          {error ? <Aviso tono="peligro">{error}</Aviso> : null}
          {hecho ? <Aviso tono="exito">{hecho}</Aviso> : null}

          <Responsable
            datos={carga.datos.legal}
            borrador={borrador ?? desdeDatos(carga.datos.legal)}
            alCambiar={(clave, valor) =>
              setBorrador((actual) => ({
                ...(actual ?? desdeDatos(carga.datos.legal)),
                [clave]: valor,
              }))
            }
            guardando={guardando}
            alGuardar={() => void guardar()}
          />

          {carga.datos.documento ? <Documento estado={carga.datos.documento} /> : null}
        </>
      )}
    </Pantalla>
  );
}

function Responsable({
  datos,
  borrador,
  alCambiar,
  guardando,
  alGuardar,
}: {
  datos: LegalData;
  borrador: Borrador;
  alCambiar: (clave: keyof Borrador, valor: string) => void;
  guardando: boolean;
  alGuardar: () => void;
}) {
  const faltan = faltantesLegibles(datos.missing);
  const completa = faltan.length === 0;

  return (
    <Tarjeta>
      <View style={estilos.bloque}>
        <View style={estilos.cabecera}>
          <Text style={estilos.titulo}>Datos del responsable</Text>
          <Etiqueta tono={completa ? 'exito' : 'aviso'}>
            {completa ? 'Completa' : 'Incompleta'}
          </Etiqueta>
        </View>

        <Text style={estilos.introduccion}>
          Es quien figura ante tus socios como responsable del tratamiento de sus datos. Se copia
          dentro del documento de privacidad al publicarlo, y los documentos ya publicados no
          cambian si luego editas esto.
        </Text>

        {/* Lo que falta va ANTES del formulario: quien entra a arreglar algo
            necesita saberlo antes de leer cuatro campos. */}
        {!completa ? (
          <Aviso tono="aviso">{`Faltan por rellenar: ${faltan.join(', ')}.`}</Aviso>
        ) : null}

        {CAMPOS.map((campo) => (
          <Campo
            key={campo.clave}
            etiqueta={campo.etiqueta}
            ayuda={campo.ayuda}
            valor={borrador[campo.clave]}
            alCambiar={(valor) => alCambiar(campo.clave, valor)}
            keyboardType={campo.teclado}
            autoCapitalize={campo.clave === 'privacyEmail' ? 'none' : 'sentences'}
            autoCorrect={false}
            deshabilitado={guardando}
          />
        ))}

        <Boton
          variante="primario"
          onPress={alGuardar}
          cargando={guardando}
          deshabilitado={guardando}
        >
          Guardar
        </Boton>
      </View>
    </Tarjeta>
  );
}

/**
 * El otro bloque: qué ha hecho el sistema con esos datos.
 *
 * No hay boton de publicar, y es deliberado — igual que en el panel. El
 * documento se publica solo cuando un socio lo necesita, de forma idempotente.
 * Una funcionalidad que depende de que alguien se acuerde de pulsar un boton
 * acaba apagada. Lo que si hace falta es que el dueño pueda SABER en qué punto
 * está.
 */
function Documento({ estado }: { estado: PrivacyDocumentStatus }) {
  const explicacion = explicarDocumento(estado.state);

  return (
    <Tarjeta>
      <View style={estilos.bloque}>
        <Text style={estilos.titulo}>Documento de privacidad</Text>

        <Aviso tono={explicacion.tono === 'error' ? 'peligro' : explicacion.tono}>
          {`${explicacion.titulo}. ${explicacion.detalle}`}
        </Aviso>

        <View style={estilos.dato}>
          <Text style={estilos.rotulo}>Versión activa en la plataforma</Text>
          <Text style={estilos.valor}>{estado.expectedVersion ?? 'Ninguna'}</Text>
        </View>
        <View style={estilos.dato}>
          <Text style={estilos.rotulo}>Versión publicada en tu gimnasio</Text>
          <Text style={estilos.valor}>{estado.publishedVersion ?? 'Ninguna'}</Text>
        </View>
        {estado.publishedAt ? (
          <View style={estilos.dato}>
            <Text style={estilos.rotulo}>Publicado el</Text>
            <Text style={estilos.valor}>{fechaCivil(estado.publishedAt)}</Text>
          </View>
        ) : null}
      </View>
    </Tarjeta>
  );
}

const estilos = StyleSheet.create({
  centro: { paddingVertical: tema.espacio.xl, alignItems: 'center' },
  bloque: { gap: tema.espacio.md },
  cabecera: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: tema.espacio.sm,
  },
  titulo: { ...tema.texto.h2, color: tema.color.texto, flexShrink: 1 },
  introduccion: { ...tema.texto.secundario, color: tema.color.textoSecundario, lineHeight: 20 },
  dato: { gap: 2 },
  rotulo: {
    ...tema.texto.meta,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: tema.color.textoSecundario,
  },
  valor: { ...tema.texto.cuerpo, color: tema.color.texto },
});
