'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { resetPasswordSchema } from '@gymlab/contracts';
import { Aviso } from '@/componentes/aviso';
import { Boton } from '@/componentes/boton';
import { Campo } from '@/componentes/campo';
import { PantallaCentrada } from '@/componentes/pantalla-centrada';
import { api } from '@/lib/api';
import { useFormulario } from '@/lib/formulario';
import estilos from './restablecer.module.css';

/**
 * Poner una contrasena nueva con el token que llego en el correo.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ ESTA PANTALLA ES EL FINAL DE UN ENLACE QUE LA API YA MANDABA.            │
 * │                                                                          │
 * │ `auth.instance.ts` construye `${WEB_APP_URL}/reset-password?token=...`   │
 * │ desde la Fase 1. La ruta no existia, asi que el enlace del correo de     │
 * │ recuperacion terminaba en un 404: quien olvidara su contrasena se        │
 * │ quedaba fuera de su propio gimnasio para siempre, sin ninguna via de     │
 * │ vuelta dentro del producto.                                              │
 * │                                                                          │
 * │ No se noto antes porque los correos nunca llegaron a enviarse.           │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export default function RestablecerPage() {
  return (
    // `useSearchParams` obliga a un limite de suspense con exportacion
    // estatica: el HTML se genera sin conocer la URL y el token solo existe en
    // el navegador. Mismo motivo que en `/accept-invitation`.
    <Suspense fallback={<Esperando />}>
      <Restablecer />
    </Suspense>
  );
}

function Restablecer() {
  const token = useSearchParams().get('token');
  const [hecho, setHecho] = useState(false);

  if (!token) {
    return (
      <PantallaCentrada
        titulo="Falta el enlace"
        entradilla="Abre el enlace tal y como te llego en el correo, sin recortarlo. Si lo has copiado a mano, puede que se haya perdido un trozo."
      >
        <div className={estilos.acciones}>
          <Link className={estilos.enlace} href="/forgot-password">
            Pedir un enlace nuevo
          </Link>
        </div>
      </PantallaCentrada>
    );
  }

  return hecho ? <Listo /> : <Formulario token={token} onHecho={() => setHecho(true)} />;
}

function Formulario({ token, onHecho }: { token: string; onHecho: () => void }) {
  const formulario = useFormulario({
    esquema: resetPasswordSchema,
    // El token viaja como un valor mas del formulario, sin campo que lo pinte:
    // asi lo valida el mismo esquema que aplica el servidor.
    iniciales: { token, newPassword: '' },
    enviar: async (datos) => {
      await api.auth.resetPassword(datos);
      onHecho();
    },
  });

  return (
    <PantallaCentrada
      titulo="Elige una contrasena nueva"
      entradilla="Al guardarla, el enlace del correo deja de servir."
    >
      <form className={estilos.formulario} onSubmit={formulario.alEnviar} noValidate>
        {/*
          Un token gastado, caducado o inventado son el mismo 400 con el mismo
          texto, y llega aqui como aviso general porque no es culpa de lo que
          se acaba de escribir.
        */}
        {formulario.errorGeneral && (
          <Aviso>
            {formulario.errorGeneral}{' '}
            <Link className={estilos.enlaceEnAviso} href="/forgot-password">
              Pedir uno nuevo
            </Link>
          </Aviso>
        )}

        <Campo
          etiqueta="Contrasena nueva"
          tipo="password"
          autoComplete="new-password"
          ayuda="Al menos 10 caracteres. Larga es mejor que complicada."
          foco
          valor={formulario.valores.newPassword}
          error={formulario.errores.newPassword}
          alCambiar={(valor) => formulario.cambiar('newPassword', valor)}
          alSalir={() => formulario.alSalirDe('newPassword')}
        />

        <Boton
          type="submit"
          variante="primario"
          bloque
          className={estilos.enviar}
          cargando={formulario.enviando}
        >
          Guardar y continuar
        </Boton>
      </form>
    </PantallaCentrada>
  );
}

/**
 * Restablecer NO abre sesion, y por eso hay que entrar a mano.
 *
 * La respuesta del servidor no trae token de sesion, cosa deliberada: quien
 * abre el enlace puede no ser quien lo pidio. Entrar con la contrasena recien
 * puesta es la comprobacion de que ha quedado como se queria.
 */
function Listo() {
  const router = useRouter();

  return (
    <PantallaCentrada
      titulo="Contrasena cambiada"
      entradilla="Ya puedes entrar con la contrasena nueva."
      // Se llega aqui SUSTITUYENDO el formulario tras un envio: sin esto el
      // foco se queda en un boton que ya no existe y nadie anuncia el cambio.
      enfocarTitulo
    >
      <div className={estilos.acciones}>
        <Boton variante="primario" bloque onClick={() => router.replace('/login')}>
          Entrar en el panel
        </Boton>
      </div>
    </PantallaCentrada>
  );
}

function Esperando() {
  return (
    <PantallaCentrada titulo="Restablecer la contrasena">
      <p className={estilos.esperando} role="status" aria-live="polite">
        Abriendo el enlace…
      </p>
    </PantallaCentrada>
  );
}
