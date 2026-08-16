/** Cores bem distintas para identificar profissionais na agenda */
export const PROFESSIONAL_COLORS = [
  { hex: "#1D4ED8", label: "Azul" },
  { hex: "#DC2626", label: "Vermelho" },
  { hex: "#EAB308", label: "Amarelo" },
  { hex: "#2563EB", label: "Azul claro" },
  { hex: "#B91C1C", label: "Vermelho escuro" },
  { hex: "#CA8A04", label: "Amarelo ouro" },
  { hex: "#0EA5E9", label: "Azul céu" },
  { hex: "#F97316", label: "Laranja-vermelho" },
] as const;

export const DEFAULT_PROFESSIONAL_COLOR = PROFESSIONAL_COLORS[0].hex;

export function nextProfessionalColor(used: string[]) {
  const normalized = used.map((c) => c.toLowerCase());
  const free = PROFESSIONAL_COLORS.find((c) => !normalized.includes(c.hex.toLowerCase()));
  if (free) return free.hex;
  return PROFESSIONAL_COLORS[used.length % PROFESSIONAL_COLORS.length].hex;
}
