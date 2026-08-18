'use client';

import { useCallback, useRef, useState } from 'react';
import type { AccessResult } from '@gymlab/contracts';
import { Aviso } from '@/componentes/aviso';
import { Boton } from '@/componentes/boton';
import { Campo } from '@/componentes/campo';
import { Tarjeta } from '@/componentes/tarjeta';
import { api } from '@/lib/api';
import { mensajeDeError } from '@/lib/errores';
import { esSesionCaducada, useSesion } from '@/lib/sesion';
import {
  MENSAJE_DEL_MOTIVO,
  TITULO_DE_LA_DECISION,
  debeEnviar,
  detalleDeCuota,
  nombreDelSocio,
  tonoDeLaDecision,
} from './escaner-logica';
import { usarCamara } from './usar-camara';
import estilos from './accesos.module.css';

/**
 * El escáner de la puerta.
 *
 * Dos caminos hacia la misma llamada: la cámara cuando el navegador la ofrece,
 * y el pegado manual siempre. **No hay lógica de decisión aquí** — quién pasa lo
 * decide el servidor, y esta pantalla solo lo cuenta.
 */
export function Escaner({ alVerificar }: { alVerificar: () => void }) {
    const { gymId, revisar } = useSesion();
  const [resultado, setResultado] = useState<AccessResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [manual, setManual] = useState('');
  const [procesando, setProcesando] = useState(false);
  /*
   * En una ref y no en el estado: la cámara lee muchos fotogramas por segundo y
   * `setState` no se ve reflejado hasta el siguiente render. Con estado, varios
   * fotogramas del MISMO código pasarían el filtro antes del primer repintado.
   */
  const ultimoEnviado = useRef<string | null>(null);
  const enCurso = useRef(false);

  const verificar = useCallback(
    async (token: string) => {
      if (!gymId) return;
      if (!debeEnviar(token, { ultimoEnviado: ultimoEnviado.current, procesando: enCurso.current }))
        return;

      ultimoEnviado.current = token;
      enCurso.current = true;
      setProcesando(true);
      setError(null);

      try {
        setResultado(await api.accesos.verify(gymId, token.trim()));
        alVerificar();
      } catch (fallo) {
        if (esSesionCaducada(fallo)) return void revisar();
        setResultado(null);
        setError(mensajeDeError(fallo));
        /*
         * Se olvida el token para que se pueda REINTENTAR el mismo código: si
         * el fallo fue de red, el socio sigue delante con su carné en la mano.
         */
        ultimoEnviado.current = null;
      } finally {
        enCurso.current = false;
        setProcesando(false);
      }
    },
    [gymId, revisar, alVerificar],
  );

  const camara = usarCamara(verificar);

  return (
    <>
      <Tarjeta>
        <h2 className={estilos.titulo}>Escanear carné</h2>

        {camara.estado === 'no-soportada' && (
          <Aviso tono="informacion">
            Este navegador no puede leer códigos con la cámara. Pide al socio el código de su
            carné y pégalo abajo: funciona igual.
          </Aviso>
        )}

        {camara.estado === 'denegada' && (
          <Aviso tono="informacion">
            No se pudo usar la cámara — puede que falte el permiso o que no haya ninguna
            conectada. Usa el código manual.
          </Aviso>
        )}

        {(camara.estado === 'lista' || camara.estado === 'encendida') && (
          <div className={estilos.camara}>
            {/*
              `playsInline` es obligatorio: sin él, iOS abre el vídeo a pantalla
              completa y tapa el resultado del escaneo.
            */}
            <video
              ref={camara.video}
              className={camara.estado === 'encendida' ? estilos.video : estilos.videoOculto}
              muted
              playsInline
            />
            {camara.estado === 'lista' ? (
              <Boton variante="primario" onClick={() => void camara.encender()}>
                Encender la cámara
              </Boton>
            ) : (
              <Boton onClick={camara.apagar}>Apagar la cámara</Boton>
            )}
          </div>
        )}

        <form
          className={estilos.manual}
          onSubmit={(evento) => {
            evento.preventDefault();
            // Manual: se limpia el recuerdo para poder repetir el mismo código a
            // propósito, que en el mostrador es una petición legítima.
            ultimoEnviado.current = null;
            void verificar(manual);
          }}
        >
          <Campo
            etiqueta="Código del carné"
            ayuda="Pega aquí el código si no usas la cámara."
            valor={manual}
            alCambiar={setManual}
            deshabilitado={procesando}
          />
          <Boton type="submit" variante="primario" cargando={procesando} disabled={!manual.trim()}>
            Comprobar
          </Boton>
        </form>
      </Tarjeta>

      {error && <Aviso>{error}</Aviso>}
      {resultado && <Resultado resultado={resultado} />}
    </>
  );
}

/**
 * El veredicto, en grande.
 *
 * Quien está en la puerta lo lee de reojo con una persona delante, así que la
 * decisión va primero y en cuerpo grande; el nombre y el número existen para
 * confirmar de un vistazo que quien entra es quien dice el carné.
 */
function Resultado({ resultado }: { resultado: AccessResult }) {
  const nombre = nombreDelSocio(resultado);
  const detalle = detalleDeCuota(resultado);

  return (
    <Tarjeta>
      {/* `role="status"` para que un lector de pantalla lo anuncie al llegar. */}
      <div className={estilos.veredicto} role="status">
        <p className={`${estilos.decision} ${estilos[resultado.decision.toLowerCase()]}`}>
          {TITULO_DE_LA_DECISION[resultado.decision]}
        </p>

        {nombre ? (
          <p className={estilos.socio}>
            {nombre} <span className={estilos.numero}>nº {resultado.member!.memberNumber}</span>
          </p>
        ) : (
          // Sin socio identificado se dice así, en lugar de dejar un hueco que
          // parezca un fallo de carga.
          <p className={estilos.sinSocio}>El código no identifica a ningún socio.</p>
        )}

        <Aviso tono={tonoDeLaDecision(resultado.decision)}>
          {MENSAJE_DEL_MOTIVO[resultado.reason]}
          {detalle && ` ${detalle}`}
        </Aviso>

        {resultado.isRetry && (
          <p className={estilos.reintento}>
            Es una relectura del mismo código, no una entrada nueva.
          </p>
        )}
      </div>
    </Tarjeta>
  );
}
