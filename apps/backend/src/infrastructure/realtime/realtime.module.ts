import { type DynamicModule, Global, Module, type ModuleMetadata, type Type } from '@nestjs/common';
import { REALTIME_AUTHENTICATOR, type RealtimeAuthenticator } from './realtime-authenticator';
import { RealtimeGateway } from './realtime.gateway';
import { RealtimeService } from './realtime.service';

export interface RealtimeModuleOptions {
  /** Modules that export the authenticator implementation (e.g. AuthModule). */
  imports: ModuleMetadata['imports'];
  /** Class implementing RealtimeAuthenticator, resolved from `imports`. */
  authenticator: Type<RealtimeAuthenticator>;
}

/**
 * Realtime infrastructure: Socket.IO gateway (`/realtime`) + RealtimeService
 * (`emitToFamily`, `emitToUser`, room membership). Global so feature modules inject
 * RealtimeService without importing this module. The authenticator is supplied by the
 * application root (AppModule), keeping infrastructure independent of feature modules.
 */
@Global()
@Module({})
export class RealtimeModule {
  static forRoot(options: RealtimeModuleOptions): DynamicModule {
    return {
      module: RealtimeModule,
      imports: options.imports ?? [],
      providers: [
        { provide: REALTIME_AUTHENTICATOR, useExisting: options.authenticator },
        RealtimeGateway,
        RealtimeService,
      ],
      exports: [RealtimeService],
    };
  }
}
