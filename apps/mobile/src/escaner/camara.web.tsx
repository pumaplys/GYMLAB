import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { tema } from '../tema';
import type { EstadoDelPermiso } from './permiso';

/**
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ EN WEB NO HAY CAMARA, Y NO HACE FALTA QUE LA HAYA.                      │
 * │                                                                          │
 * │ La vista previa existe para MIRAR la pantalla —el tamaño del visor, el   │
 * │ marco, la jerarquia del veredicto, los margenes seguros— mientras el     │
 * │ ensayo con el iPhone esta pendiente. Nada de eso necesita video.         │
 * │                                                                          │
 * │ Y el visor se sustituye por una superficie que DICE lo que es. Pintar    │
 * │ aqui un video de mentira, o una foto de un gimnasio, seria fabricar una  │
 * │ captura que parece un escaner funcionando sin serlo — y esa captura      │
 * │ acabaria enseñandose como si probara algo.                               │
 * │                                                                          │
 * │ `.web.tsx`: en iOS y Android Metro coge `camara.tsx`, que es el unico    │
 * │ fichero que importa `expo-camera`. Nada de esto entra en el binario.     │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
const HABILITADA = process.env.EXPO_PUBLIC_VISTA_PREVIA === '1';

const ESTADOS: Record<string, EstadoDelPermiso> = {
  'escaner-consultando': 'consultando',
  'escaner-permiso': 'denegado',
  'escaner-bloqueado': 'bloqueado',
};

function casoActual(): string | null {
  if (!HABILITADA) return null;
  return new URLSearchParams(window.location.search).get('vista');
}

export function usarPermisoDeCamara(): { estado: EstadoDelPermiso; pedir: () => void } {
  const caso = casoActual();
  return {
    estado: (caso ? ESTADOS[caso] : undefined) ?? 'concedido',
    pedir: () => undefined,
  };
}

/**
 * Un texto con la FORMA de un carne, para que la vista previa recorra el
 * camino de verdad.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ NO ES UN TOKEN Y SE VE QUE NO LO ES.                                     │
 * │                                                                          │
 * │ Empieza por RINDA-DEMO-NO-VALIDO y no lo firma nadie: escaneado en una   │
 * │ puerta de verdad devolveria `BAD_SIGNATURE`. Lo unico que comparte con   │
 * │ un token real es el alfabeto base64url y los 119 caracteres, que es      │
 * │ justo lo que hace falta para que PASE el filtro de formato.              │
 * │                                                                          │
 * │ Y eso importa: asi la captura del veredicto sale de recorrer la maquina  │
 * │ de estados y `esTokenDeAcceso` de verdad, en vez de pintar el resultado  │
 * │ a mano saltandose las dos cosas que hay que comprobar.                   │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
const CARNE_DE_MUESTRA = 'RINDA-DEMO-NO-VALIDO'.padEnd(119, '_muestra');

/** Los casos en los que la vista previa simula que hay un carne delante. */
const LEEN_SOLOS = ['allow', 'warn', 'deny', 'deny-sin-socio', 'reintento', 'fallo'].map(
  (n) => `escaner-${n}`,
);

export function Visor({ activa, alLeer }: { activa: boolean; alLeer: (texto: string) => void }) {
  const caso = casoActual();
  useEffect(() => {
    if (!activa || !caso || !LEEN_SOLOS.includes(caso)) return;
    alLeer(CARNE_DE_MUESTRA);
  }, [activa, caso, alLeer]);

  return (
    <View style={[StyleSheet.absoluteFill, estilos.hueco]}>
      <Text style={estilos.texto}>
        {activa
          ? 'Aquí va la cámara. En el navegador no se abre.'
          : 'Cámara en pausa mientras hay un resultado.'}
      </Text>
    </View>
  );
}

const estilos = StyleSheet.create({
  hueco: {
    backgroundColor: '#05070A',
    alignItems: 'center',
    justifyContent: 'center',
    padding: tema.espacio.xl,
  },
  texto: { ...tema.texto.secundario, color: '#4A515C', textAlign: 'center' },
});
