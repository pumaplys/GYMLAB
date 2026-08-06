'use client';

import { useState } from 'react';
import Link from 'next/link';
import { forgotPasswordSchema } from '@gymlab/contracts';
import { Aviso } from '@/componentes/aviso';
import { Boton } from '@/componentes/boton';
import { Campo } from '@/componentes/campo';
import { PantallaCentrada } from '@/componentes/pantalla-centrada';
import { api } from '@/lib/api';
import { useFormulario } from '@/lib/formulario';
import estilos from './pedir.module.css';

/**
 * Pedir el correo con el enlace para poner una contrasena nueva.
 *
 * Es la unica via de vuelta al sistema para quien olvida su contrasena: nadie
 * puede reponersela desde el panel, ni el dueno del gimnasio.
 */
export default function PedirEnlacePage() {
  /**
   * El correo que se escribio, o `null` si aun no se ha enviado nada.
   *
   * Se guarda para poder repetirlo en la confirmacion. No confirma que exista:
   * es lo que ESCRIBIO quien esta delante, y sirve justo para que detecte una
   * errata cuando el correo no llegue.
   */
  const [enviadoA, setEnviadoA] = useState<string | null>(null);

  return enviadoA === null ? (
    <Formulario onEnviado={setEnviadoA} />
  ) : (
    <Confirmacion correo={enviadoA} />
  );
}

function Formulario({ onEnviado }: { onEnviado: (correo: string) => void }) {
  const formulario = useFormulario({
    esquema: forgotPasswordSchema,
    iniciales: { email: '' },
    enviar: async (datos) => {
      await api.auth.forgotPassword(datos);
      onEnviado(datos.email);
    },
  });

  return (
    <PantallaCentrada
      titulo="Recuperar el acceso"
      entradilla="Escribe tu correo y te llega un enlace para poner una contrasena nueva."
    >
      <form className={estilos.formulario} onSubmit={formulario.alEnviar} noValidate>
        {formulario.errorGeneral && <Aviso>{formulario.errorGeneral}</Aviso>}

        <Campo
          etiqueta="Correo electronico"
          tipo="email"
          autoComplete="username"
          foco
          valor={formulario.valores.email}
          error={formulario.errores.email}
          alCambiar={(valor) => formulario.cambiar('email', valor)}
          alSalir={() => formulario.alSalirDe('email')}
        />

        <Boton
          type="submit"
          variante="primario"
          bloque
          className={estilos.enviar}
          cargando={formulario.enviando}
        >
          Enviarme el enlace
        </Boton>

        <Link className={estilos.enlace} href="/login">
          Volver a entrar
        </Link>
      </form>
    </PantallaCentrada>
  );
}

/**
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ AQUI NO SE PUEDE DECIR "TE HEMOS ENVIADO UN CORREO". PUEDE QUE NO.       │
 * │                                                                          │
 * │ El servidor responde `ok` exista la cuenta o no, y eso es deliberado:    │
 * │ si respondiera distinto, este formulario seria un comprobador de quien   │
 * │ esta dado de alta en la plataforma —se prueban correos uno a uno y el    │
 * │ que conteste diferente delata a un cliente—. Como la respuesta no lo     │
 * │ sabe, la pantalla tampoco puede afirmarlo.                               │
 * │                                                                          │
 * │ De ahi el "si ... tiene cuenta". Es literalmente todo lo que consta.     │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
function Confirmacion({ correo }: { correo: string }) {
  return (
    <PantallaCentrada
      titulo="Revisa tu correo"
      // Se llega aqui sustituyendo el formulario tras un envio: sin esto el
      // foco se queda en un boton que ya no existe.
      enfocarTitulo
    >
      <div className={estilos.acciones}>
        <p className={estilos.explicacion}>
          Si <span className={estilos.correo}>{correo}</span> tiene cuenta en GYMLAB, ahi esta el
          enlace para poner una contrasena nueva. Caduca, asi que mejor abrirlo ahora.
        </p>

        <p className={estilos.explicacion}>
          Si no llega, mira en la carpeta de correo no deseado y comprueba que la direccion esta
          bien escrita.
        </p>

        <Link className={estilos.enlace} href="/login">
          Volver a entrar
        </Link>
      </div>
    </PantallaCentrada>
  );
}
