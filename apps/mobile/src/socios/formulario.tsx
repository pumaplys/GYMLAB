import { useState } from 'react';
import type { Member } from '@gymlab/contracts';
import { Aviso } from '../componentes/aviso';
import { Boton } from '../componentes/boton';
import { Campo } from '../componentes/campo';
import { type DatosDeSocio, datosDesde, seIntentoBorrarUnCampo } from './gestion';

/**
 * Los datos de un socio: los mismos campos para el alta y para la edicion.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LA VALIDACION ES LA DEL CONTRATO, NO UNA COPIA.                         │
 * │                                                                          │
 * │ `createMemberSchema` ya dice que el nombre es obligatorio, como es un    │
 * │ telefono valido y que una fecha de nacimiento no puede estar en el       │
 * │ futuro. Reescribir esas reglas aqui serian dos que se separan.           │
 * │                                                                          │
 * │ Lo que si es de aqui es COMO se cuenta el fallo, y el aviso de que       │
 * │ vaciar una casilla no la borra.                                          │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export function FormularioDeSocio({
  socio,
  guardando,
  etiqueta,
  error,
  onGuardar,
}: {
  /** El que se edita, o nada si es un alta. */
  socio?: Member;
  guardando: boolean;
  etiqueta: string;
  error: string | null;
  onGuardar: (datos: DatosDeSocio) => void;
}) {
  const [datos, setDatos] = useState<DatosDeSocio>(
    socio
      ? datosDesde(socio)
      : { firstName: '', lastName: '', email: '', phone: '', birthDate: '' },
  );

  const cambiar = (campo: keyof DatosDeSocio) => (valor: string) =>
    setDatos((actuales) => ({ ...actuales, [campo]: valor }));

  const intentaBorrar = socio ? seIntentoBorrarUnCampo(socio, datos) : false;

  return (
    <>
      {error ? <Aviso tono="peligro">{error}</Aviso> : null}

      {/*
        No es un fallo de la app: `updateMemberSchema` no admite `null`, asi que
        no hay forma de pedirle al servidor «quita el telefono». Se dice antes
        de guardar, no despues de que el dato siga ahi sin explicacion.
      */}
      {intentaBorrar ? (
        <Aviso tono="aviso">
          Todavía no se puede dejar en blanco un campo que ya tenía valor. Vuelve a escribirlo o
          déjalo como estaba: al guardar se conservará el anterior.
        </Aviso>
      ) : null}

      <Campo
        etiqueta="Nombre"
        valor={datos.firstName}
        alCambiar={cambiar('firstName')}
        deshabilitado={guardando}
        autoCapitalize="words"
      />
      <Campo
        etiqueta="Apellidos"
        valor={datos.lastName}
        alCambiar={cambiar('lastName')}
        deshabilitado={guardando}
        autoCapitalize="words"
      />
      <Campo
        etiqueta="Correo electrónico"
        valor={datos.email}
        alCambiar={cambiar('email')}
        deshabilitado={guardando}
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
        ayuda="Opcional. Hace falta para poder invitarle a la app."
      />
      <Campo
        etiqueta="Teléfono"
        valor={datos.phone}
        alCambiar={cambiar('phone')}
        deshabilitado={guardando}
        keyboardType="phone-pad"
        ayuda="Opcional."
      />
      <Campo
        etiqueta="Fecha de nacimiento"
        valor={datos.birthDate}
        alCambiar={cambiar('birthDate')}
        deshabilitado={guardando}
        autoCapitalize="none"
        autoCorrect={false}
        ayuda="Opcional. AAAA-MM-DD."
      />

      <Boton
        variante="primario"
        onPress={() => onGuardar(datos)}
        cargando={guardando}
        deshabilitado={guardando}
      >
        {etiqueta}
      </Boton>
    </>
  );
}
