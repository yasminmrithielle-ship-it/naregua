import express from "express";
import { z } from "zod";
import { pool, query } from "../db.js";
import {
  attachAuth,
  requireAdmin,
  requireOperationalUser
} from "../middleware/auth.js";
import {
  sendChatbotCompletionThanks,
  sendChatbotConfirmation
} from "../integrations/chatbotAdapter.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ensureDefaultServices } from "../services/serviceCatalog.js";
import {
  cancelAppointmentReminders,
  scheduleAppointmentReminders
} from "../services/reminderScheduler.js";
import {
  deactivateExpiredOpenSlots,
  getCurrentSlotReference
} from "../services/slotExpiry.js";
import { assertFeatureAccess } from "../services/saasService.js";

const router = express.Router();

const appointmentSchema = z.object({
  barbeariaId: z.string().optional(),
  nome: z.string().trim().min(2, "Nome obrigatorio"),
  telefone: z.string().trim().min(8, "Telefone obrigatorio"),
  data: z.string().trim().min(10, "Data obrigatoria"),
  hora: z.string().trim().min(4, "Hora obrigatoria"),
  servico: z.string().trim().min(2, "Servico obrigatorio"),
  barbeiroId: z.string().trim().optional()
});

function asExecutor(client) {
  return {
    query: (text, params) => client.query(text, params)
  };
}

function resolveBarbershopId(req, explicitBarbershopId) {
  if (req.auth?.membership?.barbershopId) {
    if (
      explicitBarbershopId &&
      explicitBarbershopId !== req.auth.membership.barbershopId
    ) {
      throw new Error("Tenant informado nao corresponde a barbearia autenticada.");
    }

    return req.auth.membership.barbershopId;
  }

  if (!explicitBarbershopId) {
    throw new Error("barbeariaId e obrigatorio para operacoes publicas.");
  }

  return explicitBarbershopId;
}

async function ensureServiceExists(client, servico, barbeariaId) {
  const serviceResult = await client.query(
    `
      SELECT id, nome
      FROM servicos
      WHERE barbearia_id = $1
        AND nome = $2
        AND ativo = true
      LIMIT 1
    `,
    [barbeariaId, servico]
  );

  return serviceResult.rows[0] || null;
}

async function upsertCustomer(client, { barbeariaId, nome, telefone }) {
  const result = await client.query(
    `
      INSERT INTO clientes (
        barbearia_id,
        nome,
        telefone
      )
      VALUES ($1, $2, $3)
      ON CONFLICT (barbearia_id, telefone) DO UPDATE
      SET
        nome = EXCLUDED.nome,
        updated_at = NOW()
      RETURNING id
    `,
    [barbeariaId, nome, telefone]
  );

  return result.rows[0];
}

async function createAppointmentRecord(client, payload) {
  const inserted = await client.query(
    `
      INSERT INTO agendamentos (
        barbearia_id,
        cliente_id,
        barbeiro_id,
        cliente_nome,
        cliente_telefone,
        nome,
        telefone,
        data,
        hora,
        servico_id,
        servico_nome,
        servico,
        status,
        origem
      )
      VALUES (
        $1,
        $2,
        $3,
        $4,
        $5,
        $4,
        $5,
        $6::date,
        $7,
        $8,
        $9,
        $9,
        'confirmado',
        $10
      )
      RETURNING *
    `,
    [
      payload.barbeariaId,
      payload.clienteId,
      payload.barbeiroId || null,
      payload.nome,
      payload.telefone,
      payload.data,
      payload.hora,
      payload.servicoId,
      payload.servicoNome,
      payload.origem
    ]
  );

  return inserted.rows[0];
}

async function reserveSlot(client, barbeariaId, data, hora) {
  await client.query(
    `
      UPDATE horarios
      SET disponivel = false
      WHERE data = $1
        AND hora = $2
        AND barbearia_id = $3
    `,
    [data, hora, barbeariaId]
  );
}

async function releaseSlot(client, barbeariaId, data, hora) {
  await client.query(
    `
      UPDATE horarios
      SET disponivel = true
      WHERE data = $1
        AND hora = $2
        AND barbearia_id = $3
    `,
    [data, hora, barbeariaId]
  );
}

async function ensureSlotAvailable(client, { barbeariaId, data, hora, appointmentId = null }) {
  const disponibilidade = await client.query(
    `
      SELECT h.id
      FROM horarios h
      LEFT JOIN agendamentos a
        ON a.data = h.data
       AND a.hora = h.hora
       AND a.status != 'cancelado'
       AND a.barbearia_id = h.barbearia_id
       AND ($4::int IS NULL OR a.id != $4)
      WHERE h.data = $1
        AND h.hora = $2
        AND h.disponivel = true
        AND h.barbearia_id = $3
        AND a.id IS NULL
      LIMIT 1
    `,
    [data, hora, barbeariaId, appointmentId]
  );

  return disponibilidade.rows.length > 0;
}

