import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { Plan, PlanPeriod } from '@gymlab/contracts';
import { Aviso } from '../componentes/aviso';
import { Boton } from '../componentes/boton';
import { Campo } from '../componentes/campo';
import { NOMBRE_DEL_PERIODO, PERIODOS, aCentimos } from './logica';
import { tema } from '../tema';

/**
 * Crear o editar un plan.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LA PERIODICIDAD NO SE PUEDE CAMBIAR, Y NO ES UN OLVIDO.                 │
 * │                                                                          │
 * │ `updatePlanSchema` no la admite: cambiarla reescribiria lo que cubre     │
 * │ cada pago ya registrado de las suscripciones vivas. Si un gimnasio       │
 * │ quiere pasar de mensual a trimestral, crea un plan nuevo y archiva el    │
 * │ viejo — asi el historial de quien pagó qué sigue en pie.                  │
 * │                                                                          │
 * │ Al editar se enseña, apagada y con el motivo. Esconderla haria pensar    │
 * │ que la pantalla esta incompleta.                                         │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export function FormularioDePlan({
  plan,
  guardando,
  etiqueta,
  error,
  onGuardar,
}: {
  plan?: Plan;
  guardando: boolean;
  etiqueta: string;
  error: string | null;
  onGuardar: (datos: {
    nombre: string;
    descripcion: string;
    centimos: number;
    periodo: PlanPeriod;
  }) => void;
}) {
  const editando = plan !== undefined;
  const [nombre, setNombre] = useState(plan?.name ?? '');
  const [descripcion, setDescripcion] = useState(plan?.description ?? '');
  const [precio, setPrecio] = useState(
    plan ? String(plan.priceCents / 100).replace('.', ',') : '',
  );
  const [periodo, setPeriodo] = useState<PlanPeriod>(plan?.period ?? 'monthly');
  const [aviso, setAviso] = useState<string | null>(null);

  const guardar = () => {
    const centimos = aCentimos(precio);
    if (centimos === null) {
      setAviso('Escribe un precio como 35 o 29,99.');
      return;
    }
    if (nombre.trim() === '') {
      setAviso('El plan necesita un nombre.');
      return;
    }
    setAviso(null);
    onGuardar({ nombre, descripcion, centimos, periodo });
  };

  return (
    <>
      {error ? <Aviso tono="peligro">{error}</Aviso> : null}
      {aviso ? <Aviso tono="aviso">{aviso}</Aviso> : null}

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
        ayuda="Opcional: qué incluye."
      />
      <Campo
        etiqueta="Precio"
        valor={precio}
        alCambiar={setPrecio}
        keyboardType="decimal-pad"
        deshabilitado={guardando}
        ayuda="En euros: 35 o 29,99."
      />

      <View style={estilos.grupo}>
        <Text style={estilos.rotulo}>Periodicidad</Text>
        <View style={estilos.pastillas}>
          {PERIODOS.map((p) => {
            const activa = p === periodo;
            return (
              <Pressable
                key={p}
                onPress={() => setPeriodo(p)}
                disabled={guardando || editando}
                accessibilityRole="radio"
                accessibilityState={{ selected: activa, disabled: editando }}
                style={({ pressed }) => [
                  estilos.pastilla,
                  activa && estilos.pastillaElegida,
                  editando && estilos.apagada,
                  pressed && !editando && estilos.pulsado,
                ]}
              >
                <Text style={[estilos.textoPastilla, activa && estilos.textoElegido]}>
                  {NOMBRE_DEL_PERIODO[p]}
                </Text>
              </Pressable>
            );
          })}
        </View>
        {editando ? (
          <Text style={estilos.ayuda}>
            La periodicidad no se puede cambiar: reescribiría lo que cubre cada pago ya
            registrado. Para cambiarla, crea un plan nuevo y archiva este.
          </Text>
        ) : null}
      </View>

      <Boton
        variante="primario"
        onPress={guardar}
        cargando={guardando}
        deshabilitado={guardando}
      >
        {etiqueta}
      </Boton>
    </>
  );
}

const estilos = StyleSheet.create({
  grupo: { gap: tema.espacio.sm },
  rotulo: {
    ...tema.texto.meta,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: tema.color.textoSecundario,
  },
  pastillas: { flexDirection: 'row', flexWrap: 'wrap', gap: tema.espacio.sm },
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
  apagada: { opacity: 0.5 },
  pulsado: { opacity: 0.6 },
  textoPastilla: { ...tema.texto.secundario, color: tema.color.textoSecundario },
  textoElegido: { color: tema.color.texto, fontWeight: '600' },
  ayuda: { ...tema.texto.meta, color: tema.color.textoSecundario, lineHeight: 18 },
});
