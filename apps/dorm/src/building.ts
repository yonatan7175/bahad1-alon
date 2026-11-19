// The battalion's living quarters. Floors 2–4 share one layout; only the first digit changes.
//
//   WC ─────────────── שירותים (צד 37/38) ─────────────── WC
//   odd side  x37 x39 x41 x43 x45 │ לובי │ x47 x49 x51 x53 x55
//   even side x38 x40 x42 x44 x46 │ לובי │ x48 x50 x52 x54 x56
//   WC ─────────────── שירותים (צד 55/56) ─────────────── WC
//
// Two parallel corridors (even / odd), each split in two halves by a central lobby;
// a toilets passage joins them at each end, so the floor is a closed ring.
// x38 faces x37 … x56 faces x55. Keep the "room" enum in ../app.json in sync (pnpm gen validates writes).

export const FLOORS = [2, 3, 4] as const;
export type Floor = (typeof FLOORS)[number];

export type AreaKind = "room" | "wc" | "lobby";
export interface Area {
  /** Stored in records: "241" for rooms, "2-wc1" / "2-wc2" / "2-lobby" for shared areas. */
  id: string;
  floor: Floor;
  kind: AreaKind;
  label: string;
  short: string;
}

/** Row 0..4 = first half (37–46), row 5..9 = second half (47–56). */
export const HALF_ROWS = 5;
const ODD = [37, 39, 41, 43, 45, 47, 49, 51, 53, 55];
const EVEN = [38, 40, 42, 44, 46, 48, 50, 52, 54, 56];

export const roomId = (floor: Floor, n: number) => `${floor}${n}`;

export interface FloorPlan {
  floor: Floor;
  odd: string[];
  even: string[];
  wc1: Area;
  wc2: Area;
  lobby: Area;
}

function plan(floor: Floor): FloorPlan {
  return {
    floor,
    odd: ODD.map((n) => roomId(floor, n)),
    even: EVEN.map((n) => roomId(floor, n)),
    wc1: { id: `${floor}-wc1`, floor, kind: "wc", label: `שירותים קומה ${floor} (צד ${floor}37/${floor}38)`, short: `שירותים ${floor}37` },
    wc2: { id: `${floor}-wc2`, floor, kind: "wc", label: `שירותים קומה ${floor} (צד ${floor}55/${floor}56)`, short: `שירותים ${floor}55` },
    lobby: { id: `${floor}-lobby`, floor, kind: "lobby", label: `לובי / מדרגות קומה ${floor}`, short: `לובי ${floor}` },
  };
}

export const PLANS: Record<Floor, FloorPlan> = { 2: plan(2), 3: plan(3), 4: plan(4) };

export const AREAS: Area[] = FLOORS.flatMap((f) => {
  const p = PLANS[f];
  const rooms = [...p.odd, ...p.even]
    .sort()
    .map((id): Area => ({ id, floor: f, kind: "room", label: `חדר ${id}`, short: id }));
  return [...rooms, p.wc1, p.wc2, p.lobby];
});
const BY_ID = new Map(AREAS.map((a) => [a.id, a]));
export const areaById = (id: string | null | undefined) => (id ? BY_ID.get(id) : undefined);
export const ROOMS = AREAS.filter((a) => a.kind === "room");
export const isRoom = (id: string | null | undefined) => areaById(id)?.kind === "room";

/**
 * Walking route for handing out supplies: per floor, one lap around the ring —
 * even side 38→56, toilets (55/56), odd side 55→37, toilets (37/38).
 */
export const ROUTE: string[] = FLOORS.flatMap((f) => {
  const p = PLANS[f];
  const evenA = p.even.slice(0, HALF_ROWS);
  const evenB = p.even.slice(HALF_ROWS);
  const oddDesc = [...p.odd].reverse();
  return [...evenA, p.lobby.id, ...evenB, p.wc2.id, ...oddDesc.slice(0, HALF_ROWS), ...oddDesc.slice(HALF_ROWS), p.wc1.id];
});
const ROUTE_POS = new Map(ROUTE.map((id, i) => [id, i]));
export const routeOrder = (a: string, b: string) => (ROUTE_POS.get(a) ?? 999) - (ROUTE_POS.get(b) ?? 999);
