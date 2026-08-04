'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ACCOUNT_EXISTS, acceptInvitationSchema, loginSchema, type Me } from '@gymlab/contracts';
import { ApiError } from '@gymlab/api-client';
import { Aviso } from '@/componentes/aviso';
import { Boton } from '@/componentes/boton';
import { Campo } from '@/componentes/campo';
import { PantallaCentrada } from '@/componentes/pantalla-centrada';
import { api } from '@/lib/api';
import { mensajeDeError } from '@/lib/errores';
import { useFormulario } from '@/lib/formulario';
import { useSesion } from '@/lib/sesion';
import estilos from './aceptar.module.css';

type Flujo = 'ninguno' | 'entrando' | 'cerrando';

/**
 * Aceptar una invitacion. Los dos caminos de ADR-0010, en una sola pantalla.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ POR QUE NO SE SALE DE AQUI EN NINGUN MOMENTO                             │
 * │                                                                          │
 * │ El camino de la cuenta existente obliga a iniciar sesion antes de        │
 * │ vincular. Lo evidente seria mandar a `/login` y volver, pero eso exige   │
 * │ arrastrar el token de invitacion por una URL de vuelta — y ese token es  │
 * │ el que da acceso al gimnasio. Cada salto es un sitio mas donde acaba:    │
 * │ el historial, un `Referer`, la barra de direcciones de un ordenador      │
 * │ compartido del mostrador.                                                │
 * │                                                                          │
 * │ Asi que el formulario de entrar se pinta AQUI. El token nunca sale de    │
 * │ esta pantalla ni se guarda en ningun sitio.                              │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * La otra mitad del diseno la impone el servidor y conviene no discutirla:
 * `accept` solo crea cuentas nuevas y responde 409 si el correo ya tiene una;
 * `link` exige sesion y **no acepta contrasena en su contrato**, asi que ese
 * camino no puede cambiar credenciales ni por error de programacion.
 */
export default function AceptarInvitacionPage() {
  return (
    // `useSearchParams` obliga a un limite de suspense con exportacion
    // estatica: el HTML se genera sin conocer la URL y el token solo existe en
    // el navegador.
    <Suspense fallback={<Cargando texto="Abriendo la invitacion…" />}>
      <AceptarInvitacion />
    </Suspense>
  );
}

function AceptarInvitacion() {
  const token = useSearchParams().get('token');
  const { estado, revisar } = useSesion();

  /** Se pasa a 'entrar' cuando el servidor dice que ese correo ya tiene cuenta. */
  const [modo, setModo] = useState<'crear' | 'entrar'>('crear');
  /** Lo que falla al vincular. Vive aqui porque sobrevive al cambio de pantalla. */
  const [aviso, setAviso] = useState<string | null>(null);

  /**
   * En que punto va el recorrido, que NO es lo mismo que si hay sesion.
   *
   * ┌──────────────────────────────────────────────────────────────────────┐
   * │ SIN ESTO SE PINTABA UNA PANTALLA QUE YA NO TOCA, Y SE PODIA PULSAR.  │
   * │                                                                      │
   * │ Iniciar sesion y vincular son dos pasos del mismo recorrido, pero la │
   * │ sesion aparece entre uno y otro. Esta pantalla, que decidia mirando  │
   * │ solo "¿hay sesion?", cambiaba a "Anadir este gimnasio" con su boton  │
   * │ ACTIVO mientras el vinculado seguia en vuelo. Medido en local: 241   │
   * │ ms al principio y 98 ms tras un primer intento de arreglarlo tarde.  │
   * │                                                                      │
   * │ Quien pulsara en esa ventana lanzaba un SEGUNDO `link` con el mismo  │
   * │ token y recibia "la invitacion ya se uso" justo despues de que todo  │
   * │ hubiera funcionado. Con mala conexion la ventana es mayor.           │
   * │                                                                      │
   * │ La cura no es acertar con el instante: es que la pantalla deje de    │
   * │ deducir el paso a partir de la sesion y lo sepa.                     │
   * └──────────────────────────────────────────────────────────────────────┘
   *
   * - `entrando`: hay un inicio de sesion en marcha que terminara vinculando.
   *   Aunque aparezca la sesion, la pantalla NO cambia: sigue siendo la del
   *   formulario, que asi conserva lo escrito si las credenciales fallan.
   * - `cerrando`: la invitacion ya se consumio. No queda nada que decidir ni
   *   nada que pulsar, solo esperar al cambio de pantalla.
   */
  const [flujo, setFlujo] = useState<Flujo>('ninguno');

  if (!token) {
    return (
      <PantallaCentrada
        titulo="Falta el enlace de invitacion"
        entradilla="Abre el enlace tal y como te llego en el correo, sin recortarlo. Si lo has copiado a mano, puede que se haya perdido un trozo."
      />
    );
  }

  if (flujo === 'cerrando') return <Cargando texto="Entrando…" />;

  if (estado.fase === 'cargando') return <Cargando texto="Comprobando tu sesion…" />;

  if (estado.fase === 'incomunicado') {
    return (
      <PantallaCentrada
        titulo="Sin conexion con el servidor"
        entradilla="No se ha podido comprobar tu sesion. El enlace sigue siendo valido: puedes reintentarlo."
      >
        <div className={estilos.acciones}>
          <Boton variante="primario" bloque onClick={() => void revisar()}>
            Reintentar
          </Boton>
        </div>
      </PantallaCentrada>
    );
  }

  // Ya hay sesion: no se pide nada, se vincula. Es el caso de quien abre el
  // enlace desde el mismo navegador en el que ya estaba dentro.
  //
  // `flujo !== 'entrando'` es lo que impide que esta pantalla se cuele en
  // mitad del otro recorrido, donde la sesion aparece a la mitad.
  if (estado.fase === 'identificado' && flujo !== 'entrando') {
    return (
      <Vincular
        token={token}
        yo={estado.yo}
        aviso={aviso}
        onAviso={setAviso}
        // Se vuelve a 'crear', que es la unica entrada que no puede quedarse
        // atascada: si el correo invitado ya tiene cuenta, el servidor responde
        // 409 y la pantalla pasa sola a iniciar sesion. Al reves no funciona
        // —el formulario de entrar no puede crear la cuenta que falta— y ahi se
        // quedaba encallado quien todavia no tenia ninguna.
        onOtraCuenta={() => setModo('crear')}
        onFlujo={setFlujo}
      />
    );
  }

  return modo === 'crear' ? (
    <CrearCuenta token={token} onCuentaExistente={() => setModo('entrar')} onFlujo={setFlujo} />
  ) : (
    <IniciarSesion token={token} onAviso={setAviso} onFlujo={setFlujo} />
  );
}

