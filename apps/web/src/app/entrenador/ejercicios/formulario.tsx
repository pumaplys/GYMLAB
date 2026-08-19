'use client';

import { useState } from 'react';
import { MUSCLE_GROUPS, type Exercise, type MuscleGroup } from '@gymlab/contracts';
import { Aviso } from '@/componentes/aviso';
import { Boton } from '@/componentes/boton';
import { Campo } from '@/componentes/campo';
import { Selector } from '@/componentes/selector';
import { Tarjeta } from '@/componentes/tarjeta';
import { api } from '@/lib/api';
import { NOMBRE_DEL_GRUPO } from '@/lib/ejercicios';
import { mensajeDeError } from '@/lib/errores';
import estilos from '../entrenador.module.css';

/**
 * Alta y edición de un ejercicio de la biblioteca.
 *
 * El mismo formulario para las dos cosas: cambian el título, el verbo del botón
 * y si se envía `POST` o `PATCH`. Duplicarlo dejaría dos sitios donde añadir el
 * día que el contrato gane un campo.
 *
 * `material` es opcional en el contrato, así que vacío se envía como ausente y
 * no como cadena vacía: «sin material» es una respuesta, `''` es un descuido.
 */
export function FormularioDeEjercicio({
  gymId,
  ejercicio,
  onGuardado,
  onCancelar,
}: {
  gymId: string;
  /** Si viene, se edita. Si no, se crea. */
  ejercicio: Exercise | null;
  onGuardado: () => Promise<void>;
  onCancelar: () => void;
}) {
  const [nombre, setNombre] = useState(ejercicio?.name ?? '');
  const [grupo, setGrupo] = useState<MuscleGroup>(ejercicio?.muscleGroup ?? 'chest');
  const [material, setMaterial] = useState(ejercicio?.equipment ?? '');
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  const editando = ejercicio !== null;

  return (
    <Tarjeta titulo={editando ? `Editar ${ejercicio.name}` : 'Nuevo ejercicio'}>
      <form
        onSubmit={(evento) => {
          evento.preventDefault();
          if (guardando) return;
          setGuardando(true);
          setError(null);

          const datos = {
            name: nombre.trim(),
            muscleGroup: grupo,
            equipment: material.trim() || undefined,
          };

          const peticion = editando
            ? api.entrenamiento.actualizarEjercicio(gymId, ejercicio.id, datos)
            : api.entrenamiento.crearEjercicio(gymId, datos);

          void peticion
            .then(onGuardado)
            .catch((problema: unknown) => setError(mensajeDeError(problema)))
            .finally(() => setGuardando(false));
        }}
        noValidate
      >
        <Campo
          etiqueta="Nombre"
          valor={nombre}
          alCambiar={setNombre}
          deshabilitado={guardando}
          foco
        />

        <Selector
          etiqueta="Grupo muscular"
          valor={grupo}
          alCambiar={(valor) => setGrupo(valor as MuscleGroup)}
          deshabilitado={guardando}
        >
          {MUSCLE_GROUPS.map((g) => (
            <option key={g} value={g}>
              {NOMBRE_DEL_GRUPO[g]}
            </option>
          ))}
        </Selector>

        <Campo
          etiqueta="Material"
          ayuda="Opcional. Barra, mancuernas, maquina…"
          opcional
          valor={material}
          alCambiar={setMaterial}
          deshabilitado={guardando}
        />

        {error && <Aviso>{error}</Aviso>}

        <div className={estilos.accionesDelFormulario}>
          <Boton
            type="submit"
            variante="primario"
            cargando={guardando}
            disabled={nombre.trim() === ''}
          >
            {editando ? 'Guardar cambios' : 'Crear ejercicio'}
          </Boton>
          <Boton onClick={onCancelar} disabled={guardando}>
            Cancelar
          </Boton>
        </div>
      </form>
    </Tarjeta>
  );
}
