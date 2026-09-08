import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { CreateRoutineInput, Exercise, Routine } from '@gymlab/contracts';
import { createRoutineSchema } from '@gymlab/contracts';
import { Aviso } from '../componentes/aviso';
import { Boton } from '../componentes/boton';
import { Campo } from '../componentes/campo';
import { Icono } from '../componentes/icono';
import { Tarjeta } from '../componentes/tarjeta';
import { anadir, aEnvio, cambiar, itemsDesde, mensajeDe, mover, quitar } from './editor';
import { filtrarEjercicios, lineaDeEjercicio } from './biblioteca';
import type { ItemEditable } from './editor';
import { tema } from '../tema';

/**
 * El editor de rutinas, en 390 px.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LA MISMA CAPACIDAD QUE EL EDITOR DEL PANEL, CON OTRA DISPOSICION.       │
 * │                                                                          │
 * │ Nombre, descripcion, añadir ejercicios, quitarlos, ORDENARLOS, y para    │
 * │ cada uno series, repeticiones, descanso y notas. Ninguna de esas cosas   │
 * │ se recorta por ser un telefono: lo que cambia es que las filas se apilan │
 * │ en vez de repartirse en columnas, y que el orden se cambia con dos       │
 * │ botones en lugar de arrastrando.                                         │
 * │                                                                          │
 * │ La logica —que es la que puede destruir datos— esta en `editor.ts` y es  │
 * │ la misma que la del panel. Lo comprueba un test que compara las dos.     │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export function EditorDeRutina({
  rutina,
  ejercicios,
  guardando,
  etiquetaDeGuardar,
  onGuardar,
}: {
  /** La que se edita, o nada si es nueva. */
  rutina?: Routine;
  /** La biblioteca del gimnasio, para elegir. */
  ejercicios: readonly Exercise[];
  guardando: boolean;
  etiquetaDeGuardar: string;
  onGuardar: (datos: CreateRoutineInput) => void;
}) {
  const [nombre, setNombre] = useState(rutina?.name ?? '');
  const [descripcion, setDescripcion] = useState(rutina?.description ?? '');
  const [items, setItems] = useState<ItemEditable[]>(rutina ? itemsDesde(rutina) : []);
  const [eligiendo, setEligiendo] = useState(false);
  const [busqueda, setBusqueda] = useState('');
  const [errores, setErrores] = useState<string[]>([]);

  /** Un contador propio: la clave identifica la FILA, no el ejercicio. */
  const [siguiente, setSiguiente] = useState(0);

  const guardar = () => {
    const datos = aEnvio(nombre, descripcion, items);
    const revisado = createRoutineSchema.safeParse(datos);
    if (!revisado.success) {
      setErrores(revisado.error.issues.map((i) => mensajeDe(i.path, i.message)));
      return;
    }
    setErrores([]);
    onGuardar(revisado.data);
  };

  const elegir = (ejercicio: Exercise) => {
    setItems(anadir(items, ejercicio, `nuevo-${siguiente}`));
    setSiguiente(siguiente + 1);
    setEligiendo(false);
    setBusqueda('');
  };

  return (
    <>
      {errores.length > 0 ? <Aviso tono="peligro">{errores.join('. ') + '.'}</Aviso> : null}

      <Campo
        etiqueta="Nombre"
        valor={nombre}
        alCambiar={setNombre}
        deshabilitado={guardando}
        autoCapitalize="sentences"
      />
      <Campo
        etiqueta="Descripción"
        valor={descripcion}
        alCambiar={setDescripcion}
        deshabilitado={guardando}
        ayuda="Opcional: cuántos días, cómo repartirla…"
      />

      <View style={estilos.lista}>
        {items.map((item, indice) => (
          <Tarjeta key={item.clave}>
            <View style={estilos.cabeceraDeItem}>
              <Text style={estilos.posicion}>{indice + 1}</Text>
              <View style={estilos.nombreDelItem}>
                <Text style={estilos.nombreEjercicio}>{item.exerciseName}</Text>
                {/*
                  Un ejercicio borrado de la biblioteca NO se esconde ni se
                  quita solo: se marca. Quitarlo aqui lo borraria de la rutina
                  al guardar, y eso tiene que decidirlo quien edita.
                */}
                {item.exerciseId === null ? (
                  <Text style={estilos.huerfano}>
                    Ya no está en la biblioteca. Quítalo o pon otro en su sitio.
                  </Text>
                ) : null}
              </View>
            </View>

            <View style={estilos.dosCampos}>
              <View style={estilos.mitad}>
                <Campo
                  etiqueta="Series"
                  valor={item.sets}
                  alCambiar={(v) => setItems(cambiar(items, item.clave, 'sets', v))}
                  keyboardType="number-pad"
                  deshabilitado={guardando}
                />
              </View>
              <View style={estilos.mitad}>
                <Campo
                  etiqueta="Repeticiones"
                  valor={item.reps}
                  alCambiar={(v) => setItems(cambiar(items, item.clave, 'reps', v))}
                  deshabilitado={guardando}
                  ayuda="8-10, al fallo, 30 s…"
                />
              </View>
            </View>

            <Campo
              etiqueta="Descanso (segundos)"
              valor={item.restSeconds}
              alCambiar={(v) => setItems(cambiar(items, item.clave, 'restSeconds', v))}
              keyboardType="number-pad"
              deshabilitado={guardando}
              ayuda="Opcional."
            />
            <Campo
              etiqueta="Notas"
              valor={item.notes}
              alCambiar={(v) => setItems(cambiar(items, item.clave, 'notes', v))}
              deshabilitado={guardando}
              ayuda="Opcional: técnica, avisos…"
            />

            <View style={estilos.acciones}>
              <Mover
                icono="volver"
                etiqueta={`Subir ${item.exerciseName}`}
                deshabilitado={guardando || indice === 0}
                alPulsar={() => setItems(mover(items, indice, -1))}
                gira
              />
              <Mover
                icono="volver"
                etiqueta={`Bajar ${item.exerciseName}`}
                deshabilitado={guardando || indice === items.length - 1}
                alPulsar={() => setItems(mover(items, indice, 1))}
              />
              <View style={estilos.separador} />
              <Pressable
                onPress={() => setItems(quitar(items, item.clave))}
                disabled={guardando}
                accessibilityRole="button"
                accessibilityLabel={`Quitar ${item.exerciseName}`}
                style={({ pressed }) => [estilos.quitar, pressed && estilos.pulsado]}
              >
                <Text style={estilos.textoQuitar}>Quitar</Text>
              </Pressable>
            </View>
          </Tarjeta>
        ))}

        {items.length === 0 ? (
          <Text style={estilos.vacio}>
            Una rutina necesita al menos un ejercicio. Añade el primero.
          </Text>
        ) : null}
      </View>

      {eligiendo ? (
        <Tarjeta alta>
          <Text style={estilos.tituloDelSelector}>Elige un ejercicio</Text>
          <Campo
            etiqueta="Buscar"
            valor={busqueda}
            alCambiar={setBusqueda}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <View style={estilos.opciones}>
            {filtrarEjercicios(ejercicios, busqueda)
              // Se acota a lo que cabe mirar de una vez: con la biblioteca de
              // plantilla son mas de sesenta y la lista no es el sitio para
              // recorrerlos, para eso esta la casilla de buscar.
              .slice(0, 12)
              .map((ejercicio) => (
                <Pressable
                  key={ejercicio.id}
                  onPress={() => elegir(ejercicio)}
                  accessibilityRole="button"
                  style={({ pressed }) => [estilos.opcion, pressed && estilos.pulsado]}
                >
                  <Text style={estilos.nombreOpcion}>{ejercicio.name}</Text>
                  <Text style={estilos.detalleOpcion}>{lineaDeEjercicio(ejercicio)}</Text>
                </Pressable>
              ))}
            {filtrarEjercicios(ejercicios, busqueda).length === 0 ? (
              <Text style={estilos.vacio}>Nada con ese texto.</Text>
            ) : null}
          </View>
          <Boton onPress={() => setEligiendo(false)}>Cancelar</Boton>
        </Tarjeta>
      ) : (
        <Boton onPress={() => setEligiendo(true)} deshabilitado={guardando}>
          Añadir ejercicio
        </Boton>
      )}

      <Boton variante="primario" onPress={guardar} cargando={guardando} deshabilitado={guardando}>
        {etiquetaDeGuardar}
      </Boton>
    </>
  );
}

