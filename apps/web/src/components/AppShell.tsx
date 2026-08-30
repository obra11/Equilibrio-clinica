"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { BrandLogo } from "@/components/BrandLogo";
import { clearSession, getStoredUser } from "@/lib/api";

const allLinks = [
  { href: "/dashboard", label: "Início" },
  { href: "/pacientes", label: "Pacientes" },
  { href: "/agenda", label: "Agenda" },
  { href: "/pilates", label: "Pilates" },
  { href: "/financeiro", label: "Financeiro", roles: ["ADMIN", "RECEPCAO"] },
  { href: "/equipe", label: "Equipe" },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const user = getStoredUser();
  const links = allLinks.filter(
    (l) => !("roles" in l) || !l.roles || (user?.role && l.roles.includes(user.role)),
  );

  function logout() {
    clearSession();
    router.replace("/login");
  }

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-[60] border-b border-borderEq bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4">
          <Link href="/dashboard" className="flex items-center" aria-label="Equilíbrio — Início">
            <BrandLogo variant="header" priority />
          </Link>
          <div className="flex items-center gap-3 text-sm text-olive-muted">
            <span>{user?.professional?.fullName || user?.email}</span>
            <button type="button" className="eq-btn-ghost" onClick={logout}>
              Sair
            </button>
          </div>
        </div>
        <nav className="mx-auto flex max-w-7xl gap-1 overflow-x-auto px-4 pb-3">
          {links.map((l) => {
            const active = pathname.startsWith(l.href);
            return (
              <Link
                key={l.href}
                href={l.href}
                className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${
                  active ? "bg-olive text-cream" : "text-olive hover:bg-white"
                }`}
              >
                {l.label}
              </Link>
            );
          })}
        </nav>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-8">{children}</main>
    </div>
  );
}
