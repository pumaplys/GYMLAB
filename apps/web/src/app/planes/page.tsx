'use client';

import { useEffect, useState } from 'react';
import { createPlanSchema, type Plan, type PlanPeriod } from '@gymlab/contracts';
import { Aviso } from '@/componentes/aviso';
import { Boton } from '@/componentes/boton';
import { Campo } from '@/componentes/campo';
import { Cargando } from '@/componentes/cargando';
import { ConfirmacionEnLinea } from '@/componentes/confirmacion-en-linea';
import { EncabezadoDePagina } from '@/componentes/encabezado-de-pagina';
import { EstadoVacio } from '@/componentes/estado-vacio';
import { Etiqueta } from '@/componentes/etiqueta';
import { Marco } from '@/componentes/marco';
import { RutaPrivada } from '@/componentes/ruta-privada';
import { Selector } from '@/componentes/selector';
import { Tabla } from '@/componentes/tabla';
import { Tarjeta } from '@/componentes/tarjeta';
import { api } from '@/lib/api';
import { mensajeDeError } from '@/lib/errores';
import { aCentimos, comoImporte } from '@/lib/formato';
import { esSesionCaducada, useSesion } from '@/lib/sesion';
import estilos from './planes.module.css';

/**
 * Los planes del gimnasio: lo que cobra y cada cuanto.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ SIN ESTA PANTALLA, UN GIMNASIO NUEVO NO PUEDE COBRAR A NADIE.            │
 * │                                                                          │
 * │ Nace con el catalogo vacio —el alta solo siembra la biblioteca de        │
 * │ ejercicios— y dar de alta una cuota exige un `planId`. La ficha del      │
 * │ socio lo decia con honestidad, "los planes los crea el propietario", y   │
 * │ senalaba a un sitio que no existia: la unica via era que alguien de      │
 * │ GYMLAB ejecutara una llamada a la API por el.                            │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Solo el dueno. El servidor lo impone igual —`PlansController` entero es
 * `@Roles('owner')` salvo la lectura del catalogo— y aqui solo se evita pintar
 * una pantalla que la API va a rechazar entera.
 */
const NOMBRE_DEL_PERIODO: Record<PlanPeriod, string> = {
  monthly: 'Mensual',
  quarterly: 'Trimestral',
  yearly: 'Anual',
};

export default function PlanesPage() {
  return (
    <RutaPrivada roles={['owner']}>
      <Marco>
        <Planes />
      </Marco>
    </RutaPrivada>
  );
}

function Planes() {
  const { gymId, revisar } = useSesion();

  const [planes, setPlanes] = useState<Plan[] | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!gymId) return;
    const control = new AbortController();
    setCargando(true);
    setError(null);

    api.billing
      .listPlans(gymId, { signal: control.signal })
      .then(setPlanes)
      .catch((problema: unknown) => {
        if (control.signal.aborted) return;
        // Una sesion caducada no es un error de esta pantalla: se le pregunta al
        // servidor y `RutaPrivada` se encarga de lo que salga.
        if (esSesionCaducada(problema)) return void revisar();
        setError(mensajeDeError(problema));
      })
      .finally(() => {
        if (!control.signal.aborted) setCargando(false);
      });

    return () => control.abort();
  }, [gymId, revisar]);

  const recargar = async () => {
    if (!gymId) return;
    setPlanes(await api.billing.listPlans(gymId));
  };

  return (
    <>
      <EncabezadoDePagina
        titulo="Planes"
        entradilla="Lo que cobra el gimnasio y cada cuanto. Un plan no se puede usar en una cuota hasta que existe, asi que esto es lo primero que hay que montar."
      />

      {error && (
        <div className={estilos.avisos}>
          <Aviso>{error}</Aviso>
        </div>
      )}

      {gymId && <NuevoPlan gymId={gymId} onCreado={recargar} />}

      <Tarjeta variante="lista" className={estilos.panel}>
        {cargando ? (
          <Cargando>Cargando los planes…</Cargando>
        ) : !planes || planes.length === 0 ? (
          <EstadoVacio
            titulo="Todavia no hay ningun plan"
            texto="Hasta que crees el primero no se le puede poner cuota a ningun socio."
          />
        ) : (
          gymId && <TablaDePlanes gymId={gymId} planes={planes} onCambio={recargar} />
        )}
      </Tarjeta>
    </>
  );
}

