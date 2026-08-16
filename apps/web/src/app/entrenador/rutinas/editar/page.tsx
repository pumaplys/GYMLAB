'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import type { Exercise, Routine } from '@gymlab/contracts';
import { Aviso } from '@/componentes/aviso';
import { Cargando } from '@/componentes/cargando';
import { EncabezadoDePagina } from '@/componentes/encabezado-de-pagina';
import { MarcoEntrenador } from '@/componentes/marco-entrenador';
import { RutaPrivada } from '@/componentes/ruta-privada';
import { api } from '@/lib/api';
import { mensajeDeError } from '@/lib/errores';
import { esSesionCaducada, useSesion } from '@/lib/sesion';
import estilos from '../../entrenador.module.css';
import { EditorDeRutina } from '../editor';
import { itemsDesde } from '../editor-logica';

/**
 * Editar una rutina.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ SE MANDA LA COLECCION ENTERA, SIEMPRE.                                   │
 * │                                                                          │
 * │ El servidor borra los items y los reinserta desde lo que llegue, asi que │
 * │ omitir uno es borrarlo. No hay reconciliacion parcial posible ni deseada:│
 * │ el editor tiene la rutina completa en pantalla, asi que mandarla entera  │
 * │ es lo correcto y ademas resuelve el orden sin enviar posiciones sueltas. │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * La puede editar cualquier entrenador del gimnasio: las rutinas son
 * compartidas por diseno y editar se puede deshacer. Lo que solo puede hacer su
 * creador —o el dueno— es BORRARLA, y eso no esta en esta pantalla.
 */
export default function EditarRutinaPage() {
  return (
    <RutaPrivada>
      <MarcoEntrenador>
        <Suspense fallback={<Cargando>Abriendo la rutina…</Cargando>}>
          <Editar />
        </Suspense>
      </MarcoEntrenador>
    </RutaPrivada>
  );
}

function Editar() {
  const id = useSearchParams().get('id');
  const { gymId, revisar } = useSesion();
  const router = useRouter();

  const [rutina, setRutina] = useState<Routine | null>(null);
  const [ejercicios, setEjercicios] = useState<Exercise[] | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!gymId || !id) {
      setCargando(false);
      return;
    }
    const control = new AbortController();
    setCargando(true);
    setError(null);

    // Las dos a la vez: son independientes y encadenarlas duplica la espera.
    Promise.all([
      api.entrenamiento.rutina(gymId, id, { signal: control.signal }),
      api.entrenamiento.ejercicios(gymId, { signal: control.signal }),
    ])
      .then(([suya, biblioteca]) => {
        setRutina(suya);
        setEjercicios(biblioteca);
        setCargando(false);
      })
      .catch((problema: unknown) => {
        if (control.signal.aborted) return;
        if (esSesionCaducada(problema)) {
          void revisar();
          return;
        }
        setError(mensajeDeError(problema));
        setCargando(false);
      });

    return () => control.abort();
  }, [gymId, id, revisar]);

  const volverALaFicha = () =>
    router.push(`/entrenador/rutinas/ficha?id=${encodeURIComponent(id ?? '')}`);

  if (!id) {
    return (
      <>
        <Volver />
        <Aviso>Falta el identificador de la rutina en la direccion.</Aviso>
      </>
    );
  }

  if (cargando) return <Cargando>Cargando la rutina…</Cargando>;

  if (error || !rutina || !ejercicios || !gymId) {
    return (
      <>
        <Volver />
        <Aviso>{error ?? 'No se ha encontrado esa rutina.'}</Aviso>
      </>
    );
  }

  return (
    <>
      <Volver />

      <EncabezadoDePagina
        titulo={`Editar ${rutina.name}`}
        entradilla="Al guardar se reemplaza la lista completa de ejercicios, en el orden en que queden aqui."
      />

      <EditorDeRutina
        ejercicios={ejercicios}
        nombreInicial={rutina.name}
        descripcionInicial={rutina.description ?? ''}
        itemsIniciales={itemsDesde(rutina)}
        textoDeGuardar="Guardar cambios"
        onCancelar={volverALaFicha}
        onGuardar={async (datos) => {
          await api.entrenamiento.actualizarRutina(gymId, id, {
            name: datos.name,
            // Cadena vacia y no `undefined`: `undefined` significaria "no lo
            // toques", y aqui vaciar la descripcion es una decision.
            description: datos.description ?? '',
            items: datos.items,
          });
          volverALaFicha();
        }}
      />
    </>
  );
}

function Volver() {
  return (
    <Link className={estilos.volver} href="/entrenador/rutinas">
      ← Volver a rutinas
    </Link>
  );
}
