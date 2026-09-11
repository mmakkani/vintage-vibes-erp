export interface PrismaClientLike {
  $connect?: () => Promise<void>;
  $disconnect?: () => Promise<void>;
  $transaction?: <T>(fn: (tx: any) => Promise<T>) => Promise<T>;
  [key: string]: any;
}

let prismaInstance: PrismaClientLike | null = null;
let isPrismaAvailable = false;

/**
 * In-Memory Mock Storage & Optional PostgreSQL Connector.
 * In trial/testing mode, the ERP backend runs 100% locally on the ACID-compliant
 * in-memory transactional RelationalStore with zero database setup or secrets needed.
 */
export function getPrismaClient(): PrismaClientLike | null {
  const dbUrl = process.env.DATABASE_URL;

  if (!dbUrl || dbUrl.trim() === '') {
    return null;
  }

  if (!prismaInstance) {
    try {
      // Lazy load PrismaClient safely if user opts in
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const prismaModule = (typeof require !== 'undefined') ? require('@prisma/client') : null;
      const ClientClass = prismaModule?.PrismaClient;
      if (ClientClass) {
        prismaInstance = new ClientClass({
          datasources: {
            db: {
              url: dbUrl
            }
          },
          log: process.env.NODE_ENV === 'development' ? ['query', 'warn', 'error'] : ['error']
        });
        isPrismaAvailable = true;
        console.log('[Storage Engine] PostgreSQL client attached via DATABASE_URL.');
      }
    } catch {
      prismaInstance = null;
      isPrismaAvailable = false;
    }
  }

  return prismaInstance;
}

export function isDatabaseConnected(): boolean {
  return !!process.env.DATABASE_URL && isPrismaAvailable;
}

export function getStorageMode(): 'IN_MEMORY_MOCK' | 'EXTERNAL_POSTGRES' {
  return isDatabaseConnected() ? 'EXTERNAL_POSTGRES' : 'IN_MEMORY_MOCK';
}
