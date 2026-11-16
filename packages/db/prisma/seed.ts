/**
 * Idempotent seed: safe to run repeatedly. Creates plans, built-in presets,
 * AI model catalogue entries (disabled until the AI service is installed) and
 * default platform settings. It never creates users or fake statistics.
 */
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createPrismaClient } from '../src/index';

const rootEnv = fileURLToPath(new URL('../../../.env', import.meta.url));
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);

const prisma = createPrismaClient(process.env.DATABASE_URL ?? '');

const MB = 1024n * 1024n;
const GB = 1024n * MB;

// Paid plans start INACTIVE with price 0. An admin sets real prices and
// activates them once a payment provider is configured (Phase 8).
const plans = [
  {
    code: 'free', name: 'Free', sortOrder: 0, isActive: true,
    description: 'Standard resizing, compression and conversion.',
    dailyJobLimit: 25, maxUploadBytes: 10n * MB, maxInputPixels: 25_000_000, maxBatchSize: 5,
    monthlyAiCredits: 0, storageQuotaBytes: 0n, historyRetentionDays: 1,
    features: { batch: true, aiUpscale: false, history: false, api: false, advancedCompression: false },
  },
  {
    code: 'pro', name: 'Pro', sortOrder: 1, isActive: false,
    description: 'Higher limits, larger uploads, batch processing and history.',
    dailyJobLimit: 500, maxUploadBytes: 50n * MB, maxInputPixels: 50_000_000, maxBatchSize: 50,
    monthlyAiCredits: 0, storageQuotaBytes: 5n * GB, historyRetentionDays: 30,
    features: { batch: true, aiUpscale: false, history: true, api: false, advancedCompression: true },
  },
  {
    code: 'ai', name: 'AI', sortOrder: 2, isActive: false,
    description: 'Everything in Pro plus AI upscaling credits.',
    dailyJobLimit: 500, maxUploadBytes: 50n * MB, maxInputPixels: 50_000_000, maxBatchSize: 50,
    monthlyAiCredits: 200, storageQuotaBytes: 10n * GB, historyRetentionDays: 30,
    features: { batch: true, aiUpscale: true, history: true, api: false, advancedCompression: true, priority: true },
  },
  {
    code: 'business', name: 'Business', sortOrder: 3, isActive: false,
    description: 'Highest limits, API access and priority support.',
    dailyJobLimit: 5000, maxUploadBytes: 100n * MB, maxInputPixels: 100_000_000, maxBatchSize: 200,
    monthlyAiCredits: 1000, storageQuotaBytes: 50n * GB, historyRetentionDays: 90,
    features: { batch: true, aiUpscale: true, history: true, api: true, advancedCompression: true, priority: true, team: true },
  },
];

const presets = [
  { name: 'Instagram Square', category: 'Instagram', width: 1080, height: 1080 },
  { name: 'Instagram Portrait', category: 'Instagram', width: 1080, height: 1350 },
  { name: 'Instagram Landscape', category: 'Instagram', width: 1080, height: 566 },
  { name: 'Facebook Post', category: 'Facebook', width: 1200, height: 630 },
  { name: 'Facebook Cover', category: 'Facebook', width: 851, height: 315 },
  { name: 'YouTube Thumbnail', category: 'YouTube', width: 1280, height: 720 },
  { name: 'YouTube Banner', category: 'YouTube', width: 2560, height: 1440 },
  { name: 'LinkedIn Post', category: 'LinkedIn', width: 1200, height: 627 },
  { name: 'Website Hero', category: 'Web', width: 1920, height: 1080 },
];

const aiModels = [
  {
    key: 'realesrgan-x2plus', name: 'Real-ESRGAN x2plus', provider: 'LOCAL_ONNX' as const,
    scales: [2], license: 'BSD-3-Clause', maxInputPixels: 2_000_000, creditCost: 1,
  },
  {
    key: 'realesrgan-x4plus', name: 'Real-ESRGAN x4plus', provider: 'LOCAL_ONNX' as const,
    scales: [4], license: 'BSD-3-Clause', maxInputPixels: 1_000_000, creditCost: 2,
  },
];

const settings: Record<string, unknown> = {
  'site.name': 'Pixora',
  'uploads.allowedFormats': ['jpeg', 'png', 'webp', 'avif'],
  'uploads.guestMaxBytes': Number(5n * MB),
  'retention.guestHours': 2,
  'retention.resultHours': 24,
  'features.aiUpscale': false,
  'features.registration': true,
};

async function main(): Promise<void> {
  for (const { code, ...data } of plans) {
    // Existing plans are left untouched so admin edits (prices, limits) are never overwritten.
    await prisma.subscriptionPlan.upsert({ where: { code }, create: { code, ...data }, update: {} });
  }

  for (const [i, p] of presets.entries()) {
    const existing = await prisma.processingPreset.findFirst({ where: { userId: null, name: p.name } });
    if (!existing) {
      await prisma.processingPreset.create({
        data: {
          name: p.name,
          category: p.category,
          sortOrder: i,
          params: { width: p.width, height: p.height, fit: 'cover' },
        },
      });
    }
  }

  for (const { key, ...data } of aiModels) {
    // Disabled until Phase 5 installs and verifies the model weights.
    await prisma.aIModel.upsert({ where: { key }, create: { key, enabled: false, ...data }, update: {} });
  }

  for (const [key, value] of Object.entries(settings)) {
    await prisma.adminSetting.upsert({ where: { key }, create: { key, value: value as object }, update: {} });
  }

  console.log(`Seeded ${plans.length} plans, ${presets.length} presets, ${aiModels.length} AI models, ${Object.keys(settings).length} settings.`);
}

main()
  .catch((err: unknown) => {
    console.error('Seed failed:', err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
