import { describe, expect, it } from "vitest";
import { commissionCents, parseWeek, shiftWeek, weekLabel, weekRange, weekStartOf } from "@/lib/weeks";

describe("semanas (segunda a domingo, horário de Brasília)", () => {
  it("acha a segunda-feira da semana", () => {
    expect(weekStartOf("2026-11-18T15:00:00Z")).toBe("2026-11-16"); // quarta
    expect(weekStartOf("2026-11-16T03:00:00Z")).toBe("2026-11-16"); // segunda 00:00 em Brasília
    expect(weekStartOf("2026-11-16T02:59:00Z")).toBe("2026-11-09"); // domingo 23:59 em Brasília
    expect(weekStartOf("2026-11-22T23:00:00Z")).toBe("2026-11-16"); // domingo 20:00 em Brasília
  });
  it("intervalo cobre a semana inteira em Brasília", () => {
    expect(weekRange("2026-11-16")).toEqual({ from: "2026-11-16T03:00:00.000Z", to: "2026-11-23T03:00:00.000Z" });
  });
  it("navega entre semanas, inclusive na virada do ano", () => {
    expect(shiftWeek("2026-11-16", -1)).toBe("2026-11-09");
    expect(shiftWeek("2026-12-28", 1)).toBe("2027-01-04");
    expect(weekLabel("2026-12-28")).toBe("28/12 a 03/01/2027");
  });
  it("parâmetro inválido cai na semana atual; qualquer dia vira a segunda", () => {
    expect(parseWeek("2026-11-19")).toBe("2026-11-16");
    expect(parseWeek("lixo")).toBe(weekStartOf());
    expect(parseWeek(undefined)).toBe(weekStartOf());
  });
  it("comissão arredonda ao centavo", () => {
    expect(commissionCents(2700, 15)).toBe(405);
    expect(commissionCents(2990, "12.5")).toBe(374);
    expect(commissionCents(2990, null)).toBe(0);
  });
});
