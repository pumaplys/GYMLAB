import { StyleSheet, Text, View } from 'react-native';
import { tema } from '../tema';

export type TonoDeAviso = 'informacion' | 'exito' | 'aviso' | 'peligro';

/**
 * Un mensaje al usuario: un error, una confirmacion, una advertencia.
 *
 * Lleva `accessibilityLiveRegion` para que un lector de pantalla lo anuncie
 * cuando aparece sin que haya que ir a buscarlo. `polite` y no `assertive`:
 * informa, no interrumpe a media frase.
 *
 * El tono NO es la unica senal —el texto dice lo que pasa— y por eso no hay
 * iconos: un icono de alerta sin texto no informa a nadie.
 */
export function Aviso({ children, tono = 'informacion' }: { children: string; tono?: TonoDeAviso }) {
  return (
    <View
      style={[estilos.caja, cajas[tono]]}
      accessibilityLiveRegion="polite"
      accessibilityRole="alert"
    >
      <Text style={[estilos.texto, textos[tono]]}>{children}</Text>
    </View>
  );
}

const estilos = StyleSheet.create({
  caja: {
    padding: tema.espacio.lg,
    borderRadius: tema.radio.campo,
    borderWidth: 1,
  },
  texto: { ...tema.texto.secundario, lineHeight: 20 },
});

const cajas = StyleSheet.create({
  informacion: { backgroundColor: tema.color.superficie, borderColor: tema.color.borde },
  exito: { backgroundColor: 'rgba(50,213,131,0.10)', borderColor: 'rgba(50,213,131,0.35)' },
  aviso: { backgroundColor: 'rgba(253,176,34,0.10)', borderColor: 'rgba(253,176,34,0.35)' },
  peligro: { backgroundColor: 'rgba(249,112,102,0.10)', borderColor: 'rgba(249,112,102,0.35)' },
});

const textos = StyleSheet.create({
  informacion: { color: tema.color.textoSecundario },
  exito: { color: tema.color.exito },
  aviso: { color: tema.color.aviso },
  peligro: { color: tema.color.peligro },
});
