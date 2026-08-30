"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { api, formatMoney, getStoredUser, getToken } from "@/lib/api";

type Category = { id: string; name: string; kind: string };

type Receivable = {
  id: string;
  description: string;
  amountCents: number;
  paidCents: number;
  status: string;
  dueDate: string;
  invoiceStatus: string;
  recurring?: boolean;
  recurrenceIndex?: number | null;
  recurrenceTotal?: number | null;
  patient?: { fullName: string } | null;
  category?: Category | null;
};

type Payable = {
  id: string;
  description: string;
  amountCents: number;
  paidCents: number;
  status: string;
  dueDate: string;
  vendor?: string | null;
  professionalId?: string | null;
  recurring?: boolean;
  recurrenceIndex?: number | null;
  recurrenceTotal?: number | null;
  category?: Category | null;
  professional?: {
    id: string;
    fullName: string;
    pixKey?: string | null;
    bankName?: string | null;
    bankAgency?: string | null;
    bankAccount?: string | null;
  } | null;
};

type Patient = { id: string; fullName: string };
type ProfessionalOption = {
  id: string;
  fullName: string;
  pixKey?: string | null;
};

type Dashboard = {
  year?: number;
  receberAbertoCents: number;
  pagarAbertoCents: number;
  receberVencidoCents: number;
  pagarVencidoCents: number;
  receberHojeCents: number;
  pagarHojeCents: number;
  receberHoje: Receivable[];
  pagarHoje: Payable[];
  receberVencido: Receivable[];
  pagarVencido: Payable[];
  debtors: Array<{
    patientId: string;
    fullName: string;
    totalCents: number;
    items: number;
  }>;
  openReceivablesCount: number;
  openPayablesCount: number;
  indicators?: {
    inadimplenciaPct: number;
    taxaRecebimentoPct: number;
    ticketMedioCents: number;
    yearBilledCents: number;
    yearReceivedCents: number;
    yearPaidOutCents: number;
    yearNetCents: number;
    futuros30ReceberCents: number;
    futuros30PagarCents: number;
    saldoProjetado30Cents: number;
  };
  cashFlowMonths?: Array<{
    month: number;
    label: string;
    inCents: number;
    outCents: number;
    projectedInCents: number;
    projectedOutCents: number;
    netCents: number;
    projectedNetCents: number;
  }>;
  byCategory?: Array<{
    name: string;
    billedCents: number;
    receivedCents: number;
    openCents: number;
  }>;
  byServiceType?: Array<{
    name: string;
    billedCents: number;
    receivedCents: number;
    count: number;
  }>;
  futurosReceber?: Array<{
    id: string;
    description: string;
    dueDate: string;
    remainingCents: number;
    patientName?: string | null;
    within30: boolean;
  }>;
  futurosPagar?: Array<{
    id: string;
    description: string;
    dueDate: string;
    remainingCents: number;
    vendor?: string | null;
    within30: boolean;
  }>;
};

type Tab = "dashboard" | "receber" | "pagar";
type ListFilter = "todos" | "abertos" | "hoje" | "vencidos" | "pagos";

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfToday() {
  const d = new Date();
  d.setHours(23, 59, 59, 999);
  return d;
}

function remaining(amount: number, paid: number) {
  return Math.max(0, amount - paid);
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("pt-BR");
}

function statusBadge(status: string, dueDate: string) {
  const due = new Date(dueDate);
  const overdue =
    due < startOfToday() && status !== "PAGO" && status !== "CANCELADO";
  if (overdue) return "bg-red-50 text-red-700";
  if (status === "PAGO") return "bg-olive/10 text-olive";
  if (status === "PARCIAL") return "bg-gold/20 text-olive";
  if (status === "CANCELADO") return "bg-cream text-olive-muted";
  return "bg-cream text-olive";
}

function displayStatus(status: string, dueDate: string) {
  const due = new Date(dueDate);
  if (due < startOfToday() && status !== "PAGO" && status !== "CANCELADO") {
    return "VENCIDO";
  }
  return status;
}

