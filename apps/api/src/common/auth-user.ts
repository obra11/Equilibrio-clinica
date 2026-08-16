export type AuthUser = {
  userId: string;
  email: string;
  role: string;
  professionalId: string | null;
};

export function isAdmin(role: string) {
  return role === "ADMIN";
}

export function isAdminOrRecepcao(role: string) {
  return role === "ADMIN" || role === "RECEPCAO";
}

export function isClinician(role: string) {
  return role === "ADMIN" || role === "FISIOTERAPEUTA";
}
