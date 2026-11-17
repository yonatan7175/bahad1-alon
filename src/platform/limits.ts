// Platform API limits (plan 05, rule 4). Also printed in the developer docs.
export const LIMITS = {
  recordBytes: 16 * 1024,
  writesPerMinute: 60,
  listMax: 200,
  listDefault: 50,
  pushPerDay: 20,
  pushTitle: 80,
  pushBody: 300,
  pushMaxAheadDays: 30,
  whereKeys: 10,
} as const;
