import { Injectable, Logger } from "@nestjs/common";

export type WhatsAppSendResult = {
  ok: boolean;
  status: "sent" | "skipped" | "simulated" | "error";
  to?: string;
  from?: string;
  provider?: string;
  message?: string;
  detail?: string;
  waUrl?: string;
};

function digitsOnly(value: string) {
  return value.replace(/\D/g, "");
}

/** Normaliza telefone BR para E.164 sem +: 5548999999999 */
export function normalizeBrazilWhatsApp(phone?: string | null): string | null {
  if (!phone) return null;
  let d = digitsOnly(phone);
  if (!d) return null;
  if (d.startsWith("0")) d = d.slice(1);
  if (d.length <= 11) d = `55${d}`;
  if (!d.startsWith("55")) d = `55${d}`;
  // 55 + DDD(2) + número (8 ou 9)
  if (d.length < 12 || d.length > 13) return null;
  return d;
}

function formatClinicDisplay(e164: string) {
  // 5548984882418 → +55 48 98488-2418
  if (e164.length === 13) {
    return `+${e164.slice(0, 2)} ${e164.slice(2, 4)} ${e164.slice(4, 9)}-${e164.slice(9)}`;
  }
  if (e164.length === 12) {
    return `+${e164.slice(0, 2)} ${e164.slice(2, 4)} ${e164.slice(4, 8)}-${e164.slice(8)}`;
  }
  return `+${e164}`;
}

function relativeDayLabel(startsAt: Date) {
  const tz = "America/Sao_Paulo";
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const dayKey = (d: Date) => fmt.format(d);
  const today = new Date();
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const key = dayKey(startsAt);
  if (key === dayKey(today)) return "hoje";
  if (key === dayKey(tomorrow)) return "amanhã";
  return null;
}

@Injectable()
export class WhatsappService {
  private readonly logger = new Logger(WhatsappService.name);

  /** Número oficial da clínica (origem dos envios). Default: +55 48 98488-2418 */
  clinicFromNumber() {
    const raw =
      process.env.CLINIC_WHATSAPP ||
      process.env.WHATSAPP_FROM ||
      "5548984882418";
    return normalizeBrazilWhatsApp(raw) || "5548984882418";
  }

  clinicFromDisplay() {
    return formatClinicDisplay(this.clinicFromNumber());
  }

  get provider() {
    return (process.env.WHATSAPP_PROVIDER || "console").toLowerCase();
  }

  isConfigured() {
    const p = this.provider;
    if (p === "console" || p === "none") return p === "console";
    if (p === "evolution") {
      return Boolean(
        process.env.WHATSAPP_EVOLUTION_URL &&
          process.env.WHATSAPP_EVOLUTION_INSTANCE &&
          process.env.WHATSAPP_EVOLUTION_APIKEY,
      );
    }
    if (p === "meta") {
      return Boolean(process.env.WHATSAPP_META_TOKEN && process.env.WHATSAPP_META_PHONE_ID);
    }
    return false;
  }

  private clinicName() {
    return process.env.CLINIC_NAME || "Equilíbrio Fisioterapia e Bem-Estar";
  }

  private messageFooter() {
    return (
      `\n\n—\n` +
      `${this.clinicName()}\n` +
      `WhatsApp: ${this.clinicFromDisplay()}`
    );
  }

  private formatWhen(startsAt: Date) {
    const relative = relativeDayLabel(startsAt);
    const when = startsAt.toLocaleString("pt-BR", {
      timeZone: "America/Sao_Paulo",
      weekday: "long",
      day: "2-digit",
      month: "long",
      hour: "2-digit",
      minute: "2-digit",
    });
    return relative ? `${relative}, ${when}` : when;
  }

  welcomeMessage(patientName: string) {
    const clinic = this.clinicName();
    const first = patientName.trim().split(/\s+/)[0] || "olá";
    return (
      `Olá, ${first}! 🌿\n\n` +
      `Seja bem-vindo(a) à *${clinic}*.\n\n` +
      `Seu cadastro foi realizado com sucesso. Estamos à disposição para cuidar da sua saúde e bem-estar.\n\n` +
      `Qualquer dúvida, é só responder esta mensagem.` +
      this.messageFooter()
    );
  }

  appointmentReminderMessage(params: {
    patientName: string;
    startsAt: Date;
    serviceName: string;
    professionalName: string;
    roomName?: string | null;
  }) {
    const clinic = this.clinicName();
    const first = params.patientName.trim().split(/\s+/)[0] || "olá";
    const when = this.formatWhen(params.startsAt);
    const room = params.roomName?.trim()
      ? `\n📍 Sala: ${params.roomName.trim()}`
      : "";
    return (
      `Olá, ${first}! 🌿\n\n` +
      `Lembrete do seu atendimento na *${clinic}*.\n\n` +
      `📅 ${when}\n` +
      `🩺 ${params.serviceName}\n` +
      `👤 Com ${params.professionalName}` +
      `${room}\n\n` +
      `Se precisar remarcar ou tiver qualquer dúvida, responda por aqui ou fale conosco no WhatsApp da clínica.\n` +
      `Aguardamos você!` +
      this.messageFooter()
    );
  }

