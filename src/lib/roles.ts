export type EmployeeRoleKey =
  | "pedreiro" | "ajudante" | "meio_oficial" | "carpinteiro"
  | "armador" | "eletricista" | "encanador" | "outros";

export const EMPLOYEE_ROLES: { key: EmployeeRoleKey; label: string }[] = [
  { key: "pedreiro", label: "Pedreiro" },
  { key: "ajudante", label: "Ajudante" },
  { key: "meio_oficial", label: "Meio Oficial" },
  { key: "carpinteiro", label: "Carpinteiro" },
  { key: "armador", label: "Armador" },
  { key: "eletricista", label: "Eletricista" },
  { key: "encanador", label: "Encanador" },
  { key: "outros", label: "Outros" },
];

export function roleLabel(key?: string | null, other?: string | null): string {
  if (!key) return "—";
  if (key === "outros") return other?.trim() || "Outros";
  return EMPLOYEE_ROLES.find((r) => r.key === key)?.label ?? key;
}

/** Ajudante só entra no rateio nas categorias marcadas. */
export function isHelperRole(roleKey?: string | null) {
  return roleKey === "ajudante";
}

export type EffortUnit = "horas" | "meio_dia" | "dia";
export const EFFORT_UNITS: { key: EffortUnit; label: string; factor: number }[] = [
  { key: "horas", label: "Horas", factor: 1 },        // qty em horas
  { key: "meio_dia", label: "Meio Dia", factor: 0.5 },
  { key: "dia", label: "Dia Completo", factor: 1.0 },
];

export function effortLabel(u?: string | null) {
  return EFFORT_UNITS.find((e) => e.key === u)?.label ?? u ?? "—";
}

/**
 * Rateio igualitário. Retorna Map<employee_id, valor>.
 * - includesHelper=true → todos participam.
 * - includesHelper=false → ajudantes ficam com 0.
 */
export function computeRateio(
  participants: { employee_id: string; role: string | null }[],
  totalValue: number,
  includesHelper: boolean,
): { valorPorParticipante: Map<string, number>; qualificados: number } {
  const map = new Map<string, number>();
  if (!participants.length || !totalValue || totalValue <= 0) {
    participants.forEach((p) => map.set(p.employee_id, 0));
    return { valorPorParticipante: map, qualificados: 0 };
  }
  const elegiveis = participants.filter((p) => includesHelper || !isHelperRole(p.role));
  const n = elegiveis.length;
  const share = n > 0 ? totalValue / n : 0;
  participants.forEach((p) => {
    const inRateio = includesHelper || !isHelperRole(p.role);
    map.set(p.employee_id, inRateio ? share : 0);
  });
  return { valorPorParticipante: map, qualificados: n };
}
