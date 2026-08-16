"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { PatientAvatar } from "@/components/PatientAvatar";
import { formatCep, formatCpf, PatientForm, PatientFormValues } from "@/components/PatientForm";
import { api, getToken } from "@/lib/api";

type Patient = {
  id: string;
  fullName: string;
  cpf?: string | null;
  email?: string | null;
  phone?: string | null;
  whatsapp?: string | null;
  birthDate?: string | null;
  photoUrl?: string | null;
  zipCode?: string | null;
  street?: string | null;
  number?: string | null;
  complement?: string | null;
  neighborhood?: string | null;
  city?: string | null;
  state?: string | null;
  notes?: string | null;
  isParticular: boolean;
  insuranceName?: string | null;
};

export default function EditarPacientePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [patient, setPatient] = useState<Patient | null>(null);
  const [initial, setInitial] = useState<PatientFormValues | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!getToken()) {
      router.replace("/login");
      return;
    }
    api<Patient>(`/patients/${id}`)
      .then((data) => {
        setPatient(data);
        setInitial({
          fullName: data.fullName || "",
          cpf: data.cpf ? formatCpf(data.cpf) : "",
          email: data.email || "",
          phone: data.phone || "",
          whatsapp: data.whatsapp || "",
          birthDate: data.birthDate ? data.birthDate.slice(0, 10) : "",
          zipCode: data.zipCode ? formatCep(data.zipCode) : "",
          street: data.street || "",
          number: data.number || "",
          complement: data.complement || "",
          neighborhood: data.neighborhood || "",
          city: data.city || "",
          state: data.state || "SC",
          notes: data.notes || "",
          isParticular: data.isParticular,
          insuranceName: data.insuranceName || "",
        });
      })
      .catch((e) => setError(e.message));
  }, [id, router]);

  async function onSubmit(values: PatientFormValues) {
    await api(`/patients/${id}`, {
      method: "PATCH",
      body: JSON.stringify({
        ...values,
        email: values.email || null,
        birthDate: values.birthDate || null,
        insuranceName: values.isParticular ? null : values.insuranceName || null,
      }),
    });
    router.push("/pacientes");
  }

  return (
    <AppShell>
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl text-olive">Editar paciente</h1>
          <p className="mt-1 text-sm text-olive-muted">Clique na foto para alterar a imagem</p>
        </div>
        <div className="flex gap-2">
          <Link href={`/pacientes/${id}`} className="eq-btn-ghost">
            Ver prontuário
          </Link>
          <Link href="/pacientes" className="eq-btn-ghost">
            Voltar à lista
          </Link>
        </div>
      </div>
      {error ? <p className="mb-4 text-sm text-red-700">{error}</p> : null}
      {!initial || !patient ? (
        <p className="text-olive-muted">Carregando...</p>
      ) : (
        <div className="max-w-2xl space-y-4">
          <div className="eq-card flex items-center gap-4">
            <PatientAvatar
              patientId={patient.id}
              fullName={patient.fullName}
              photoUrl={patient.photoUrl}
              size="lg"
              onUpdated={(photoUrl) =>
                setPatient((prev) => (prev ? { ...prev, photoUrl } : prev))
              }
            />
            <div>
              <p className="font-display text-xl text-olive">{patient.fullName}</p>
              <p className="text-sm text-olive-muted">Toque na foto para enviar uma nova imagem</p>
            </div>
          </div>
          <PatientForm
            key={id}
            initial={initial}
            submitLabel="Salvar alterações"
            onSubmit={onSubmit}
            onCancel={() => router.push("/pacientes")}
          />
        </div>
      )}
    </AppShell>
  );
}
