import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { UsersService } from '../users/users.service';
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly userService: UsersService) {
    // private configService: ConfigService
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      // secretOrKey: 'bookmarksecret',
      secretOrKey: process.env.SECRET,
    });
  }

  async validate(data: any): Promise<any> {
    const user = await this.userService.validateUser(data.email);
    if (!user) {
      throw new UnauthorizedException();
    }
    return user;
  }
}