import { createHash, randomBytes } from "crypto";
import { pool, query } from "../db.js";
import { getSessionTtlDays, getSeedConfig } from "../config.js";
import { ensureDefaultServices } from "./serviceCatalog.js";
import { ensureDefaultPlans } from "./subscriptionCatalog.js";
import {
  buildUniqueSlug,
  createBarbershopId,
  provisionBarbershopScaffold
} from "./barbershopService.js";

function hashSessionToken(token) {
  return createHash("sha256").update(token).digest("hex");
}

function buildSessionPayload(row, token, memberships = []) {
  return {
    token,
    expiresAt: row.expires_at,
    user: {
      id: row.usuario_id,
      name: row.usuario_nome,
      email: row.usuario_email
    },
    membership: {
      id: row.membership_id,
      role: row.papel,
      barbershopId: row.barbearia_id
    },
    barbershop: {
      id: row.barbearia_id,
      name: row.barbearia_nome,
      slug: row.barbearia_slug,
      logoUrl: row.logo_url,
      phone: row.phone,
      whatsappNumber: row.whatsapp_number,
      address: row.address,
      subscriptionPlan: row.subscription_plan,
      status: row.barbearia_status,
      timezone: row.timezone,
      primaryColor: row.primary_color,
      accentColor: row.accent_color
    },
    memberships
  };
}

async function listMemberships(executor, userId) {
  const result = await executor.query(
    `
      SELECT
        bu.id,
        bu.papel,
        bu.is_padrao,
        b.id AS barbearia_id,
        b.nome AS barbearia_nome,
        b.slug AS barbearia_slug,
        b.logo_url,
        b.phone,
        b.whatsapp_number,
        b.address,
        b.subscription_plan,
        b.status AS barbearia_status,
        b.timezone,
        b.primary_color,
        b.accent_color
      FROM barbearia_usuarios bu
      INNER JOIN barbearias b
        ON b.id = bu.barbearia_id
      WHERE bu.usuario_id = $1
        AND b.status = 'active'
      ORDER BY bu.is_padrao DESC, bu.created_at ASC
    `,
    [userId]
  );

  return result.rows.map((row) => ({
    id: row.id,
    role: row.papel,
    isDefault: row.is_padrao,
    barbershop: {
      id: row.barbearia_id,
      name: row.barbearia_nome,
      slug: row.barbearia_slug,
      logoUrl: row.logo_url,
      phone: row.phone,
      whatsappNumber: row.whatsapp_number,
      address: row.address,
      subscriptionPlan: row.subscription_plan,
      status: row.barbearia_status,
      timezone: row.timezone,
      primaryColor: row.primary_color,
      accentColor: row.accent_color
    }
  }));
}

function selectMembership(memberships, { barbershopId, barbershopSlug } = {}) {
  if (!memberships.length) {
    return null;
  }

  if (barbershopId) {
    return memberships.find((item) => item.barbershop.id === barbershopId) || null;
  }

  if (barbershopSlug) {
    return memberships.find((item) => item.barbershop.slug === barbershopSlug) || null;
  }

  return memberships.find((item) => item.isDefault) || memberships[0];
}

async function createSession(
  executor,
  { userId, barbershopId, role, userAgent = null, ipAddress = null }
) {
  const token = randomBytes(48).toString("hex");
  const tokenHash = hashSessionToken(token);
  const ttlDays = getSessionTtlDays();

  const result = await executor.query(
    `
      INSERT INTO sessoes_usuario (
        usuario_id,
        barbearia_id,
        papel,
        token_hash,
        expires_at,
        user_agent,
        ip_address
      )
      VALUES (
        $1,
        $2,
        $3,
        $4,
        NOW() + make_interval(days => $5),
        $6,
        $7
      )
      RETURNING *
    `,
    [userId, barbershopId, role, tokenHash, ttlDays, userAgent, ipAddress]
  );

  return {
    token,
    row: result.rows[0]
  };
}