async function createAppointmentHandler(req, res) {
  const parsed = appointmentSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Dados invalidos", details: parsed.error.flatten() });
  }

  const { barbeariaId, nome, telefone, data, hora, servico, barbeiroId } = parsed.data;
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    const currentBarbershop = resolveBarbershopId(req, barbeariaId);
    await assertFeatureAccess(currentBarbershop, "appointments");
    await deactivateExpiredOpenSlots(
      currentBarbershop,
      req.auth?.barbershop?.timezone
    );
    const { date: currentDate, time: currentTime } = getCurrentSlotReference(
      req.auth?.barbershop?.timezone
    );

    if (data < currentDate || (data === currentDate && hora < currentTime)) {
      await client.query("ROLLBACK");
      return res.status(409).json({ error: "Nao e possivel agendar um horario que ja passou" });
    }

    await ensureDefaultServices(currentBarbershop, client);
    const service = await ensureServiceExists(client, servico, currentBarbershop);

    if (!service) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "Servico nao cadastrado no catalogo" });
    }

    const isSlotAvailable = await ensureSlotAvailable(client, {
      barbeariaId: currentBarbershop,
      data,
      hora
    });

    if (!isSlotAvailable) {
      await client.query("ROLLBACK");
      return res.status(409).json({ error: "Horario indisponivel" });
    }

    const customer = await upsertCustomer(client, {
      barbeariaId: currentBarbershop,
      nome,
      telefone
    });

    const agendamento = await createAppointmentRecord(client, {
      barbeariaId: currentBarbershop,
      clienteId: customer.id,
      barbeiroId,
      nome,
      telefone,
      data,
      hora,
      servicoId: service.id,
      servicoNome: service.nome,
      origem: req.auth ? "painel" : "app"
    });

    await reserveSlot(client, currentBarbershop, data, hora);
    await scheduleAppointmentReminders(asExecutor(client), agendamento);
    await client.query("COMMIT");

    try {
      await sendChatbotConfirmation(agendamento);
    } catch (error) {
      // Falha de webhook nao deve quebrar o agendamento.
    }

    return res.status(201).json(agendamento);
  } catch (error) {
    await client.query("ROLLBACK");
    if (error.message?.includes("Tenant informado")) {
      return res.status(403).json({ error: error.message });
    }
    if (error.message?.includes("barbeariaId")) {
      return res.status(400).json({ error: error.message });
    }
    if (error.message?.includes("assinatura")) {
      return res.status(403).json({ error: error.message });
    }
    return res.status(500).json({ error: "Falha ao agendar" });
  } finally {
    client.release();
  }
}

router.post("/agendar", attachAuth, asyncHandler(createAppointmentHandler));
router.post("/agendamentos", attachAuth, asyncHandler(createAppointmentHandler));

router.get("/agendamentos", requireOperationalUser, asyncHandler(async (req, res) => {
  const { data } = req.query;
  const currentBarbershop = req.auth.membership.barbershopId;
  const result = await query(
    `
      SELECT *
      FROM agendamentos
      WHERE ($1::date IS NULL OR data = $1::date)
        AND barbearia_id = $2
      ORDER BY data ASC, hora ASC
    `,
    [data || null, currentBarbershop]
  );

  return res.json(result.rows);
}));

router.put("/agendamento/:id", requireAdmin, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { status, servico, data, hora, nome, telefone, barbeiroId } = req.body || {};
  const currentBarbershop = req.auth.membership.barbershopId;
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const atual = await client.query(
      `
        SELECT *
        FROM agendamentos
        WHERE id = $1
          AND barbearia_id = $2
        LIMIT 1
      `,
      [id, currentBarbershop]
    );

    if (!atual.rows.length) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Agendamento nao encontrado" });
    }

    const agendamentoAtual = atual.rows[0];
    await ensureDefaultServices(agendamentoAtual.barbearia_id, client);
    const novoServico = servico || agendamentoAtual.servico_nome || agendamentoAtual.servico;
    const service = await ensureServiceExists(
      client,
      novoServico,
      agendamentoAtual.barbearia_id
    );

    if (!service) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "Servico nao cadastrado no catalogo" });
    }

    const novaData = data || String(agendamentoAtual.data).slice(0, 10);
    const novaHora = hora || agendamentoAtual.hora;
    const mudouSlot =
      String(novaData) !== String(agendamentoAtual.data).slice(0, 10) ||
      String(novaHora) !== String(agendamentoAtual.hora);

    if (mudouSlot) {
      const available = await ensureSlotAvailable(client, {
        barbeariaId: agendamentoAtual.barbearia_id,
        data: novaData,
        hora: novaHora,
        appointmentId: Number(id)
      });

      if (!available) {
        await client.query("ROLLBACK");
        return res.status(409).json({ error: "Novo horario indisponivel" });
      }

      await releaseSlot(
        client,
        agendamentoAtual.barbearia_id,
        String(agendamentoAtual.data).slice(0, 10),
        agendamentoAtual.hora
      );
      await reserveSlot(client, agendamentoAtual.barbearia_id, novaData, novaHora);
    }

    const nextName = nome || agendamentoAtual.cliente_nome || agendamentoAtual.nome;
    const nextPhone = telefone || agendamentoAtual.cliente_telefone || agendamentoAtual.telefone;
    const customer = await upsertCustomer(client, {
      barbeariaId: currentBarbershop,
      nome: nextName,
      telefone: nextPhone
    });

    const result = await client.query(
      `
        UPDATE agendamentos
        SET
          status = COALESCE($1, status),
          servico_id = COALESCE($2, servico_id),
          servico_nome = COALESCE($3, servico_nome),
          servico = COALESCE($3, servico),
          data = COALESCE($4::date, data),
          hora = COALESCE($5, hora),
          cliente_nome = COALESCE($6, cliente_nome, nome),
          nome = COALESCE($6, nome),
          cliente_telefone = COALESCE($7, cliente_telefone, telefone),
          telefone = COALESCE($7, telefone),
          cliente_id = COALESCE($8, cliente_id),
          barbeiro_id = COALESCE($9, barbeiro_id),
          updated_at = NOW()
        WHERE id = $10
          AND barbearia_id = $11
        RETURNING *
      `,
      [
        status || null,
        service.id,
        service.nome,
        data || null,
        hora || null,
        nome || null,
        telefone || null,
        customer.id,
        barbeiroId || null,
        id,
        currentBarbershop
      ]
    );

    const updatedAppointment = result.rows[0];

    if (updatedAppointment.status === "cancelado") {
      await cancelAppointmentReminders(asExecutor(client), id);
    } else {
      await scheduleAppointmentReminders(asExecutor(client), updatedAppointment);
    }

    await client.query("COMMIT");
    return res.json(updatedAppointment);
  } catch (error) {
    await client.query("ROLLBACK");
    return res.status(500).json({ error: "Falha ao atualizar agendamento" });
  } finally {
    client.release();
  }
}));

