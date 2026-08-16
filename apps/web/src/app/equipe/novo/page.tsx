"use client";

import Link from "next/link";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { ProfessionalForm, professionalPayload } from "@/components/ProfessionalForm";
import { api, getToken } from "@/lib/api";

export default function NovoProfissionalPage() {
  const router = useRouter();

  useEffect(() => {
    if (!getToken()) router.replace("/login");
  }, [router]);

  return (
    <AppShell>
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl text-olive">Incluir profissional</h1>
          <p className="mt-1 text-sm text-olive-muted">Novo membro da equipe Equilíbrio</p>
        </div>
        <Link href="/equipe" className="eq-btn-ghost">
          Voltar à equipe
        </Link>
      </div>
      <div className="max-w-2xl">
        <ProfessionalForm
          passwordRequired
          submitLabel="Cadastrar profissional"
          onCancel={() => router.push("/equipe")}
          onSubmit={async (values) => {
            await api("/professionals", {
              method: "POST",
              body: JSON.stringify(professionalPayload(values)),
            });
            router.push("/equipe");
          }}
        />
      </div>
    </AppShell>
  );
}
