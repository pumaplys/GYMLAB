import { StyleSheet, Text, View } from 'react-native';
import { tema } from '../tema';

export type TonoDeAviso = 'informacion' | 'exito' | 'aviso' | 'peligro';

/**
 * Un mensaje al usuario: un error, una confirmacion, una advertencia.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ UN AVISO TIENE QUE PARECER UN AVISO, NO UNA TARJETA.                     │
 * │                                                                          │
 * │ El tono "informacion" usaba el mismo fondo y el mismo borde que          │
 * │ `Tarjeta`, asi que en "no admitido" el mensaje se leia como un bloque de │
 * │ contenido cualquiera. Un aviso que no se distingue no avisa.             │
 * │                                                                          │
 * │ Ahora la forma es distinta de la de una tarjeta: una BARRA de acento a    │
 * │ la izquierda —el gesto de una cita, no el de un panel— y una etiqueta     │
 * │ corta que dice el tono con palabras.                                     │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ EL TONO NUNCA SE DICE SOLO CON COLOR.                                    │
 * │                                                                          │
 * │ Tres senales a la vez, y las tres funcionan por separado:                │
 * │   1. la barra y el color, para quien lo ve de un vistazo;                │
 * │   2. la ETIQUETA en palabras, para quien no distingue esos colores;      │
 * │   3. el texto del mensaje, que dice lo que pasa sin depender de nada.    │
 * │                                                                          │
 * │ Sin iconos: un icono de alerta sin texto no informa a nadie, y no hay    │
 * │ todavia un juego de iconos coherente en la app que reutilizar.           │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Lleva `accessibilityLiveRegion` para que un lector de pantalla lo anuncie
 * cuando aparece sin que haya que ir a buscarlo. `polite` y no `assertive`:
 * informa, no interrumpe a media frase.
 */
const ETIQUETAS: Record<TonoDeAviso, string> = {
  informacion: 'NOTA',
  exito: 'HECHO',
  aviso: 'ATENCION',
  peligro: 'NO SE HA PODIDO',
};

export function Aviso({ children, tono = 'informacion' }: { children: string; tono?: TonoDeAviso }) {
  return (
    <View
      style={[estilos.caja, cajas[tono]]}
      accessibilityLiveRegion="polite"
      accessibilityRole="alert"
    >
      <View style={[estilos.barra, barras[tono]]} />
      <View style={estilos.cuerpo}>
        <Text style={[estilos.etiqueta, textos[tono]]}>{ETIQUETAS[tono]}</Text>
        <Text style={estilos.texto}>{children}</Text>
      </View>
    </View>
  );
}

const estilos = StyleSheet.create({
  caja: {
    flexDirection: 'row',
    borderRadius: tema.radio.campo,
    borderWidth: 1,
    // El relleno lo pone el cuerpo: la barra tiene que llegar a los bordes.
    overflow: 'hidden',
  },
  // Estrecha a proposito. Marca sin gritar.
  barra: { width: 3 },
  cuerpo: { flex: 1, padding: tema.espacio.lg, gap: tema.espacio.xs },
  etiqueta: { ...tema.texto.meta, fontWeight: '700', letterSpacing: 1 },
  texto: { ...tema.texto.secundario, lineHeight: 20, color: tema.color.texto },
});

const cajas = StyleSheet.create({
  // Un escalon por encima de la tarjeta, no un color nuevo: asi se separa de
  // `Tarjeta` sin inventar una superficie mas.
  informacion: { backgroundColor: tema.color.superficieAlta, borderColor: tema.color.borde },
  exito: { backgroundColor: 'rgba(50,213,131,0.10)', borderColor: 'rgba(50,213,131,0.35)' },
  aviso: { backgroundColor: 'rgba(253,176,34,0.10)', borderColor: 'rgba(253,176,34,0.35)' },
  peligro: { backgroundColor: 'rgba(249,112,102,0.10)', borderColor: 'rgba(249,112,102,0.35)' },
});

const barras = StyleSheet.create({
  informacion: { backgroundColor: tema.color.secundario },
  exito: { backgroundColor: tema.color.exito },
  aviso: { backgroundColor: tema.color.aviso },
  peligro: { backgroundColor: tema.color.peligro },
});

const textos = StyleSheet.create({
  informacion: { color: tema.color.secundario },
  exito: { color: tema.color.exito },
  aviso: { color: tema.color.aviso },
  peligro: { color: tema.color.peligro },
});
