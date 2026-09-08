import { useState } from 'react';
import { router } from 'expo-router';
import { createMemberSchema } from '@gymlab/contracts';
import { CabeceraDeVuelta } from '../../src/componentes/cabecera-de-vuelta';
import { Pantalla } from '../../src/componentes/pantalla';
import { laSesionYaNoVale } from '../../src/auth/politica';
import { useSesion } from '../../src/auth/sesion';
import { FormularioDeSocio } from '../../src/socios/formulario';
import { altaAEnvio, type DatosDeSocio } from '../../src/socios/gestion';
import { crearSocio } from '../../src/socios/fuente';
import { RUTAS_INTERNAS } from '../../src/navegacion/destinos';

/**
 * Dar de alta a un socio.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ EL NUMERO DE SOCIO NO SE PIDE: LO PONE EL SERVIDOR.                      │
 * │                                                                          │
 * │ Es correlativo por gimnasio y se asigna al crear. Pedirlo aqui abriria   │
 * │ la puerta a duplicados y a huecos, y no hay ningun caso en el que quien  │
 * │ atiende sepa cual toca mejor que la base de datos.                       │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Al terminar se va a SU FICHA, no de vuelta a la lista: lo siguiente que se
 * hace con un socio recien dado de alta es ponerle la cuota.
 */
export default function Alta() {
  const { estado: sesion, revisar } = useSesion();
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const gymId = sesion.tipo === 'autenticado' ? sesion.gymId : null;

  async function crear(datos: DatosDeSocio) {
    if (!gymId || guardando) return;
    const envio = altaAEnvio(datos);
    const revisado = createMemberSchema.safeParse(envio);
    if (!revisado.success) {
      const cual = revisado.error.issues[0]?.path[0];
      setError(
        cual === 'firstName' || cual === 'lastName'
          ? 'El nombre y los apellidos son obligatorios.'
          : cual === 'email'
            ? 'Ese correo no tiene un formato válido.'
            : cual === 'phone'
              ? 'Ese teléfono no tiene un formato válido.'
              : cual === 'birthDate'
                ? 'La fecha de nacimiento tiene que ser AAAA-MM-DD y no puede estar en el futuro.'
                : 'Revisa los datos: algo no tiene el formato correcto.',
      );
      return;
    }

    setGuardando(true);
    setError(null);
    try {
      const creado = await crearSocio(gymId, revisado.data);
      router.replace(RUTAS_INTERNAS.socioDelPanel(creado.id));
    } catch (problema) {
      if (laSesionYaNoVale([problema])) {
        void revisar();
        return;
      }
      // El servidor explica los duplicados mejor que un mensaje generico.
      setError(
        problema instanceof Error && problema.message
          ? problema.message
          : 'No pudimos dar de alta al socio. Inténtalo de nuevo.',
      );
      setGuardando(false);
    }
  }

  return (
    <Pantalla>
      <CabeceraDeVuelta titulo="Nuevo socio" volverA="/panel" etiquetaDeVuelta="Panel" />
      <FormularioDeSocio
        guardando={guardando}
        etiqueta="Dar de alta"
        error={error}
        onGuardar={(datos) => void crear(datos)}
      />
    </Pantalla>
  );
}
