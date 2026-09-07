import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Aviso } from '../../src/componentes/aviso';
import { Campo } from '../../src/componentes/campo';
import { FilaDeAccion } from '../../src/componentes/fila-de-accion';
import { Pantalla } from '../../src/componentes/pantalla';
import { laSesionYaNoVale } from '../../src/auth/politica';
import { useSesion } from '../../src/auth/sesion';
import { RUTAS_INTERNAS } from '../../src/navegacion/destinos';
import { buscarSocios } from '../../src/panel/fuente';
import {
  ESPERA_MS,
  LETRAS_MINIMAS,
  debeBuscar,
  faseDeRespuesta,
  lineaDeSocio,
  siguePidiendose,
  type FaseDeBusqueda,
} from '../../src/panel/logica';
import { tema } from '../../src/tema';

/**
 * Buscar a un socio.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ EL SERVIDOR BUSCA. AQUI NO SE FILTRA NADA.                              │
 * │                                                                          │
 * │ `GET /gyms/:gymId/members?q=` ya busca por nombre, apellido, correo y    │
 * │ numero de socio. Traerse la lista entera para filtrarla en el telefono   │
 * │ significaria descargar todo el gimnasio —y con el, los correos y         │
 * │ telefonos de gente que nadie ha pedido ver— para enseñar una fila.       │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ NO SE PREGUNTA EN CADA TECLA.                                           │
 * │                                                                          │
 * │ Se espera a que dejen de escribir. Sin eso, «Fernández» son nueve        │
 * │ peticiones de las que ocho se tiran, y las respuestas pueden llegar      │
 * │ desordenadas: la de «Fern» despues de la de «Fernández» dejaria en       │
 * │ pantalla el resultado equivocado. Por eso ademas se descarta toda        │
 * │ respuesta que no sea de la ULTIMA consulta lanzada.                      │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export default function Buscar() {
  const { estado: sesion, revisar } = useSesion();
  const [texto, setTexto] = useState('');
  const [fase, setFase] = useState<FaseDeBusqueda>({ tipo: 'esperando' });

  const gymId = sesion.tipo === 'autenticado' ? sesion.gymId : null;

  /*
   * La ultima consulta lanzada. En una ref y no en el estado: se compara
   * dentro de una promesa que puede resolverse varios renders despues.
   */
  const ultima = useRef('');

  const buscar = useCallback(
    async (consulta: string) => {
      if (!gymId) return;
      ultima.current = consulta;
      setFase({ tipo: 'buscando' });
      try {
        const respuesta = await buscarSocios(gymId, consulta);
        // Llego tarde: ya se esta buscando otra cosa. Se tira.
        if (!siguePidiendose(consulta, ultima.current)) return;
        setFase(faseDeRespuesta(respuesta, consulta));
      } catch (problema) {
        if (laSesionYaNoVale([problema])) {
          void revisar();
          return;
        }
        if (!siguePidiendose(consulta, ultima.current)) return;
        setFase({ tipo: 'fallo', mensaje: 'No hemos podido buscar. Revisa la conexión.' });
      }
    },
    [gymId, revisar],
  );

  useEffect(() => {
    const consulta = texto.trim();
    if (!debeBuscar(consulta)) {
      ultima.current = '';
      setFase({ tipo: 'esperando' });
      return;
    }
    const temporizador = setTimeout(() => void buscar(consulta), ESPERA_MS);
    return () => clearTimeout(temporizador);
  }, [texto, buscar]);

  return (
    <Pantalla titulo="Buscar socio">
      <Campo
        etiqueta="Nombre, correo o número"
        ayuda={`Desde ${LETRAS_MINIMAS} letras.`}
        valor={texto}
        alCambiar={setTexto}
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="search"
      />

      {fase.tipo === 'esperando' ? (
        <Text style={estilos.pista}>
          Escribe el nombre, el correo o el número de socio para buscarlo.
        </Text>
      ) : null}

      {fase.tipo === 'buscando' ? (
        <View style={estilos.espera}>
          <ActivityIndicator color={tema.color.acento} />
        </View>
      ) : null}

      {fase.tipo === 'sinResultados' ? (
        <Aviso>{`No hay ningún socio que encaje con «${fase.consulta}».`}</Aviso>
      ) : null}

      {fase.tipo === 'fallo' ? <Aviso tono="peligro">{fase.mensaje}</Aviso> : null}

      {fase.tipo === 'resultados' ? (
        <View style={estilos.lista}>
          {fase.socios.map((socio) => {
            const linea = lineaDeSocio(socio);
            return (
              <FilaDeAccion
                key={socio.id}
                titulo={linea.titulo}
                detalle={linea.detalle}
                icono="perfil"
                alPulsar={() => router.push(RUTAS_INTERNAS.socioDelPanel(socio.id))}
              />
            );
          })}
          {/*
            Se dice cuantos hay en total cuando no caben todos: el servidor
            devuelve 25 por pagina y callarlo daria a entender que no hay mas.
          */}
          {fase.total > fase.socios.length ? (
            <Text style={estilos.pista}>
              Se muestran {fase.socios.length} de {fase.total}. Afina la búsqueda para ver el resto.
            </Text>
          ) : null}
        </View>
      ) : null}
    </Pantalla>
  );
}

const estilos = StyleSheet.create({
  lista: { gap: tema.espacio.sm },
  espera: { paddingVertical: tema.espacio.xxl, alignItems: 'center' },
  pista: { ...tema.texto.secundario, color: tema.color.textoSecundario, lineHeight: 22 },
});
