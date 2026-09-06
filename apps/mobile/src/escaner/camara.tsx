import { StyleSheet } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { estadoDelPermiso, type EstadoDelPermiso } from './permiso';

/**
 * El unico sitio de la app que toca `expo-camera`.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ UNA SOLA COSTURA CON LA CAMARA, Y AQUI ESTA.                            │
 * │                                                                          │
 * │ La pantalla del escaner no importa `expo-camera` en ningun sitio: pide   │
 * │ un permiso y pinta un visor. Eso permite que su version web —donde no    │
 * │ hay camara de verdad y no hace falta que la haya— sea otro fichero, y    │
 * │ que la maquina de estados se pruebe sin montar nada nativo.              │
 * └──────────────────────────────────────────────────────────────────────────┘
 */

export function usarPermisoDeCamara(): {
  estado: EstadoDelPermiso;
  pedir: () => void;
} {
  const [respuesta, pedirPermiso] = useCameraPermissions();
  return {
    estado: estadoDelPermiso(respuesta),
    pedir: () => void pedirPermiso(),
  };
}

/**
 * El visor.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ `activa` APAGA LA CAMARA DE DOS FORMAS, Y LAS DOS HACEN FALTA.          │
 * │                                                                          │
 * │ `active={false}` suelta la sesion de captura del sistema —que es lo que  │
 * │ apaga el piloto del telefono y deja de gastar bateria— y ademas se       │
 * │ retira `onBarcodeScanned`, que es la forma documentada de dejar de       │
 * │ leer. Con solo una de las dos, o se sigue leyendo detras de otra         │
 * │ pantalla, o la camara se queda tomada sin que nadie mire.                │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Solo `qr`: pedir todos los formatos hace que el detector busque codigos de
 * barras de producto en cada fotograma, que en una puerta no van a aparecer.
 */
export function Visor({
  activa,
  alLeer,
}: {
  activa: boolean;
  alLeer: (texto: string) => void;
}) {
  return (
    <CameraView
      style={StyleSheet.absoluteFill}
      facing="back"
      active={activa}
      barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
      onBarcodeScanned={activa ? ({ data }) => alLeer(data) : undefined}
    />
  );
}
