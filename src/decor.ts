/*
 * Real photos for decorative spots that used to be line drawings
 * (compass, plane, empty-state icons). All from Unsplash under the free
 * Unsplash License (no Unsplash+ images), served already cropped to size.
 * Photo pages: https://unsplash.com/photos/<slug> listed next to each one.
 */
const unsplash = (id: string, w: number, h: number) =>
  `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=${w}&h=${h}&q=72`;

export const decor = {
  // bussola-redonda-cor-de-latao-no-mapa-IJy2ZUex0-Y
  compass: unsplash("1566341013475-5a3244e59e1d", 560, 560),
  // airplane wing over clouds (search "airplane window", free license)
  wing: unsplash("1436491865332-7a61a109cc05", 480, 240),
  // homem, mulher e crianca caminhando juntos por estrada de terra
  family: unsplash("1503431153573-96e959f4d9b7", 720, 360),
  // passagem de montanha durante o nascer do sol
  road: unsplash("1489641024260-20e5cb3ee4aa", 480, 300),
  // mountains and still lake (search "peaceful lake morning", free license)
  lake: unsplash("1506536329413-d2f0d31ceb9f", 640, 300),
  // airplane window views (search "airplane window", free license)
  window: unsplash("1507812984078-917a274065be", 480, 300),
  windowAlt: unsplash("1488085061387-422e29b40080", 480, 300),
  // calm landscape (search "calm travel", free license)
  calm: unsplash("1533757879476-8f4a3cb1ae4b", 480, 300),
  // open roads (search "road trip", free license)
  roadAlt: unsplash("1542242476-5a3565835a38", 480, 300),
  roadWide: unsplash("1421218108559-eb1ff78357f5", 320, 320),
  // compasses on maps (search "compass map", free license)
  compassAlt: unsplash("1566341013452-946caa457784", 480, 300),
  map: unsplash("1488375634201-b85b28653a79", 320, 320),
};

/** Hides a decorative photo that failed to load (offline), keeping the tint. */
export const hideOnError = (e: { currentTarget: HTMLImageElement }) => {
  e.currentTarget.style.visibility = "hidden";
};