export async function getSessionFromToken(token) {
  if (!token) {
    return null;
  }

  const tokenHash = hashSessionToken(token);
  const result = await query(
    `
      SELECT
        s.id AS sessao_id,
        s.usuario_id,
        s.barbearia_id,
        s.papel,
        s.expires_at,
        u.nome AS usuario_nome,
        u.email AS usuario_email,
        bu.id AS membership_id,
        b.nome AS barbearia_nome,
        b.slug AS barbearia_slug,
        b.logo_url,
        b.phone,
        b.whatsapp_number,
        b.address,
        b.subscription_plan,
        b.status AS barbearia_status,
        b.timezone,
        b.primary_color,
        b.accent_color
      FROM sessoes_usuario s
      INNER JOIN usuarios u
        ON u.id = s.usuario_id
      INNER JOIN barbearia_usuarios bu
        ON bu.usuario_id = s.usuario_id
       AND bu.barbearia_id = s.barbearia_id
      INNER JOIN barbearias b
        ON b.id = s.barbearia_id
      WHERE s.token_hash = $1
        AND s.expires_at > NOW()
        AND u.status = 'active'
      LIMIT 1
    `,
    [tokenHash]
  );

  const row = result.rows[0];

  if (!row) {
    return null;
  }

  await query(
    `
      UPDATE sessoes_usuario
      SET last_seen_at = NOW()
      WHERE id = $1
    `,
    [row.sessao_id]
  );

  const memberships = await listMemberships({ query }, row.usuario_id);
  return buildSessionPayload(row, token, memberships);
}

export async function revokeSession(token) {
  if (!token) {
    return;
  }

  await query(
    `
      DELETE FROM sessoes_usuario
      WHERE token_hash = $1
    `,
    [hashSessionToken(token)]
  );
}

export async function switchSessionBarbershop(token, nextBarbershopId) {
  const session = await getSessionFromToken(token);

  if (!session) {
    return null;
  }

  const membership = session.memberships.find(
    (item) => item.barbershop.id === nextBarbershopId
  );

  if (!membership) {
    throw new Error("Voce nao possui acesso a esta barbearia.");
  }

  await query(
    `
      UPDATE sessoes_usuario
      SET
        barbearia_id = $1,
        papel = $2,
        last_seen_at = NOW()
      WHERE token_hash = $3
    `,
    [membership.barbershop.id, membership.role, hashSessionToken(token)]
  );

  return getSessionFromToken(token);
}

