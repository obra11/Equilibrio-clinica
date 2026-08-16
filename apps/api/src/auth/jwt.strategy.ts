import { Injectable, UnauthorizedException } from "@nestjs/common";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";
import { assertJwtSecret } from "../common/jwt-secret";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private prisma: PrismaService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: assertJwtSecret(),
    });
  }

  async validate(payload: { sub: string }) {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      include: { professional: { select: { id: true, active: true } } },
    });
    if (!user || !user.active) {
      throw new UnauthorizedException("Sessão inválida ou usuário inativo");
    }
    return {
      userId: user.id,
      email: user.email,
      role: user.role,
      professionalId: user.professional?.active ? user.professional.id : null,
    };
  }
}
