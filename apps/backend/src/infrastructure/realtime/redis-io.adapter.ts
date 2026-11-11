import { type INestApplicationContext, Logger } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { Redis } from 'ioredis';
import { type Server, type ServerOptions } from 'socket.io';
import { type RedisConfig } from '../../config/configuration';

/**
 * Socket.IO adapter backed by Redis pub/sub (@socket.io/redis-adapter): a broadcast to
 * `family:{id}` reaches sockets connected to ANY backend instance (horizontal scaling,
 * NFR §9 sync < 2 s). Uses two dedicated connections (pub + sub), closed with the app.
 */
export class RedisIoAdapter extends IoAdapter {
  private readonly adapterLogger = new Logger(RedisIoAdapter.name);
  private pubClient: Redis | null = null;
  private subClient: Redis | null = null;
  private adapterFactory: ReturnType<typeof createAdapter> | null = null;

  constructor(app: INestApplicationContext) {
    super(app);
  }

  async connectToRedis(config: RedisConfig): Promise<void> {
    const options = {
      host: config.host,
      port: config.port,
      password: config.password,
      lazyConnect: true,
      connectionName: 'dctl-socketio',
    };
    this.pubClient = new Redis(options);
    this.subClient = this.pubClient.duplicate();
    for (const client of [this.pubClient, this.subClient]) {
      client.on('error', (error: Error) =>
        this.adapterLogger.warn(`Redis error: ${error.message}`),
      );
    }
    await Promise.all([this.pubClient.connect(), this.subClient.connect()]);
    this.adapterFactory = createAdapter(this.pubClient, this.subClient);
  }

  override createIOServer(port: number, options?: ServerOptions): Server {
    const server = super.createIOServer(port, options) as Server;
    if (this.adapterFactory) {
      server.adapter(this.adapterFactory);
    }
    return server;
  }

  /** Nest may call close() once per gateway namespace: release Redis exactly once. */
  override async close(server: Server): Promise<void> {
    await super.close(server);
    const clients = [this.pubClient, this.subClient];
    this.pubClient = null;
    this.subClient = null;
    await Promise.all(
      clients.map(async (client) => {
        if (!client || client.status === 'end') {
          return;
        }
        try {
          await client.quit();
        } catch {
          client.disconnect();
        }
      }),
    );
  }
}
