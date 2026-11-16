import { randomBytes } from "node:crypto";

// Chave de criptografia exclusiva para testes (nunca usar em produção)
process.env.KEYS_ENCRYPTION_SECRET ??= randomBytes(32).toString("base64");
