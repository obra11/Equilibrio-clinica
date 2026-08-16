"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { AppShell } from "@/components/AppShell";
import { PatientForm, PatientFormValues } from "@/components/PatientForm";
import { api, getToken } from "@/lib/api";

type CreatePatientResponse = {
  id: string;
  welcomeWhatsapp?: {
    ok: boolean;
    status: string;
    detail?: string;
    to?: string;
  };
};

export default function NovoPacientePage() {
  const router = useRouter();

  useEffect(() => {
    if (!getToken()) router.replace("/login");
  }, [router]);

  async function onSubmit(values: PatientFormValues) {
    const created = await api<CreatePatientResponse>("/patients", {
      method: "POST",
      body: JSON.stringify({
        ...values,
        phone: values.phone || values.whatsapp,
        email: values.email || null,
        birthDate: values.birthDate || null,
        insuranceName: values.isParticular ? null : values.insuranceName || null,
        sendWelcomeWhatsapp: values.sendWelcomeWhatsapp,
      }),
    });

    const wa = created.welcomeWhatsapp;
    if (wa?.status === "sent") {
      window.alert(`Paciente cadastrado.\nWhatsApp de boas-vindas enviado para ${wa.to}.`);
    } else if (wa?.status === "simulated") {
      window.alert(
        `Paciente cadastrado.\nWhatsApp de boas-vindas preparado (modo desenvolvimento).\nDestino: ${wa.to || "—"}\n\nPara envio real, configure a Evolution API ou Meta no .env da API.`,
      );
    } else if (wa?.status === "skipped") {
      window.alert(`Paciente cadastrado.\nWhatsApp não enviado: ${wa.detail || "—"}`);
    } else if (wa?.status === "error") {
      window.alert(
        `Paciente cadastrado, mas o WhatsApp falhou:\n${wa.detail || "Erro desconhecido"}`,
      );
    }

    router.push(`/pacientes/${created.id}`);
  }

  return (
    <AppShell>
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl text-olive">Novo paciente</h1>
          <p className="mt-1 text-sm text-olive-muted">
            Cadastro completo — com opção de WhatsApp de boas-vindas
          </p>
        </div>
        <Link href="/pacientes" className="eq-btn-ghost">
          Voltar à lista
        </Link>
      </div>
      <div className="max-w-2xl">
        <PatientForm
          showWelcomeWhatsapp
          onSubmit={onSubmit}
          onCancel={() => router.push("/pacientes")}
        />
      </div>
    </AppShell>
  );
}