/** Alta de un plan. La periodicidad se elige AQUI y ya no se cambia. */
function NuevoPlan({ gymId, onCreado }: { gymId: string; onCreado: () => Promise<void> }) {
  const [periodo, setPeriodo] = useState<PlanPeriod>('monthly');
  const [creado, setCreado] = useState<string | null>(null);

  const formulario = useFormularioDePlan(gymId, periodo, async (plan) => {
    setCreado(plan.name);
    await onCreado();
  });

  return (
    <Tarjeta className={estilos.tarjeta}>
      <h2 className={estilos.tituloSeccion}>Nuevo plan</h2>

      <form className={estilos.formulario} onSubmit={formulario.alEnviar} noValidate>
        {formulario.errorGeneral && <Aviso>{formulario.errorGeneral}</Aviso>}
        {creado && <Aviso tono="exito">Plan «{creado}» creado. Ya se puede usar en una cuota.</Aviso>}

        <div className={estilos.pareja}>
          <Campo
            etiqueta="Nombre"
            placeholder="Mensual, Matricula, Bono 10…"
            valor={formulario.valores.name}
            error={formulario.errores.name}
            alCambiar={(valor) => formulario.cambiar('name', valor)}
            alSalir={() => formulario.alSalirDe('name')}
          />

          <Campo
            etiqueta="Precio"
            ayuda="En euros. 35 o 35,50"
            valor={formulario.valores.precio}
            error={formulario.errores.precio}
            alCambiar={(valor) => formulario.cambiar('precio', valor)}
            alSalir={() => formulario.alSalirDe('precio')}
          />
        </div>

        <Campo
          etiqueta="Descripcion"
          opcional
          placeholder="Que incluye"
          valor={formulario.valores.description}
          error={formulario.errores.description}
          alCambiar={(valor) => formulario.cambiar('description', valor)}
          alSalir={() => formulario.alSalirDe('description')}
        />

        <div className={estilos.campoSelector}>
          <Selector
            etiqueta="Periodicidad"
            valor={periodo}
            alCambiar={(valor) => setPeriodo(valor as PlanPeriod)}
            className={estilos.selector}
          >
            {Object.entries(NOMBRE_DEL_PERIODO).map(([valor, texto]) => (
              <option key={valor} value={valor}>
                {texto}
              </option>
            ))}
          </Selector>
          <p className={estilos.ayudaPeriodo}>
            <strong>No se podra cambiar despues.</strong> Cambiarla reescribiria lo que cubre cada
            pago ya registrado: quien pago un mes pasaria a haber pagado un trimestre. Para cambiarla
            se crea otro plan y se archiva este.
          </p>
        </div>

        <div className={estilos.pie}>
          <Boton type="submit" variante="primario" cargando={formulario.enviando}>
            Crear plan
          </Boton>
        </div>
      </form>
    </Tarjeta>
  );
}

/**
 * El formulario de alta.
 *
 * No usa `useFormulario` directamente porque el precio se escribe en euros y el
 * contrato viaja en centimos enteros: hay una conversion que el esquema no
 * puede hacer. `aCentimos` parte la cadena en vez de multiplicar por 100 —
 * `Number('19.99') * 100` da 1998.9999999999998.
 */
