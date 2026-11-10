import { afterEach, describe, expect, it, vi } from "vitest";
import { ConflictError, friendlyError, isNetworkError } from "./errors";

afterEach(() => vi.unstubAllGlobals());

describe("friendly error messages", () => {
  it("explains authentication failures", () => {
    expect(friendlyError({ message: "Invalid login credentials", status: 400 })).toBe(
      "E-mail ou senha incorretos.",
    );
    expect(friendlyError({ message: "Email not confirmed" })).toContain(
      "Confirme seu e-mail",
    );
    expect(friendlyError({ message: "User already registered" })).toContain(
      "Já existe uma conta",
    );
    expect(friendlyError({ code: "weak_password", message: "x" })).toContain(
      "senha mais forte",
    );
    expect(friendlyError({ message: "JWT expired", code: "PGRST301" })).toContain(
      "sessão expirou",
    );
    expect(friendlyError({ status: 429, message: "x" })).toContain(
      "Muitas tentativas",
    );
  });
  it("explains connection failures", () => {
    const failed = new TypeError("Failed to fetch");
    expect(isNetworkError(failed)).toBe(true);
    expect(friendlyError(failed)).toContain("Sem conexão");
    vi.stubGlobal("navigator", { onLine: false });
    expect(friendlyError(new Error("anything"))).toContain("Sem conexão");
  });
  it("explains database and permission problems", () => {
    expect(friendlyError({ code: "42501", message: "new row violates row-level security policy" })).toContain(
      "permissão",
    );
    expect(friendlyError({ code: "PGRST205", message: "Could not find the table" })).toContain(
      "migração SQL",
    );
    expect(friendlyError({ code: "23505", message: "duplicate key" })).toContain(
      "já existe",
    );
  });
  it("explains edit conflicts between devices", () => {
    expect(friendlyError(new ConflictError())).toContain("outro aparelho");
  });
  it("never leaks unknown technical messages", () => {
    expect(friendlyError(new Error("relation xyz internal stack"))).toBe(
      "Algo deu errado. Tente novamente.",
    );
    expect(friendlyError(undefined, "Falhou.")).toBe("Falhou.");
  });
});
