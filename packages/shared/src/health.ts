import { z } from 'zod';

export const checkStatusSchema = z.enum(['up', 'down']);

const formatSupportSchema = z.object({
  input: z.boolean(),
  output: z.boolean(),
});

export const healthResponseSchema = z.object({
  status: z.enum(['ok', 'degraded']),
  version: z.string(),
  uptimeSeconds: z.number(),
  timestamp: z.string(),
  checks: z.object({
    database: z.object({
      status: checkStatusSchema,
      latencyMs: z.number().optional(),
      message: z.string().optional(),
    }),
    imageEngine: z.object({
      status: checkStatusSchema,
      sharpVersion: z.string().optional(),
      libvipsVersion: z.string().optional(),
      formats: z.record(z.string(), formatSupportSchema).optional(),
      message: z.string().optional(),
    }),
  }),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;
