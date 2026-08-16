'use client';

import { useCallback, useEffect, useState } from 'react';
import type { BodyMetric, HealthConsentStatus, RecordBodyMetricInput } from '@gymlab/contracts';
import { Aviso } from '@/componentes/aviso';
import { Boton } from '@/componentes/boton';
import { Campo } from '@/componentes/campo';
import { Cargando } from '@/componentes/cargando';
import { EstadoVacio } from '@/componentes/estado-vacio';
import { Dato, FilaApilada, ListaApilada } from '@/componentes/lista-apilada';
import { Tabla, celda } from '@/componentes/tabla';
import { Tarjeta } from '@/componentes/tarjeta';
import { api } from '@/lib/api';
import { mensajeDeError } from '@/lib/errores';
import { comoFecha } from '@/lib/formato';
import { esSesionCaducada, useSesion } from '@/lib/sesion';
import estilos from './progreso.module.css';
import {
  MEDIDAS,
  aEnvio,
  borradorVacio,
  erroresDe,
  estadoDe,
  type Borrador,
} from './progreso-logica';

/**
 * Peso y medidas de un socio, dentro de su ficha.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ EL ENTRENADOR RESPETA EL CONSENTIMIENTO. NO LO CONCEDE.                  │
 * │                                                                          │
 * │ Son datos de salud (RGPD art. 9) y su base legal es el consentimiento    │
 * │ EXPLICITO del interesado. La API deja tecnicamente que un entrenador lo  │
 * │ registre —esta pensada para recogerlo en el mostrador con el socio       │
 * │ delante— pero desde aqui no hay boton para hacerlo, a proposito: un      │
 * │ consentimiento que otorga otro en tu nombre, sin que tu estes, no es     │
 * │ consentimiento. Recogerlo se resuelve fuera de esta pantalla.            │
 * │                                                                          │
 * │ Aqui solo caben dos cosas: leer lo que ya existe, y escribir cuando el   │
 * │ socio ya ha autorizado.                                                  │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * El historial se pinta SIEMPRE, tambien sin consentimiento vigente, porque el
 * servidor tampoco lo bloquea: lo ya recogido legitimamente tiene que poder
 * consultarse para atender una peticion de acceso o de borrado. Lo que
 * desaparece al faltar el consentimiento es el formulario.
 */
