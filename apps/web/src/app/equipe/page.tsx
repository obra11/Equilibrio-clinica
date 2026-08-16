"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { ProfessionalAvatar } from "@/components/ProfessionalAvatar";
import { api, getToken } from "@/lib/api";

type Professional = {
  id: string;
  fullName: string;
  crefito?: string | null;
  specialties: string[];
  color: string;
  photoUrl?: string | null;
  phone?: string | null;
  city?: string | null;
  pixKey?: string | null;
  user: { email: string; role: string };
};

export default function EquipePage() {
  const router = useRouter();
  const [items, setItems] = useState<Professional[]>([]);
  const [error, setError] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function load() {
    const data = await api<Professional[]>("/professionals");
    setItems(data);
  }

  useEffect(() => {
    if (!getToken()) {
      router.replace("/login");
      return;
    }
    load().catch((e) => setError(e.message));
  }, [router]);

  async function onDelete(p: Professional) {
    const ok = window.confirm(
      `Excluir o profissional "${p.fullName}"?\nEle deixará de aparecer na equipe e no login.`,
    );
    if (!ok) return;
    setError("");
    setDeletingId(p.id);
    try {
      await api(`/professionals/${p.id}`, { method: "DELETE" });
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
          <h1 className="font-display text-3xl text-olive">Equipe</h1>
          <p className="mt-1 text-sm text-olive-muted">
            Clique na foto ao lado do nome para adicionar ou trocar a imagem
          </p>
        </div>
        <Link href="/equipe/novo" className="eq-btn">
          Incluir profissional
        </Link>
      </div>

      {error ? <p className="mb-4 text-sm text-red-700">{error}</p> : null}

      {items.length === 0 ? (
        <div className="eq-card py-12 text-center">
          <p className="text-olive-muted">Nenhum profissional cadastrado.</p>
          <Link href="/equipe/novo" className="eq-btn mt-4 inline-flex">
            Incluir primeiro profissional
          </Link>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {items.map((p) => (
            <article key={p.id} className="eq-card flex flex-col">
              <div className="mb-4 flex items-center gap-3">
                <ProfessionalAvatar
                  professionalId={p.id}
                  fullName={p.fullName}
                  color={p.color}
                  photoUrl={p.photoUrl}
                  onUpdated={(photoUrl) =>
                    setItems((prev) =>
                      prev.map((item) => (item.id === p.id ? { ...item, photoUrl } : item)),
                    )
                  }
                />
                <div>
                  <h2 className="font-display text-xl text-olive">{p.fullName}</h2>
                  <p className="text-xs uppercase tracking-wide text-gold">
                    {p.crefito || p.user.role}
                  </p>
                </div>
              </div>
              <ul className="mb-4 flex-1 space-y-1 text-sm text-olive-muted">
                {p.specialties.length ? (
                  p.specialties.map((s) => <li key={s}>• {s}</li>)
                ) : (
                  <li>• Sem especialidades informadas</li>
                )}
              </ul>
              <div className="mb-4 space-y-0.5 text-xs text-charcoal/70">
                <p>{p.user.email}</p>
                {p.phone ? <p>{p.phone}</p> : null}
                {p.city ? <p>{p.city}</p> : null}
                {p.pixKey ? <p>PIX cadastrado</p> : null}
              </div>
              <div className="flex gap-2 border-t border-borderEq pt-3">
                <Link href={`/equipe/${p.id}/editar`} className="eq-btn-ghost flex-1 text-center text-xs">
                  Editar
                </Link>
                <button
                  type="button"
                  className="flex-1 rounded-md border border-red-200 bg-white px-3 py-2 text-xs font-medium text-red-700 transition hover:bg-red-50"
                  disabled={deletingId === p.id}
                  onClick={() => onDelete(p)}
                >
                  {deletingId === p.id ? "..." : "Excluir"}
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </AppShell>
  );
}
