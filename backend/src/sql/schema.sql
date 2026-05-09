CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION set_atualizado_em()
RETURNS TRIGGER AS $$
BEGIN
  NEW.atualizado_em = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION set_updated_at_and_atualizado_em()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  NEW.atualizado_em = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION refresh_cliente_snapshot(
  p_barbearia_id TEXT,
  p_telefone TEXT
)
RETURNS VOID AS $$
BEGIN
  UPDATE clientes c
  SET
    total_agendamentos = COALESCE(stats.total_agendamentos, 0),
    ultimo_agendamento = stats.ultimo_agendamento,
    updated_at = NOW()
  FROM (
    SELECT
      COUNT(*) FILTER (WHERE status != 'cancelado')::int AS total_agendamentos,
      MAX(data) FILTER (WHERE status != 'cancelado') AS ultimo_agendamento
    FROM agendamentos
    WHERE barbearia_id = p_barbearia_id
      AND REGEXP_REPLACE(COALESCE(cliente_telefone, telefone, ''), '\D', '', 'g')
        = REGEXP_REPLACE(COALESCE(p_telefone, ''), '\D', '', 'g')
  ) stats
  WHERE c.barbearia_id = p_barbearia_id
    AND REGEXP_REPLACE(COALESCE(c.telefone, ''), '\D', '', 'g')
      = REGEXP_REPLACE(COALESCE(p_telefone, ''), '\D', '', 'g');
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION refresh_cliente_snapshot_trigger()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM refresh_cliente_snapshot(
    COALESCE(NEW.barbearia_id, OLD.barbearia_id),
    COALESCE(NEW.cliente_telefone, NEW.telefone, OLD.cliente_telefone, OLD.telefone)
  );

  IF TG_OP = 'UPDATE' AND (
    COALESCE(OLD.telefone, '') != COALESCE(NEW.telefone, '')
    OR COALESCE(OLD.cliente_telefone, '') != COALESCE(NEW.cliente_telefone, '')
  ) THEN
    PERFORM refresh_cliente_snapshot(
      COALESCE(OLD.barbearia_id, NEW.barbearia_id),
      COALESCE(OLD.cliente_telefone, OLD.telefone)
    );
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE IF NOT EXISTS barbearias (
  id TEXT PRIMARY KEY,
  nome TEXT NOT NULL
);

ALTER TABLE barbearias
  ADD COLUMN IF NOT EXISTS slug TEXT,
  ADD COLUMN IF NOT EXISTS logo_url TEXT,
  ADD COLUMN IF NOT EXISTS phone TEXT,
  ADD COLUMN IF NOT EXISTS telefone TEXT,
  ADD COLUMN IF NOT EXISTS whatsapp_number TEXT,
  ADD COLUMN IF NOT EXISTS address TEXT,
  ADD COLUMN IF NOT EXISTS subscription_plan TEXT NOT NULL DEFAULT 'starter',
  ADD COLUMN IF NOT EXISTS plano TEXT,
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS timezone TEXT NOT NULL DEFAULT 'America/Sao_Paulo',
  ADD COLUMN IF NOT EXISTS primary_color TEXT,
  ADD COLUMN IF NOT EXISTS cor_primaria TEXT,
  ADD COLUMN IF NOT EXISTS accent_color TEXT,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS criado_em TIMESTAMP NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS atualizado_em TIMESTAMP NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS onboarding_completed_at TIMESTAMP;

UPDATE barbearias
SET slug = COALESCE(
  slug,
  NULLIF(
    TRIM(BOTH '-' FROM REGEXP_REPLACE(LOWER(nome), '[^a-z0-9]+', '-', 'g')),
    ''
  ),
  id
)
WHERE slug IS NULL;

UPDATE barbearias
SET
  telefone = COALESCE(telefone, phone),
  cor_primaria = COALESCE(cor_primaria, primary_color, '#D4A64A'),
  plano = COALESCE(plano, 'Plano'),
  status = CASE WHEN status = 'active' THEN 'ativo' ELSE status END,
  criado_em = COALESCE(criado_em, created_at, NOW()),
  atualizado_em = COALESCE(atualizado_em, updated_at, NOW());

