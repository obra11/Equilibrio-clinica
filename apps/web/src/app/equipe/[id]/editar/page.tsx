"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { formatCep } from "@/components/PatientForm";
import { ProfessionalAvatar } from "@/components/ProfessionalAvatar";
import {
  ProfessionalForm,
  ProfessionalFormValues,
  professionalPayload,
} from "@/components/ProfessionalForm";
import { api, getToken } from "@/lib/api";

type Professional = {
  id: string;
  fullName: string;
  crefito?: string | null;
  specialties: string[];
  color: string;
  photoUrl?: string | null;
  phone?: string | null;
  whatsapp?: string | null;
  zipCode?: string | null;
  street?: string | null;
  number?: string | null;
  complement?: string | null;
  neighborhood?: string | null;
  city?: string | null;
  state?: string | null;
  accountHolder?: string | null;
  bankName?: string | null;
  bankAgency?: string | null;
  bankAccount?: string | null;
  bankAccountType?: string | null;
  pixKey?: string | null;
  pixKeyType?: string | null;
  user: { email: string; role: string };
};

export default function EditarProfissionalPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [professional, setProfessional] = useState<Professional | null>(null);
  const [initial, setInitial] = useState<ProfessionalFormValues | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!getToken()) {
      router.replace("/login");
      return;
    }
    api<Professional>(`/professionals/${id}`)
      .then((p) => {
        setProfessional(p);
        setInitial({
          fullName: p.fullName,
          email: p.user.email,
          password: "",
          phone: p.phone || "",
          whatsapp: p.whatsapp || "",
          crefito: p.crefito || "",
          specialtiesText: p.specialties.join(", "),
          color: p.color || "#585E45",
          role: p.user.role || "FISIOTERAPEUTA",
          zipCode: p.zipCode ? formatCep(p.zipCode) : "",
          street: p.street || "",
          number: p.number || "",
          complement: p.complement || "",
          neighborhood: p.neighborhood || "",
          city: p.city || "",
          state: p.state || "",
          accountHolder: p.accountHolder || "",
          bankName: p.bankName || "",
          bankAgency: p.bankAgency || "",
          bankAccount: p.bankAccount || "",
          bankAccountType: p.bankAccountType || "CORRENTE",
          pixKey: p.pixKey || "",
          pixKeyType: p.pixKeyType || "CPF",
        });
      })
      .catch((e) => setError(e.message));
  }, [id, router]);

  return (
    <AppShell>
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl text-olive">Editar profissional</h1>
          <p className="mt-1 text-sm text-olive-muted">
            Clique na foto para alterar a imagem
          </p>
        </div>
        <Link href="/equipe" className="eq-btn-ghost">
          Voltar à equipe
        </Link>
      </div>
      {error ? <p className="mb-4 text-sm text-red-700">{error}</p> : null}
      {!initial || !professional ? (
        <p className="text-olive-muted">Carregando...</p>
      ) : (
        <div className="max-w-2xl space-y-4">
          <div className="eq-card flex items-center gap-4">
            <ProfessionalAvatar
              professionalId={professional.id}
              fullName={professional.fullName}
              color={professional.color}
              photoUrl={professional.photoUrl}
              size="lg"
              onUpdated={(photoUrl) =>
                setProfessional((prev) => (prev ? { ...prev, photoUrl } : prev))
              }
            />
            <div>
              <p className="font-display text-xl text-olive">{professional.fullName}</p>
              <p className="text-sm text-olive-muted">Toque na foto para enviar uma nova imagem</p>
            </div>
          </div>
          <ProfessionalForm
            key={id}
            initial={initial}
            submitLabel="Salvar alterações"
            onCancel={() => router.push("/equipe")}
            onSubmit={async (values) => {
              const payload = professionalPayload(values);
              await api(`/professionals/${id}`, {
                method: "PATCH",
                body: JSON.stringify({
                  ...payload,
                  password: values.password || undefined,
                }),
              });
              router.push("/equipe");
            }}
          />
        </div>
      )}
    </AppShell>
  );
}
