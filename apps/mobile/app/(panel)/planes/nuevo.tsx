import { useState } from 'react';
import { Redirect, router } from 'expo-router';
import { createPlanSchema } from '@gymlab/contracts';
import { CabeceraDeVuelta } from '../../../src/componentes/cabecera-de-vuelta';
import { Pantalla } from '../../../src/componentes/pantalla';
import { laSesionYaNoVale } from '../../../src/auth/politica';
import { useSesion } from '../../../src/auth/sesion';
import { FormularioDePlan } from '../../../src/cobros/formulario-de-plan';
import { puedeEditarPlanes } from '../../../src/socios/permisos';
import { crearPlan } from '../../../src/socios/fuente';
import { RUTAS_INTERNAS } from '../../../src/navegacion/destinos';

/**
 * Crear un plan. SOLO EL DUEÑO.
 *
 * El gate del grupo `(panel)` deja entrar tambien a recepcion —comparten
 * area—, asi que esta pantalla comprueba el rol por su cuenta. No es una
 * politica duplicada: es que el area y el permiso no coinciden aqui, igual que
 * pasa con entrenamiento.
 */
export default function NuevoPlan() {
  const { estado: sesion, revisar } = useSesion();
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const gymId = sesion.tipo === 'autenticado' ? sesion.gymId : null;
  if (sesion.tipo === 'autenticado' && !puedeEditarPlanes(sesion.rol)) {
    return <Redirect href={RUTAS_INTERNAS.planes} />;
  }

  async function crear(datos: {
    nombre: string;
    descripcion: string;
    centimos: number;
    periodo: 'monthly' | 'quarterly' | 'yearly';
  }) {
    if (!gymId || guardando) return;
    const revisado = createPlanSchema.safeParse({
      name: datos.nombre.trim(),
      priceCents: datos.centimos,
      period: datos.periodo,
      ...(datos.descripcion.trim() ? { description: datos.descripcion.trim() } : {}),
    });
    if (!revisado.success) {
      setError('Revisa los datos: algo no tiene el formato correcto.');
      return;
    }
    setGuardando(true);
    setError(null);
    try {
      await crearPlan(gymId, revisado.data);
      router.replace(RUTAS_INTERNAS.planes);
    } catch (problema) {
      if (laSesionYaNoVale([problema])) {
        void revisar();
        return;
      }
      setError(
        problema instanceof Error && problema.message
          ? problema.message
          : 'No pudimos crear el plan. Inténtalo de nuevo.',
      );
      setGuardando(false);
    }
  }

  return (
    <Pantalla>
      <CabeceraDeVuelta
        titulo="Nuevo plan"
        volverA={RUTAS_INTERNAS.planes}
        etiquetaDeVuelta="Planes"
      />
      <FormularioDePlan
        guardando={guardando}
        etiqueta="Crear plan"
        error={error}
        onGuardar={(datos) => void crear(datos)}
      />
    </Pantalla>
  );
}
