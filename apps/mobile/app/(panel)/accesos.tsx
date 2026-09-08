import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import type { AccessEventList } from '@gymlab/contracts';
import { Aviso } from '../../src/componentes/aviso';
import { Boton } from '../../src/componentes/boton';
import { CabeceraDeVuelta } from '../../src/componentes/cabecera-de-vuelta';
import { Etiqueta } from '../../src/componentes/etiqueta';
import { Pantalla } from '../../src/componentes/pantalla';
import { Tarjeta } from '../../src/componentes/tarjeta';
import { laSesionYaNoVale } from '../../src/auth/politica';
import { useSesion } from '../../src/auth/sesion';
import { fechaCortaDeInstante, horaDeInstante } from '../../src/formato/fecha';
import { POR_PAGINA, lineaDeEvento } from '../../src/accesos/historial';
import { cargarAccesos } from '../../src/personal/fuente';
import { tema } from '../../src/tema';

/**
 * El historial de la puerta.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ NO REPITE LA DECISION: LA CUENTA.                                       │
 * │                                                                          │
 * │ Los motivos y los colores salen de `escaner/logica.ts`, el mismo modulo  │
 * │ que usa el escaner validado en iPhone. Si aqui hubiera una segunda tabla │
 * │ el mismo intento se explicaria de dos maneras — y quien atiende no       │
 * │ sabria cual creer.                                                       │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Sin filtros ni buscador, porque el panel web tampoco los tiene: pide las
 * ultimas 25 y ya esta. Inventarlos aqui seria una capacidad que la web no da.
 */
type Carga = { fase: 'cargando' } | { fase: 'ok'; datos: AccessEventList } | { fase: 'fallo' };

export default function Accesos() {
  const { estado: sesion, revisar } = useSesion();
  const [carga, setCarga] = useState<Carga>({ fase: 'cargando' });
  const [refrescando, setRefrescando] = useState(false);

  const gymId = sesion.tipo === 'autenticado' ? sesion.gymId : null;

  const pedir = useCallback(async () => {
    if (!gymId) return;
    try {
      setCarga({ fase: 'ok', datos: await cargarAccesos(gymId, POR_PAGINA) });
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

  const refrescar = useCallback(() => {
    setRefrescando(true);
    void pedir().finally(() => setRefrescando(false));
  }, [pedir]);

  return (
    <Pantalla
      alRefrescar={carga.fase === 'ok' ? refrescar : undefined}
      refrescando={refrescando}
    >
      <CabeceraDeVuelta titulo="Accesos" volverA="/panel" etiquetaDeVuelta="Panel" />

      {carga.fase === 'cargando' ? (
        <View style={estilos.centrado}>
          <ActivityIndicator color={tema.color.acento} />
        </View>
      ) : null}

      {carga.fase === 'fallo' ? (
        <>
          <Aviso tono="peligro">No pudimos cargar el historial de accesos.</Aviso>
          <Boton onPress={() => void pedir()}>Reintentar</Boton>
        </>
      ) : null}

      {carga.fase === 'ok' ? (
        <View style={estilos.lista}>
          {carga.datos.items.map((evento) => {
            const linea = lineaDeEvento(evento);
            return (
              <Tarjeta key={evento.id}>
                <View style={estilos.bloque}>
                  <View style={estilos.cabecera}>
                    <Text style={estilos.titulo}>{linea.titulo}</Text>
                    <Etiqueta
                      tono={
                        linea.tono === 'exito'
                          ? 'exito'
                          : linea.tono === 'aviso'
                            ? 'aviso'
                            : 'peligro'
                      }
                    >
                      {evento.decision}
                    </Etiqueta>
                  </View>
                  <Text style={estilos.detalle}>{linea.motivo}</Text>
                  <Text style={estilos.momento}>
                    {fechaCortaDeInstante(evento.occurredAt)} · {horaDeInstante(evento.occurredAt)}
                    {/*
                      Una relectura es el mismo carne leido dos veces en tres
                      segundos. Sin decirlo, la lista parece tener duplicados.
                    */}
                    {linea.relectura ? ' · relectura' : ''}
                  </Text>
                </View>
              </Tarjeta>
            );
          })}

          {carga.datos.items.length === 0 ? (
            <Text style={estilos.vacio}>
              Todavía no se ha registrado ningún acceso en este gimnasio.
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
  bloque: { gap: tema.espacio.xs },
  cabecera: { flexDirection: 'row', alignItems: 'center', gap: tema.espacio.md },
  titulo: { ...tema.texto.cuerpo, color: tema.color.texto, flex: 1 },
  detalle: { ...tema.texto.secundario, color: tema.color.textoSecundario, lineHeight: 20 },
  momento: { ...tema.texto.meta, color: tema.color.textoSecundario },
  vacio: { ...tema.texto.secundario, color: tema.color.textoSecundario, lineHeight: 22 },
});