/** Camino 1: la cuenta no existe. Se crea con la contrasena que elija. */
function CrearCuenta({
  token,
  onCuentaExistente,
  onFlujo,
}: {
  token: string;
  onCuentaExistente: () => void;
  onFlujo: (flujo: Flujo) => void;
}) {
  const { revisar } = useSesion();
  const router = useRouter();

  const formulario = useFormulario({
    esquema: acceptInvitationSchema,
    // El token viaja como un valor mas del formulario, sin campo que lo pinte:
    // asi lo valida el mismo esquema que aplica el servidor.
    iniciales: { token, name: '', password: '' },
    enviar: async (datos) => {
      try {
        await api.auth.acceptInvitation(datos);
      } catch (error) {
        // No es un fallo que enseñar: es el otro camino de ADR-0010. Se
        // reconoce por el codigo del contrato, no por el 409 ni por el texto.
        if (error instanceof ApiError && error.code === ACCOUNT_EXISTS) {
          onCuentaExistente();
          return;
        }
        throw error;
      }
      // La cuenta ya existe y la sesion esta abierta: desde aqui no se vuelve.
      onFlujo('cerrando');
      // La sesion queda abierta y con el gimnasio activo puesto por el servidor.
      await revisar();
      router.replace('/socios');
    },
  });

  return (
    <PantallaCentrada
      titulo="Crea tu cuenta"
      entradilla="Te han invitado a un gimnasio en GYMLAB. Elige una contrasena y entras."
    >
      <form className={estilos.formulario} onSubmit={formulario.alEnviar} noValidate>
        {formulario.errorGeneral && <Aviso>{formulario.errorGeneral}</Aviso>}

        <Campo
          etiqueta="Tu nombre"
          autoComplete="name"
          foco
          valor={formulario.valores.name}
          error={formulario.errores.name}
          alCambiar={(valor) => formulario.cambiar('name', valor)}
          alSalir={() => formulario.alSalirDe('name')}
        />

        <Campo
          etiqueta="Contrasena"
          tipo="password"
          autoComplete="new-password"
          ayuda="Al menos 10 caracteres. Larga es mejor que complicada."
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
          Crear cuenta y entrar
        </Boton>
      </form>
    </PantallaCentrada>
  );
}

/**
 * Camino 2: ese correo ya tiene cuenta.
 *
 * Se inicia sesion y se vincula, sin tocar la contrasena. Es literalmente
 * imposible tocarla desde aqui: `link-invitation` no la acepta en su contrato.
 */