function useFormularioDePlan(
  gymId: string,
  periodo: PlanPeriod,
  alCrear: (plan: Plan) => Promise<void>,
) {
  const [valores, setValores] = useState({ name: '', precio: '', description: '' });
  const [errores, setErrores] = useState<Partial<Record<'name' | 'precio' | 'description', string>>>(
    {},
  );
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const cambiar = (campo: keyof typeof valores, valor: string) => {
    setValores((previos) => ({ ...previos, [campo]: valor }));
    setErrores((previos) => ({ ...previos, [campo]: undefined }));
  };

  const revisarPrecio = (texto: string): string | undefined =>
    aCentimos(texto) === null ? 'Escribe un importe como 35 o 35,50' : undefined;

  return {
    valores,
    errores,
    errorGeneral,
    enviando,
    cambiar,
    alSalirDe: (campo: keyof typeof valores) => {
      if (campo === 'precio' && valores.precio.trim() !== '') {
        setErrores((previos) => ({ ...previos, precio: revisarPrecio(valores.precio) }));
      }
    },
    alEnviar: (evento: React.FormEvent<HTMLFormElement>) => {
      evento.preventDefault();
      if (enviando) return;
      setErrorGeneral(null);

      const priceCents = aCentimos(valores.precio);
      if (priceCents === null) {
        setErrores((previos) => ({ ...previos, precio: revisarPrecio(valores.precio) }));
        return;
      }

      // Se valida con el MISMO esquema que aplica el servidor, ya en centimos.
      const analisis = createPlanSchema.safeParse({
        name: valores.name.trim(),
        priceCents,
        period: periodo,
        ...(valores.description.trim() ? { description: valores.description.trim() } : {}),
      });

      if (!analisis.success) {
        const porCampo: Record<string, string> = {};
        for (const problema of analisis.error.issues) {
          const campo = String(problema.path[0] ?? '');
          porCampo[campo === 'priceCents' ? 'precio' : campo] ??= problema.message;
        }
        setErrores(porCampo);
        return;
      }

      setEnviando(true);
      void api.billing
        .createPlan(gymId, analisis.data)
        .then(async (plan) => {
          setValores({ name: '', precio: '', description: '' });
          await alCrear(plan);
        })
        .catch((problema: unknown) => setErrorGeneral(mensajeDeError(problema)))
        .finally(() => setEnviando(false));
    },
  };
}

function TablaDePlanes({
  gymId,
  planes,
  onCambio,
}: {
  gymId: string;
  planes: Plan[];
  onCambio: () => Promise<void>;
}) {
  const [editando, setEditando] = useState<string | null>(null);
  const [confirmando, setConfirmando] = useState<string | null>(null);
  const [trabajando, setTrabajando] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const archivar = (planId: string) => {
    setTrabajando(planId);
    setError(null);
    void api.billing
      .archivePlan(gymId, planId)
      .then(onCambio)
      .catch((problema: unknown) => setError(mensajeDeError(problema)))
      .finally(() => {
        setTrabajando(null);
        setConfirmando(null);
      });
  };

  return (
    <>
      {error && (
        <div className={estilos.avisoTabla}>
          <Aviso>{error}</Aviso>
        </div>
      )}

      <Tabla>
        <thead>
          <tr>
            <th scope="col">Plan</th>
            <th scope="col">Precio</th>
            <th scope="col">Periodicidad</th>
            <th scope="col">Cuotas activas</th>
            <th scope="col">
              <span className="solo-lectores">Acciones</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {planes.map((plan) =>
            editando === plan.id ? (
              <FilaEditando
                key={plan.id}
                gymId={gymId}
                plan={plan}
                onFin={async (recargar) => {
                  setEditando(null);
                  if (recargar) await onCambio();
                }}
              />
            ) : (
              <tr key={plan.id} className={plan.status === 'archived' ? estilos.archivado : ''}>
                <td>
                  <div className={estilos.nombre}>{plan.name}</div>
                  {plan.description && <div className={estilos.descripcion}>{plan.description}</div>}
                  {plan.status === 'archived' && (
                    <Etiqueta tono="neutro" className={estilos.etiqueta}>
                      Archivado
                    </Etiqueta>
                  )}
                </td>
                <td className={estilos.importe}>
                  {comoImporte(plan.priceCents, plan.currency)}
                </td>
                <td>{NOMBRE_DEL_PERIODO[plan.period]}</td>
                <td>{plan.activeSubscriptions}</td>
                <td className={estilos.acciones}>
                  {plan.status === 'active' &&
                    (confirmando === plan.id ? (
                      <ConfirmacionEnLinea
                        pregunta={
                          plan.activeSubscriptions > 0
                            ? `¿Archivar? ${plan.activeSubscriptions} cuota(s) siguen usandolo`
                            : '¿Archivar?'
                        }
                        confirmando={trabajando === plan.id}
                        onConfirmar={() => archivar(plan.id)}
                        onCancelar={() => setConfirmando(null)}
                      />
                    ) : (
                      <>
                        <Boton
                          variante="sutil"
                          disabled={trabajando !== null}
                          onClick={() => setEditando(plan.id)}
                        >
                          Editar
                        </Boton>
                        <Boton
                          variante="sutil"
                          disabled={trabajando !== null}
                          onClick={() => setConfirmando(plan.id)}
                        >
                          Archivar
                        </Boton>
                      </>
                    ))}
                </td>
              </tr>
            ),
          )}
        </tbody>
      </Tabla>
    </>
  );
}

