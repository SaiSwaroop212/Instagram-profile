// ============================================================================
// Validated Application Configuration (PRD 04 - Requirement JS-D01)
// ============================================================================

export interface AppConfig {
  port: number;
  frontendOrigin: string;
  demoUserId: string;
  databaseUrl: string;
  databaseConnectTimeoutMs: number;
}

export function validateConfig(): AppConfig {
  const port = Number(process.env.PORT) || 3001;
  const frontendOrigin = process.env.FRONTEND_ORIGIN || 'http://localhost:5173';
  const demoUserId = process.env.DEMO_USER_ID || 'a0000000-0000-4000-8000-000000000001';
  const databaseUrl = process.env.DATABASE_URL;
  const databaseConnectTimeoutMs = Number(process.env.DATABASE_CONNECT_TIMEOUT_MS) || 5000;

  if (!databaseUrl) {
    throw new Error(
      'Configuration Error: DATABASE_URL is missing. Please set DATABASE_URL in your environment or .env file.'
    );
  }

  if (isNaN(port) || port <= 0 || port > 65535) {
    throw new Error(`Configuration Error: PORT must be a valid port number, received: ${process.env.PORT}`);
  }

  return {
    port,
    frontendOrigin,
    demoUserId,
    databaseUrl,
    databaseConnectTimeoutMs,
  };
}

// Sanitizes connection strings to prevent credential leaks in logs
export function maskDatabaseUrl(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.password) {
      parsed.password = '****';
    }
    return parsed.toString();
  } catch {
    return 'postgresql://[masked]';
  }
}

export const config = validateConfig();