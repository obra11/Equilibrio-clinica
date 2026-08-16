import "../load-env";

import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { PassportModule } from "@nestjs/passport";
import { AuthService } from "./auth.service";
import { AuthController } from "./auth.controller";
import { JwtStrategy } from "./jwt.strategy";
import { assertJwtSecret } from "../common/jwt-secret";

@Module({
  imports: [
    PassportModule,
    JwtModule.register({
      secret: assertJwtSecret(),
      signOptions: {
        expiresIn: "7d",
      },
    }),
  ],
  providers: [AuthService, JwtStrategy],
  controllers: [AuthController],
  exports: [AuthService],
})
export class AuthModule {}