function IniciarSesion({
  token,
  onAviso,
  onFlujo,
}: {
  token: string;
  onAviso: (aviso: string) => void;
  onFlujo: (flujo: Flujo) => void;
}) {
  const { entrar } = useSesion();
  const vincular = useVincular(onFlujo);

  const formulario = useFormulario({
    esquema: loginSchema,
    iniciales: { email: '', password: '' },
    enviar: async (datos) => {
      // Se marca ANTES de entrar, no despues: la sesion aparece en mitad de
      // este recorrido y sin esto la pantalla cambiaria sola bajo los pies.
      onFlujo('entrando');
      try {
        await entrar(datos);
      } catch (error) {
        // Credenciales malas o servidor caido: se vuelve al punto de partida y
        // el formulario pinta el error CON lo que ya estaba escrito, porque no
        // ha llegado a desmontarse.
        onFlujo('ninguno');
        throw error;
      }
      // Si el vinculado falla —por ejemplo, porque la invitacion era para otra
      // direccion— el aviso se guarda arriba y lo pinta la pantalla siguiente,
      // que para entonces ya es la de vincular.
      await vincular(token).catch((error: unknown) => {
        onFlujo('ninguno');
        onAviso(mensajeDeError(error));
      });
    },
  });

  return (
    <PantallaCentrada
      titulo="Ya tienes cuenta"
      entradilla="Ese correo ya esta registrado en GYMLAB. Inicia sesion y anadimos el gimnasio a tu cuenta."
      // A esta pantalla se llega SUSTITUYENDO la anterior tras un envio, asi
      // que el foco tiene que venir aqui: sin esto se queda en un boton que ya
      // no existe y nadie anuncia que la pantalla ha cambiado. Por eso el
      // primer campo tampoco lleva `foco`: robaria el anuncio del titulo.
      enfocarTitulo
    >
      <form className={estilos.formulario} onSubmit={formulario.alEnviar} noValidate>
        {formulario.errorGeneral && <Aviso>{formulario.errorGeneral}</Aviso>}

        <Aviso tono="informacion">Tu contrasena no cambia. Solo se anade el gimnasio nuevo.</Aviso>

        <Campo
          etiqueta="Correo electronico"
          tipo="email"
          autoComplete="username"
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
          Entrar y anadir el gimnasio
        </Boton>
      </form>
    </PantallaCentrada>
  );
}

/** Ya hay sesion: solo queda confirmar. */
function Vincular({
  token,
  yo,
  aviso,
  onAviso,
  onOtraCuenta,
  onFlujo,
}: {
  token: string;
  yo: Me;
  aviso: string | null;
  onAviso: (aviso: string | null) => void;
  onOtraCuenta: () => void;
  onFlujo: (flujo: Flujo) => void;
}) {
  const { salir } = useSesion();
  const vincular = useVincular(onFlujo);
  const [trabajando, setTrabajando] = useState(false);

  const confirmar = () => {
    setTrabajando(true);
    onAviso(null);
    void vincular(token)
      .catch((error: unknown) => onAviso(mensajeDeError(error)))
      .finally(() => setTrabajando(false));
  };

  return (
    <PantallaCentrada
      titulo="Anadir este gimnasio a tu cuenta"
      entradilla="Ya has iniciado sesion, asi que no hace falta crear nada. Tu contrasena no cambia."
    >
      <div className={estilos.acciones}>
        {aviso && <Aviso>{aviso}</Aviso>}

        <p className={estilos.cuenta}>
          Estas dentro como <span className={estilos.correo}>{yo.user.email}</span>
        </p>

        <Boton variante="primario" bloque cargando={trabajando} onClick={confirmar}>
          Anadir el gimnasio
        </Boton>

        {/*
          La invitacion es para una direccion concreta y el servidor lo
          comprueba: con otra cuenta responde 403. Esta salida existe para
          quien abre el enlace desde el navegador de un companero.
        */}
        <Boton
          bloque
          disabled={trabajando}
          onClick={() => {
            onAviso(null);
            onOtraCuenta();
            void salir();
          }}
        >
          Usar otra cuenta
        </Boton>
      </div>
    </PantallaCentrada>
  );
}

/**
 * Vincula y deja a la persona dentro del gimnasio al que la invitaron.
 *
 * `link-invitation` no cambia el gimnasio activo a proposito —quien decide
 * donde opera es la persona— pero aqui acaba de decirlo pulsando el enlace de
 * ese gimnasio. Por eso se cambia, y con el endpoint de siempre.
 */
function useVincular(onFlujo: (flujo: Flujo) => void): (token: string) => Promise<void> {
  const { elegirGimnasio } = useSesion();
  const router = useRouter();

  return async (token: string) => {
    const { gymId } = await api.auth.linkInvitation({ token });

    // La invitacion ya esta consumida: a partir de aqui no hay vuelta atras y
    // no debe quedar nada que pulsar.
    onFlujo('cerrando');

    // La pertenencia ya existe. Si el cambio de gimnasio fallara —un corte de
    // red entre una llamada y la siguiente— no es grave: el panel preguntara a
    // cual entrar. Lo que no puede pasar es quedarse aqui, porque reintentar
    // daria "la invitacion ya se uso" sobre algo que si funciono.
    await elegirGimnasio(gymId).catch(() => undefined);
    router.replace('/socios');
  };
}

function Cargando({ texto }: { texto: string }) {
  return (
    <PantallaCentrada titulo="Invitacion">
      <p className={estilos.esperando} role="status" aria-live="polite">
        {texto}
      </p>
    </PantallaCentrada>
  );
}
