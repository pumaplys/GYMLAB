import { useState } from 'react';
import { router } from 'expo-router';
import type { CreateExerciseInput } from '@gymlab/contracts';
import { Aviso } from '../../../src/componentes/aviso';
import { CabeceraDeVuelta } from '../../../src/componentes/cabecera-de-vuelta';
import { Pantalla } from '../../../src/componentes/pantalla';
import { laSesionYaNoVale } from '../../../src/auth/politica';
import { useSesion } from '../../../src/auth/sesion';
import { FormularioDeEjercicio } from '../../../src/entrenamiento/formulario-de-ejercicio';
import { crearEjercicio } from '../../../src/entrenamiento/fuente';
import { RUTAS_INTERNAS } from '../../../src/navegacion/destinos';

/** Añadir un ejercicio a la biblioteca del gimnasio. */
export default function NuevoEjercicio() {
  const { estado: sesion, revisar } = useSesion();
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const gymId = sesion.tipo === 'autenticado' ? sesion.gymId : null;

  async function crear(datos: CreateExerciseInput) {
    if (!gymId || guardando) return;
    setGuardando(true);
    setError(null);
    try {
      await crearEjercicio(gymId, datos);
      // `replace` y no `back`: crear termina aqui, y dejar el formulario en la
      // pila haria que el gesto de atras volviera a un formulario ya enviado.
      router.replace(RUTAS_INTERNAS.ejercicios);
    } catch (problema) {
      if (laSesionYaNoVale([problema])) {
        void revisar();
        return;
      }
      /*
       * El servidor rechaza los nombres repetidos: «Ya hay un ejercicio
       * llamado "X" en este gimnasio». No se adivina cual de los dos casos es
       * —duplicado o cualquier otro— porque el mensaje del servidor ya lo
       * dice, y repetir aqui su regla seria tener dos.
       */
      setError(
        problema instanceof Error && problema.message
          ? problema.message
          : 'No pudimos crear el ejercicio. Inténtalo de nuevo.',
      );
      setGuardando(false);
    }
  }

  return (
    <Pantalla>
      <CabeceraDeVuelta
        titulo="Nuevo ejercicio"
        volverA={RUTAS_INTERNAS.ejercicios}
        etiquetaDeVuelta="Ejercicios"
      />
      {error ? <Aviso tono="peligro">{error}</Aviso> : null}
      <FormularioDeEjercicio guardando={guardando} onGuardar={(datos) => void crear(datos)} />
    </Pantalla>
  );
}
