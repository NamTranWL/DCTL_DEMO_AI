import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { jwtConfig, type JwtConfig } from '../../config/configuration';
import { UsersModule } from '../users/users.module';
import { AuthController } from './auth.controller';
import { AccessTokenAuthenticator } from './access-token.authenticator';
import { AuthService } from './auth.service';
import { FamilyMemberGuard } from './guards/family-member.guard';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { PasswordHasher } from './password-hasher.service';
import { RefreshTokenRepository } from './repositories/refresh-token.repository';
import { TokenService } from './token.service';

/**
 * Module auth (UC-AUTH-01/02). Registers the three global guards, executed in order:
 * JwtAuthGuard (who are you?) → RolesGuard (@Roles) → FamilyMemberGuard (@RequireFamily).
 * AccessTokenAuthenticator is exported: AppModule binds it as the realtime gateway's
 * RealtimeAuthenticator (WebSocket handshake, B6).
 */
@Module({
  imports: [
    UsersModule,
    JwtModule.registerAsync({
      inject: [jwtConfig.KEY],
      useFactory: (config: JwtConfig) => ({
        secret: config.secret,
        signOptions: { algorithm: 'HS256' },
        verifyOptions: { algorithms: ['HS256'] },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    TokenService,
    AccessTokenAuthenticator,
    PasswordHasher,
    RefreshTokenRepository,
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: FamilyMemberGuard },
  ],
  exports: [TokenService, PasswordHasher, AccessTokenAuthenticator],
})
export class AuthModule {}
