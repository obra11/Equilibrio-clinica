import { Body, Controller, Get, Post, Req, UseGuards } from "@nestjs/common";
import { AuthService } from "./auth.service";
import { JwtAuthGuard } from "../common/guards";
import { consumeRateLimit } from "../common/rate-limit";

@Controller("auth")
export class AuthController {
  constructor(private auth: AuthService) {}

  @Post("login")
  login(
    @Req() req: { ip?: string; headers?: { "x-forwarded-for"?: string } },
    @Body() body: { email: string; password: string },
  ) {
    const email = (body.email || "").toLowerCase().trim();
    const ip =
      req.headers?.["x-forwarded-for"]?.split(",")[0]?.trim() || req.ip || "unknown";
    consumeRateLimit(`login:${ip}:${email}`, 10, 15 * 60 * 1000);
    consumeRateLimit(`login-ip:${ip}`, 40, 15 * 60 * 1000);
    return this.auth.login(email, body.password);
  }

  @UseGuards(JwtAuthGuard)
  @Get("me")
  me(@Req() req: { user: { userId: string } }) {
    return this.auth.me(req.user.userId);
  }
}
