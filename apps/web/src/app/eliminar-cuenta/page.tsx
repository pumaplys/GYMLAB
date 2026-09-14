'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { ErasureBlocker } from '@gymlab/contracts';
import { Aviso } from '@/componentes/aviso';
import { Boton } from '@/componentes/boton';
import { Campo } from '@/componentes/campo';
import { PantallaCentrada } from '@/componentes/pantalla-centrada';
import { api } from '@/lib/api';
import estilos from './eliminar.module.css';

/**
 * El recurso web de borrado de cuenta.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ TIENE QUE FUNCIONAR SIN LA APP INSTALADA. ESO ES LO QUE PIDE GOOGLE.    │
 * │                                                                          │
 * │ Quien desinstalo RINDA y quiere que sus datos desaparezcan no tiene por  │
 * │ donde pedirlo si el unico camino esta dentro de la app. Por eso esta     │
 * │ pagina es PUBLICA: explica sin sesion lo que ocurre, y solo pide entrar  │
 * │ para EJECUTARLO —que sigue siendo necesario, porque nadie puede borrar   │
 * │ la cuenta de otra persona.                                               │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ Y NO ES UN SEGUNDO MOTOR DE BORRADO.                                     │
 * │                                                                          │
 * │ Llama al mismo `DELETE /v1/me` que la app. Dos implementaciones del      │
 * │ articulo 17 serian dos sitios donde olvidarse de una tabla, y la que se  │
 * │ usa menos seria la que se quedaria atras.                                │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
const CONFIRMACION = 'ELIMINAR';

type Estado =
  | { fase: 'comprobando' }
  | { fase: 'sinSesion' }
  | { fase: 'bloqueado'; bloqueos: ErasureBlocker[] }
  | { fase: 'puede' }
  | { fase: 'hecho' };

export default function EliminarCuentaPage() {
  const [estado, setEstado] = useState<Estado>({ fase: 'comprobando' });
  const [escrito, setEscrito] = useState('');
  const [contrasena, setContrasena] = useState('');
  const [borrando, setBorrando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    void (async () => {
      try {
        const r = await api.auth.erasurePreview();
        if (!vivo) return;
        setEstado(r.puedeBorrarse ? { fase: 'puede' } : { fase: 'bloqueado', bloqueos: r.bloqueos });
      } catch {
        // Sin sesion la API responde 401. No es un fallo: es el caso normal de
        // quien llega aqui desde un buscador o desde la ficha de la tienda.
        if (vivo) setEstado({ fase: 'sinSesion' });
      }
    })();
    return () => {
      vivo = false;
    };
  }, []);

  const eliminar = async () => {
    setBorrando(true);
    setError(null);
    try {
      const r = await api.auth.eraseAccount({ password: contrasena });
      if (r.ok) setEstado({ fase: 'hecho' });
      else {
        setEstado({ fase: 'bloqueado', bloqueos: r.bloqueos });
        setEscrito('');
        setContrasena('');
      }
    } catch {
      // Un 401 aqui es «esa no es tu contraseña», que es el fallo mas probable.
      setError('No hemos podido eliminar tu cuenta. Comprueba tu contraseña e inténtalo de nuevo.');
    } finally {
      setBorrando(false);
    }
  };

  return (
    <PantallaCentrada titulo="Eliminar mi cuenta" entradilla="Tu identidad en RINDA">
      <div className={estilos.texto}>
        <h2>Qué ocurre si la eliminas</h2>
        <p>
          Se elimina tu identidad en RINDA entera, no sólo en un gimnasio: tu acceso, tus datos
          personales, tus mediciones corporales y los permisos que hayas dado.
        </p>
        <p>
          Algunos registros se conservan <strong>sin tu nombre</strong>, porque el gimnasio los
          necesita como hecho: los pagos y las entradas quedan como importes y fechas, sin quedar
          ligados a ti.
        </p>
        <p>
          No hay periodo de espera ni forma de recuperarla. Se cierran todas tus sesiones, también
          en el móvil.
        </p>
        <p>
          Si eres la única persona dueña de un gimnasio, no podremos eliminarla todavía: ese
          gimnasio se quedaría sin nadie que lo administre. Te diremos cuál es.
        </p>
      </div>

      {estado.fase === 'comprobando' ? <p className={estilos.texto}>Comprobando…</p> : null}

      {estado.fase === 'sinSesion' ? (
        <div className={estilos.acciones}>
          <Aviso tono="aviso">Para eliminar tu cuenta tienes que entrar con ella.</Aviso>
          <Link href="/login" className={estilos.enlace}>
            Entrar
          </Link>
          <Link href="/forgot-password" className={estilos.enlace}>
            He olvidado mi contraseña
          </Link>
        </div>
      ) : null}

      {estado.fase === 'bloqueado' ? (
        <div className={estilos.acciones}>
          <Aviso tono="aviso">
            {estado.bloqueos.length === 1
              ? `Todavía no: eres la única persona dueña de ${estado.bloqueos[0]!.nombre}.`
              : 'Todavía no: eres la única persona dueña de estos gimnasios.'}
          </Aviso>
          {estado.bloqueos.length > 1 ? (
            <ul className={estilos.lista}>
              {estado.bloqueos.map((b) => (
                <li key={b.gymId}>{b.nombre}</li>
              ))}
            </ul>
          ) : null}
          <p className={estilos.texto}>
            Invita a otro dueño desde Personal y vuelve aquí.
          </p>
        </div>
      ) : null}

      {estado.fase === 'puede' ? (
        <div className={estilos.acciones}>
          {error ? <Aviso tono="error">{error}</Aviso> : null}
          {/*
            DOS PUERTAS, Y NO SON LA MISMA. La palabra confirma la INTENCION
            —que no ha sido un clic sin querer—; la contraseña confirma la
            IDENTIDAD de quien está delante. La segunda la comprueba el
            servidor: esta pantalla no decide nada.
          */}
          <Campo
            etiqueta={`Escribe ${CONFIRMACION} para confirmar`}
            ayuda="Es la única forma de continuar."
            valor={escrito}
            alCambiar={setEscrito}
            deshabilitado={borrando}
          />
          <Campo
            etiqueta="Tu contraseña actual"
            tipo="password"
            ayuda="Para comprobar que eres tú."
            valor={contrasena}
            alCambiar={setContrasena}
            deshabilitado={borrando}
          />
          <Boton
            variante="peligro"
            onClick={() => void eliminar()}
            cargando={borrando}
            disabled={escrito.trim().toUpperCase() !== CONFIRMACION || !contrasena || borrando}
          >
            Eliminar mi cuenta
          </Boton>
        </div>
      ) : null}

      {estado.fase === 'hecho' ? (
        <div className={estilos.acciones}>
          <Aviso tono="exito">
            Tu cuenta se ha eliminado. Ya no existe ninguna sesión abierta con ella.
          </Aviso>
        </div>
      ) : null}

      <p className={estilos.pie}>
        ¿Dudas sobre qué datos se conservan? Léelo en{' '}
        <Link href="/privacidad">la política de privacidad</Link>, o escríbenos desde{' '}
        <Link href="/soporte">soporte</Link>.
      </p>
    </PantallaCentrada>
  );
}
