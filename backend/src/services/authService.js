import { pool, query } from "../db.js";
import { getSaasTrialDays, getSeedConfig, getSessionTtlDays } from "../config.js";
import { signJwt, verifyJwt } from "./jwtService.js";
import { ensureDefaultServices } from "./serviceCatalog.js";
import { ensureDefaultPlans } from "./subscriptionCatalog.js";
import {
  buildUniqueSlug,
  createBarbershopId,
  provisionBarbershopScaffold
} from "./barbershopService.js";
import { createInitialTrialSubscription, ensureDefaultSaasPlans, getCurrentSaasSubscription } from "./saasService.js";
import { toLegacyRole, toPublicRole } from "./roleService.js";

function buildSessionPayload(row, token, memberships = [], saasSubscription = null) {
  const publicRole = toPublicRole(row.papel);

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
      role: publicRole,
      barbershopId: row.barbearia_id
    },
    barbershop: {
      id: row.barbearia_id,
      name: row.barbearia_nome,
      slug: row.barbearia_slug,
      logoUrl: row.logo_url,
      phone: row.telefone || row.phone,
      whatsappNumber: row.whatsapp_number,
      address: row.address,
      subscriptionPlan: row.plano || row.subscription_plan,
      status: row.barbearia_status,
      timezone: row.timezone,
      primaryColor: row.cor_primaria || row.primary_color,
      accentColor: row.accent_color
    },
    saasSubscription,
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
        COALESCE(b.telefone, b.phone) AS telefone,
        b.whatsapp_number,
        b.address,
        COALESCE(b.plano, b.subscription_plan) AS plano,
        b.status AS barbearia_status,
        b.timezone,
        COALESCE(b.cor_primaria, b.primary_color) AS cor_primaria,
        b.accent_color
      FROM barbearia_usuarios bu
      INNER JOIN barbearias b
        ON b.id = bu.barbearia_id
      WHERE bu.usuario_id = $1
        AND b.status IN ('ativo', 'teste', 'active')
      ORDER BY bu.is_padrao DESC, bu.created_at ASC
    `,
    [userId]
  );

  return result.rows.map((row) => ({
    id: row.id,
    role: toPublicRole(row.papel),
    isDefault: row.is_padrao,
    barbershop: {
      id: row.barbearia_id,
      name: row.barbearia_nome,
      slug: row.barbearia_slug,
      logoUrl: row.logo_url,
      phone: row.telefone,
      whatsappNumber: row.whatsapp_number,
      address: row.address,
      subscriptionPlan: row.plano,
      status: row.barbearia_status,
      timezone: row.timezone,
      primaryColor: row.cor_primaria,
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

function buildJwtToken({ userId, barbershopId, role }) {
  const expiresInSeconds = Number(getSessionTtlDays()) * 24 * 60 * 60;

  return signJwt(
    {
      userId,
      barbeariaId: barbershopId,
      role: toPublicRole(role)
    },
    { expiresInSeconds }
  );
}

export async function getSessionFromToken(token) {
  if (!token) {
    return null;
  }

  const payload = verifyJwt(token);
  const result = await query(
    `
      SELECT
        u.id AS usuario_id,
        u.nome AS usuario_nome,
        u.email AS usuario_email,
        COALESCE(u.ativo, u.status = 'active') AS usuario_ativo,
        bu.id AS membership_id,
        bu.papel,
        b.id AS barbearia_id,
        b.nome AS barbearia_nome,
        b.slug AS barbearia_slug,
        b.logo_url,
        COALESCE(b.telefone, b.phone) AS telefone,
        b.whatsapp_number,
        b.address,
        COALESCE(b.plano, b.subscription_plan) AS plano,
        b.status AS barbearia_status,
        b.timezone,
        COALESCE(b.cor_primaria, b.primary_color) AS cor_primaria,
        b.accent_color
      FROM usuarios u
      INNER JOIN barbearia_usuarios bu
        ON bu.usuario_id = u.id
      INNER JOIN barbearias b
        ON b.id = bu.barbearia_id
      WHERE u.id = $1
        AND bu.barbearia_id = $2
      LIMIT 1
    `,
    [payload.userId, payload.barbeariaId]
  );

  const row = result.rows[0];

  if (!row || !row.usuario_ativo) {
    return null;
  }

  await query(
    `
      UPDATE usuarios
      SET
        last_login_at = NOW(),
        barbearia_id = $2,
        role = $3,
        updated_at = NOW()
      WHERE id = $1
    `,
    [row.usuario_id, row.barbearia_id, toPublicRole(row.papel)]
  ).catch(() => null);

  const [memberships, saasSubscription] = await Promise.all([
    listMemberships({ query }, row.usuario_id),
    getCurrentSaasSubscription(row.barbearia_id)
  ]);

  return buildSessionPayload(
    {
      ...row,
      expires_at: new Date(payload.exp * 1000).toISOString()
    },
    token,
    memberships,
    saasSubscription
  );
}

export async function revokeSession(_token) {
  return;
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

  const nextToken = buildJwtToken({
    userId: session.user.id,
    barbershopId: membership.barbershop.id,
    role: membership.role
  });

  return getSessionFromToken(nextToken);
}

export async function loginUser({
  email,
  password,
  barbershopId,
  barbershopSlug
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
        COALESCE(ativo, status = 'active') AS ativo,
        COALESCE(senha_hash, password_hash) = crypt($2, COALESCE(senha_hash, password_hash)) AS password_ok
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

  if (!user.ativo) {
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

  await query(
    `
      UPDATE usuarios
      SET
        last_login_at = NOW(),
        barbearia_id = $2,
        role = $3,
        ativo = true,
        status = 'active'
      WHERE id = $1
    `,
    [user.id, selectedMembership.barbershop.id, selectedMembership.role]
  );

  const token = buildJwtToken({
    userId: user.id,
    barbershopId: selectedMembership.barbershop.id,
    role: selectedMembership.role
  });

  return getSessionFromToken(token);
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
  logoUrl = null
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
    await ensureDefaultSaasPlans(client);

    const barbershopId = createBarbershopId();
    const uniqueSlug = await buildUniqueSlug(slug || normalizedBarbershopName, client);

    const userResult = await client.query(
      `
        WITH hashed AS (
          SELECT crypt($3, gen_salt('bf')) AS password_hash
        )
        INSERT INTO usuarios (
          nome,
          email,
          password_hash,
          senha_hash,
          status,
          ativo,
          role,
          barbearia_id,
          criado_em
        )
        SELECT
          $1,
          $2,
          hashed.password_hash,
          hashed.password_hash,
          'active',
          true,
          'owner',
          $4,
          NOW()
        FROM hashed
        RETURNING id, nome, email
      `,
      [normalizedName, normalizedEmail, password, barbershopId]
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
      subscriptionPlan: "plano",
      sessionName: `barbearia-${barbershopId}`
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
    await createInitialTrialSubscription(client, barbershopId, getSaasTrialDays());
    await client.query("COMMIT");

    const token = buildJwtToken({
      userId: user.id,
      barbershopId,
      role: "owner"
    });

    return getSessionFromToken(token);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function ensureSeedData() {
  const seed = getSeedConfig();

  if (!seed) {
    return;
  }

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
