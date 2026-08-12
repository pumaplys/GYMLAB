'use client';

import { useState } from 'react';
import { createMemberSchema, type Member } from '@gymlab/contracts';
import { Aviso } from '@/componentes/aviso';
import { Boton, BotonEnlace } from '@/componentes/boton';
import { Campo } from '@/componentes/campo';
import { EncabezadoDePagina } from '@/componentes/encabezado-de-pagina';
import { Marco } from '@/componentes/marco';
import { RutaPrivada } from '@/componentes/ruta-privada';
import { Tarjeta } from '@/componentes/tarjeta';
import { api } from '@/lib/api';
import { useFormulario } from '@/lib/formulario';
import { ROLES_DEL_PANEL } from '@/lib/roles';
import { useSesion } from '@/lib/sesion';
import estilos from './nuevo.module.css';

export default function NuevoSocioPage() {
  return (
    <RutaPrivada roles={ROLES_DEL_PANEL}>
      <Marco>
        <NuevoSocio />
      </Marco>
    </RutaPrivada>
  );
}

function NuevoSocio() {
  const [ultimo, setUltimo] = useState<Member | null>(null);
  // Cambia con cada alta para remontar el formulario: se vacia solo y el foco
  // vuelve al primer campo. Recepcion casi nunca da de alta a una sola persona.
  const [ronda, setRonda] = useState(0);

  return (
    <>
      <EncabezadoDePagina
        titulo="Nuevo socio"
        acciones={<BotonEnlace href="/socios">Volver al listado</BotonEnlace>}
      />

      {ultimo && (
        <div className={estilos.aviso}>
          <Aviso tono="exito">
            Alta hecha: {ultimo.firstName} {ultimo.lastName}, con el numero de socio{' '}
            {ultimo.memberNumber}.
          </Aviso>
        </div>
      )}

      <Tarjeta className={estilos.tarjeta}>
        <Formulario
          key={ronda}
          alCrear={(socio) => {
            setUltimo(socio);
            setRonda((anterior) => anterior + 1);
          }}
        />
      </Tarjeta>
    </>
  );
}

function Formulario({ alCrear }: { alCrear: (socio: Member) => void }) {
  const { gymId } = useSesion();

  const formulario = useFormulario({
    esquema: createMemberSchema,
    iniciales: { firstName: '', lastName: '', email: '', phone: '', birthDate: '' },
    enviar: async (datos) => {
      // `RutaPrivada` garantiza que aqui hay gimnasio activo; esto es para el
      // compilador, no una posibilidad real.
      if (!gymId) throw new Error('No hay gimnasio activo.');
      alCrear(await api.members.create(gymId, datos));
    },
  });

  return (
    <form className={estilos.formulario} onSubmit={formulario.alEnviar} noValidate>
      {formulario.errorGeneral && <Aviso>{formulario.errorGeneral}</Aviso>}

      <fieldset className={estilos.grupo}>
        <legend className={estilos.leyenda}>Quien es</legend>
        <div className={estilos.pareja}>
          <Campo
            etiqueta="Nombre"
            autoComplete="given-name"
            foco
            valor={formulario.valores.firstName}
            error={formulario.errores.firstName}
            alCambiar={(valor) => formulario.cambiar('firstName', valor)}
            alSalir={() => formulario.alSalirDe('firstName')}
          />
          <Campo
            etiqueta="Apellidos"
            autoComplete="family-name"
            valor={formulario.valores.lastName}
            error={formulario.errores.lastName}
            alCambiar={(valor) => formulario.cambiar('lastName', valor)}
            alSalir={() => formulario.alSalirDe('lastName')}
          />
        </div>
        <Campo
          etiqueta="Fecha de nacimiento"
          tipo="date"
          opcional
          valor={formulario.valores.birthDate}
          error={formulario.errores.birthDate}
          alCambiar={(valor) => formulario.cambiar('birthDate', valor)}
          alSalir={() => formulario.alSalirDe('birthDate')}
        />
      </fieldset>

      <fieldset className={estilos.grupo}>
        <legend className={estilos.leyenda}>Como se le localiza</legend>
        <Campo
          etiqueta="Correo electronico"
          tipo="email"
          opcional
          // Dar de alta e invitar son dos acciones distintas, y conviene que se
          // note: un gimnasio tiene socios que nunca tendran cuenta.
          ayuda="Solo hace falta si mas adelante quieres invitarle a crear su cuenta."
          valor={formulario.valores.email}
          error={formulario.errores.email}
          alCambiar={(valor) => formulario.cambiar('email', valor)}
          alSalir={() => formulario.alSalirDe('email')}
        />
        <Campo
          etiqueta="Telefono"
          tipo="tel"
          opcional
          valor={formulario.valores.phone}
          error={formulario.errores.phone}
          alCambiar={(valor) => formulario.cambiar('phone', valor)}
          alSalir={() => formulario.alSalirDe('phone')}
        />
      </fieldset>

      <div className={estilos.acciones}>
        <Boton type="submit" variante="primario" cargando={formulario.enviando}>
          Dar de alta
        </Boton>
      </div>
    </form>
  );
}