router.delete("/agendamento/:id", requireAdmin, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const currentBarbershop = req.auth.membership.barbershopId;
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const result = await client.query(
      `
        UPDATE agendamentos
        SET
          status = 'cancelado',
          updated_at = NOW()
        WHERE id = $1
          AND barbearia_id = $2
        RETURNING *
      `,
      [id, currentBarbershop]
    );

    if (result.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Agendamento nao encontrado" });
    }

    const agendamento = result.rows[0];

    await releaseSlot(
      client,
      agendamento.barbearia_id,
      String(agendamento.data).slice(0, 10),
      agendamento.hora
    );

    await cancelAppointmentReminders(asExecutor(client), id);
    await client.query("COMMIT");
    return res.json(agendamento);
  } catch (error) {
    await client.query("ROLLBACK");
    return res.status(500).json({ error: "Falha ao cancelar agendamento" });
  } finally {
    client.release();
  }
}));

router.post("/agendamento/:id/concluir", requireOperationalUser, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const currentBarbershop = req.auth.membership.barbershopId;
  const client = await pool.connect();

  let agendamento;

  try {
    await client.query("BEGIN");

    const currentResult = await client.query(
      `
        SELECT *
        FROM agendamentos
        WHERE id = $1
          AND barbearia_id = $2
        LIMIT 1
      `,
      [id, currentBarbershop]
    );

    if (!currentResult.rows.length) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Agendamento nao encontrado" });
    }

    const currentAppointment = currentResult.rows[0];

    if (currentAppointment.status === "cancelado") {
      await client.query("ROLLBACK");
      return res.status(409).json({ error: "Nao e possivel concluir um agendamento cancelado" });
    }

    const result = await client.query(
      `
        UPDATE agendamentos
        SET
          status = 'concluido',
          updated_at = NOW()
        WHERE id = $1
          AND barbearia_id = $2
        RETURNING *
      `,
      [id, currentBarbershop]
    );

    agendamento = result.rows[0];

    const paymentExists = await client.query(
      `
        SELECT id
        FROM pagamentos_atendimento
        WHERE agendamento_id = $1
        LIMIT 1
      `,
      [id]
    );

    if (!paymentExists.rows.length) {
      const serviceResult = await client.query(
        `
          SELECT preco
          FROM servicos
          WHERE barbearia_id = $1
            AND nome = $2
          LIMIT 1
        `,
        [
          agendamento.barbearia_id,
          agendamento.servico_nome || agendamento.servico
        ]
      );

      const servicePrice = Number(serviceResult.rows[0]?.preco || 0);

      await client.query(
        `
          INSERT INTO pagamentos_atendimento
            (
              agendamento_id,
              barbearia_id,
              cliente_nome,
              cliente_telefone,
              servico,
              valor,
              data_pagamento,
              status,
              metodo
            )
          VALUES
            ($1, $2, $3, $4, $5, $6, CURRENT_DATE, 'pago', 'presencial')
        `,
        [
          agendamento.id,
          agendamento.barbearia_id,
          agendamento.cliente_nome || agendamento.nome,
          agendamento.cliente_telefone || agendamento.telefone,
          agendamento.servico_nome || agendamento.servico,
          servicePrice
        ]
      );
    }

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }

  try {
    await sendChatbotCompletionThanks(agendamento);
  } catch (error) {
    // Falha no envio da mensagem nao deve quebrar a conclusao.
  }

  return res.json(agendamento);
}));

export default router;
