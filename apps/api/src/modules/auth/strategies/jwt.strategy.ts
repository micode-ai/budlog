import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { UsersService } from '../../users/users.service';

interface JwtPayload {
  sub: string;
  email: string;
  iat?: number;
}

/**
 * Rejects a token issued before the user's last password change (session
 * invalidation after `resetPassword`). `iat` is in seconds — compare at second
 * granularity so a token minted in the same second as the reset still passes.
 */
export function isTokenStale(iat: number | undefined, passwordChangedAt: Date | null): boolean {
  if (!passwordChangedAt || !iat) return false;
  return iat < Math.floor(passwordChangedAt.getTime() / 1000);
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private readonly configService: ConfigService,
    private readonly usersService: UsersService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('JWT_SECRET'),
    });
  }

  async validate(payload: JwtPayload) {
    const user = await this.usersService.findById(payload.sub);

    if (!user || !user.isActive) {
      throw new UnauthorizedException();
    }
    if (isTokenStale(payload.iat, user.passwordChangedAt)) {
      throw new UnauthorizedException('Token invalidated by password change');
    }

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      currencyCode: user.currencyCode,
      defaultAccountId: user.defaultAccountId,
    };
  }
}
