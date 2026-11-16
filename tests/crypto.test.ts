import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret, hashSecret, last4 } from "@/lib/crypto";

describe("Proteção das keys (criptografia)", () => {
  it("criptografa e descriptografa (AES-256-GCM)", () => {
    const enc = encryptSecret("ABCDE-FGHIJ-KLMNO");
    expect(enc).not.toContain("ABCDE");
    expect(decryptSecret(enc)).toBe("ABCDE-FGHIJ-KLMNO");
  });

  it("gera IV aleatório (mesma key → textos cifrados diferentes)", () => {
    expect(encryptSecret("X")).not.toBe(encryptSecret("X"));
  });

  it("detecta adulteração", () => {
    const enc = encryptSecret("ABCDE");
    const parts = enc.split(":");
    parts[3] = Buffer.from("zzzzz").toString("base64");
    expect(() => decryptSecret(parts.join(":"))).toThrow();
  });

  it("não descriptografa com outra chave", () => {
    const enc = encryptSecret("ABCDE");
    expect(() => decryptSecret(enc, randomBytes(32).toString("base64"))).toThrow();
  });

  it("hash determinístico e normalizado para unicidade", () => {
    expect(hashSecret("abcde-12345")).toBe(hashSecret(" ABCDE-12345 "));
    expect(hashSecret("A")).not.toBe(hashSecret("B"));
  });

  it("exige chave de 32 bytes", () => {
    expect(() => encryptSecret("x", Buffer.from("curta").toString("base64"))).toThrow(/32 bytes/);
  });

  it("last4 ignora separadores", () => {
    expect(last4("AAAAA-BBBBB-CD12")).toBe("CD12");
  });
});
