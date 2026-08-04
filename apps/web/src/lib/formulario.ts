'use client';

import { useCallback, useState } from 'react';
import type { FormEvent } from 'react';
import type { ZodType } from 'zod';
import { ApiError } from '@gymlab/api-client';
import { mensajeDeError } from '@/lib/errores';

/**
 * Formularios validados con el esquema de `@gymlab/contracts`.
 *
 * El esquema es EL MISMO que aplica el servidor, asi que no hay dos reglas que
 * puedan separarse: si un dia cambia el minimo de un campo, cambia en los dos
 * sitios a la vez o no cambia. Validar aqui no es desconfiar menos del cliente
 * —el servidor vuelve a validar igual— sino no hacerle escribir a alguien un
 * formulario entero para que se lo rechacen despues.
 *
 * Sin libreria de formularios: son cuarenta lineas y una dependencia menos que
 * mantener. Si algun dia hacen falta arrays anidados o campos dinamicos, ese
 * sera el momento de traerla.
 */
interface Opciones<C extends string, S> {
  esquema: ZodType<S>;
  iniciales: Record<C, string>;
  enviar: (datos: S) => Promise<void>;
}

export interface Formulario<C extends string> {
  valores: Record<C, string>;
  /** Un mensaje por campo, y solo de los campos que ya se han tocado. */
  errores: Partial<Record<C, string>>;
  /** Lo que no pertenece a ningun campo: credenciales, red, conflictos. */
  errorGeneral: string | null;
  enviando: boolean;
  cambiar(campo: C, valor: string): void;
  /** Validacion en el momento de salir del campo, no mientras se escribe. */
  alSalirDe(campo: C): void;
  alEnviar(evento: FormEvent<HTMLFormElement>): void;
}

export function useFormulario<C extends string, S>({
  esquema,
  iniciales,
  enviar,
}: Opciones<C, S>): Formulario<C> {
  const [valores, setValores] = useState<Record<C, string>>(iniciales);
  const [errores, setErrores] = useState<Partial<Record<C, string>>>({});
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const cambiar = useCallback((campo: C, valor: string) => {
    setValores((previos) => ({ ...previos, [campo]: valor }));
    // Al corregir se retira el error de ese campo. Mantenerlo mientras la
    // persona esta arreglandolo es regañarle por algo que ya esta haciendo.
    setErrores((previos) => ({ ...previos, [campo]: undefined }));
  }, []);

  const alSalirDe = useCallback(
    (campo: C) => {
      const problemas = revisar(esquema, valores);
      // Solo el de este campo: los demas aun no se han tocado, y avisar de
      // errores en campos vacios que nadie ha visitado es ruido.
      setErrores((previos) => ({ ...previos, [campo]: problemas[campo] }));
    },
    [esquema, valores],
  );

  const alEnviar = useCallback(
    (evento: FormEvent<HTMLFormElement>) => {
      evento.preventDefault();
      if (enviando) return;

      setErrorGeneral(null);
      const analisis = esquema.safeParse(limpiar(valores));
      if (!analisis.success) {
        // Al enviar si se muestran todos: aqui ya se ha visitado el formulario
        // entero, y ocultar un error obligaria a adivinar por que no avanza.
        setErrores(problemasPorCampo<C>(analisis.error.issues));
        return;
      }

      setEnviando(true);
      void enviar(analisis.data)
        .catch((error: unknown) => {
          // El servidor tambien valida, y cuando rechaza un campo lo dice por
          // campo. Se coloca junto a su campo, igual que la validacion local:
          // para quien rellena el formulario son la misma cosa.
          if (error instanceof ApiError && error.issues.length > 0) {
            const { porCampo, sueltos } = repartir<C>(error.issues, valores);
            setErrores(porCampo);
            if (sueltos.length > 0) setErrorGeneral(sueltos.join(' '));
            return;
          }
          setErrorGeneral(mensajeDeError(error));
        })
        .finally(() => setEnviando(false));
    },
    [enviando, esquema, valores, enviar],
  );

  return { valores, errores, errorGeneral, enviando, cambiar, alSalirDe, alEnviar };
}

/**
 * Los campos vacios se quitan antes de validar.
 *
 * Un `<input>` sin rellenar devuelve la cadena vacia, no `undefined`. Sin esto,
 * un telefono opcional que nadie ha escrito llegaria como '' y el esquema lo
 * rechazaria por corto — el campo es opcional, pero '' no es un telefono.
 */
function limpiar<C extends string>(valores: Record<C, string>): Record<string, string> {
  const limpio: Record<string, string> = {};
  for (const [campo, valor] of Object.entries(valores) as [C, string][]) {
    const recortado = valor.trim();
    if (recortado !== '') limpio[campo] = recortado;
  }
  return limpio;
}

function revisar<C extends string, S>(
  esquema: ZodType<S>,
  valores: Record<C, string>,
): Partial<Record<C, string>> {
  const analisis = esquema.safeParse(limpiar(valores));
  return analisis.success ? {} : problemasPorCampo<C>(analisis.error.issues);
}

/** El primer problema de cada campo. Dos mensajes sobre el mismo campo abruman. */
function problemasPorCampo<C extends string>(
  issues: readonly { path: PropertyKey[]; message: string }[],
): Partial<Record<C, string>> {
  const problemas: Partial<Record<C, string>> = {};
  for (const issue of issues) {
    const campo = String(issue.path[0] ?? '') as C;
    if (campo && problemas[campo] === undefined) problemas[campo] = issue.message;
  }
  return problemas;
}

/**
 * Reparte los errores del servidor entre los campos que existen en el
 * formulario y los que no.
 *
 * Un mensaje sobre un campo que esta pantalla no pinta se quedaria invisible, y
 * la persona veria el formulario intacto sin ninguna explicacion de por que no
 * avanza. Esos suben al aviso general.
 */
function repartir<C extends string>(
  issues: readonly { path: string; message: string }[],
  valores: Record<C, string>,
): { porCampo: Partial<Record<C, string>>; sueltos: string[] } {
  const porCampo: Partial<Record<C, string>> = {};
  const sueltos: string[] = [];

  for (const issue of issues) {
    const campo = issue.path.split('.')[0] as C;
    if (campo in valores) {
      if (porCampo[campo] === undefined) porCampo[campo] = issue.message;
    } else {
      sueltos.push(issue.message);
    }
  }
  return { porCampo, sueltos };
}