export default function FinanceiroPage() {
  const router = useRouter();
  const role = getStoredUser()?.role;
  const canSeePayables = role === "ADMIN";
  const [tab, setTab] = useState<Tab>("dashboard");
  const [listFilter, setListFilter] = useState<ListFilter>("abertos");
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [receivables, setReceivables] = useState<Receivable[]>([]);
  const [payables, setPayables] = useState<Payable[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [professionals, setProfessionals] = useState<ProfessionalOption[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [patientId, setPatientId] = useState("");
  const [professionalId, setProfessionalId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [newCategoryName, setNewCategoryName] = useState("");
  const [showNewCategory, setShowNewCategory] = useState(false);
  const [vendor, setVendor] = useState("");
  const [recurring, setRecurring] = useState(false);
  const [recurrenceMonths, setRecurrenceMonths] = useState("12");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [remindEmail, setRemindEmail] = useState(true);
  const [remindWhatsapp, setRemindWhatsapp] = useState(true);
  const [reminding, setReminding] = useState(false);
  const [remindInfo, setRemindInfo] = useState("");
  const [remindPreview, setRemindPreview] = useState<{
    sampleMessage: string;
    patients: Array<{
      patientId: string;
      fullName: string;
      totalCents: number;
      items: number;
      canEmail: boolean;
      canWhatsapp: boolean;
    }>;
  } | null>(null);
  const [remindResults, setRemindResults] = useState<Array<{
    fullName: string;
    email?: { ok: boolean; status: string; detail?: string };
    whatsapp?: { ok: boolean; status: string; detail?: string; waUrl?: string };
  }> | null>(null);
  const [analyticsYear, setAnalyticsYear] = useState(() => new Date().getFullYear());

  async function loadOverduePreview() {
    try {
      const preview = await api<{
        sampleMessage: string;
        patients: Array<{
          patientId: string;
          fullName: string;
          totalCents: number;
          items: number;
          canEmail: boolean;
          canWhatsapp: boolean;
        }>;
      }>("/finance/overdue-reminders/preview");
      setRemindPreview(preview);
    } catch {
      /* preview opcional */
    }
  }

  async function sendOverdueReminders() {
    const channels: Array<"email" | "whatsapp"> = [];
    if (remindEmail) channels.push("email");
    if (remindWhatsapp) channels.push("whatsapp");
    if (!channels.length) {
      setError("Selecione e-mail e/ou WhatsApp");
      return;
    }
    const n = remindPreview?.patients.length ?? 0;
    const ok = window.confirm(
      n > 0
        ? `Enviar lembrete amigável para ${n} paciente(s) em atraso via ${channels.join(" e ")}?`
        : `Enviar lembretes aos pacientes com títulos vencidos via ${channels.join(" e ")}?`,
    );
    if (!ok) return;
    setReminding(true);
    setError("");
    setRemindInfo("");
    setRemindResults(null);
    try {
      const res = await api<{
        sent: number;
        total?: number;
        detail?: string;
        results: Array<{
          fullName: string;
          email?: { ok: boolean; status: string; detail?: string };
          whatsapp?: { ok: boolean; status: string; detail?: string; waUrl?: string };
        }>;
      }>("/finance/overdue-reminders", {
        method: "POST",
        body: JSON.stringify({ channels }),
      });
      setRemindResults(res.results || []);
      setRemindInfo(
        res.detail ||
          `Lembretes processados: ${res.sent} de ${res.total ?? res.results?.length ?? 0} paciente(s).`,
      );
      await loadOverduePreview();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao enviar lembretes");
    } finally {
      setReminding(false);
    }
  }

  async function load() {
    setLoading(true);
    try {
      const [dash, r, p, pats, pros, cats] = await Promise.all([
        api<Dashboard>(`/finance/dashboard?year=${analyticsYear}`),
        api<Receivable[]>("/finance/receivables"),
        canSeePayables ? api<Payable[]>("/finance/payables") : Promise.resolve([] as Payable[]),
        api<Patient[]>("/patients"),
        api<ProfessionalOption[]>("/professionals"),
        api<Category[]>("/finance/categories"),
      ]);
      setDashboard(dash);
      setReceivables(r);
      setPayables(p);
      setPatients(pats);
      setProfessionals(pros);
      setCategories(cats);
      if (!patientId && pats[0]) setPatientId(pats[0].id);
      loadOverduePreview().catch(() => undefined);
    } finally {
      setLoading(false);
    }
  }

  const kindForTab = tab === "pagar" ? "PAGAR" : "RECEBER";
  const categoriesForTab = useMemo(
    () => categories.filter((c) => c.kind === kindForTab),
    [categories, kindForTab],
  );

  useEffect(() => {
    if (!getToken()) {
      router.replace("/login");
      return;
    }
    if (role !== "ADMIN" && role !== "RECEPCAO") {
      router.replace("/dashboard");
      return;
    }
    load().catch((e) => setError(e.message));
  }, [router, role, analyticsYear]);

  const filteredReceivables = useMemo(() => {
    const todayStart = startOfToday();
    const todayEnd = endOfToday();
    return receivables.filter((r) => {
      const due = new Date(r.dueDate);
      const rest = remaining(r.amountCents, r.paidCents);
      if (listFilter === "pagos") return r.status === "PAGO";
      if (listFilter === "abertos") {
        return rest > 0 && r.status !== "CANCELADO";
      }
      if (listFilter === "hoje") {
        return rest > 0 && due >= todayStart && due <= todayEnd && r.status !== "CANCELADO";
      }
      if (listFilter === "vencidos") {
        return rest > 0 && due < todayStart && r.status !== "CANCELADO" && r.status !== "PAGO";
      }
      return true;
    });
  }, [receivables, listFilter]);

  const filteredPayables = useMemo(() => {
    const todayStart = startOfToday();
    const todayEnd = endOfToday();
    return payables.filter((p) => {
      const due = new Date(p.dueDate);
      const rest = remaining(p.amountCents, p.paidCents);
      if (listFilter === "pagos") return p.status === "PAGO";
      if (listFilter === "abertos") {
        return rest > 0 && p.status !== "CANCELADO";
      }
      if (listFilter === "hoje") {
        return rest > 0 && due >= todayStart && due <= todayEnd && p.status !== "CANCELADO";
      }
      if (listFilter === "vencidos") {
        return rest > 0 && due < todayStart && p.status !== "CANCELADO" && p.status !== "PAGO";
      }
      return true;
    });
  }, [payables, listFilter]);

  async function createCategoryInline() {
    const name = newCategoryName.trim();
    if (!name) return;
    setError("");
    try {
      const created = await api<Category>("/finance/categories", {
        method: "POST",
        body: JSON.stringify({ name, kind: kindForTab }),
      });
      setCategories((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
      setCategoryId(created.id);
      setNewCategoryName("");
      setShowNewCategory(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao criar categoria");
    }
  }

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setError("");
    try {
      const recurrencePayload = {
        recurring,
        recurrenceMonths: recurring ? Number(recurrenceMonths) || 12 : 1,
      };
      if (tab === "receber") {
        await api("/finance/receivables", {
          method: "POST",
          body: JSON.stringify({
            description,
            amount: Number(amount),
            dueDate,
            patientId: patientId || null,
            categoryId: categoryId || null,
            ...recurrencePayload,
          }),
        });
      } else if (tab === "pagar") {
        const pro = professionals.find((x) => x.id === professionalId);
        await api("/finance/payables", {
          method: "POST",
          body: JSON.stringify({
            description,
            amount: Number(amount),
            dueDate,
            vendor: vendor || pro?.fullName || null,
            professionalId: professionalId || null,
            categoryId: categoryId || null,
            ...recurrencePayload,
          }),
        });
      }
      setDescription("");
      setAmount("");
      setDueDate("");
      setVendor("");
      setProfessionalId("");
      setCategoryId("");
      setNewCategoryName("");
      setShowNewCategory(false);
      setRecurring(false);
      setRecurrenceMonths("12");
      setShowForm(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro");
    }
  }

  async function payReceivable(id: string, remainingCents: number) {
    await api(`/finance/receivables/${id}/payments`, {
      method: "POST",
      body: JSON.stringify({ amount: remainingCents / 100, method: "PIX" }),
    });
    await load();
  }

  async function payPayable(id: string, remainingCents: number) {
    await api(`/finance/payables/${id}/payments`, {
      method: "POST",
      body: JSON.stringify({ amount: remainingCents / 100, method: "PIX" }),
    });
    await load();
  }

  const filters: Array<[ListFilter, string]> = [
    ["abertos", "Em aberto"],
    ["hoje", "Vencem hoje"],
    ["vencidos", "Vencidos"],
    ["pagos", "Pagos"],
    ["todos", "Todos"],
  ];

  return (
    <AppShell>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl text-olive">Financeiro</h1>
          <p className="mt-1 text-sm text-olive-muted">
            Fluxo de caixa, indicadores e lançamentos a receber/pagar
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {tab === "dashboard" ? (
            <>
              <label className="flex items-center gap-2 text-sm text-olive">
                Ano
                <select
                  className="eq-input w-28 py-1"
                  value={analyticsYear}
                  onChange={(e) => setAnalyticsYear(Number(e.target.value))}
                >
                  {[0, 1, 2].map((offset) => {
                    const y = new Date().getFullYear() - offset;
                    return (
                      <option key={y} value={y}>
                        {y}
                      </option>
                    );
                  })}
                </select>
              </label>
              <button
                type="button"
                className="eq-btn"
                onClick={() => {
                  setTab("receber");
                  setShowForm(true);
                  setListFilter("abertos");
                }}
              >
                Novo lançamento futuro
              </button>
            </>
          ) : (
            <button type="button" className="eq-btn" onClick={() => setShowForm((v) => !v)}>
              {showForm ? "Fechar formulário" : "Novo lançamento"}
            </button>
          )}
        </div>
      </div>

      <div className="mb-6 flex flex-wrap gap-2">
        {(
          [
            ["dashboard", "Dashboard"],
            ["receber", "A receber"],
            ...(canSeePayables ? ([["pagar", "A pagar"]] as Array<[Tab, string]>) : []),
          ] as Array<[Tab, string]>
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            className={tab === key ? "eq-btn" : "eq-btn-ghost"}
            onClick={() => {
              setTab(key);
              setShowForm(false);
              setListFilter("abertos");
              setCategoryId("");
              setShowNewCategory(false);
              setNewCategoryName("");
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {error ? <p className="mb-4 text-sm text-red-700">{error}</p> : null}
      {remindInfo ? <p className="mb-4 text-sm text-olive">{remindInfo}</p> : null}
      {loading && !dashboard ? <p className="text-olive-muted">Carregando...</p> : null}

      {tab === "dashboard" && dashboard ? (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <div className="eq-card">
              <p className="eq-label">A receber</p>
              <p className="font-display text-3xl text-olive">
                {formatMoney(dashboard.receberAbertoCents)}
              </p>
              <p className="mt-1 text-xs text-olive-muted">
                {dashboard.openReceivablesCount} título(s) em aberto
              </p>
            </div>
            <div className="eq-card">
              <p className="eq-label">A pagar</p>
              <p className="font-display text-3xl text-olive">
                {formatMoney(dashboard.pagarAbertoCents)}
              </p>
              <p className="mt-1 text-xs text-olive-muted">
                {dashboard.openPayablesCount} título(s) em aberto
              </p>
            </div>
            <div className="eq-card border-red-200">
              <p className="eq-label text-red-700">Receber vencido</p>
              <p className="font-display text-3xl text-red-700">
                {formatMoney(dashboard.receberVencidoCents)}
              </p>
              <button
                type="button"
                className="mt-2 text-xs font-semibold text-olive underline"
                onClick={() => {
                  setTab("receber");
                  setListFilter("vencidos");
                }}
              >
                Ver inadimplentes
              </button>
            </div>
            <div className="eq-card border-red-200">
              <p className="eq-label text-red-700">Pagar vencido</p>
              <p className="font-display text-3xl text-red-700">
                {formatMoney(dashboard.pagarVencidoCents)}
              </p>
              <button
                type="button"
                className="mt-2 text-xs font-semibold text-olive underline"
                onClick={() => {
                  setTab("pagar");
                  setListFilter("vencidos");
                }}
              >
                Ver contas vencidas
              </button>
            </div>
          </div>

          {dashboard.indicators ? (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <div className="eq-card">
                <p className="eq-label">Inadimplência</p>
                <p className="font-display text-3xl text-red-700">
                  {dashboard.indicators.inadimplenciaPct}%
                </p>
                <p className="mt-1 text-xs text-olive-muted">
                  Vencido / total em aberto a receber
                </p>
              </div>
              <div className="eq-card">
                <p className="eq-label">Taxa de recebimento ({analyticsYear})</p>
                <p className="font-display text-3xl text-olive">
                  {dashboard.indicators.taxaRecebimentoPct}%
                </p>
                <p className="mt-1 text-xs text-olive-muted">
                  Pago / faturado no ano
                </p>
              </div>
              <div className="eq-card">
                <p className="eq-label">Ticket médio</p>
                <p className="font-display text-3xl text-olive">
                  {formatMoney(dashboard.indicators.ticketMedioCents)}
                </p>
                <p className="mt-1 text-xs text-olive-muted">Por lançamento a receber no ano</p>
              </div>
              <div className="eq-card">
                <p className="eq-label">Resultado do ano</p>
                <p
                  className={`font-display text-3xl ${
                    dashboard.indicators.yearNetCents >= 0 ? "text-olive" : "text-red-700"
                  }`}
                >
                  {formatMoney(dashboard.indicators.yearNetCents)}
                </p>
                <p className="mt-1 text-xs text-olive-muted">
                  Entradas {formatMoney(dashboard.indicators.yearReceivedCents)} − saídas{" "}
                  {formatMoney(dashboard.indicators.yearPaidOutCents)}
                </p>
              </div>
            </div>
          ) : null}

          {dashboard.cashFlowMonths?.length ? (
            <section className="eq-card">
              <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
                <div>
                  <h2 className="font-display text-xl text-olive">
                    Fluxo de caixa {analyticsYear}
                  </h2>
                  <p className="text-sm text-olive-muted">
                    Barras: entradas (recebido) × saídas (pago). Linha guia: a receber em aberto no mês.
                  </p>
                </div>
                {dashboard.indicators ? (
                  <p className="text-xs text-olive-muted">
                    Próx. 30 dias: receber {formatMoney(dashboard.indicators.futuros30ReceberCents)} ·
                    pagar {formatMoney(dashboard.indicators.futuros30PagarCents)} · saldo{" "}
                    {formatMoney(dashboard.indicators.saldoProjetado30Cents)}
                  </p>
                ) : null}
              </div>
              <div className="grid grid-cols-12 items-end gap-1 sm:gap-2" style={{ minHeight: 160 }}>
                {(() => {
                  const maxVal = Math.max(
                    1,
                    ...dashboard.cashFlowMonths.map((m) =>
                      Math.max(m.inCents, m.outCents, m.projectedInCents),
                    ),
                  );
                  return dashboard.cashFlowMonths.map((m) => (
                    <div key={m.month} className="flex flex-col items-center gap-1">
                      <div className="flex h-36 w-full items-end justify-center gap-0.5">
                        <div
                          className="w-1/3 rounded-t bg-olive/80"
                          style={{ height: `${Math.max(4, (m.inCents / maxVal) * 100)}%` }}
                          title={`Entradas: ${formatMoney(m.inCents)}`}
                        />
                        <div
                          className="w-1/3 rounded-t bg-red-400/80"
                          style={{ height: `${Math.max(4, (m.outCents / maxVal) * 100)}%` }}
                          title={`Saídas: ${formatMoney(m.outCents)}`}
                        />
                        <div
                          className="w-1/3 rounded-t bg-gold/70"
                          style={{
                            height: `${Math.max(4, (m.projectedInCents / maxVal) * 100)}%`,
                          }}
                          title={`A receber: ${formatMoney(m.projectedInCents)}`}
                        />
                      </div>
                      <span className="text-[10px] uppercase text-olive-muted">{m.label}</span>
                    </div>
                  ));
                })()}
              </div>
              <div className="mt-3 flex flex-wrap gap-4 text-xs text-olive-muted">
                <span className="inline-flex items-center gap-1">
                  <span className="h-2 w-2 rounded-sm bg-olive/80" /> Entradas
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="h-2 w-2 rounded-sm bg-red-400/80" /> Saídas
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="h-2 w-2 rounded-sm bg-gold/70" /> A receber (em aberto)
                </span>
              </div>
            </section>
          ) : null}

          <div className="grid gap-4 lg:grid-cols-2">
            <section className="eq-card">
              <h2 className="mb-3 font-display text-xl text-olive">
                Arrecadação por tipo de serviço ({analyticsYear})
              </h2>
              {!dashboard.byServiceType?.length ? (
                <p className="text-sm text-olive-muted">
                  Sem dados no ano. Vincule lançamentos a atendimentos ou use categorias.
                </p>
              ) : (
                <div className="space-y-2 text-sm">
                  {dashboard.byServiceType.slice(0, 8).map((s) => {
                    const max = dashboard.byServiceType![0].billedCents || 1;
                    const pct = Math.round((s.billedCents / max) * 100);
                    return (
                      <div key={s.name}>
                        <div className="mb-1 flex justify-between gap-2">
                          <span className="font-medium text-olive">{s.name}</span>
                          <span className="text-olive-muted">
                            {formatMoney(s.billedCents)} · {s.count}×
                          </span>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-cream">
                          <div className="h-full rounded-full bg-olive" style={{ width: `${pct}%` }} />
                        </div>
                        <p className="mt-0.5 text-[10px] text-olive-muted">
                          Recebido {formatMoney(s.receivedCents)}
                        </p>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
            <section className="eq-card">
              <h2 className="mb-3 font-display text-xl text-olive">
                Por categoria ({analyticsYear})
              </h2>
              {!dashboard.byCategory?.length ? (
                <p className="text-sm text-olive-muted">Nenhuma categoria no período.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-borderEq text-xs uppercase text-olive-muted">
                        <th className="py-2 pr-2">Categoria</th>
                        <th className="py-2 pr-2">Faturado</th>
                        <th className="py-2 pr-2">Recebido</th>
                        <th className="py-2">Aberto</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dashboard.byCategory.map((c) => (
                        <tr key={c.name} className="border-b border-borderEq/60">
                          <td className="py-2 pr-2 font-medium">{c.name}</td>
                          <td className="py-2 pr-2">{formatMoney(c.billedCents)}</td>
                          <td className="py-2 pr-2">{formatMoney(c.receivedCents)}</td>
                          <td className="py-2">{formatMoney(c.openCents)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <section className="eq-card">
              <div className="mb-3 flex items-center justify-between gap-2">
                <h2 className="font-display text-xl text-olive">Lançamentos futuros (90 dias)</h2>
                <button
                  type="button"
                  className="text-xs font-semibold text-olive underline"
                  onClick={() => {
                    setTab("receber");
                    setShowForm(true);
                  }}
                >
                  Lançar a receber
                </button>
              </div>
              {!dashboard.futurosReceber?.length ? (
                <p className="text-sm text-olive-muted">Nenhum a receber futuro nos próximos 90 dias.</p>
              ) : (
                <div className="max-h-64 space-y-2 overflow-y-auto text-sm">
                  {dashboard.futurosReceber.map((f) => (
                    <div
                      key={f.id}
                      className="flex justify-between gap-2 border-b border-borderEq/70 py-2"
                    >
                      <div>
                        <p className="font-medium">{f.patientName || f.description}</p>
                        <p className="text-xs text-olive-muted">
                          {formatDate(f.dueDate)}
                          {f.within30 ? " · 30 dias" : ""} · {f.description}
                        </p>
                      </div>
                      <p className="font-semibold text-olive">{formatMoney(f.remainingCents)}</p>
                    </div>
                  ))}
                </div>
              )}
            </section>
            <section className="eq-card">
              <div className="mb-3 flex items-center justify-between gap-2">
                <h2 className="font-display text-xl text-olive">Contas a pagar futuras</h2>
                {canSeePayables ? (
                  <button
                    type="button"
                    className="text-xs font-semibold text-olive underline"
                    onClick={() => {
                      setTab("pagar");
                      setShowForm(true);
                    }}
                  >
                    Lançar a pagar
                  </button>
                ) : null}
              </div>
              {!canSeePayables ? (
                <p className="text-sm text-olive-muted">Disponível para administradores.</p>
              ) : !dashboard.futurosPagar?.length ? (
                <p className="text-sm text-olive-muted">Nenhuma conta futura nos próximos 90 dias.</p>
              ) : (
                <div className="max-h-64 space-y-2 overflow-y-auto text-sm">
                  {dashboard.futurosPagar.map((f) => (
                    <div
                      key={f.id}
                      className="flex justify-between gap-2 border-b border-borderEq/70 py-2"
                    >
                      <div>
                        <p className="font-medium">{f.vendor || f.description}</p>
                        <p className="text-xs text-olive-muted">
                          {formatDate(f.dueDate)}
                          {f.within30 ? " · 30 dias" : ""}
                        </p>
                      </div>
                      <p className="font-semibold text-red-700">{formatMoney(f.remainingCents)}</p>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <section className="eq-card">
              <div className="mb-3 flex items-center justify-between gap-2">
                <h2 className="font-display text-xl text-olive">Alertas de hoje</h2>
                <span className="rounded-full bg-gold/20 px-3 py-1 text-xs font-semibold text-olive">
                  Receber {formatMoney(dashboard.receberHojeCents)} · Pagar{" "}
                  {formatMoney(dashboard.pagarHojeCents)}
                </span>
              </div>
              <div className="space-y-3">
                {dashboard.receberHoje.length === 0 && dashboard.pagarHoje.length === 0 ? (
                  <p className="text-sm text-olive-muted">Nenhum vencimento para hoje.</p>
                ) : null}
                {dashboard.receberHoje.map((r) => (
                  <div
                    key={r.id}
                    className="flex items-start justify-between gap-3 rounded-lg border border-borderEq bg-cream/50 p-3 text-sm"
                  >
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-gold">
                        Receber hoje
                      </p>
                      <p className="font-medium">{r.patient?.fullName || r.description}</p>
                      <p className="text-olive-muted">{r.description}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-olive">
                        {formatMoney(remaining(r.amountCents, r.paidCents))}
                      </p>
                      <button
                        type="button"
                        className="mt-1 text-xs underline"
                        onClick={() => payReceivable(r.id, remaining(r.amountCents, r.paidCents))}
                      >
                        Baixar
                      </button>
                    </div>
                  </div>
                ))}
                {dashboard.pagarHoje.map((p) => (
                  <div
                    key={p.id}
                    className="flex items-start justify-between gap-3 rounded-lg border border-borderEq bg-cream/50 p-3 text-sm"
                  >
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-red-700">
                        Pagar hoje
                      </p>
                      <p className="font-medium">{p.vendor || p.description}</p>
                      <p className="text-olive-muted">{p.description}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-olive">
                        {formatMoney(remaining(p.amountCents, p.paidCents))}
                      </p>
                      <button
                        type="button"
                        className="mt-1 text-xs underline"
                        onClick={() => payPayable(p.id, remaining(p.amountCents, p.paidCents))}
                      >
                        Baixar
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className="eq-card">
              <div className="mb-3 flex items-center justify-between gap-2">
                <h2 className="font-display text-xl text-olive">Quem está devendo</h2>
                <button
                  type="button"
                  className="text-xs font-semibold text-olive underline"
                  onClick={() => {
                    setTab("receber");
                    setListFilter("abertos");
                  }}
                >
                  Ver todos a receber
                </button>
              </div>
              {dashboard.debtors.length === 0 ? (
                <p className="text-sm text-olive-muted">Nenhum paciente com saldo em aberto.</p>
              ) : (
                <div className="space-y-2">
                  {dashboard.debtors.map((d) => (
                    <div
                      key={d.patientId || d.fullName}
                      className="flex items-center justify-between rounded-lg border border-borderEq px-3 py-2 text-sm"
                    >
                      <div>
                        <p className="font-medium text-charcoal">{d.fullName}</p>
                        <p className="text-xs text-olive-muted">{d.items} lançamento(s)</p>
                      </div>
                      <p className="font-semibold text-red-700">{formatMoney(d.totalCents)}</p>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>

          <section className="eq-card">
            <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="font-display text-xl text-olive">Lembrete de atraso</h2>
                <p className="mt-1 text-sm text-olive-muted">
                  Mensagem padrão educada para pacientes com títulos vencidos (e-mail e/ou WhatsApp)
                </p>
              </div>
              <p className="text-xs text-olive-muted">
                {remindPreview?.patients.length ?? 0} paciente(s) elegível(is)
              </p>
            </div>

            <div className="mb-3 flex flex-wrap items-center gap-4 text-sm text-olive">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={remindEmail}
                  onChange={(e) => setRemindEmail(e.target.checked)}
                />
                E-mail
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={remindWhatsapp}
                  onChange={(e) => setRemindWhatsapp(e.target.checked)}
                />
                WhatsApp
              </label>
              <button
                type="button"
                className="eq-btn"
                disabled={reminding || (remindPreview?.patients.length ?? 0) === 0}
                onClick={() => sendOverdueReminders()}
              >
                {reminding ? "Enviando..." : "Enviar lembretes"}
              </button>
            </div>

            {remindPreview?.sampleMessage ? (
              <details className="mb-3 rounded-md border border-borderEq bg-cream/40 p-3 text-sm">
                <summary className="cursor-pointer font-medium text-olive">
                  Ver modelo da mensagem
                </summary>
                <pre className="mt-2 whitespace-pre-wrap font-sans text-xs text-olive-muted">
                  {remindPreview.sampleMessage}
                </pre>
              </details>
            ) : null}

            {remindPreview && remindPreview.patients.length > 0 ? (
              <div className="mb-2 max-h-40 space-y-1 overflow-y-auto text-xs text-olive-muted">
                {remindPreview.patients.map((p) => (
                  <p key={p.patientId}>
                    {p.fullName} · {formatMoney(p.totalCents)} ·{" "}
                    {[p.canEmail ? "e-mail" : null, p.canWhatsapp ? "WhatsApp" : null]
                      .filter(Boolean)
                      .join(" · ") || "sem contato"}
                  </p>
                ))}
              </div>
            ) : (
              <p className="text-sm text-olive-muted">Nenhum vencido com paciente vinculado no momento.</p>
            )}

            {remindResults && remindResults.length > 0 ? (
              <div className="mt-3 space-y-2 border-t border-borderEq pt-3 text-sm">
                <p className="font-medium text-olive">Resultado do envio</p>
                {remindResults.map((r, idx) => (
                  <div key={`${r.fullName}-${idx}`} className="rounded-md border border-borderEq p-2">
                    <p className="font-medium">{r.fullName}</p>
                    {r.email ? (
                      <p className="text-xs text-olive-muted">
                        E-mail: {r.email.ok ? r.email.status : r.email.detail || r.email.status}
                      </p>
                    ) : null}
                    {r.whatsapp ? (
                      <p className="text-xs text-olive-muted">
                        WhatsApp:{" "}
                        {r.whatsapp.ok ? r.whatsapp.status : r.whatsapp.detail || r.whatsapp.status}
                        {r.whatsapp.waUrl ? (
                          <>
                            {" · "}
                            <a
                              href={r.whatsapp.waUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="font-semibold text-olive underline"
                            >
                              Abrir no WhatsApp
                            </a>
                          </>
                        ) : null}
                      </p>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : null}
          </section>

          <div className="grid gap-4 lg:grid-cols-2">
            <section className="eq-card">
              <h2 className="mb-3 font-display text-xl text-olive">Receber vencido</h2>
              {dashboard.receberVencido.length === 0 ? (
                <p className="text-sm text-olive-muted">Sem títulos vencidos.</p>
              ) : (
                <div className="space-y-2 text-sm">
                  {dashboard.receberVencido.map((r) => (
                    <div key={r.id} className="flex justify-between gap-3 border-b border-borderEq/70 py-2">
                      <div>
                        <p className="font-medium">{r.patient?.fullName || "—"}</p>
                        <p className="text-xs text-olive-muted">
                          {r.description} · venceu {formatDate(r.dueDate)}
                        </p>
                      </div>
                      <p className="font-semibold text-red-700">
                        {formatMoney(remaining(r.amountCents, r.paidCents))}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </section>
            <section className="eq-card">
              <h2 className="mb-3 font-display text-xl text-olive">Pagar vencido</h2>
              {dashboard.pagarVencido.length === 0 ? (
                <p className="text-sm text-olive-muted">Sem contas vencidas.</p>
              ) : (
                <div className="space-y-2 text-sm">
                  {dashboard.pagarVencido.map((p) => (
                    <div key={p.id} className="flex justify-between gap-3 border-b border-borderEq/70 py-2">
                      <div>
                        <p className="font-medium">{p.vendor || p.description}</p>
                        <p className="text-xs text-olive-muted">venceu {formatDate(p.dueDate)}</p>
                      </div>
                      <p className="font-semibold text-red-700">
                        {formatMoney(remaining(p.amountCents, p.paidCents))}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        </div>
      ) : null}

      {(tab === "receber" || tab === "pagar") && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {filters.map(([key, label]) => (
              <button
                key={key}
                type="button"
                className={listFilter === key ? "eq-btn" : "eq-btn-ghost"}
                onClick={() => setListFilter(key)}
              >
                {label}
              </button>
            ))}
            {tab === "receber" && listFilter === "vencidos" ? (
              <button
                type="button"
                className="eq-btn-ghost"
                disabled={reminding}
                onClick={() => sendOverdueReminders()}
              >
                {reminding ? "Enviando..." : "Avisar vencidos (e-mail/WhatsApp)"}
              </button>
            ) : null}
          </div>

          {showForm ? (
            <form onSubmit={onCreate} className="eq-card grid gap-3 md:grid-cols-2 lg:grid-cols-4">
              <div className="md:col-span-2 lg:col-span-4">
                <h2 className="font-display text-xl text-olive">
                  Novo {tab === "receber" ? "a receber" : "a pagar"}
                </h2>
              </div>
              <div className="md:col-span-2">
                <label className="eq-label">Descrição</label>
                <input
                  className="eq-input"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  required
                />
              </div>
              <div>
                <label className="eq-label">Valor</label>
                <input
                  className="eq-input"
                  type="number"
                  step="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  required
                />
              </div>
              <div>
                <label className="eq-label">Vencimento</label>
                <input
                  className="eq-input"
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  required
                />
              </div>
              <div className="md:col-span-2 lg:col-span-4 flex flex-wrap items-end gap-3 rounded-md border border-borderEq bg-cream/40 px-3 py-3">
                <label className="flex items-center gap-2 text-sm text-olive">
                  <input
                    type="checkbox"
                    checked={recurring}
                    onChange={(e) => setRecurring(e.target.checked)}
                  />
                  Repete todo mês
                </label>
                {recurring ? (
                  <div className="w-36">
                    <label className="eq-label">Quantos meses</label>
                    <input
                      className="eq-input"
                      type="number"
                      min={2}
                      max={36}
                      value={recurrenceMonths}
                      onChange={(e) => setRecurrenceMonths(e.target.value)}
                      required
                    />
                  </div>
                ) : null}
                {recurring ? (
                  <p className="text-xs text-olive-muted">
                    Serão gerados {recurrenceMonths || "—"} títulos com o mesmo valor, um por mês.
                  </p>
                ) : null}
              </div>
              <div className="md:col-span-2">
                <label className="eq-label">Categoria</label>
                <select
                  className="eq-input"
                  value={categoryId}
                  onChange={(e) => {
                    if (e.target.value === "__new__") {
                      setShowNewCategory(true);
                      return;
                    }
                    setCategoryId(e.target.value);
                    setShowNewCategory(false);
                  }}
                >
                  <option value="">— Sem categoria —</option>
                  {categoriesForTab.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                  <option value="__new__">+ Cadastrar nova categoria</option>
                </select>
                {showNewCategory ? (
                  <div className="mt-2 flex gap-2">
                    <input
                      className="eq-input"
                      value={newCategoryName}
                      onChange={(e) => setNewCategoryName(e.target.value)}
                      placeholder="Nome da categoria"
                    />
                    <button
                      type="button"
                      className="eq-btn whitespace-nowrap px-3"
                      onClick={createCategoryInline}
                    >
                      Salvar
                    </button>
                  </div>
                ) : null}
              </div>
              {tab === "receber" ? (
                <div className="md:col-span-2">
                  <label className="eq-label">Paciente</label>
                  <select
                    className="eq-input"
                    value={patientId}
                    onChange={(e) => setPatientId(e.target.value)}
                  >
                    {patients.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.fullName}
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <>
                  <div className="md:col-span-2">
                    <label className="eq-label">Profissional (repasse)</label>
                    <select
                      className="eq-input"
                      value={professionalId}
                      onChange={(e) => {
                        const id = e.target.value;
                        setProfessionalId(id);
                        const pro = professionals.find((x) => x.id === id);
                        if (pro && !vendor) setVendor(pro.fullName);
                      }}
                    >
                      <option value="">— Fornecedor externo —</option>
                      {professionals.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.fullName}
                          {p.pixKey ? " (PIX cadastrado)" : ""}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="md:col-span-2">
                    <label className="eq-label">Fornecedor / favorecido</label>
                    <input
                      className="eq-input"
                      value={vendor}
                      onChange={(e) => setVendor(e.target.value)}
                      placeholder="Nome no pagamento"
                    />
                  </div>
                </>
              )}
              <div className="flex items-end">
                <button className="eq-btn w-full">Salvar lançamento</button>
              </div>
            </form>
          ) : null}

          <div className="eq-card overflow-x-auto">
            {tab === "receber" ? (
              filteredReceivables.length === 0 ? (
                <p className="py-8 text-center text-sm text-olive-muted">
                  Nenhum título neste filtro.
                </p>
              ) : (
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-borderEq text-xs uppercase tracking-wide text-olive-muted">
                      <th className="py-3 pr-3">Vencimento</th>
                      <th className="pr-3">Paciente</th>
                      <th className="pr-3">Categoria</th>
                      <th className="pr-3">Descrição</th>
                      <th className="pr-3">Valor</th>
                      <th className="pr-3">Em aberto</th>
                      <th className="pr-3">Status</th>
                      <th className="text-right">Ação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredReceivables.map((r) => {
                      const rest = remaining(r.amountCents, r.paidCents);
                      return (
                        <tr key={r.id} className="border-b border-borderEq/70">
                          <td className="py-3 pr-3 whitespace-nowrap">{formatDate(r.dueDate)}</td>
                          <td className="pr-3 font-medium">{r.patient?.fullName || "—"}</td>
                          <td className="pr-3 text-olive-muted">{r.category?.name || "—"}</td>
                          <td className="pr-3 text-olive-muted">
                            {r.description}
                            {r.recurring ? (
                              <span className="ml-2 rounded-full bg-gold/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-olive">
                                Mensal
                                {r.recurrenceIndex && r.recurrenceTotal
                                  ? ` ${r.recurrenceIndex}/${r.recurrenceTotal}`
                                  : ""}
                              </span>
                            ) : null}
                          </td>
                          <td className="pr-3">{formatMoney(r.amountCents)}</td>
                          <td className="pr-3 font-semibold">{formatMoney(rest)}</td>
                          <td className="pr-3">
                            <span
                              className={`rounded-full px-2 py-0.5 text-xs font-semibold ${statusBadge(r.status, r.dueDate)}`}
                            >
                              {displayStatus(r.status, r.dueDate)}
                            </span>
                          </td>
                          <td className="text-right">
                            {rest > 0 && r.status !== "CANCELADO" ? (
                              <button
                                type="button"
                                className="eq-btn-ghost px-3 py-1.5 text-xs"
                                onClick={() => payReceivable(r.id, rest)}
                              >
                                Baixar
                              </button>
                            ) : (
                              "—"
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )
            ) : filteredPayables.length === 0 ? (
              <p className="py-8 text-center text-sm text-olive-muted">
                Nenhum título neste filtro.
              </p>
            ) : (
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-borderEq text-xs uppercase tracking-wide text-olive-muted">
                    <th className="py-3 pr-3">Vencimento</th>
                    <th className="pr-3">Fornecedor</th>
                    <th className="pr-3">Categoria</th>
                    <th className="pr-3">Pagamento</th>
                    <th className="pr-3">Descrição</th>
                    <th className="pr-3">Valor</th>
                    <th className="pr-3">Em aberto</th>
                    <th className="pr-3">Status</th>
                    <th className="text-right">Ação</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPayables.map((p) => {
                    const rest = remaining(p.amountCents, p.paidCents);
                    const bankHint = p.professional
                      ? [
                          p.professional.pixKey ? `PIX ${p.professional.pixKey}` : null,
                          p.professional.bankName
                            ? `${p.professional.bankName} ${p.professional.bankAgency || ""}/${p.professional.bankAccount || ""}`.trim()
                            : null,
                        ]
                          .filter(Boolean)
                          .join(" · ")
                      : "";
                    return (
                      <tr key={p.id} className="border-b border-borderEq/70">
                        <td className="py-3 pr-3 whitespace-nowrap">{formatDate(p.dueDate)}</td>
                        <td className="pr-3 font-medium">
                          {p.professional?.fullName || p.vendor || "—"}
                        </td>
                        <td className="pr-3 text-olive-muted">{p.category?.name || "—"}</td>
                        <td className="pr-3 text-xs text-olive-muted">{bankHint || "—"}</td>
                        <td className="pr-3 text-olive-muted">
                          {p.description}
                          {p.recurring ? (
                            <span className="ml-2 rounded-full bg-gold/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-olive">
                              Mensal
                              {p.recurrenceIndex && p.recurrenceTotal
                                ? ` ${p.recurrenceIndex}/${p.recurrenceTotal}`
                                : ""}
                            </span>
                          ) : null}
                        </td>
                        <td className="pr-3">{formatMoney(p.amountCents)}</td>
                        <td className="pr-3 font-semibold">{formatMoney(rest)}</td>
                        <td className="pr-3">
                          <span
                            className={`rounded-full px-2 py-0.5 text-xs font-semibold ${statusBadge(p.status, p.dueDate)}`}
                          >
                            {displayStatus(p.status, p.dueDate)}
                          </span>
                        </td>
                        <td className="text-right">
                          {rest > 0 && p.status !== "CANCELADO" ? (
                            <button
                              type="button"
                              className="eq-btn-ghost px-3 py-1.5 text-xs"
                              onClick={() => payPayable(p.id, rest)}
                            >
                              Baixar
                            </button>
                          ) : (
                            "—"
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </AppShell>
  );
}
