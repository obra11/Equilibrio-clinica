"use client";

import Link from "next/link";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { ClassForm } from "@/components/ClassForm";
import { api, getToken } from "@/lib/api";

export default function NovaAulaPilatesPage() {
  const router = useRouter();

  useEffect(() => {
    if (!getToken()) router.replace("/login");
  }, [router]);

  return (
    <AppShell>
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl text-olive">Nova aula</h1>
          <p className="mt-1 text-sm text-olive-muted">
            Crie uma aula ou uma turma com dias da semana e repetição
          </p>
        </div>
        <Link href="/pilates" className="eq-btn-ghost">
          Voltar às turmas
        </Link>
      </div>
      <div className="max-w-2xl">
        <ClassForm
          allowRecurrence
          submitLabel="Criar turma"
          onCancel={() => router.push("/pilates")}
          onSubmit={async (values) => {
            const created = await api<{ id: string; count?: number }>("/classes", {
              method: "POST",
              body: JSON.stringify({
                title: values.title,
                professionalId: values.professionalId,
                serviceTypeId: values.serviceTypeId,
                roomId: values.roomId || null,
                capacity: Number(values.capacity),
                startsAt: new Date(values.startsAt).toISOString(),
                endsAt: values.endsAt,
                notes: values.notes || null,
                weekdays: values.weekdays,
                weeksCount: values.weeksCount,
                repeatUntil: values.repeatUntil || null,
              }),
            });
            router.push(`/pilates/${created.id}`);
          }}
        />
      </div>
    </AppShell>
  );
}
