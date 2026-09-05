import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, StyleSheet, Text, View } from 'react-native';
import LOGO from '../../assets/logo.png';
import { ENTRADA, RESPIRACION, planDeAnimacion } from '../arranque/animacion';
import { tema } from '../tema';

/** Proporcion del fichero: 600 x 445. */
const PROPORCION = 600 / 445;
const ANCHO = 200;

/**
 * Lo que se ve mientras se comprueba si hay sesion.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ NO ALARGA EL ARRANQUE NI UN MILISEGUNDO.                                │
 * │                                                                          │
 * │ Esta pantalla se pinta porque el estado de sesion es `cargando`, y       │
 * │ desaparece en cuanto deja de serlo. Aqui no hay `setTimeout`, ni minimo  │
 * │ de duracion, ni nada que espere a que termine la animacion: si la sesion │
 * │ se resuelve en 200 ms, esto dura 200 ms y se corta a media entrada. Es   │
 * │ lo correcto — la animacion acompaña la espera, no la fabrica.            │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ SOBRIA: UN FUNDIDO, UN 4 % DE ZOOM Y UNA RESPIRACION DE 2 %.            │
 * │                                                                          │
 * │ Ni rotaciones, ni rebotes, ni resplandores, ni parpadeos. Lo unico que   │
 * │ se mueve es la escala, y muy poco: 5,2 s de ciclo completo. Todo con     │
 * │ `Animated` y `useNativeDriver`, asi que corre en el hilo de la interfaz  │
 * │ y no compite con la peticion que se esta esperando.                      │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export function Arranque() {
  /*
   * `AccessibilityInfo` responde en asincrono, asi que hasta que conteste se
   * asume MOVIMIENTO REDUCIDO: si la respuesta llegara tarde, es mejor no
   * haber movido nada que haber movido lo que alguien pidio no mover.
   */
  const [movimientoReducido, setMovimientoReducido] = useState(true);

  useEffect(() => {
    let vivo = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((activo) => {
        if (vivo) setMovimientoReducido(activo);
      })
      .catch(() => {
        // Si la plataforma no lo sabe decir, se queda como esta: sin mover.
      });

    // Y si se cambia el ajuste con la app abierta, se atiende.
    const suscripcion = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      setMovimientoReducido,
    );
    return () => {
      vivo = false;
      suscripcion.remove();
    };
  }, []);

  return <Logo plan={planDeAnimacion(movimientoReducido)} />;
}

function Logo({ plan }: { plan: ReturnType<typeof planDeAnimacion> }) {
  const opacidad = useRef(new Animated.Value(ENTRADA.opacidadInicial)).current;
  const escala = useRef(new Animated.Value(plan.escalaInicial)).current;

  useEffect(() => {
    escala.setValue(plan.escalaInicial);

    const entrada = Animated.parallel([
      Animated.timing(opacidad, {
        toValue: ENTRADA.opacidadFinal,
        duration: plan.duracionDeEntrada,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(escala, {
        toValue: ENTRADA.escalaFinal,
        duration: plan.duracionDeEntrada,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
    ]);

    // La respiracion no arranca hasta que la entrada termina: encadenarlas
    // evita que dos animaciones peleen por el mismo valor.
    const respiracion = Animated.loop(
      Animated.sequence([
        Animated.timing(escala, {
          toValue: RESPIRACION.escalaMaxima,
          duration: RESPIRACION.duracion,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(escala, {
          toValue: RESPIRACION.escalaMinima,
          duration: RESPIRACION.duracion,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    );

    const secuencia = plan.respira ? Animated.sequence([entrada, respiracion]) : entrada;
    secuencia.start();

    // Al desmontar se PARA. Sin esto queda una animacion en bucle corriendo
    // sobre un componente que ya no existe.
    return () => secuencia.stop();
  }, [plan, opacidad, escala]);

  return (
    <View style={estilos.raiz}>
      <Animated.Image
        source={LOGO}
        style={[
          estilos.logo,
          { opacity: opacidad, transform: [{ scale: escala }] },
        ]}
        resizeMode="contain"
        accessibilityRole="image"
        accessibilityLabel="RINDA"
      />
      <Text style={estilos.pie} accessibilityLiveRegion="polite">
        Comprobando tu sesión…
      </Text>
    </View>
  );
}

const estilos = StyleSheet.create({
  raiz: {
    flex: 1,
    backgroundColor: tema.color.fondo,
    alignItems: 'center',
    justifyContent: 'center',
    gap: tema.espacio.xxl,
  },
  logo: { width: ANCHO, height: ANCHO / PROPORCION },
  pie: { ...tema.texto.meta, color: tema.color.textoSecundario },
});