export function ProgresoDelSocio({ memberId, nombre }: { memberId: string; nombre: string }) {
  const { gymId, revisar } = useSesion();

  const [historial, setHistorial] = useState<BodyMetric[] | null>(null);
  const [consentimiento, setConsentimiento] = useState<HealthConsentStatus | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [registrando, setRegistrando] = useState(false);
  const [borrador, setBorrador] = useState<Borrador>(borradorVacio);
  const [intentado, setIntentado] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [errorAlGuardar, setErrorAlGuardar] = useState<string | null>(null);
  const [hecho, setHecho] = useState(false);

  const cargar = useCallback(
    async (signal?: AbortSignal) => {
      if (!gymId) return;
      const [mediciones, estado] = await Promise.all([
        api.progreso.historial(gymId, memberId, { signal }),
        api.progreso.consentimientoDeSalud(gymId, memberId, { signal }),
      ]);
      setHistorial(mediciones);
      setConsentimiento(estado);
    },
    [gymId, memberId],
  );

  useEffect(() => {
    if (!gymId) return;
    const control = new AbortController();
    setCargando(true);
    setError(null);

    cargar(control.signal)
      .then(() => setCargando(false))
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
  }, [gymId, cargar, revisar]);

  /*
   * Cambiar de gimnasio tira TODO el estado local, incluido lo escrito.
   *
   * Aqui importa mas que en ninguna otra pantalla: un formulario a medias con el
   * peso de una persona no puede sobrevivir a un cambio de contexto y acabar
   * enviandose contra otro gimnasio. Se pierde lo tecleado, si — y es lo
   * correcto: son datos de salud de alguien que ya no esta delante.
   */
  useEffect(() => {
    setHistorial(null);
    setConsentimiento(null);
    setRegistrando(false);
    setBorrador(borradorVacio());
    setIntentado(false);
    setErrorAlGuardar(null);
    setHecho(false);
  }, [gymId]);

  const errores = intentado ? erroresDe(borrador) : {};

  const cambiar = (campo: keyof Borrador['medidas'], valor: string) =>
    setBorrador((actual) => ({ ...actual, medidas: { ...actual.medidas, [campo]: valor } }));

  const guardar = async () => {
    if (!gymId || guardando) return;
    setIntentado(true);
    setErrorAlGuardar(null);

    if (Object.keys(erroresDe(borrador)).length > 0) return;

    setGuardando(true);
    try {
      await api.progreso.registrar(gymId, memberId, aEnvio(borrador) as RecordBodyMetricInput);
      await cargar();
      // Solo al ir bien se limpia. Si falla, lo escrito sigue donde estaba.
      setBorrador(borradorVacio());
      setIntentado(false);
      setRegistrando(false);
      setHecho(true);
    } catch (problema: unknown) {
      if (esSesionCaducada(problema)) {
        void revisar();
        return;
      }
      setErrorAlGuardar(mensajeDeError(problema));
    } finally {
      setGuardando(false);
    }
  };

  const estado = consentimiento ? estadoDe(consentimiento) : null;

  return (
    <section aria-labelledby="progreso-del-socio">
      <div className={estilos.cabecera}>
        <h2 className={estilos.titulo} id="progreso-del-socio">
          Progreso
        </h2>
        {estado === 'vigente' && !registrando && !cargando && (
          <Boton
            onClick={() => {
              setRegistrando(true);
              // El "registrada" de la vez anterior se va al empezar otra: dejarlo
              // encima de un formulario en blanco dice que ya se guardo algo que
              // todavia no se ha escrito.
              setHecho(false);
            }}
          >
            Registrar medicion
          </Boton>
        )}
      </div>

      {error && <Aviso>{error}</Aviso>}

      {hecho && <Aviso tono="exito">Medicion registrada.</Aviso>}

      {/*
        Sin consentimiento se explica QUE falta y A QUIEN le toca, sin convertir
        la pantalla en un texto legal ni ofrecer una forma de saltarselo.
      */}
      {estado === 'sin-texto' && (
        <Aviso tono="informacion">
          Este gimnasio todavia no tiene publicado el texto del consentimiento de datos de salud,
          asi que no se puede registrar peso ni medidas de nadie. No es algo que se resuelva desde
          aqui.
        </Aviso>
      )}

      {estado === 'sin-aceptar' && (
        <Aviso tono="informacion">
          {nombre} no ha autorizado el tratamiento de sus datos de salud, asi que no se pueden
          registrar mediciones. Tiene que autorizarlo la propia persona.
        </Aviso>
      )}

      {registrando && estado === 'vigente' && (
        <Tarjeta className={estilos.formulario}>
          {errorAlGuardar && <Aviso>{errorAlGuardar}</Aviso>}
          {errores.general && <Aviso>{errores.general}</Aviso>}

          <div className={estilos.medidas}>
            {MEDIDAS.map((medida, indice) => (
              <Campo
                key={medida.campo}
                etiqueta={`${medida.etiqueta} (${medida.unidad})`}
                opcional
                /*
                  El primero recibe el foco al abrir el formulario. Sin esto, el
                  boton que se acaba de pulsar desaparece y el foco cae al
                  `body`: quien va con teclado tendria que recorrer la ficha
                  entera para llegar al formulario que acaba de abrir.
                */
                foco={indice === 0}
                valor={borrador.medidas[medida.campo]}
                alCambiar={(v) => cambiar(medida.campo, v)}
                error={errores[medida.campo]}
              />
            ))}
          </div>

          <Campo
            etiqueta="Fecha de la medicion"
            opcional
            tipo="date"
            ayuda="Si se deja en blanco, se guarda con la fecha de hoy. No se admite el futuro."
            valor={borrador.fecha}
            alCambiar={(v) => setBorrador((actual) => ({ ...actual, fecha: v }))}
            error={errores.fecha}
          />

          <Campo
            etiqueta="Notas"
            opcional
            valor={borrador.notas}
            alCambiar={(v) => setBorrador((actual) => ({ ...actual, notas: v }))}
            error={errores.notas}
          />

          <div className={estilos.acciones}>
            <Boton variante="primario" cargando={guardando} onClick={() => void guardar()}>
              Guardar medicion
            </Boton>
            <Boton
              disabled={guardando}
              onClick={() => {
                setRegistrando(false);
                setBorrador(borradorVacio());
                setIntentado(false);
                setErrorAlGuardar(null);
              }}
            >
              Cancelar
            </Boton>
          </div>
        </Tarjeta>
      )}

      <Tarjeta variante="lista">
        {cargando ? (
          <Cargando>Cargando su progreso…</Cargando>
        ) : historial === null || historial.length === 0 ? (
          <EstadoVacio
            titulo="Todavia no hay mediciones"
            texto={
              estado === 'vigente'
                ? `Registra la primera y quedara aqui el historial de ${nombre}.`
                : 'Cuando se puedan registrar, apareceran aqui.'
            }
          />
        ) : (
          <Historial mediciones={historial} />
        )}
      </Tarjeta>
    </section>
  );
}

/**
 * El historial, en tabla ancha y en tarjetas estrechas.
 *
 * SIN GRAFICAS. Una linea de peso con tres puntos sugiere una tendencia que no
 * existe, y aqui el dato correcto vale mas que el dibujo. Tampoco se calcula
 * nada —ni IMC ni variaciones—: seria inventar un dato de salud que nadie midio.
 */
function Historial({ mediciones }: { mediciones: readonly BodyMetric[] }) {
  const conValor = MEDIDAS.filter((m) => mediciones.some((x) => x[m.campo] !== null));

  return (
    <>
      <Tabla conListaEstrecha>
        <thead>
          <tr>
            <th scope="col">Fecha</th>
            {conValor.map((m) => (
              <th key={m.campo} scope="col" className={celda.numerica}>
                {m.etiqueta} ({m.unidad})
              </th>
            ))}
            <th scope="col">Notas</th>
          </tr>
        </thead>
        <tbody>
          {mediciones.map((medicion) => (
            <tr key={medicion.id}>
              <td>{comoFecha(medicion.measuredAt)}</td>
              {conValor.map((m) => (
                <td key={m.campo} className={celda.numerica}>
                  {medicion[m.campo] ?? <span className={celda.tenue}>—</span>}
                </td>
              ))}
              <td>{medicion.notes ?? <span className={celda.tenue}>—</span>}</td>
            </tr>
          ))}
        </tbody>
      </Tabla>

      <ListaApilada etiqueta="Mediciones">
        {mediciones.map((medicion) => (
          <FilaApilada key={medicion.id} titulo={comoFecha(medicion.measuredAt)}>
            {MEDIDAS.filter((m) => medicion[m.campo] !== null).map((m) => (
              <Dato key={m.campo} etiqueta={m.etiqueta}>
                <span className={celda.numerica}>
                  {medicion[m.campo]} {m.unidad}
                </span>
              </Dato>
            ))}
            {medicion.notes && <Dato etiqueta="Notas">{medicion.notes}</Dato>}
          </FilaApilada>
        ))}
      </ListaApilada>
    </>
  );
}
