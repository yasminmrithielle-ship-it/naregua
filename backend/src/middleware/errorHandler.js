export function errorHandler(error, req, res, next) {
  if (res.headersSent) {
    return next(error);
  }

  console.error("Erro nao tratado:", error);

  if (
    error?.code === "EACCES" ||
    error?.code === "ECONNREFUSED" ||
    error?.code === "ENOTFOUND" ||
    error?.code === "28P01" ||
    error?.routine === "auth_failed"
  ) {
    return res.status(503).json({
      error: "Banco de dados indisponivel no momento"
    });
  }

  return res.status(500).json({
    error: "Erro interno do servidor"
  });
}
