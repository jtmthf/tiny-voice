import { z } from 'zod/v4';
import type { ConfigValues } from './config';

function booleanFromString() {
  return z.enum(['true', 'false']).transform((val) => val === 'true');
}

export const ConfigSchema = z.object({
  DATABASE_PATH: z.string().min(1),
  PDF_GENERATOR: z.enum(['pdfkit', 'stub']),
  LATE_FEES_ENABLED: booleanFromString(),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']),
  NODE_ENV: z.enum(['development', 'production', 'test']),
}) satisfies z.ZodType<ConfigValues>;