function Mover({
  icono,
  etiqueta,
  deshabilitado,
  alPulsar,
  gira,
}: {
  icono: 'volver';
  etiqueta: string;
  deshabilitado: boolean;
  alPulsar: () => void;
  gira?: boolean;
}) {
  return (
    <Pressable
      onPress={alPulsar}
      disabled={deshabilitado}
      accessibilityRole="button"
      accessibilityLabel={etiqueta}
      accessibilityState={{ disabled: deshabilitado }}
      style={({ pressed }) => [
        estilos.mover,
        pressed && estilos.pulsado,
        deshabilitado && estilos.apagado,
      ]}
    >
      {/* La misma flecha, girada: subir y bajar son la misma forma. */}
      <View style={gira ? estilos.arriba : estilos.abajo}>
        <Icono
          nombre={icono}
          tamano={20}
          color={deshabilitado ? tema.color.textoSecundario : tema.color.texto}
        />
      </View>
    </Pressable>
  );
}

const estilos = StyleSheet.create({
  lista: { gap: tema.espacio.md },
  cabeceraDeItem: { flexDirection: 'row', alignItems: 'flex-start', gap: tema.espacio.md },
  posicion: {
    ...tema.texto.meta,
    fontWeight: '700',
    color: tema.color.textoSecundario,
    minWidth: 18,
    paddingTop: 2,
  },
  nombreDelItem: { flex: 1, gap: tema.espacio.xs },
  nombreEjercicio: { ...tema.texto.cuerpo, color: tema.color.texto, fontWeight: '600' },
  huerfano: { ...tema.texto.meta, color: tema.tinte.borde('aviso') },
  dosCampos: { flexDirection: 'row', gap: tema.espacio.md },
  mitad: { flex: 1 },
  acciones: { flexDirection: 'row', alignItems: 'center', gap: tema.espacio.sm },
  separador: { flex: 1 },
  mover: {
    minHeight: tema.controlAltoMinimo,
    minWidth: tema.controlAltoMinimo,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: tema.radio.campo,
    borderWidth: 1,
    borderColor: tema.color.borde,
  },
  arriba: { transform: [{ rotate: '90deg' }] },
  abajo: { transform: [{ rotate: '-90deg' }] },
  apagado: { opacity: 0.4 },
  pulsado: { opacity: 0.6 },
  quitar: {
    minHeight: tema.controlAltoMinimo,
    justifyContent: 'center',
    paddingHorizontal: tema.espacio.md,
  },
  textoQuitar: { ...tema.texto.secundario, color: tema.tinte.borde('peligro') },
  vacio: { ...tema.texto.secundario, color: tema.color.textoSecundario, lineHeight: 22 },
  tituloDelSelector: { ...tema.texto.cuerpo, color: tema.color.texto, fontWeight: '600' },
  opciones: { gap: tema.espacio.xs },
  opcion: {
    minHeight: tema.controlAltoMinimo,
    justifyContent: 'center',
    paddingVertical: tema.espacio.sm,
  },
  nombreOpcion: { ...tema.texto.cuerpo, color: tema.color.texto },
  detalleOpcion: { ...tema.texto.meta, color: tema.color.textoSecundario },
});
