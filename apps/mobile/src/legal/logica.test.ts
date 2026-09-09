import { describe, expect, it } from 'vitest';
import { LEGAL_REQUIRED_FIELDS, PRIVACY_DOCUMENT_STATES } from '@gymlab/contracts';
import type { LegalData } from '@gymlab/contracts';
import {
  CAMPOS,
  NOMBRE_DEL_CAMPO,
  cambiosDe,
  desdeDatos,
  explicarDocumento,
  faltantesLegibles,
  hayCambios,
  type Borrador,
} from './logica';

const DATOS: LegalData = {
  name: 'Gimnasio',
  legalName: 'Gimnasio, S. L.',
  taxId: 'B00000000',
  address: 'Calle 1',
  privacyEmail: 'privacidad@ejemplo.local',
  missing: [],
};

describe('los campos que se editan', () => {
  it('son exactamente los que el contrato declara obligatorios', () => {
    // Si el servidor añadiera uno, el formulario se quedaria corto sin que
    // nada fallara: el dueño veria «incompleta» y no tendria donde escribirlo.
    expect(CAMPOS.map((c) => c.clave).sort()).toEqual([...LEGAL_REQUIRED_FIELDS].sort());
  });

  it('cada campo obligatorio tiene nombre para una persona', () => {
    for (const campo of LEGAL_REQUIRED_FIELDS) {
      expect(NOMBRE_DEL_CAMPO[campo]).toBeTruthy();
    }
  });

  it('faltantesLegibles traduce lo que dice el servidor, no lo recalcula', () => {
    expect(faltantesLegibles(['taxId', 'address'])).toEqual(['Identificador fiscal', 'Domicilio']);
    expect(faltantesLegibles([])).toEqual([]);
  });
});

describe('qué se manda al guardar', () => {
  const original = desdeDatos(DATOS);

  it('los nulos del servidor se leen como campos vacíos', () => {
    expect(desdeDatos({ ...DATOS, taxId: null, address: null })).toEqual({
      legalName: 'Gimnasio, S. L.',
      taxId: '',
      address: '',
      privacyEmail: 'privacidad@ejemplo.local',
    });
  });

  it('sin tocar nada no viaja nada', () => {
    expect(cambiosDe(original, original)).toEqual({});
    expect(hayCambios(original, original)).toBe(false);
  });

  it('solo viaja lo que ha cambiado', () => {
    const tocado: Borrador = { ...original, taxId: 'B11111111' };
    expect(cambiosDe(tocado, original)).toEqual({ taxId: 'B11111111' });
  });

  it('un campo vaciado viaja como null: es «bórralo», no «déjalo igual»', () => {
    const tocado: Borrador = { ...original, address: '   ' };
    expect(cambiosDe(tocado, original)).toEqual({ address: null });
  });

  it('los espacios sobrantes no cuentan como cambio', () => {
    const tocado: Borrador = { ...original, legalName: '  Gimnasio, S. L.  ' };
    expect(cambiosDe(tocado, original)).toEqual({});
  });

  it('lo que se manda va recortado', () => {
    const tocado: Borrador = { ...original, legalName: '  Otra Sociedad  ' };
    expect(cambiosDe(tocado, original)).toEqual({ legalName: 'Otra Sociedad' });
  });
});

describe('el estado del documento de privacidad', () => {
  it('los seis estados del contrato tienen explicación', () => {
    // `Record` no vale aqui: `explicarDocumento` es un `switch`, y un estado
    // nuevo devolveria `undefined` sin que nada avisara.
    for (const estado of PRIVACY_DOCUMENT_STATES) {
      const explicacion = explicarDocumento(estado);
      expect(explicacion.titulo).toBeTruthy();
      expect(explicacion.detalle.length).toBeGreaterThan(30);
    }
  });

  it('distingue lo que arregla el dueño de lo que arregla la plataforma', () => {
    expect(explicarDocumento('falta_configuracion').arreglaOtro).toBe(false);
    expect(explicarDocumento('sin_version').arreglaOtro).toBe(true);
    expect(explicarDocumento('falta_plantilla').arreglaOtro).toBe(true);
    expect(explicarDocumento('plantilla_en_borrador').arreglaOtro).toBe(true);
  });

  it('no promete cumplimiento legal en ninguno de los seis', () => {
    // Que los datos esten completos no es lo mismo que que el texto ampare
    // juridicamente nada, y confundirlos es el error que esto no debe inducir.
    for (const estado of PRIVACY_DOCUMENT_STATES) {
      const texto = `${explicarDocumento(estado).titulo} ${explicarDocumento(estado).detalle}`;
      expect(texto.toLowerCase()).not.toContain('rgpd');
      expect(texto.toLowerCase()).not.toContain('cumple');
      expect(texto.toLowerCase()).not.toContain('legalmente');
    }
  });

  it('publicado y listo son buenas noticias; las de la plataforma, no', () => {
    expect(explicarDocumento('publicado').tono).toBe('exito');
    expect(explicarDocumento('listo').tono).toBe('exito');
    expect(explicarDocumento('falta_plantilla').tono).toBe('error');
  });
});
