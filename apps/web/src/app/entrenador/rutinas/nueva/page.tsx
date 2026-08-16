'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { Exercise } from '@gymlab/contracts';
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

/**
 * Crear una rutina.
 *
 * Se carga la biblioteca antes de pintar el editor: sin ejercicios no hay nada
 * que anadir, y una rutina necesita al menos uno.
 */
export default function NuevaRutinaPage() {
  return (
    <RutaPrivada>
      <MarcoEntrenador>
        <Nueva />
      </MarcoEntrenador>
    </RutaPrivada>
  );
}

function Nueva() {
  const { gymId, revisar } = useSesion();
  const router = useRouter();
  const [ejercicios, setEjercicios] = useState<Exercise[] | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!gymId) return;
    const control = new AbortController();
    setCargando(true);
    setError(null);

    api.entrenamiento
      .ejercicios(gymId, { signal: control.signal })
      .then((lista) => {
        setEjercicios(lista);
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
  }, [gymId, revisar]);

  return (
    <>
      <Link className={estilos.volver} href="/entrenador/rutinas">
        ← Volver a rutinas
      </Link>

      <EncabezadoDePagina
        titulo="Nueva rutina"
        entradilla="Los ejercicios salen de la biblioteca de este gimnasio, y el orden de la lista es el orden de la rutina."
      />

      {error && <Aviso>{error}</Aviso>}

      {cargando ? (
        <Cargando>Cargando la biblioteca…</Cargando>
      ) : (
        ejercicios &&
        gymId && (
          <EditorDeRutina
            ejercicios={ejercicios}
            textoDeGuardar="Crear rutina"
            onCancelar={() => router.push('/entrenador/rutinas')}
            onGuardar={async (datos) => {
              const creada = await api.entrenamiento.crearRutina(gymId, datos);
              // A su ficha y no al listado: lo siguiente que se quiere ver es
              // lo que se acaba de escribir, para comprobarlo.
              router.push(`/entrenador/rutinas/ficha?id=${encodeURIComponent(creada.id)}`);
            }}
          />
        )
      )}
    </>
  );
}
