import { z } from "zod";
import { isValidCPF } from "@/lib/utils";

const uuid = z.string().uuid();

export const cartLineSchema = z.object({
  productId: uuid,
  quantity: z.number().int().min(1).max(100),
});

export const createOrderSchema = z.object({
  items: z.array(cartLineSchema).min(1).max(30),
  customerName: z.string().trim().min(3, "Informe seu nome completo").max(120),
  couponCode: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9_-]{3,40}$/, "Cupom inválido")
    .optional()
    .or(z.literal("").transform(() => undefined)),
  acceptTerms: z.literal(true, { errorMap: () => ({ message: "É necessário aceitar os termos" }) }),
});

export const cpfSchema = z
  .string()
  .trim()
  .transform((v) => v.replace(/\D/g, ""))
  .refine((v) => isValidCPF(v), "CPF inválido");

export const pixPaymentSchema = z.object({
  method: z.literal("pix"),
  cpf: cpfSchema.optional().or(z.literal("").transform(() => undefined)),
});

/** Dados enviados pelo Card Payment Brick (o cartão já vem tokenizado) */
export const cardPaymentSchema = z.object({
  method: z.literal("card"),
  token: z.string().min(10).max(200),
  payment_method_id: z.string().min(2).max(40),
  issuer_id: z.union([z.string(), z.number()]).optional().nullable(),
  installments: z.number().int().min(1).max(12),
  payer: z.object({
    email: z.string().email(),
    identification: z.object({ type: z.string().max(10), number: z.string().max(20) }).optional(),
  }),
});

export const paymentSchema = z.discriminatedUnion("method", [pixPaymentSchema, cardPaymentSchema]);

export const cartValidateSchema = z.object({ items: z.array(cartLineSchema).max(30), couponCode: z.string().optional() });

export const signUpSchema = z
  .object({
    fullName: z.string().trim().min(3, "Informe seu nome completo").max(120),
    email: z.string().trim().email("E-mail inválido"),
    password: z
      .string()
      .min(8, "A senha deve ter ao menos 8 caracteres")
      .regex(/[A-Za-z]/, "Inclua ao menos uma letra")
      .regex(/\d/, "Inclua ao menos um número"),
    confirmPassword: z.string(),
  })
  .refine((d) => d.password === d.confirmPassword, { path: ["confirmPassword"], message: "As senhas não conferem" });

export const signInSchema = z.object({
  email: z.string().trim().email("E-mail inválido"),
  password: z.string().min(1, "Informe a senha"),
});

// ───────────── Admin ─────────────
const centsField = z.coerce.number().int().min(0).max(10_000_000);

export const productUpdateSchema = z.object({
  name: z.string().trim().min(1).max(200),
  slug: z.string().trim().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Slug inválido"),
  description: z.string().max(10000).optional().nullable(),
  short_description: z.string().max(600).optional().nullable(),
  image_url: z.string().url().optional().nullable().or(z.literal("").transform(() => null)),
  background_url: z.string().url().optional().nullable().or(z.literal("").transform(() => null)),
  category_id: uuid.optional().nullable().or(z.literal("").transform(() => null)),
  category_ids: z.array(uuid).default([]),
  platform: z.string().trim().min(1).max(40),
  activation_region: z.string().trim().max(80).optional().nullable().or(z.literal("").transform(() => null)),
  pricing_mode: z.enum(["global", "custom"]),
  custom_price_cents: centsField.optional().nullable(),
  original_price_cents: centsField.optional().nullable(),
  promo_price_cents: centsField.optional().nullable(),
  promo_ends_at: z.string().optional().nullable().or(z.literal("").transform(() => null)),
  active: z.boolean(),
  featured: z.boolean(),
});

export const settingsSchema = z.object({
  store_name: z.string().trim().min(2).max(60),
  store_legal_name: z.string().trim().max(120).nullable(),
  store_document: z.string().trim().max(30).nullable(),
  support_email: z.string().trim().email().nullable().or(z.literal("").transform(() => null)),
  support_whatsapp: z.string().trim().max(30).nullable(),
  support_hours: z.string().trim().max(80).nullable(),
  pricing_strategy: z.enum(["flat", "percent", "fixed", "percent_plus_fixed"]),
  default_sale_price_cents: z.coerce.number().int().min(100).max(10_000_000),
  combo_enabled: z.boolean(),
  combo_size: z.coerce.number().int().min(2).max(20),
  combo_free: z.coerce.number().int().min(1).max(19),
  margin_percent: z.coerce.number().min(0).max(1000),
  fixed_markup_cents: centsField,
  min_price_cents: z.coerce.number().int().min(1),
  round_to_90: z.boolean(),
  default_platform: z.string().trim().min(1).max(40),
  default_activation_region: z.string().trim().max(80).nullable(),
  activation_instructions: z.string().max(4000).nullable(),
  import_nsfw: z.boolean(),
  auto_deactivate_missing: z.boolean(),
  max_quantity_per_item: z.coerce.number().int().min(1).max(100),
  pix_enabled: z.boolean(),
  card_enabled: z.boolean(),
  pix_expiration_minutes: z.coerce.number().int().min(10).max(1440),
  max_installments: z.coerce.number().int().min(1).max(12),
  auto_delivery_enabled: z.boolean(),
  delivery_max_attempts: z.coerce.number().int().min(1).max(50),
  key_code_length: z.enum(["15", "20", "25", "random"]),
  emails_enabled: z.boolean(),
  email_reply_to: z.string().trim().email().nullable().or(z.literal("").transform(() => null)),
});

const optionalHttpsUrl = z
  .string()
  .trim()
  .max(500)
  .url("URL inválida")
  .refine((u) => u.startsWith("https://"), "Use um link https://")
  .nullable()
  .or(z.literal("").transform(() => null));

export const tutorialSchema = z.object({
  platform: z.string().trim().min(1, "Informe a plataforma").max(40),
  title: z.string().trim().min(2, "Título muito curto").max(120),
  intro: z.string().trim().max(2000).nullable().or(z.literal("").transform(() => null)),
  steps: z.array(z.string().trim().max(500, "Passo muito longo")).max(30, "Máximo de 30 passos").transform((a) => a.filter(Boolean)),
  activation_url: optionalHttpsUrl,
  video_url: optionalHttpsUrl,
  notes: z.string().trim().max(4000).nullable().or(z.literal("").transform(() => null)),
  is_default: z.boolean(),
  active: z.boolean(),
  sort_order: z.coerce.number().int().min(0).max(999),
});

export const categorySchema = z.object({
  name: z.string().trim().min(2).max(60),
  slug: z.string().trim().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Slug inválido"),
  supplier_tags: z.array(z.string().trim().min(1).max(60)).max(50),
  sort_order: z.coerce.number().int().min(0).max(999),
});

export const couponSchema = z.object({
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9_-]{3,40}$/),
  discount_type: z.enum(["percent", "fixed"]),
  discount_value: z.coerce.number().int().min(1),
  min_order_cents: centsField,
  max_uses: z.coerce.number().int().min(1).nullable(),
  max_uses_per_user: z.coerce.number().int().min(1).max(1000).nullable().default(null),
  affiliate_name: z.string().trim().min(1).max(80).nullable().default(null),
  commission_percent: z.coerce.number().gt(0, "Comissão deve ser maior que 0").max(100, "Comissão máxima: 100%").transform((v) => Math.round(v * 100) / 100).nullable().default(null),
  expires_at: z.string().nullable(),
  active: z.boolean(),
});
