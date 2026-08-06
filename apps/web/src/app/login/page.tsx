'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { loginSchema } from '@gymlab/contracts';
import { Aviso } from '@/componentes/aviso';
import { Boton } from '@/componentes/boton';
import { Campo } from '@/componentes/campo';
import { PantallaCentrada } from '@/componentes/pantalla-centrada';
import { useFormulario } from '@/lib/formulario';
import { useSesion } from '@/lib/sesion';
import estilos from './login.module.css';

export default function Entrar() {
  const { estado, entrar } = useSesion();
  const router = useRouter();

  // Quien ya tiene sesion no ve esta pantalla: si vuelve a /login —por un
  // marcador, o por el boton de atras— se le devuelve al panel.
  useEffect(() => {
    if (estado.fase === 'identificado') router.replace('/socios');
  }, [estado.fase, router]);

  const formulario = useFormulario({
    esquema: loginSchema,
    iniciales: { email: '', password: '' },
    // No hay redireccion aqui: al terminar, la sesion pasa a `identificado` y
    // el efecto de arriba se encarga. Una sola salida en lugar de dos.
    enviar: entrar,
  });

  return (
    <PantallaCentrada titulo="Entrar en el panel">
      <form className={estilos.formulario} onSubmit={formulario.alEnviar} noValidate>
        {/*
          `noValidate` desactiva los avisos del navegador a proposito: los suyos
          salen en el idioma del sistema, con su propio estilo y sin relacion
          con lo que valida el servidor. Los nuestros vienen del mismo esquema
          que aplica la API.
        */}
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

        <Campo
          etiqueta="Contrasena"
          tipo="password"
          autoComplete="current-password"
          valor={formulario.valores.password}
          error={formulario.errores.password}
          alCambiar={(valor) => formulario.cambiar('password', valor)}
          alSalir={() => formulario.alSalirDe('password')}
        />

        <Boton
          type="submit"
          variante="primario"
          bloque
          className={estilos.enviar}
          cargando={formulario.enviando}
        >
          Entrar
        </Boton>

        {/*
          Sin este enlace la pantalla de recuperacion no existe para quien la
          necesita: el otro camino es el correo, y a ese solo se llega desde
          aqui. Va debajo del boton a proposito — quien viene a entrar no debe
          tropezarse antes con la salida de emergencia.
        */}
        <Link className={estilos.olvidada} href="/forgot-password">
          He olvidado mi contrasena
        </Link>
      </form>
    </PantallaCentrada>
  );
}