CREATE UNIQUE INDEX IF NOT EXISTS idx_barbearias_slug_unique
  ON barbearias(slug);

CREATE TABLE IF NOT EXISTS usuarios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  last_login_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

ALTER TABLE usuarios
  ADD COLUMN IF NOT EXISTS barbearia_id TEXT REFERENCES barbearias(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS senha_hash TEXT,
  ADD COLUMN IF NOT EXISTS role TEXT,
  ADD COLUMN IF NOT EXISTS ativo BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS criado_em TIMESTAMP NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS atualizado_em TIMESTAMP NOT NULL DEFAULT NOW();

UPDATE usuarios
SET
  senha_hash = COALESCE(senha_hash, password_hash),
  ativo = COALESCE(ativo, status = 'active'),
  role = COALESCE(role, 'owner'),
  criado_em = COALESCE(criado_em, created_at, NOW()),
  atualizado_em = COALESCE(atualizado_em, updated_at, NOW());

CREATE TABLE IF NOT EXISTS barbearia_usuarios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  barbearia_id TEXT NOT NULL REFERENCES barbearias(id) ON DELETE CASCADE,
  papel TEXT NOT NULL CHECK (papel IN ('owner', 'admin', 'barber', 'attendant')),
  is_padrao BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (usuario_id, barbearia_id)
);

