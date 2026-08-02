import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  and,
  auditLog,
  count,
  desc,
  eq,
  ilike,
  isNotNull,
  memberNotes,
  members,
  or,
  sql,
  type Member as MemberRow,
} from '@gymlab/db';
import type {
  CreateMemberInput,
  ListMembersQuery,
  Member,
  MemberList,
  MemberNote,
  UpdateMemberInput,
  UpdateOwnProfileInput,
} from '@gymlab/contracts';
import type { Invitation } from '@gymlab/contracts';
import { requireRequestContext, requireTransaction } from '../common/request-context';
import { InvitationsService } from '../invitations/invitations.service';
import { memberToDto } from './member.mapper';

/**
 * La direccion de dependencia es `members -> invitations` y solo esa: este
 * servicio llama a `InvitationsService` para crear invitaciones, e `invitations`
 * no sabe nada de `members` — reacciona a traves de la interfaz de `common`.
 *
 * El lado contrario —rellenar `members.user_id` al aceptarse— lo implementa
 * `MemberAccountLink`, y esta en otra clase por un motivo que cuesta caro
 * olvidar: ahi explica cual.
 */
@Injectable()
export class MembersService {
  constructor(private readonly invitations: InvitationsService) {}

  /**
   * Da de alta un socio.
   *
   * No exige email ni cuenta: un gimnasio real tiene socios que nunca tendran
   * una. Invitarles a crearla es otra accion, y llegara cuando exista el
   * proveedor de correo.
   */
  async create(gymId: string, input: CreateMemberInput): Promise<Member> {
    const tx = requireTransaction();
    const { userId: actorUserId } = requireRequestContext();

    if (input.email) await this.assertEmailLibre(gymId, input.email);

    const [fila] = await tx
      .insert(members)
      .values({
        gymId,
        memberNumber: await this.siguienteNumero(gymId),
        firstName: input.firstName,
        lastName: input.lastName,
        email: input.email ?? null,
        phone: input.phone ?? null,
        birthDate: input.birthDate ?? null,
      })
      .returning();

    await tx.insert(auditLog).values({
      gymId,
      actorUserId,
      action: 'member.created',
      entityType: 'member',
      entityId: fila!.id,
      metadata: { memberNumber: fila!.memberNumber },
    });

    return memberToDto(fila!);
  }

