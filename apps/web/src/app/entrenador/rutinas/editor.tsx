'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { createRoutineSchema, type Exercise } from '@gymlab/contracts';
import { Aviso } from '@/componentes/aviso';
import { Boton } from '@/componentes/boton';
import { Campo } from '@/componentes/campo';
import { ConfirmacionEnLinea } from '@/componentes/confirmacion-en-linea';
import { SelectorDeEjercicio } from '@/componentes/selector-de-ejercicio';
import { Tarjeta } from '@/componentes/tarjeta';
import { mensajeDeError } from '@/lib/errores';
import { aEnvio, mensajeDe, mover, type ItemEditable } from './editor-logica';
import estilos from './editor.module.css';

let contador = 0;
const nuevaClave = () => `nuevo-${contador++}`;

interface Props {
  ejercicios: readonly Exercise[];
  nombreInicial?: string;
  descripcionInicial?: string;
  itemsIniciales?: ItemEditable[];
  /**
   * Recibe la rutina ENTERA, nunca un trozo.
   *
   * El servidor borra los items y los reinserta desde lo que llegue, asi que
   * mandar menos de los que hay en pantalla es borrarlos. Por eso `items` va
   * siempre y completo: no hay ningun camino por el que este editor guarde una
   * lista parcial.
   */
  onGuardar: (datos: {
    name: string;
    /** Ausente si se dejo en blanco: el esquema la trata como opcional. */
    description?: string;
    items: {
      exerciseId: string;
      sets: number;
      reps: string;
      restSeconds?: number;
      notes?: string;
    }[];
  }) => Promise<void>;
  onCancelar: () => void;
  textoDeGuardar: string;
}

