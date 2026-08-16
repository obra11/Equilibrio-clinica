"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { PatientAvatar } from "@/components/PatientAvatar";
import { formatCpf } from "@/components/PatientForm";
import { api, getStoredUser, getToken } from "@/lib/api";

type Patient = {
  id: string;
  fullName: string;
  cpf?: string | null;
  email?: string | null;
  phone?: string | null;
  whatsapp?: string | null;
  city?: string | null;
  state?: string | null;
  photoUrl?: string | null;
  isParticular: boolean;
  insuranceName?: string | null;
};

export default function PacientesPage() {
  const router = useRouter();
  const canDelete = getStoredUser()?.role === "ADMIN";
  const [patients, setPatients] = useState<Patient[]>([]);
  const [q, setQ] = useState("");
  const [error, setError] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function load(search?: string) {
    const query = search !== undefined ? search : q;
    const data = await api<Patient[]>(`/patients${query ? `?q=${encodeURIComponent(query)}` : ""}`);
    setPatients(data);
  }

  useEffect(() => {
    if (!getToken()) {
      router.replace("/login");
      return;
    }
    load().catch((e) => setError(e.message));
  }, [router]);

  async function onDelete(patient: Patient) {
    if (!canDelete) return;
    const ok = window.confirm(
      `Arquivar o paciente "${patient.fullName}"?\nEle sai das listagens, mas o histórico permanece no sistema.`,
    );
    if (!ok) return;
    setError("");
    setDeletingId(patient.id);
    try {
      await api(`/patients/${patient.id}`, { method: "DELETE" });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao excluir");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <AppShell>
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl text-olive">Pacientes</h1>
          <p className="mt-1 text-sm text-olive-muted">
            Clique na foto ao lado do nome para adicionar ou trocar a imagem
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            className="eq-input w-56"
            placeholder="Buscar nome, CPF, e-mail..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && load()}
          />
          <button type="button" className="eq-btn-ghost" onClick={() => load()}>
            Buscar
          </button>
          <Link href="/pacientes/novo" className="eq-btn">
            Novo paciente
          </Link>
        </div>
      </div>

      {error ? <p className="mb-4 text-sm text-red-700">{error}</p> : null}

      <div className="eq-card overflow-x-auto">
        {patients.length === 0 ? (
          <div className="py-12 text-center">
            <p className="text-olive-muted">Nenhum paciente encontrado.</p>
            <Link href="/pacientes/novo" className="eq-btn mt-4 inline-flex">
              Cadastrar primeiro paciente
            </Link>
          </div>
        ) : (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-borderEq text-xs uppercase tracking-wide text-olive-muted">
                <th className="py-3 pr-3">Nome</th>
                <th className="pr-3">CPF</th>
                <th className="pr-3">Contato</th>
                <th className="pr-3">Cidade</th>
                <th className="pr-3">Tipo</th>
                <th className="text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {patients.map((p) => (
                <tr key={p.id} className="border-b border-borderEq/70 align-middle">
                  <td className="py-3 pr-3">
                    <div className="flex items-center gap-3">
                      <PatientAvatar
                        patientId={p.id}
                        fullName={p.fullName}
                        photoUrl={p.photoUrl}
                        size="sm"
                        onUpdated={(photoUrl) =>
                          setPatients((prev) =>
                            prev.map((item) => (item.id === p.id ? { ...item, photoUrl } : item)),
                          )
                        }
                      />
                      <div>
                        <Link className="font-medium text-olive hover:underline" href={`/pacientes/${p.id}`}>
                          {p.fullName}
                        </Link>
                        {p.email ? <p className="text-xs text-olive-muted">{p.email}</p> : null}
                      </div>
                    </div>
                  </td>
                  <td className="pr-3">{p.cpf ? formatCpf(p.cpf) : "—"}</td>
                  <td className="pr-3">{p.whatsapp || p.phone || "—"}</td>
                  <td className="pr-3">{p.city ? `${p.city}${p.state ? `/${p.state}` : ""}` : "—"}</td>
                  <td className="pr-3">{p.isParticular ? "Particular" : p.insuranceName || "Convênio"}</td>
                  <td className="py-3">
                    <div className="flex justify-end gap-2">
                      <Link href={`/pacientes/${p.id}/editar`} className="eq-btn-ghost px-3 py-1.5 text-xs">
                        Editar
                      </Link>
                      {canDelete ? (
                        <button
                          type="button"
                          className="rounded-md border border-red-200 bg-white px-3 py-1.5 text-xs font-medium text-red-700 transition hover:bg-red-50"
                          disabled={deletingId === p.id}
                          onClick={() => onDelete(p)}
                        >
                          {deletingId === p.id ? "..." : "Arquivar"}
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </AppShell>
  );
}