export async function loginUser({
  email,
  password,
  barbershopId,
  barbershopSlug,
  userAgent = null,
  ipAddress = null
}) {
  const normalizedEmail = String(email || "").trim().toLowerCase();

  if (!normalizedEmail || !password) {
    throw new Error("Email e senha sao obrigatorios.");
  }

  const result = await query(
    `
      SELECT
        id,
        nome,
        email,
        status,
        password_hash = crypt($2, password_hash) AS password_ok
      FROM usuarios
      WHERE LOWER(email) = $1
      LIMIT 1
    `,
    [normalizedEmail, password]
  );

  const user = result.rows[0];

  if (!user || !user.password_ok) {
    throw new Error("Credenciais invalidas.");
  }

  if (user.status !== "active") {
    throw new Error("Usuario inativo.");
  }

  const memberships = await listMemberships({ query }, user.id);
  const selectedMembership = selectMembership(memberships, {
    barbershopId,
    barbershopSlug
  });

  if (!selectedMembership) {
    throw new Error("Nenhuma barbearia ativa vinculada a este usuario.");
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    await client.query(
      `
        UPDATE usuarios
        SET last_login_at = NOW()
        WHERE id = $1
      `,
      [user.id]
    );

    const session = await createSession(client, {
      userId: user.id,
      barbershopId: selectedMembership.barbershop.id,
      role: selectedMembership.role,
      userAgent,
      ipAddress
    });

    await client.query("COMMIT");

    return buildSessionPayload(
      {
        ...session.row,
        usuario_id: user.id,
        usuario_nome: user.nome,
        usuario_email: user.email,
        membership_id: selectedMembership.id,
        papel: selectedMembership.role,
        barbearia_id: selectedMembership.barbershop.id,
        barbearia_nome: selectedMembership.barbershop.name,
        barbearia_slug: selectedMembership.barbershop.slug,
        logo_url: selectedMembership.barbershop.logoUrl,
        phone: selectedMembership.barbershop.phone,
        whatsapp_number: selectedMembership.barbershop.whatsappNumber,
        address: selectedMembership.barbershop.address,
        subscription_plan: selectedMembership.barbershop.subscriptionPlan,
        barbearia_status: selectedMembership.barbershop.status,
        timezone: selectedMembership.barbershop.timezone,
        primary_color: selectedMembership.barbershop.primaryColor,
        accent_color: selectedMembership.barbershop.accentColor
      },
      session.token,
      memberships
    );
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function registerOwnerAccount({
  name,
  email,
  password,
  barbershopName,
  slug,
  phone = null,
  whatsappNumber = null,
  address = null,
  logoUrl = null,
  userAgent = null,
  ipAddress = null
}) {
  const normalizedEmail = String(email || "").trim().toLowerCase();
  const normalizedName = String(name || "").trim();
  const normalizedBarbershopName = String(barbershopName || "").trim();

  if (!normalizedName || !normalizedEmail || !password || !normalizedBarbershopName) {
    throw new Error("Nome, email, senha e nome da barbearia sao obrigatorios.");
  }

  const existingUser = await query(
    `
      SELECT id
      FROM usuarios
      WHERE LOWER(email) = $1
      LIMIT 1
    `,
    [normalizedEmail]
  );

  if (existingUser.rows.length) {
    throw new Error("Ja existe uma conta com este email.");
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const barbershopId = createBarbershopId();
    const uniqueSlug = await buildUniqueSlug(slug || normalizedBarbershopName, client);

    const userResult = await client.query(
      `
        INSERT INTO usuarios (nome, email, password_hash, status)
        VALUES ($1, $2, crypt($3, gen_salt('bf')), 'active')
        RETURNING id, nome, email
      `,
      [normalizedName, normalizedEmail, password]
    );

    const user = userResult.rows[0];

    await provisionBarbershopScaffold(client, {
      barbershopId,
      name: normalizedBarbershopName,
      slug: uniqueSlug,
      logoUrl,
      phone,
      whatsappNumber,
      address,
      subscriptionPlan: "starter",
      sessionName: uniqueSlug
    });

    await client.query(
      `
        INSERT INTO barbearia_usuarios (
          usuario_id,
          barbearia_id,
          papel,
          is_padrao
        )
        VALUES ($1, $2, 'owner', true)
      `,
      [user.id, barbershopId]
    );

    await ensureDefaultServices(barbershopId, client);
    await ensureDefaultPlans(barbershopId, client);

    const session = await createSession(client, {
      userId: user.id,
      barbershopId,
      role: "owner",
      userAgent,
      ipAddress
    });

    await client.query("COMMIT");

    return getSessionFromToken(session.token);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function ensureSeedData() {
  const seed = getSeedConfig();
  const countResult = await query(
    `
      SELECT COUNT(*)::int AS total
      FROM usuarios
    `
  );

  if (countResult.rows[0]?.total > 0) {
    return;
  }

  await registerOwnerAccount({
    name: seed.ownerName,
    email: seed.ownerEmail,
    password: seed.ownerPassword,
    barbershopName: seed.barbershopName,
    slug: seed.barbershopSlug,
    phone: seed.phone,
    whatsappNumber: seed.whatsappNumber,
    address: seed.address
  });
}