/**
 * El editor de una rutina. Lo comparten crear y editar.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ UN SOLO FORMULARIO, NO UN ASISTENTE POR PASOS.                           │
 * │                                                                          │
 * │ Escribir una rutina no es un tramite lineal: se anade un ejercicio, se   │
 * │ cambian las series del segundo, se sube el cuarto, se quita uno. Partir  │
 * │ eso en pasos obliga a ir y volver por algo que cabe en una pantalla.     │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export function EditorDeRutina({
  ejercicios,
  nombreInicial = '',
  descripcionInicial = '',
  itemsIniciales = [],
  onGuardar,
  onCancelar,
  textoDeGuardar,
}: Props) {
  const [nombre, setNombre] = useState(nombreInicial);
  const [descripcion, setDescripcion] = useState(descripcionInicial);
  const [items, setItems] = useState<ItemEditable[]>(itemsIniciales);

  /** `null` = cerrado; `'nuevo'` = anadiendo; una clave = sustituyendo ese item. */
  const [eligiendo, setEligiendo] = useState<string | null>(null);
  const [quitando, setQuitando] = useState<string | null>(null);
  const [errores, setErrores] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  /*
   * Para poder decir de que ejercicio son "Series" y "Repeticiones".
   *
   * Con tres ejercicios en pantalla hay tres campos llamados "Series", y quien
   * navega por formulario los oye seguidos sin saber a cual pertenece cada uno.
   * Agrupandolos bajo el nombre del ejercicio, se anuncia el grupo al entrar.
   */
  const idBase = useId();

  const huerfanos = items.filter((i) => i.exerciseId === null);

  const cambiar = (clave: string, campo: keyof ItemEditable, valor: string) =>
    setItems((actuales) =>
      actuales.map((i) => (i.clave === clave ? { ...i, [campo]: valor } : i)),
    );

  /*
   * ┌──────────────────────────────────────────────────────────────────────────┐
   * │ AL MOVER UN EJERCICIO, EL FOCO SE VA CON EL.                             │
   * │                                                                          │
   * │ Sin esto, subir un ejercicio hasta el primer puesto deshabilita el boton │
   * │ que se acaba de pulsar y el foco cae al `body`: quien ordena con teclado │
   * │ tiene que recorrer el formulario entero para volver donde estaba. Se     │
   * │ eligieron botones Subir/Bajar en vez de arrastrar precisamente para que  │
   * │ esto se pudiera hacer con teclado, asi que perder el foco lo desmonta.   │
   * │                                                                          │
   * │ Si el boton llega deshabilitado —el ejercicio esta en un extremo— el     │
   * │ foco pasa al de la direccion contraria, que es el unico que queda util.  │
   * └──────────────────────────────────────────────────────────────────────────┘
   */
  const botones = useRef(new Map<string, HTMLButtonElement | null>());
  const [aEnfocar, setAEnfocar] = useState<string | null>(null);

  useEffect(() => {
    if (aEnfocar === null) return;
    const preferido = botones.current.get(aEnfocar);
    const [clave, direccion] = aEnfocar.split('|');
    const contrario = botones.current.get(`${clave}|${direccion === '-1' ? '1' : '-1'}`);
    (preferido?.disabled ? contrario : preferido)?.focus();
    setAEnfocar(null);
  }, [aEnfocar]);

  const reordenar = (indice: number, direccion: -1 | 1, clave: string) => {
    setItems((actuales) => mover(actuales, indice, direccion));
    setAEnfocar(`${clave}|${direccion}`);
  };

  const elegir = (ejercicio: Exercise) => {
    if (eligiendo === 'nuevo') {
      setItems((actuales) => [
        ...actuales,
        {
          clave: nuevaClave(),
          exerciseId: ejercicio.id,
          exerciseName: ejercicio.name,
          sets: '3',
          reps: '10',
          restSeconds: '',
          notes: '',
        },
      ]);
    } else if (eligiendo) {
      // Sustituir el huerfano: se conserva TODO lo demas —series, reps,
      // descanso y notas— porque eso lo escribio alguien y no se ha perdido.
      setItems((actuales) =>
        actuales.map((i) =>
          i.clave === eligiendo
            ? { ...i, exerciseId: ejercicio.id, exerciseName: ejercicio.name }
            : i,
        ),
      );
    }
    setEligiendo(null);
  };

  const guardar = () => {
    setErrores([]);
    setError(null);

    const candidato = aEnvio(nombre, descripcion, items);

    /*
     * Se valida con el MISMO esquema que aplica el servidor.
     *
     * No se reescriben aqui los limites —1 a 20 series, reps de 1 a 30
     * caracteres, descanso de 0 a 600, de 1 a 50 ejercicios— porque una segunda
     * copia se desincroniza con la primera y entonces el formulario acepta algo
     * que la API rechaza.
     */
    const resultado = createRoutineSchema.safeParse(candidato);
    if (!resultado.success) {
      setErrores(resultado.error.issues.map((i) => mensajeDe(i.path, i.message)));
      return;
    }

    setGuardando(true);
    void onGuardar(resultado.data)
      // No se limpia nada al fallar: lo escrito sigue en pantalla. Perder una
      // rutina de doce ejercicios por un fallo de red seria imperdonable.
      .catch((problema: unknown) => setError(mensajeDeError(problema)))
      .finally(() => setGuardando(false));
  };

  return (
    <>
      {error && <Aviso>{error}</Aviso>}

      {errores.length > 0 && (
        <Aviso>
          {/*
            En lista cuando hay varios, y no unidos por puntos: "necesita un
            nombre. anade al menos un ejercicio" se lee como una frase rota, y
            ademas esconde cuantas cosas faltan de verdad.
          */}
          {errores.length === 1 ? (
            <span>Falta algo: {errores[0]}</span>
          ) : (
            <div>
              <span>Faltan {errores.length} cosas:</span>
              <ul className={estilos.errores}>
                {errores.map((cual) => (
                  <li key={cual}>{cual}</li>
                ))}
              </ul>
            </div>
          )}
        </Aviso>
      )}

      {huerfanos.length > 0 && (
        <Aviso tono="informacion">
          {huerfanos.length === 1
            ? 'Un ejercicio de esta rutina ya no esta en la biblioteca. Elige uno que lo sustituya o quitalo: al guardar los ejercicios hay que decir cual es cada uno.'
            : `${huerfanos.length} ejercicios de esta rutina ya no estan en la biblioteca. Elige uno que sustituya a cada uno o quitalos.`}
        </Aviso>
      )}

      <Tarjeta className={estilos.tarjeta}>
        <div className={estilos.formulario}>
          <Campo
            etiqueta="Nombre"
            placeholder="Fuerza tren superior, Movilidad…"
            valor={nombre}
            alCambiar={setNombre}
            foco={nombreInicial === ''}
          />
          <Campo
            etiqueta="Descripcion"
            opcional
            ayuda="Para que sirve o como se usa. Lo lee quien la asigne."
            valor={descripcion}
            alCambiar={setDescripcion}
          />
        </div>
      </Tarjeta>

      <h2 className={estilos.tituloSeccion}>Ejercicios</h2>

      {items.length === 0 ? (
        <Tarjeta className={estilos.tarjeta}>
          <p className={estilos.sinItems}>
            Una rutina necesita al menos un ejercicio. Anadelos de la biblioteca del gimnasio.
          </p>
        </Tarjeta>
      ) : (
        <ol className={estilos.items}>
          {items.map((item, indice) => (
            <li key={item.clave}>
              <Tarjeta className={estilos.tarjeta}>
                <div className={estilos.cabeceraItem}>
                  <span className={estilos.posicion} aria-hidden="true">
                    {indice + 1}
                  </span>
                  <span className={estilos.nombreItem} id={`${idBase}-${item.clave}`}>
                    {item.exerciseName}
                    {item.exerciseId === null && (
                      <span className={estilos.faltante}>Ya no esta en la biblioteca</span>
                    )}
                  </span>
                </div>

                <div
                  className={estilos.camposItem}
                  role="group"
                  aria-labelledby={`${idBase}-${item.clave}`}
                >
                  <Campo
                    etiqueta="Series"
                    valor={item.sets}
                    alCambiar={(v) => cambiar(item.clave, 'sets', v)}
                  />
                  {/*
                    `reps` es TEXTO y el campo tambien: "8-10", "al fallo" y
                    "30 s" son prescripciones validas. Un `type="number"` las
                    haria imposibles de escribir.
                  */}
                  <Campo
                    etiqueta="Repeticiones"
                    ayuda="10, 8-12, al fallo, 30 s…"
                    valor={item.reps}
                    alCambiar={(v) => cambiar(item.clave, 'reps', v)}
                  />
                  <Campo
                    etiqueta="Descanso"
                    opcional
                    ayuda="En segundos"
                    valor={item.restSeconds}
                    alCambiar={(v) => cambiar(item.clave, 'restSeconds', v)}
                  />
                  <Campo
                    etiqueta="Notas"
                    opcional
                    valor={item.notes}
                    alCambiar={(v) => cambiar(item.clave, 'notes', v)}
                  />
                </div>

                <div className={estilos.accionesItem}>
                  {/*
                    Subir y bajar en lugar de arrastrar. Arrastrar es comodo con
                    raton y hostil con el pulgar y con teclado, y aqui el sitio
                    de uso es el movil. Ademas un boton deshabilitado dice donde
                    estan los extremos sin tener que probarlo.
                  */}
                  <Boton
                    variante="sutil"
                    tamano="sm"
                    className={estilos.reordenar}
                    ref={(nodo) => {
                      botones.current.set(`${item.clave}|-1`, nodo);
                    }}
                    disabled={indice === 0}
                    onClick={() => reordenar(indice, -1, item.clave)}
                  >
                    ↑ <span className="solo-lectores">Subir {item.exerciseName}</span>
                  </Boton>
                  <Boton
                    variante="sutil"
                    tamano="sm"
                    className={estilos.reordenar}
                    ref={(nodo) => {
                      botones.current.set(`${item.clave}|1`, nodo);
                    }}
                    disabled={indice === items.length - 1}
                    onClick={() => reordenar(indice, 1, item.clave)}
                  >
                    ↓ <span className="solo-lectores">Bajar {item.exerciseName}</span>
                  </Boton>

                  {item.exerciseId === null && (
                    <Boton
                      variante="secundario"
                      tamano="sm"
                      onClick={() => setEligiendo(item.clave)}
                    >
                      Elegir sustituto
                      <span className="solo-lectores"> de {item.exerciseName}</span>
                    </Boton>
                  )}

                  {quitando === item.clave ? (
                    <ConfirmacionEnLinea
                      /* "de la rutina", no "de la biblioteca": son cosas
                         distintas y confundirlas asusta con razon. */
                      pregunta="¿Quitar de esta rutina?"
                      confirmando={false}
                      onConfirmar={() => {
                        setItems((actuales) => actuales.filter((i) => i.clave !== item.clave));
                        setQuitando(null);
                      }}
                      onCancelar={() => setQuitando(null)}
                    />
                  ) : (
                    <Boton variante="sutil" tamano="sm" onClick={() => setQuitando(item.clave)}>
                      {/*
                        Con tres ejercicios hay tres botones "Quitar" que suenan
                        identicos. El nombre va oculto a la vista y no al lector:
                        quitar el que no era no tiene deshacer.
                      */}
                      Quitar<span className="solo-lectores"> {item.exerciseName}</span>
                    </Boton>
                  )}
                </div>
              </Tarjeta>
            </li>
          ))}
        </ol>
      )}

      {eligiendo ? (
        <div className={estilos.tarjeta}>
          <SelectorDeEjercicio
            ejercicios={ejercicios}
            etiqueta={eligiendo === 'nuevo' ? 'Anadir un ejercicio' : 'Elegir el sustituto'}
            onElegir={elegir}
            onCancelar={() => setEligiendo(null)}
          />
        </div>
      ) : (
        <div className={estilos.tarjeta}>
          <Boton onClick={() => setEligiendo('nuevo')}>Anadir ejercicio</Boton>
        </div>
      )}

      <div className={estilos.pie}>
        <Boton variante="primario" cargando={guardando} onClick={guardar}>
          {textoDeGuardar}
        </Boton>
        <Boton disabled={guardando} onClick={onCancelar}>
          Cancelar
        </Boton>
      </div>
    </>
  );
}
