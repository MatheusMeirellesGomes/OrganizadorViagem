import { describe, it, expect } from "vitest";
import { validDocumentData, documentLimit } from "./documents";
import { parseBackup } from "./offline";
import { newTrip } from "./model";
import { portableTrips } from "./backup";
import { prepareTripAssets } from "./migration";
import { memoryBackend } from "./test/memory";
const pdf = "data:application/pdf;base64," + btoa("%PDF-1.7\n test");
describe("documentos privados e backup", () => {
  it("recusa formato ativo, conteúdo falso, base64 inválido e arquivo grande", () => {
    expect(validDocumentData(pdf)).toBe(true);
    expect(validDocumentData("data:text/html;base64," + btoa("<script>"))).toBe(
      false,
    );
    expect(
      validDocumentData("data:application/pdf;base64," + btoa("texto")),
    ).toBe(false);
    expect(validDocumentData("data:application/pdf;base64,%%%")).toBe(false);
    expect(
      validDocumentData(
        "data:application/pdf;base64," +
          btoa("%PDF-" + "a".repeat(documentLimit)),
      ),
    ).toBe(false);
  });
  it("remapeia vínculo no backup sem confiar no MIME e tamanho declarados", () => {
    const [t] = parseBackup(
      JSON.stringify({
        version: 1,
        trips: [
          newTrip({
            reservations: [{ id: "r", title: "Voo", details: "", url: "" }],
            documents: [
              {
                id: "d",
                name: "Voo.pdf",
                mime: "text/html",
                size: 0,
                url: pdf,
                reservationId: "r",
              },
            ],
          }),
        ],
      }),
    );
    expect(t.documents![0].reservationId).toBe(t.reservations[0].id);
    expect(t.documents![0].mime).toBe("application/pdf");
    expect(t.documents![0].size).toBeGreaterThan(0);
  });
  it("materializa arquivos privados e recusa backup parcial", async () => {
    const t = newTrip({
      documents: [
        {
          id: "d",
          name: "Voo.pdf",
          mime: "application/pdf",
          size: 10,
          url: "owner/trip/d",
        },
      ],
    });
    const calls: string[] = [];
    const [copy] = await portableTrips(
      [t],
      async (bucket, path) => {
        calls.push(bucket + "/" + path);
        return new Blob();
      },
      async () => pdf,
    );
    expect(calls).toEqual(["trip-documents/owner/trip/d"]);
    expect(copy.documents![0].url).toBe(pdf);
    expect(t.documents![0].url).toBe("owner/trip/d");
    await expect(
      portableTrips([t], async () => {
        throw new Error("offline");
      }),
    ).rejects.toThrow("offline");
  });
  it("envia documentos antes de criar viagem na conta e falha sem suporte", async () => {
    const repo = memoryBackend().as("u"),
      t = newTrip({
        documents: [
          {
            id: "d",
            name: "Voo.pdf",
            mime: "application/pdf",
            size: 10,
            url: pdf,
          },
        ],
      });
    await expect(prepareTripAssets(repo, "u", t)).rejects.toThrow(
      "não configurado",
    );
    const uploaded: string[] = [];
    repo.uploadDocument = async (path) => {
      uploaded.push(path);
    };
    const copy = await prepareTripAssets(repo, "u", t);
    expect(copy.documents![0].url).toBe(`u/${t.id}/d`);
    expect(uploaded).toEqual([`u/${t.id}/d`]);
    expect(t.documents![0].url).toBe(pdf);
  });
});
