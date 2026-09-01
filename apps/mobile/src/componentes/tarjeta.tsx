import { StyleSheet, View } from 'react-native';
import type { ReactNode } from 'react';
import { tema } from '../tema';

/**
 * La superficie sobre la que va todo.
 *
 * Sin sombra: en un fondo oscuro una sombra no se ve, y lo que separa una
 * tarjeta del fondo es el propio color mas el borde de un pixel. Anadir
 * `elevation` aqui solo cuesta rendimiento en Android.
 *
 * `alta` levanta la superficie un escalon. Se usa poco a proposito: si todo
 * esta elevado, nada lo esta.
 */
export function Tarjeta({
  children,
  alta = false,
}: {
  children: ReactNode;
  alta?: boolean;
}) {
  return <View style={[estilos.tarjeta, alta && estilos.alta]}>{children}</View>;
}

const estilos = StyleSheet.create({
  tarjeta: {
    backgroundColor: tema.color.superficie,
    borderColor: tema.color.borde,
    borderWidth: 1,
    borderRadius: tema.radio.tarjeta,
    padding: tema.espacio.lg,
    gap: tema.espacio.md,
  },
  alta: { backgroundColor: tema.color.superficieAlta },
});
