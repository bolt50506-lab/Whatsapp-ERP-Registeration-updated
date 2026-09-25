import { createHash, randomBytes } from 'crypto';

export function generateApiKey(): string {
  const prefix = 'weg_';
  const key = randomBytes(32).toString('hex');
  return prefix + key;
}

export function hashApiKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}

export function getKeyPrefix(key: string): string {
  return key.substring(0, 12) + '...';
}

export function generateWebhookSecret(): string {
  return randomBytes(24).toString('hex');
}

export function generateReportToken(): string {
  return randomBytes(32).toString('hex');
}