  classReminderMessage(params: {
    patientName: string;
    startsAt: Date;
    title: string;
    professionalName: string;
    roomName?: string | null;
  }) {
    const clinic = this.clinicName();
    const first = params.patientName.trim().split(/\s+/)[0] || "olá";
    const when = this.formatWhen(params.startsAt);
    const room = params.roomName?.trim()
      ? `\n📍 Sala: ${params.roomName.trim()}`
      : "";
    return (
      `Olá, ${first}! 🌿\n\n` +
      `Lembrete da sua aula de Pilates na *${clinic}*.\n\n` +
      `📅 ${when}\n` +
      `🧘‍♀️ ${params.title}\n` +
      `👤 Com ${params.professionalName}` +
      `${room}\n\n` +
      `Contamos com a sua presença. Se não puder vir, avise com antecedência por este WhatsApp, por favor.\n` +
      `Até breve!` +
      this.messageFooter()
    );
  }

  /** Link para abrir conversa com o paciente (enviar pelo WhatsApp da clínica). */
  waMeUrl(phone: string | null | undefined, text: string) {
    const to = normalizeBrazilWhatsApp(phone);
    if (!to) return undefined;
    return `https://wa.me/${to}?text=${encodeURIComponent(text)}`;
  }

  configPublic() {
    return {
      from: this.clinicFromNumber(),
      fromDisplay: this.clinicFromDisplay(),
      provider: this.provider,
      configured: this.isConfigured(),
    };
  }

  async sendText(toRaw: string, text: string): Promise<WhatsAppSendResult> {
    const to = normalizeBrazilWhatsApp(toRaw);
    const from = this.clinicFromNumber();
    if (!to) {
      return {
        ok: false,
        status: "skipped",
        from,
        detail: "Telefone/WhatsApp inválido",
      };
    }

    const provider = this.provider;
    const waUrl = this.waMeUrl(to, text);

    if (provider === "none") {
      return {
        ok: false,
        status: "skipped",
        to,
        from,
        provider,
        detail: "WhatsApp desativado",
        waUrl,
      };
    }

    if (provider === "console") {
      this.logger.log(
        `[WhatsApp simulado] de ${from} (${this.clinicFromDisplay()}) para ${to}: ${text}`,
      );
      return {
        ok: true,
        status: "simulated",
        to,
        from,
        provider,
        message: text,
        waUrl,
        detail: `Abra o WhatsApp da clínica ${this.clinicFromDisplay()} e envie a mensagem`,
      };
    }

    try {
      if (provider === "evolution") {
        const sent = await this.sendEvolution(to, text);
        return { ...sent, from, waUrl: waUrl || sent.waUrl };
      }
      if (provider === "meta") {
        const sent = await this.sendMeta(to, text);
        return { ...sent, from, waUrl: waUrl || sent.waUrl };
      }
      return {
        ok: false,
        status: "error",
        to,
        from,
        provider,
        detail: `Provedor WhatsApp desconhecido: ${provider}`,
        waUrl,
      };
    } catch (err) {
      const detail = err instanceof Error ? err.message : "Falha ao enviar WhatsApp";
      this.logger.error(detail);
      return { ok: false, status: "error", to, from, provider, detail, waUrl };
    }
  }

  async sendWelcome(patientName: string, phone?: string | null): Promise<WhatsAppSendResult> {
    if (!phone) {
      return {
        ok: false,
        status: "skipped",
        from: this.clinicFromNumber(),
        detail: "Paciente sem WhatsApp/telefone",
      };
    }
    const text = this.welcomeMessage(patientName);
    return this.sendText(phone, text);
  }

  private async sendEvolution(to: string, text: string): Promise<WhatsAppSendResult> {
    const base = (process.env.WHATSAPP_EVOLUTION_URL || "").replace(/\/$/, "");
    const instance = process.env.WHATSAPP_EVOLUTION_INSTANCE || "";
    const apikey = process.env.WHATSAPP_EVOLUTION_APIKEY || "";
    if (!base || !instance || !apikey) {
      return {
        ok: false,
        status: "error",
        to,
        provider: "evolution",
        detail: "Evolution API não configurada (.env)",
      };
    }

    const res = await fetch(`${base}/message/sendText/${instance}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey,
      },
      body: JSON.stringify({
        number: to,
        text,
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Evolution API ${res.status}: ${body.slice(0, 200)}`);
    }

    return {
      ok: true,
      status: "sent",
      to,
      provider: "evolution",
      message: text,
      detail: `Mensagem enviada via Evolution (origem ${this.clinicFromDisplay()})`,
    };
  }

  private async sendMeta(to: string, text: string): Promise<WhatsAppSendResult> {
    const token = process.env.WHATSAPP_META_TOKEN || "";
    const phoneId = process.env.WHATSAPP_META_PHONE_ID || "";
    if (!token || !phoneId) {
      return {
        ok: false,
        status: "error",
        to,
        provider: "meta",
        detail: "Meta Cloud API não configurada (.env)",
      };
    }

    const res = await fetch(`https://graph.facebook.com/v19.0/${phoneId}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to,
        type: "text",
        text: { body: text },
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Meta API ${res.status}: ${body.slice(0, 200)}`);
    }

    return {
      ok: true,
      status: "sent",
      to,
      provider: "meta",
      message: text,
      detail: `Mensagem enviada via Meta (origem ${this.clinicFromDisplay()})`,
    };
  }
}
