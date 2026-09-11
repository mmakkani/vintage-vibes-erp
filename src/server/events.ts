import { Request, Response } from 'express';

export interface SyncEvent {
  type: 'ENTITY_MUTATED' | 'SYNC_TRIGGER' | 'BROADCAST_MESSAGE';
  module: 'FINANCE' | 'PURCHASE' | 'SALES' | 'PARTIES' | 'HR' | 'SETUP' | 'AUDIT' | 'AUTH' | 'MARKETING' | 'ALL';
  entity: string;
  action: 'CREATE' | 'UPDATE' | 'DELETE' | 'POST' | 'UNPOST' | 'BATCH';
  documentRef?: string;
  userId?: string;
  userName?: string;
  timestamp: string;
  data?: any;
}

interface SSEClient {
  id: string;
  res: Response;
  connectedAt: string;
  ip: string;
}

class EventHub {
  private clients: Map<string, SSEClient> = new Map();
  private pingInterval: NodeJS.Timeout | null = null;

  constructor() {
    // Send periodic SSE keep-alive comments to prevent intermediary proxy timeouts
    this.pingInterval = setInterval(() => {
      this.sendKeepAlive();
    }, 25000);
  }

  public subscribe(req: Request, res: Response) {
    // Standard Server-Sent Events headers
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no' // Prevent Nginx reverse proxy buffering
    });

    const clientId = `client-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    const clientIp = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || 'unknown';

    const client: SSEClient = {
      id: clientId,
      res,
      connectedAt: new Date().toISOString(),
      ip: clientIp
    };

    this.clients.set(clientId, client);

    // Initial handshake packet
    res.write(`data: ${JSON.stringify({
      type: 'CONNECTED',
      clientId,
      activeClientsCount: this.clients.size,
      serverTime: new Date().toISOString(),
      message: 'Multi-User Real-time Sync Active'
    })}\n\n`);

    // Handle client disconnect
    req.on('close', () => {
      this.clients.delete(clientId);
    });
  }

  public broadcast(event: Omit<SyncEvent, 'timestamp'>) {
    const fullEvent: SyncEvent = {
      ...event,
      timestamp: new Date().toISOString()
    };

    const payload = `data: ${JSON.stringify(fullEvent)}\n\n`;

    this.clients.forEach((client, id) => {
      try {
        client.res.write(payload);
      } catch (err) {
        // If socket is closed or faulted, remove client
        this.clients.delete(id);
      }
    });
  }

  private sendKeepAlive() {
    this.clients.forEach((client, id) => {
      try {
        client.res.write(`: ping\n\n`);
      } catch (err) {
        this.clients.delete(id);
      }
    });
  }

  public getStatus() {
    return {
      activeSubscribers: this.clients.size,
      serverUptimeSec: Math.floor(process.uptime()),
      timestamp: new Date().toISOString()
    };
  }
}

export const eventHub = new EventHub();