/**
 * Edicion en la propia fila.
 *
 * La periodicidad se pinta como TEXTO, no como campo: no esta en
 * `updatePlanSchema` y no puede cambiarse. Enseñarla desactivada explicaria por
 * que mejor que ocultarla.
 */
function FilaEditando({
  gymId,
  plan,
  onFin,
}: {
  gymId: string;
  plan: Plan;
  onFin: (recargar: boolean) => Promise<void>;
}) {
  const [nombre, setNombre] = useState(plan.name);
  const [precio, setPrecio] = useState((plan.priceCents / 100).toFixed(2).replace('.', ','));
  const [descripcion, setDescripcion] = useState(plan.description ?? '');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const guardar = () => {
    const priceCents = aCentimos(precio);
    if (priceCents === null) return setError('Escribe un importe como 35 o 35,50');
    if (nombre.trim() === '') return setError('El nombre no puede quedar vacio');

    setGuardando(true);
    setError(null);
    void api.billing
      .updatePlan(gymId, plan.id, {
        name: nombre.trim(),
        priceCents,
        // Vaciar la descripcion se manda como cadena vacia, que el esquema
        // acepta: es la unica forma de quitarla sin un campo anulable.
        description: descripcion.trim(),
      })
      .then(() => onFin(true))
      .catch((problema: unknown) => setError(mensajeDeError(problema)))
      .finally(() => setGuardando(false));
  };

  return (
    <tr className={estilos.filaEdicion}>
      <td colSpan={5}>
        {error && <Aviso>{error}</Aviso>}

        <div className={estilos.edicion}>
          <Campo etiqueta="Nombre" valor={nombre} alCambiar={setNombre} />
          <Campo etiqueta="Precio" ayuda="En euros" valor={precio} alCambiar={setPrecio} />
          <Campo etiqueta="Descripcion" opcional valor={descripcion} alCambiar={setDescripcion} />

          <div className={estilos.periodoFijo}>
            <span className={estilos.etiquetaCampo}>Periodicidad</span>
            <span className={estilos.periodoValor}>{NOMBRE_DEL_PERIODO[plan.period]}</span>
            <span className={estilos.periodoNota}>
              No se puede cambiar: reescribiria lo que cubre cada pago ya registrado
            </span>
          </div>
        </div>

        <div className={estilos.accionesEdicion}>
          <Boton variante="primario" cargando={guardando} onClick={guardar}>
            Guardar
          </Boton>
          <Boton disabled={guardando} onClick={() => void onFin(false)}>
            Cancelar
          </Boton>
        </div>
      </td>
    </tr>
  );
}
