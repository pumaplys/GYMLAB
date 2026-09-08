import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { CreateExerciseInput, Exercise, MuscleGroup } from '@gymlab/contracts';
import { createExerciseSchema } from '@gymlab/contracts';
import { Aviso } from '../componentes/aviso';
import { Boton } from '../componentes/boton';
import { Campo } from '../componentes/campo';
import { GRUPOS, NOMBRE_DEL_GRUPO, ejercicioAEnvio } from './biblioteca';
import { tema } from '../tema';

/**
 * Crear o editar un ejercicio. La misma pantalla para las dos cosas.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LA VALIDACION ES LA DEL CONTRATO, NO UNA COPIA.                         │
 * │                                                                          │
 * │ `createExerciseSchema` ya dice que el nombre es obligatorio, que cabe    │
 * │ en 120 caracteres y que el grupo muscular es uno de los ocho. Escribir   │
 * │ aqui esas mismas reglas seria tener dos que se separan a la primera      │
 * │ correccion — y ademas el servidor validaria igualmente.                  │
 * │                                                                          │
 * │ Lo que si es de aqui es COMO se cuenta el fallo.                         │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export function FormularioDeEjercicio({
  ejercicio,
  guardando,
  onGuardar,
}: {
  /** El que se edita, o nada si es nuevo. */
  ejercicio?: Exercise;
  guardando: boolean;
  onGuardar: (datos: CreateExerciseInput) => void;
}) {
  const [nombre, setNombre] = useState(ejercicio?.name ?? '');
  const [grupo, setGrupo] = useState<MuscleGroup>(ejercicio?.muscleGroup ?? 'chest');
  const [material, setMaterial] = useState(ejercicio?.equipment ?? '');
  const [error, setError] = useState<string | null>(null);

  const guardar = () => {
    const datos = ejercicioAEnvio(nombre, grupo, material);
    const revisado = createExerciseSchema.safeParse(datos);
    if (!revisado.success) {
      setError(
        revisado.error.issues.some((i) => i.path[0] === 'name')
          ? 'El ejercicio necesita un nombre.'
          : 'Revisa los datos: algo no tiene el formato correcto.',
      );
      return;
    }
    setError(null);
    onGuardar(revisado.data);
  };

  return (
    <>
      {error ? <Aviso tono="peligro">{error}</Aviso> : null}

      <Campo
        etiqueta="Nombre"
        valor={nombre}
        alCambiar={setNombre}
        deshabilitado={guardando}
        autoCapitalize="sentences"
      />

      <View style={estilos.bloque}>
        <Text style={estilos.etiqueta}>Grupo muscular</Text>
        {/*
          Pastillas y no un desplegable: son ocho valores fijos y en 390 px
          caben en dos filas. Un selector nativo obligaria a abrir, elegir y
          cerrar para algo que se ve entero de un vistazo.
        */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={estilos.grupos}>
            {GRUPOS.map((g) => {
              const elegido = g === grupo;
              return (
                <Pressable
                  key={g}
                  onPress={() => setGrupo(g)}
                  disabled={guardando}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: elegido }}
                  style={[estilos.pastilla, elegido && estilos.pastillaElegida]}
                >
                  <Text style={[estilos.textoPastilla, elegido && estilos.textoElegido]}>
                    {NOMBRE_DEL_GRUPO[g]}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </ScrollView>
      </View>

      <Campo
        etiqueta="Material"
        valor={material}
        alCambiar={setMaterial}
        deshabilitado={guardando}
        ayuda="Opcional: barra, mancuernas, máquina…"
      />

      <Boton variante="primario" onPress={guardar} cargando={guardando} deshabilitado={guardando}>
        {ejercicio ? 'Guardar cambios' : 'Crear ejercicio'}
      </Boton>
    </>
  );
}

const estilos = StyleSheet.create({
  bloque: { gap: tema.espacio.sm },
  etiqueta: {
    ...tema.texto.meta,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: tema.color.textoSecundario,
  },
  grupos: { flexDirection: 'row', gap: tema.espacio.sm, paddingVertical: tema.espacio.xs },
  pastilla: {
    minHeight: tema.controlAltoMinimo,
    justifyContent: 'center',
    paddingHorizontal: tema.espacio.lg,
    borderRadius: tema.radio.pastilla,
    borderWidth: 1,
    borderColor: tema.color.borde,
    backgroundColor: tema.color.superficie,
  },
  pastillaElegida: {
    borderColor: tema.tinte.borde('acento'),
    backgroundColor: tema.tinte.fondo('acento'),
  },
  textoPastilla: { ...tema.texto.secundario, color: tema.color.textoSecundario },
  textoElegido: { color: tema.color.texto, fontWeight: '600' },
});