CREATE TABLE IF NOT EXISTS sessoes_usuario (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  barbearia_id TEXT NOT NULL REFERENCES barbearias(id) ON DELETE CASCADE,
  papel TEXT NOT NULL CHECK (papel IN ('owner', 'admin', 'barber', 'attendant')),
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMP NOT NULL,
  user_agent TEXT,
  ip_address TEXT,
  last_seen_at TIMESTAMP NOT NULL DEFAULT NOW(),
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS barbeiros (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  barbearia_id TEXT NOT NULL REFERENCES barbearias(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  especialidade TEXT,
  phone TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

ALTER TABLE barbeiros
  ADD COLUMN IF NOT EXISTS telefone TEXT,
  ADD COLUMN IF NOT EXISTS foto_url TEXT,
  ADD COLUMN IF NOT EXISTS ativo BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS criado_em TIMESTAMP NOT NULL DEFAULT NOW();

UPDATE barbeiros
SET
  telefone = COALESCE(telefone, phone),
  ativo = COALESCE(ativo, active, true),
  criado_em = COALESCE(criado_em, created_at, NOW());

CREATE TABLE IF NOT EXISTS clientes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  barbearia_id TEXT NOT NULL REFERENCES barbearias(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  telefone TEXT NOT NULL,
  email TEXT,
  notas TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (barbearia_id, telefone)
);

ALTER TABLE clientes
  ADD COLUMN IF NOT EXISTS total_agendamentos INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ultimo_agendamento DATE,
  ADD COLUMN IF NOT EXISTS criado_em TIMESTAMP NOT NULL DEFAULT NOW();

UPDATE clientes
SET
  criado_em = COALESCE(criado_em, created_at, NOW());

CREATE TABLE IF NOT EXISTS servicos (
  id SERIAL PRIMARY KEY,
  barbearia_id TEXT NOT NULL REFERENCES barbearias(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  duracao INTEGER NOT NULL,
  preco NUMERIC(10,2) NOT NULL
);

ALTER TABLE servicos
  ADD COLUMN IF NOT EXISTS descricao TEXT,
  ADD COLUMN IF NOT EXISTS ativo BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS criado_em TIMESTAMP NOT NULL DEFAULT NOW();

UPDATE servicos
SET
  criado_em = COALESCE(criado_em, created_at, NOW());

CREATE TABLE IF NOT EXISTS horarios_trabalho (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  barbearia_id TEXT NOT NULL REFERENCES barbearias(id) ON DELETE CASCADE,
  barbeiro_id UUID REFERENCES barbeiros(id) ON DELETE CASCADE,
  day_of_week SMALLINT NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS horarios_funcionamento (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  barbearia_id TEXT NOT NULL REFERENCES barbearias(id) ON DELETE CASCADE,
  barbeiro_id UUID REFERENCES barbeiros(id) ON DELETE CASCADE,
  dia_semana SMALLINT NOT NULL CHECK (dia_semana BETWEEN 0 AND 6),
  hora_inicio TIME NOT NULL,
  hora_fim TIME NOT NULL,
  intervalo_inicio TIME,
  intervalo_fim TIME,
  ativo BOOLEAN NOT NULL DEFAULT true,
  criado_em TIMESTAMP NOT NULL DEFAULT NOW(),
  atualizado_em TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS horarios (
  id SERIAL PRIMARY KEY,
  barbearia_id TEXT NOT NULL REFERENCES barbearias(id) ON DELETE CASCADE,
  data DATE NOT NULL,
  hora TEXT NOT NULL,
  disponivel BOOLEAN NOT NULL DEFAULT true
);

ALTER TABLE horarios
  ADD COLUMN IF NOT EXISTS barbeiro_id UUID REFERENCES barbeiros(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS origem TEXT NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS criado_em TIMESTAMP NOT NULL DEFAULT NOW();

UPDATE horarios
SET
  criado_em = COALESCE(criado_em, created_at, NOW());

CREATE TABLE IF NOT EXISTS agendamentos (
  id SERIAL PRIMARY KEY,
  barbearia_id TEXT NOT NULL REFERENCES barbearias(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  telefone TEXT NOT NULL,
  data DATE NOT NULL,
  hora TEXT NOT NULL,
  servico TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'confirmado',
  criado_em TIMESTAMP NOT NULL DEFAULT NOW()
);

ALTER TABLE agendamentos
  ADD COLUMN IF NOT EXISTS cliente_id UUID REFERENCES clientes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS barbeiro_id UUID REFERENCES barbeiros(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS servico_id INTEGER REFERENCES servicos(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cliente_nome TEXT,
  ADD COLUMN IF NOT EXISTS cliente_telefone TEXT,
  ADD COLUMN IF NOT EXISTS servico_nome TEXT,
  ADD COLUMN IF NOT EXISTS origem TEXT NOT NULL DEFAULT 'panel',
  ADD COLUMN IF NOT EXISTS observacoes TEXT,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP NOT NULL DEFAULT NOW();

UPDATE agendamentos
SET
  cliente_nome = COALESCE(cliente_nome, nome),
  cliente_telefone = COALESCE(cliente_telefone, telefone),
  servico_nome = COALESCE(servico_nome, servico),
  origem = CASE
    WHEN origem IN ('panel', 'painel') THEN 'painel'
    WHEN origem IN ('chatbot', 'whatsapp') THEN 'chatbot'
    WHEN origem = 'app' THEN 'app'
    ELSE origem
  END;

CREATE TABLE IF NOT EXISTS chatbot_configuracoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  barbearia_id TEXT NOT NULL UNIQUE REFERENCES barbearias(id) ON DELETE CASCADE,
  assistant_name TEXT NOT NULL DEFAULT 'Assistente',
  welcome_message TEXT NOT NULL DEFAULT 'Ola! Seja bem-vindo(a)! Como posso ajudar com seu agendamento hoje?',
  off_hours_message TEXT NOT NULL DEFAULT 'No momento estamos fora do horario de atendimento. Assim que possivel retornaremos.',
  cancellation_message TEXT NOT NULL DEFAULT 'Seu agendamento foi cancelado com sucesso.',
  reschedule_message TEXT NOT NULL DEFAULT 'Vamos remarcar seu horario. Informe uma nova data desejada.',
  tone_of_voice TEXT NOT NULL DEFAULT 'friendly',
  custom_instructions TEXT,
  allow_cancellation BOOLEAN NOT NULL DEFAULT true,
  allow_reschedule BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS conexoes_whatsapp (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  barbearia_id TEXT NOT NULL REFERENCES barbearias(id) ON DELETE CASCADE,
  session_name TEXT NOT NULL UNIQUE,
  phone_number TEXT,
  provider TEXT NOT NULL DEFAULT 'whatsapp-web.js',
  status TEXT NOT NULL DEFAULT 'disconnected',
  qr_code TEXT,
  webhook_secret TEXT,
  last_connected_at TIMESTAMP,
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

ALTER TABLE conexoes_whatsapp
  ADD COLUMN IF NOT EXISTS qr_data_url TEXT,
  ADD COLUMN IF NOT EXISTS session_path TEXT,
  ADD COLUMN IF NOT EXISTS telefone_conectado TEXT,
  ADD COLUMN IF NOT EXISTS ultima_conexao TIMESTAMP,
  ADD COLUMN IF NOT EXISTS criado_em TIMESTAMP NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS atualizado_em TIMESTAMP NOT NULL DEFAULT NOW();

UPDATE conexoes_whatsapp
SET
  session_path = COALESCE(session_path, '.wwebjs_auth/barbearia-' || barbearia_id),
  telefone_conectado = COALESCE(telefone_conectado, phone_number),
  ultima_conexao = COALESCE(ultima_conexao, last_connected_at),
  criado_em = COALESCE(criado_em, created_at, NOW()),
  atualizado_em = COALESCE(atualizado_em, updated_at, NOW());

CREATE UNIQUE INDEX IF NOT EXISTS idx_conexoes_whatsapp_barbearia_unique
  ON conexoes_whatsapp(barbearia_id);

CREATE TABLE IF NOT EXISTS planos_saas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL UNIQUE,
  preco NUMERIC(10,2) NOT NULL,
  limite_agendamentos INTEGER,
  limite_chatbots INTEGER NOT NULL DEFAULT 1,
  ativo BOOLEAN NOT NULL DEFAULT true,
  criado_em TIMESTAMP NOT NULL DEFAULT NOW(),
  atualizado_em TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS assinaturas_saas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  barbearia_id TEXT NOT NULL UNIQUE REFERENCES barbearias(id) ON DELETE CASCADE,
  plano_id UUID NOT NULL REFERENCES planos_saas(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'active',
  inicio_trial DATE,
  fim_trial DATE,
  vencimento DATE,
  criado_em TIMESTAMP NOT NULL DEFAULT NOW(),
  atualizado_em TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS planos_assinatura (
  id SERIAL PRIMARY KEY,
  barbearia_id TEXT NOT NULL REFERENCES barbearias(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  valor NUMERIC(10,2) NOT NULL,
  cortes_inclusos INTEGER NOT NULL,
  validade_dias INTEGER NOT NULL DEFAULT 30,
  ativo BOOLEAN NOT NULL DEFAULT true,
  criado_em TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS clientes_assinatura (
  id SERIAL PRIMARY KEY,
  barbearia_id TEXT NOT NULL REFERENCES barbearias(id) ON DELETE CASCADE,
  plano_id INTEGER NOT NULL REFERENCES planos_assinatura(id) ON DELETE RESTRICT,
  nome TEXT NOT NULL,
  telefone TEXT NOT NULL,
  data_adesao DATE NOT NULL DEFAULT CURRENT_DATE,
  data_vencimento DATE NOT NULL,
  status_pagamento TEXT NOT NULL DEFAULT 'pendente',
  ativo BOOLEAN NOT NULL DEFAULT true,
  observacoes TEXT,
  criado_em TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pagamentos_assinatura (
  id SERIAL PRIMARY KEY,
  cliente_id INTEGER NOT NULL REFERENCES clientes_assinatura(id) ON DELETE CASCADE,
  barbearia_id TEXT NOT NULL REFERENCES barbearias(id) ON DELETE CASCADE,
  valor NUMERIC(10,2) NOT NULL,
  competencia TEXT NOT NULL,
  data_pagamento DATE NOT NULL DEFAULT CURRENT_DATE,
  status TEXT NOT NULL DEFAULT 'pago',
  metodo TEXT NOT NULL DEFAULT 'manual',
  criado_em TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pagamentos_atendimento (
  id SERIAL PRIMARY KEY,
  agendamento_id INTEGER NOT NULL UNIQUE REFERENCES agendamentos(id) ON DELETE CASCADE,
  barbearia_id TEXT NOT NULL REFERENCES barbearias(id) ON DELETE CASCADE,
  cliente_nome TEXT NOT NULL,
  cliente_telefone TEXT NOT NULL,
  servico TEXT NOT NULL,
  valor NUMERIC(10,2) NOT NULL,
  data_pagamento DATE NOT NULL DEFAULT CURRENT_DATE,
  status TEXT NOT NULL DEFAULT 'pago',
  metodo TEXT NOT NULL DEFAULT 'presencial',
  criado_em TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS consumos_assinatura (
  id SERIAL PRIMARY KEY,
  cliente_id INTEGER NOT NULL REFERENCES clientes_assinatura(id) ON DELETE CASCADE,
  barbearia_id TEXT NOT NULL REFERENCES barbearias(id) ON DELETE CASCADE,
  data_consumo DATE NOT NULL DEFAULT CURRENT_DATE,
  descricao TEXT NOT NULL DEFAULT 'Corte',
  quantidade INTEGER NOT NULL DEFAULT 1,
  agendamento_id INTEGER REFERENCES agendamentos(id) ON DELETE SET NULL,
  criado_em TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS lembretes (
  id SERIAL PRIMARY KEY,
  barbearia_id TEXT NOT NULL REFERENCES barbearias(id) ON DELETE CASCADE,
  referencia_tipo TEXT NOT NULL,
  referencia_id INTEGER NOT NULL,
  categoria TEXT NOT NULL,
  telefone TEXT NOT NULL,
  nome_cliente TEXT NOT NULL,
  mensagem TEXT NOT NULL,
  agendado_para TIMESTAMP NOT NULL,
  status TEXT NOT NULL DEFAULT 'pendente',
  tentativas INTEGER NOT NULL DEFAULT 0,
  ultimo_erro TEXT,
  enviado_em TIMESTAMP,
  criado_em TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_barbearia_usuarios_usuario
  ON barbearia_usuarios(usuario_id);
CREATE INDEX IF NOT EXISTS idx_barbearia_usuarios_barbearia
  ON barbearia_usuarios(barbearia_id);
CREATE INDEX IF NOT EXISTS idx_sessoes_usuario_token_hash
  ON sessoes_usuario(token_hash);
CREATE INDEX IF NOT EXISTS idx_sessoes_usuario_barbearia
  ON sessoes_usuario(barbearia_id);
CREATE INDEX IF NOT EXISTS idx_clientes_barbearia
  ON clientes(barbearia_id);
CREATE INDEX IF NOT EXISTS idx_barbeiros_barbearia
  ON barbeiros(barbearia_id);
CREATE INDEX IF NOT EXISTS idx_servicos_barbearia_nome
  ON servicos(barbearia_id, LOWER(nome));
CREATE INDEX IF NOT EXISTS idx_horarios_funcionamento_barbearia
  ON horarios_funcionamento(barbearia_id);
CREATE INDEX IF NOT EXISTS idx_horarios_data
  ON horarios(data);
CREATE INDEX IF NOT EXISTS idx_horarios_barbearia_data_hora
  ON horarios(barbearia_id, data, hora);
CREATE INDEX IF NOT EXISTS idx_agendamentos_data
  ON agendamentos(data);
CREATE INDEX IF NOT EXISTS idx_agendamentos_barbearia_data_hora
  ON agendamentos(barbearia_id, data, hora);
CREATE INDEX IF NOT EXISTS idx_agendamentos_barbearia_telefone
  ON agendamentos(barbearia_id, telefone);
CREATE INDEX IF NOT EXISTS idx_agendamentos_cliente_id
  ON agendamentos(cliente_id);
CREATE INDEX IF NOT EXISTS idx_planos_saas_nome
  ON planos_saas(nome);
CREATE INDEX IF NOT EXISTS idx_assinaturas_saas_barbearia
  ON assinaturas_saas(barbearia_id);
CREATE INDEX IF NOT EXISTS idx_planos_assinatura_barbearia
  ON planos_assinatura(barbearia_id);
CREATE INDEX IF NOT EXISTS idx_clientes_assinatura_barbearia
  ON clientes_assinatura(barbearia_id);
CREATE INDEX IF NOT EXISTS idx_clientes_assinatura_vencimento
  ON clientes_assinatura(data_vencimento);
CREATE INDEX IF NOT EXISTS idx_pagamentos_assinatura_cliente
  ON pagamentos_assinatura(cliente_id);
CREATE INDEX IF NOT EXISTS idx_pagamentos_atendimento_agendamento
  ON pagamentos_atendimento(agendamento_id);
CREATE INDEX IF NOT EXISTS idx_pagamentos_atendimento_data
  ON pagamentos_atendimento(data_pagamento, criado_em);
CREATE INDEX IF NOT EXISTS idx_consumos_assinatura_cliente
  ON consumos_assinatura(cliente_id);
CREATE INDEX IF NOT EXISTS idx_lembretes_pendentes
  ON lembretes(status, agendado_para);
CREATE INDEX IF NOT EXISTS idx_conexoes_whatsapp_barbearia
  ON conexoes_whatsapp(barbearia_id);

DROP TRIGGER IF EXISTS trg_barbearias_set_updated_at ON barbearias;
CREATE TRIGGER trg_barbearias_set_updated_at
BEFORE UPDATE ON barbearias
FOR EACH ROW
EXECUTE FUNCTION set_updated_at_and_atualizado_em();

DROP TRIGGER IF EXISTS trg_usuarios_set_updated_at ON usuarios;
CREATE TRIGGER trg_usuarios_set_updated_at
BEFORE UPDATE ON usuarios
FOR EACH ROW
EXECUTE FUNCTION set_updated_at_and_atualizado_em();

DROP TRIGGER IF EXISTS trg_barbeiros_set_updated_at ON barbeiros;
CREATE TRIGGER trg_barbeiros_set_updated_at
BEFORE UPDATE ON barbeiros
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_clientes_set_updated_at ON clientes;
CREATE TRIGGER trg_clientes_set_updated_at
BEFORE UPDATE ON clientes
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_servicos_set_updated_at ON servicos;
CREATE TRIGGER trg_servicos_set_updated_at
BEFORE UPDATE ON servicos
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_horarios_trabalho_set_updated_at ON horarios_trabalho;
CREATE TRIGGER trg_horarios_trabalho_set_updated_at
BEFORE UPDATE ON horarios_trabalho
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_horarios_funcionamento_set_updated_at ON horarios_funcionamento;
CREATE TRIGGER trg_horarios_funcionamento_set_updated_at
BEFORE UPDATE ON horarios_funcionamento
FOR EACH ROW
EXECUTE FUNCTION set_atualizado_em();

DROP TRIGGER IF EXISTS trg_horarios_set_updated_at ON horarios;
CREATE TRIGGER trg_horarios_set_updated_at
BEFORE UPDATE ON horarios
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_agendamentos_set_updated_at ON agendamentos;
CREATE TRIGGER trg_agendamentos_set_updated_at
BEFORE UPDATE ON agendamentos
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_chatbot_configuracoes_set_updated_at ON chatbot_configuracoes;
CREATE TRIGGER trg_chatbot_configuracoes_set_updated_at
BEFORE UPDATE ON chatbot_configuracoes
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_conexoes_whatsapp_set_updated_at ON conexoes_whatsapp;
CREATE TRIGGER trg_conexoes_whatsapp_set_updated_at
BEFORE UPDATE ON conexoes_whatsapp
FOR EACH ROW
EXECUTE FUNCTION set_updated_at_and_atualizado_em();

DROP TRIGGER IF EXISTS trg_planos_saas_set_updated_at ON planos_saas;
CREATE TRIGGER trg_planos_saas_set_updated_at
BEFORE UPDATE ON planos_saas
FOR EACH ROW
EXECUTE FUNCTION set_atualizado_em();

DROP TRIGGER IF EXISTS trg_assinaturas_saas_set_updated_at ON assinaturas_saas;
CREATE TRIGGER trg_assinaturas_saas_set_updated_at
BEFORE UPDATE ON assinaturas_saas
FOR EACH ROW
EXECUTE FUNCTION set_atualizado_em();

DROP TRIGGER IF EXISTS trg_agendamentos_refresh_cliente_snapshot ON agendamentos;
CREATE TRIGGER trg_agendamentos_refresh_cliente_snapshot
AFTER INSERT OR UPDATE OR DELETE ON agendamentos
FOR EACH ROW
EXECUTE FUNCTION refresh_cliente_snapshot_trigger();
