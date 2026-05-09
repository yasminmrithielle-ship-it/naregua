import { assertFeatureAccess } from "../services/saasService.js";

export function requireFeatureAccess(feature) {
  return async function featureAccessMiddleware(req, res, next) {
    const barbeariaId = req.auth?.membership?.barbershopId;

    if (!barbeariaId) {
      return res.status(401).json({ error: "Sessao sem tenant associado." });
    }

    try {
      req.saasSubscription = await assertFeatureAccess(barbeariaId, feature);
      return next();
    } catch (error) {
      return res.status(403).json({
        error:
          error.message ||
          "Sua assinatura nao permite acessar este recurso no momento."
      });
    }
  };
}