  async list(gymId: string, query: ListMembersQuery): Promise<MemberList> {
    const tx = requireTransaction();

    const condiciones = [eq(members.gymId, gymId)];
    if (query.status) condiciones.push(eq(members.status, query.status));
    if (query.q) {
      const patron = `%${query.q}%`;
      const numero = Number.parseInt(query.q, 10);
      const porTexto = [
        ilike(members.firstName, patron),
        ilike(members.lastName, patron),
        ilike(members.email, patron),
      ];
      // Buscar "42" debe encontrar al socio numero 42, no solo textos con "42".
      if (Number.isInteger(numero)) porTexto.push(eq(members.memberNumber, numero));
      condiciones.push(or(...porTexto)!);
    }

    const where = and(...condiciones);

    const [filas, [total]] = await Promise.all([
      tx
        .select()
        .from(members)
        .where(where)
        .orderBy(members.lastName, members.firstName)
        .limit(query.pageSize)
        .offset((query.page - 1) * query.pageSize),
      tx.select({ n: count() }).from(members).where(where),
    ]);

    return {
      items: filas.map((f) => memberToDto(f)),
      total: Number(total?.n ?? 0),
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  async getById(gymId: string, id: string): Promise<Member> {
    return memberToDto(await this.buscar(gymId, id));
  }

  async update(gymId: string, id: string, input: UpdateMemberInput): Promise<Member> {
    const tx = requireTransaction();
    const { userId: actorUserId } = requireRequestContext();
    const actual = await this.buscar(gymId, id);

    if (input.email && input.email !== actual.email) {
      await this.assertEmailLibre(gymId, input.email, id);
    }

    const [fila] = await tx
      .update(members)
      .set({ ...input, updatedAt: new Date() })
      .where(and(eq(members.gymId, gymId), eq(members.id, id)))
      .returning();

    await tx.insert(auditLog).values({
      gymId,
      actorUserId,
      action: 'member.updated',
      entityType: 'member',
      entityId: id,
      // Solo qué campos cambiaron, no sus valores: el registro de auditoría no
      // debe convertirse en una segunda copia de los datos personales.
      metadata: { campos: Object.keys(input) },
    });

    return memberToDto(fila!);
  }

  /**
   * Da de baja a un socio.
   *
   * NO borra nada. El gimnasio necesita el historial para contabilidad y para
   * cuando esa persona vuelva. El borrado del art. 17 es `erase()`.
   */
  async deactivate(gymId: string, id: string): Promise<Member> {
    const tx = requireTransaction();
    const { userId: actorUserId } = requireRequestContext();
    const actual = await this.buscar(gymId, id);

    if (actual.status === 'inactive') {
      throw new BadRequestException('Ese socio ya esta de baja.');
    }

    const [fila] = await tx
      .update(members)
      .set({ status: 'inactive', leftAt: new Date(), updatedAt: new Date() })
      .where(and(eq(members.gymId, gymId), eq(members.id, id)))
      .returning();

    await tx.insert(auditLog).values({
      gymId,
      actorUserId,
      action: 'member.deactivated',
      entityType: 'member',
      entityId: id,
    });

    return memberToDto(fila!);
  }

  async reactivate(gymId: string, id: string): Promise<Member> {
    const tx = requireTransaction();
    const { userId: actorUserId } = requireRequestContext();
    const actual = await this.buscar(gymId, id);

    if (actual.status === 'active') {
      throw new BadRequestException('Ese socio ya esta activo.');
    }
    // El indice unico de email es parcial (solo activos): al reactivar hay que
    // comprobar que nadie ha ocupado ese email mientras estaba de baja.
    if (actual.email) await this.assertEmailLibre(gymId, actual.email, id);

    const [fila] = await tx
      .update(members)
      .set({ status: 'active', leftAt: null, updatedAt: new Date() })
      .where(and(eq(members.gymId, gymId), eq(members.id, id)))
      .returning();

    await tx.insert(auditLog).values({
      gymId,
      actorUserId,
      action: 'member.reactivated',
      entityType: 'member',
      entityId: id,
    });

    return memberToDto(fila!);
  }

  // --- El socio y sus propios datos --------------------------------------

  async getOwnProfile(gymId: string, userId: string): Promise<Member> {
    const tx = requireTransaction();
    const [fila] = await tx
      .select()
      .from(members)
      .where(and(eq(members.gymId, gymId), eq(members.userId, userId)))
      .limit(1);

    if (!fila) throw new NotFoundException('No tienes ficha de socio en este gimnasio.');
    return memberToDto(fila);
  }

  async updateOwnProfile(
    gymId: string,
    userId: string,
    input: UpdateOwnProfileInput,
  ): Promise<Member> {
    const tx = requireTransaction();
    const actual = await this.getOwnProfile(gymId, userId);

    const [fila] = await tx
      .update(members)
      .set({ ...input, updatedAt: new Date() })
      .where(and(eq(members.gymId, gymId), eq(members.id, actual.id)))
      .returning();

    return memberToDto(fila!);
  }

  // --- Notas internas ----------------------------------------------------

  async addNote(gymId: string, memberId: string, body: string): Promise<MemberNote> {
    const tx = requireTransaction();
    const { userId: actorUserId } = requireRequestContext();
    await this.buscar(gymId, memberId);

    const [fila] = await tx
      .insert(memberNotes)
      .values({ gymId, memberId, authorUserId: actorUserId, body })
      .returning();

    return {
      id: fila!.id,
      body: fila!.body,
      authorUserId: fila!.authorUserId,
      createdAt: fila!.createdAt.toISOString(),
    };
  }

  async listNotes(gymId: string, memberId: string): Promise<MemberNote[]> {
    const tx = requireTransaction();
    await this.buscar(gymId, memberId);

    const filas = await tx
      .select()
      .from(memberNotes)
      .where(and(eq(memberNotes.gymId, gymId), eq(memberNotes.memberId, memberId)))
      .orderBy(desc(memberNotes.createdAt));

    return filas.map((f) => ({
      id: f.id,
      body: f.body,
      authorUserId: f.authorUserId,
      createdAt: f.createdAt.toISOString(),
    }));
  }

  // --- RGPD --------------------------------------------------------------

  /**
   * Exporta todo lo que este modulo guarda de una persona (art. 15 y 20).
   *
   * ┌──────────────────────────────────────────────────────────────────────┐
   * │ INCLUYE LAS NOTAS INTERNAS, y conviene entender por que.             │
   * │                                                                      │
   * │ En el producto el socio no las ve, y eso es una decision de producto. │
   * │ Pero ante una solicitud formal de acceso son **datos personales que   │
   * │ le conciernen**, asi que forman parte de lo que hay que entregar.     │
   * │                                                                      │
   * │ Consecuencia practica para el gimnasio: una nota interna no es        │
   * │ secreta. Hay que escribirlas sabiendo que esa persona puede pedirlas. │
   * └──────────────────────────────────────────────────────────────────────┘
   */
  async exportData(gymId: string, id: string) {
    return {
      exportadoEl: new Date().toISOString(),
      ficha: memberToDto(await this.buscar(gymId, id)),
      notasInternas: await this.listNotes(gymId, id),
    };
  }

  /**
   * Borrado por derecho al olvido (art. 17), la parte de ESTE modulo.
   *
   * Elimina la ficha y, en cascada, sus notas. No toca la cuenta de usuario ni
   * la pertenencia al gimnasio: son del modulo `identity`, y la arquitectura
   * establecio que cada modulo expone su borrado e `identity` los orquesta
   * (ADR-0006). Llamar aqui a tablas ajenas romperia esa frontera.
   *
   * El registro de auditoria se escribe ANTES, y a proposito no guarda ningun
   * dato personal: solo que hubo un borrado y quien lo pidio. Un registro que
   * conservara el nombre convertiria la auditoria en una copia de lo borrado.
   */
  async erase(gymId: string, id: string): Promise<{ ok: true }> {
    const tx = requireTransaction();
    const { userId: actorUserId } = requireRequestContext();
    const socio = await this.buscar(gymId, id);

    await tx.insert(auditLog).values({
      gymId,
      actorUserId,
      action: 'member.erased',
      entityType: 'member',
      entityId: id,
      metadata: { memberNumber: socio.memberNumber },
    });

    await tx.delete(members).where(and(eq(members.gymId, gymId), eq(members.id, id)));

    return { ok: true };
  }

  // --- Invitacion a crear cuenta -----------------------------------------

  /**
   * Invita a un socio a crear su cuenta.
   *
   * Dar de alta e invitar son dos acciones distintas: un gimnasio real tiene
   * socios que nunca tendran cuenta, y por eso la ficha existe sin `user_id`.
   *
   * Dos validaciones, y ninguna es de tramite:
   *
   * 1. Sin email no se puede invitar. `members.email` es nullable a proposito,
   *    asi que este caso es normal, no un error raro: merece un mensaje claro y
   *    no un fallo de Better Auth tres capas mas abajo.
   *
   * 2. Con cuenta ya vinculada, la invitacion no tiene sentido: crearia una
   *    segunda cuenta con otro email para la misma persona.
   */
  async invite(gymId: string, memberId: string): Promise<Invitation> {
    const { userId: actorUserId, role: actorRole } = requireRequestContext();
    const socio = await this.buscar(gymId, memberId);

    if (!socio.email) {
      throw new BadRequestException(
        'Ese socio no tiene email. Anadelo a su ficha antes de invitarle.',
      );
    }
    if (socio.userId) {
      throw new BadRequestException('Ese socio ya tiene una cuenta vinculada.');
    }
    if (socio.status !== 'active') {
      throw new BadRequestException('No se puede invitar a un socio dado de baja.');
    }

    // Se delega en `invitations`, que es el dueno de ese ciclo de vida: token
    // hasheado, caducidad, un solo uso y el correo. `members` no lo replica.
    return this.invitations.create(
      gymId,
      actorUserId,
      actorRole!,
      socio.email,
      'member',
      socio.id,
    );
  }

  // --- Interno -----------------------------------------------------------

  /**
   * Reserva el siguiente numero de socio del gimnasio.
   *
   * UNA SOLA SENTENCIA, y es lo que evita el fallo. Lo natural seria
   * `SELECT max(member_number) + 1`, exactamente la trampa que ya nos mordio con
   * el limite de intentos de login: dos personas dando de alta a la vez en el
   * mostrador leerian el mismo maximo y generarian el mismo numero.
   *
   * El `ON CONFLICT DO UPDATE` bloquea la fila del contador, asi que dos altas
   * simultaneas se serializan. `next_number - 1` devuelve el valor asignado
   * tanto si la fila se acaba de crear como si ya existia.
   */
  private async siguienteNumero(gymId: string): Promise<number> {
    const tx = requireTransaction();
    const resultado = await tx.execute<{ assigned: number }>(sql`
      INSERT INTO member_counters (gym_id, next_number)
      VALUES (${gymId}, 2)
      ON CONFLICT (gym_id) DO UPDATE SET next_number = member_counters.next_number + 1
      RETURNING next_number - 1 AS assigned
    `);

    const numero = resultado.rows[0]?.assigned;
    if (!numero) throw new Error('[members] No se pudo reservar el numero de socio.');
    return Number(numero);
  }

  /** El indice unico solo cubre socios activos; el mensaje de error lo damos aqui. */
  private async assertEmailLibre(gymId: string, email: string, excluir?: string): Promise<void> {
    const tx = requireTransaction();
    const filas = await tx
      .select({ id: members.id })
      .from(members)
      .where(
        and(
          eq(members.gymId, gymId),
          eq(members.status, 'active'),
          isNotNull(members.email),
          sql`lower(${members.email}) = lower(${email})`,
        ),
      );

    if (filas.some((f) => f.id !== excluir)) {
      throw new BadRequestException('Ya hay un socio activo con ese email en este gimnasio.');
    }
  }

  private async buscar(gymId: string, id: string): Promise<MemberRow> {
    const tx = requireTransaction();
    const [fila] = await tx
      .select()
      .from(members)
      .where(and(eq(members.gymId, gymId), eq(members.id, id)))
      .limit(1);

    // RLS ya impide ver socios de otro gimnasio: aqui llegaria como 404, que es
    // lo correcto — no confirmamos la existencia de fichas ajenas.
    if (!fila) throw new NotFoundException('Socio no encontrado.');
    return fila;
  }

}
