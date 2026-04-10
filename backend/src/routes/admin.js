import express from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/auth.js";
import {
  getSessionFromToken,
  loginUser,
  registerOwnerAccount,
  revokeSession,
  switchSessionBarbershop
} from "../services/authService.js";

const router = express.Router();

const loginSchema = z.object({
  email: z.string().trim().email().optional(),
  username: z.string().trim().optional(),
  password: z.string().min(4, "Senha obrigatoria"),
  barbershopId: z.string().trim().optional(),
  barbershopSlug: z.string().trim().optional()
});

const registerSchema = z.object({
  name: z.string().trim().min(2, "Nome obrigatorio"),
  email: z.string().trim().email("Email invalido"),
  password: z.string().min(6, "Senha deve ter no minimo 6 caracteres"),
  barbershopName: z.string().trim().min(2, "Nome da barbearia obrigatorio"),
  slug: z.string().trim().optional(),
  phone: z.string().trim().optional(),
  whatsappNumber: z.string().trim().optional(),
  address: z.string().trim().optional(),
  logoUrl: z.string().trim().url().optional().or(z.literal(""))
});

const switchSchema = z.object({
  barbershopId: z.string().trim().min(1, "Barbearia obrigatoria")
});

function getTokenFromRequest(req) {
  const header = req.headers.authorization || "";
  return header.replace("Bearer ", "").trim();
}

function getRequestMetadata(req) {
  return {
    userAgent: req.headers["user-agent"] || null,
    ipAddress:
      req.headers["x-forwarded-for"]?.toString().split(",")[0].trim() ||
      req.socket.remoteAddress ||
      null
  };
}

router.post("/auth/register", async (req, res) => {
  const parsed = registerSchema.safeParse(req.body || {});

  if (!parsed.success) {
    return res.status(400).json({
      error: "Dados invalidos",
      details: parsed.error.flatten()
    });
  }

  try {
    const session = await registerOwnerAccount({
      ...parsed.data,
      logoUrl: parsed.data.logoUrl || null,
      ...getRequestMetadata(req)
    });

    return res.status(201).json(session);
  } catch (error) {
    return res.status(400).json({ error: error.message || "Falha ao criar conta" });
  }
});

router.post("/auth/login", async (req, res) => {
  const parsed = loginSchema.safeParse(req.body || {});

  if (!parsed.success) {
    return res.status(400).json({
      error: "Dados invalidos",
      details: parsed.error.flatten()
    });
  }

  const email = parsed.data.email || parsed.data.username;

  try {
    const session = await loginUser({
      email,
      password: parsed.data.password,
      barbershopId: parsed.data.barbershopId,
      barbershopSlug: parsed.data.barbershopSlug,
      ...getRequestMetadata(req)
    });

    return res.json(session);
  } catch (error) {
    return res.status(401).json({ error: error.message || "Credenciais invalidas" });
  }
});

router.get("/auth/me", requireAuth, async (req, res) => {
  return res.json(req.auth);
});

router.post("/auth/logout", requireAuth, async (req, res) => {
  const token = getTokenFromRequest(req);
  await revokeSession(token);
  return res.json({ ok: true });
});

router.post("/auth/switch-barbershop", requireAuth, async (req, res) => {
  const parsed = switchSchema.safeParse(req.body || {});

  if (!parsed.success) {
    return res.status(400).json({
      error: "Dados invalidos",
      details: parsed.error.flatten()
    });
  }

  try {
    const session = await switchSessionBarbershop(
      getTokenFromRequest(req),
      parsed.data.barbershopId
    );

    if (!session) {
      return res.status(401).json({ error: "Sessao invalida ou expirada." });
    }

    return res.json(session);
  } catch (error) {
    return res.status(403).json({ error: error.message || "Falha ao trocar de barbearia" });
  }
});

router.get("/auth/session", async (req, res) => {
  const token = getTokenFromRequest(req);

  if (!token) {
    return res.status(401).json({ error: "Sessao nao autenticada." });
  }

  const session = await getSessionFromToken(token);

  if (!session) {
    return res.status(401).json({ error: "Sessao invalida ou expirada." });
  }

  return res.json(session);
});

export default router;
