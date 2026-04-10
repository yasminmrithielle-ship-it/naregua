import { getChatbotInternalSecret } from "../config.js";

export function requireChatbotInternal(req, res, next) {
  const providedSecret =
    req.headers["x-chatbot-secret"] ||
    req.headers["x-internal-chatbot-secret"] ||
    "";

  if (!providedSecret || providedSecret !== getChatbotInternalSecret()) {
    return res.status(401).json({ error: "Internal chatbot secret invalido." });
  }

  return next();
}
