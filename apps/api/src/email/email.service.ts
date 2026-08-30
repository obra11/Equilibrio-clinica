import { Injectable, Logger } from "@nestjs/common";

export type EmailSendResult = {
  ok: boolean;
  status: "sent" | "skipped" | "simulated" | "error";
  to?: string;
  provider?: string;
  subject?: string;
  message?: string;
  detail?: string;
  mailtoUrl?: string;
};

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  get provider() {
    return (process.env.EMAIL_PROVIDER || "console").toLowerCase();
  }

  isConfigured() {
    const p = this.provider;
    if (p === "console" || p === "none") return p === "console";
    if (p === "smtp") {
      return Boolean(process.env.SMTP_HOST && process.env.SMTP_FROM);
    }
    return false;
  }

  private fromAddress() {
    return (
      process.env.SMTP_FROM ||
      process.env.EMAIL_FROM ||
      "Equilíbrio Fisioterapia <noreply@equilibriobe.com.br>"
    ).trim();
  }

  clinicName() {
    return process.env.CLINIC_NAME || "Equilíbrio Fisioterapia e Bem-Estar";
  }

  mailtoUrl(to: string, subject: string, body: string) {
    const q = new URLSearchParams({
      subject,
      body,
    });
    return `mailto:${to}?${q.toString()}`;
  }

  async sendText(params: {
    to: string;
    subject: string;
    text: string;
    html?: string;
  }): Promise<EmailSendResult> {
    const to = (params.to || "").trim().toLowerCase();
    if (!to || !to.includes("@")) {
      return {
        ok: false,
        status: "skipped",
        detail: "E-mail inválido ou ausente",
      };
    }

    const mailtoUrl = this.mailtoUrl(to, params.subject, params.text);
    const provider = this.provider;

    if (provider === "none") {
      return {
        ok: false,
        status: "skipped",
        to,
        provider,
        detail: "E-mail desativado",
        mailtoUrl,
      };
    }

    if (provider === "console") {
      this.logger.log(
        `[E-mail simulado] para ${to} | ${params.subject}\n${params.text}`,
      );
      return {
        ok: true,
        status: "simulated",
        to,
        provider,
        subject: params.subject,
        message: params.text,
        detail: "Abra o e-mail da clínica e confirme o envio (modo simulado)",
        mailtoUrl,
      };
    }

    if (provider === "smtp") {
      try {
        const host = process.env.SMTP_HOST || "";
        const port = Number(process.env.SMTP_PORT || 587);
        const user = process.env.SMTP_USER || "";
        const pass = process.env.SMTP_PASS || "";
        const secure = process.env.SMTP_SECURE === "true" || port === 465;

        if (!host) {
          return {
            ok: false,
            status: "error",
            to,
            provider,
            detail: "SMTP_HOST não configurado",
            mailtoUrl,
          };
        }

        const nodemailer = await import("nodemailer");
        const transporter = nodemailer.createTransport({
          host,
          port,
          secure,
          auth: user ? { user, pass } : undefined,
        });

        await transporter.sendMail({
          from: this.fromAddress(),
          to,
          subject: params.subject,
          text: params.text,
          html: params.html || params.text.replace(/\n/g, "<br/>"),
        });

        return {
          ok: true,
          status: "sent",
          to,
          provider,
          subject: params.subject,
          message: params.text,
          detail: "E-mail enviado via SMTP",
          mailtoUrl,
        };
      } catch (err) {
        const detail = err instanceof Error ? err.message : "Falha ao enviar e-mail";
        this.logger.error(detail);
        return { ok: false, status: "error", to, provider, detail, mailtoUrl };
      }
    }

    return {
      ok: false,
      status: "error",
      to,
      provider,
      detail: `Provedor de e-mail desconhecido: ${provider}`,
      mailtoUrl,
    };
  }
}
