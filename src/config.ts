import { config as loadEnv } from 'dotenv';
import { z } from 'zod';

// Load environment variables from .env file when running locally.
loadEnv();

const booleanString = z
  .enum(['true', 'false'])
  .transform((value) => value === 'true');

const envSchema = z.object({
  GOOGLE_APPLICATION_CREDENTIALS: z.string().optional(),
  BQ_PROJECT: z.string().min(1, 'BQ_PROJECT is required'),
  BQ_DATASET: z.string().min(1, 'BQ_DATASET is required'),
  SUPABASE_URL: z.string().url().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  LOG_PRETTY: booleanString.optional(),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const formatted = parsed.error.format();
  throw new Error(`Invalid environment configuration: ${JSON.stringify(formatted, null, 2)}`);
}

export const appConfig = {
  googleApplicationCredentials: parsed.data.GOOGLE_APPLICATION_CREDENTIALS,
  bigQueryProject: parsed.data.BQ_PROJECT,
  bigQueryDataset: parsed.data.BQ_DATASET,
  supabaseUrl: parsed.data.SUPABASE_URL,
  supabaseServiceRoleKey: parsed.data.SUPABASE_SERVICE_ROLE_KEY,
  openAiApiKey: parsed.data.OPENAI_API_KEY,
  logPretty: parsed.data.LOG_PRETTY ?? false,
};
