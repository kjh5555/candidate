import { z } from "zod";

const ConfigSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  KAKAO_REST_API_KEY: z.string().min(1, "KAKAO_REST_API_KEY is required"),
  ASSEMBLY_API_KEY: z.string().optional(),
  CLIK_API_KEY: z.string().optional(),
  NEC_API_KEY: z.string().optional(),
  // data.go.kr key used for budget endpoints (기획재정부 15076058 +
  // 지방재정365 15058011). Falls back to NEC_API_KEY at runtime when missing,
  // since the same 일반인증키 typically works across providers.
  FISCAL_API_KEY: z.string().optional(),
  LOFIN_API_KEY: z.string().optional(),
  PORT: z
    .string()
    .optional()
    .default("3001")
    .transform((v) => {
      const n = Number(v);
      if (!Number.isFinite(n) || n <= 0) {
        throw new Error(`PORT must be a positive number, got: ${v}`);
      }
      return n;
    }),
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .optional()
    .default("development"),
  CORS_ORIGIN: z.string().optional().default("http://localhost:3000"),
});

export type AppConfig = z.infer<typeof ConfigSchema>;

function loadConfig(): AppConfig {
  const parsed = ConfigSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return parsed.data;
}

export const config: AppConfig = loadConfig();
