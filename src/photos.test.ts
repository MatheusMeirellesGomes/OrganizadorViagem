import { it, expect } from "vitest";
import { photoDimensions, chronologicalPhotos, removePhoto } from "./photos";
import { newTrip } from "./model";
import { parseBackup } from "./offline";
it("reduz dimensões preservando proporção sem aumentar imagens pequenas", () => {
  expect(photoDimensions(4000, 3000)).toEqual({ width: 1600, height: 1200 });
  expect(photoDimensions(600, 800)).toEqual({ width: 600, height: 800 });
});
it("ordena datas sem alterar original e remove capa ao excluir sua foto", () => {
  const photos = [
    { id: "a", url: "", name: "a" },
    { id: "b", url: "", name: "b", takenAt: "2027-01-22" },
  ];
  expect(chronologicalPhotos(photos)[0].id).toBe("b");
  expect(photos[0].id).toBe("a");
  expect(
    removePhoto(newTrip({ photos, coverPhotoId: "a" }), "a").coverPhotoId,
  ).toBeUndefined();
});
it("backup remapeia capa e vínculo de foto com passeio", () => {
  const t = newTrip({
    activities: [
      {
        id: "a",
        title: "Passeio",
        time: "",
        day: 1,
        kind: "",
        address: "",
        done: true,
      },
    ],
    coverPhotoId: "p",
    photos: [
      {
        id: "p",
        url: "data:image/jpeg;base64,/9j/",
        name: "foto",
        caption: "Família",
        album: "Portugal",
        activityId: "a",
        takenAt: "2027-01-22",
      },
    ],
  });
  const [copy] = parseBackup(JSON.stringify({ version: 1, trips: [t] }));
  expect(copy.coverPhotoId).toBe(copy.photos[0].id);
  expect(copy.photos[0].activityId).toBe(copy.activities[0].id);
  expect(copy.photos[0].caption).toBe("Família");
  expect(copy.photos[0].album).toBe("Portugal");
});
