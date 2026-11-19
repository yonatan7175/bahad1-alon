// ─────────────────────────────────────────────────────────────────────────────
// Public types of the Bahad Platform API (v1).
//
// THIS FILE IS THE SINGLE SOURCE for the API types. `scripts/build-docs.ts`
// turns it into `/bahad.d.ts` (by stripping `export`) so contributors' AI
// tools get exact types. Keep it import-free and declaration-only.
// ─────────────────────────────────────────────────────────────────────────────

export type BahadErrorCode =
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "invalid"
  | "rate_limited"
  | "app_disabled"
  | "conflict";

/** Every API method rejects with this shape. */
export interface BahadErrorShape {
  code: BahadErrorCode;
  message: string;
}

export type Role = "cadet" | "commander" | "admin";

export interface UnitRef {
  id: string;
  name: string;
}

/** What `bahad.user.me()` returns. Optional fields depend on the app's scopes. */
export interface Me {
  id: string;
  name: string;
  avatarUrl: string | null;
  /** scope "role" */
  role?: Role;
  /** scope "role": true for admins and for managers of this app (they moderate its collections battalion-wide) */
  manager?: boolean;
  /** scope "unit" */
  company?: UnitRef | null;
  /** scope "unit" */
  platoon?: UnitRef | null;
  /** scope "unit": the room number the user gave at sign-up (e.g. "241") */
  room?: string | null;
  /** scope "contact" (sensitive) */
  email?: string;
  /** scope "contact" (sensitive) */
  phone?: string | null;
}

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

export type JsonObject = { [key: string]: JsonValue };

export interface BahadRecord<T extends JsonObject = JsonObject> {
  id: string;
  data: T;
  owner: { id: string; name: string };
  /** true when the current user owns this record */
  mine: boolean;
  /** ISO 8601 */
  createdAt: string;
  /** ISO 8601 */
  updatedAt: string;
}

export interface ListOptions {
  /** Equality on top-level keys only. Values must be string / number / boolean / null. */
  where?: { [key: string]: string | number | boolean | null };
  /** Default "createdAt:desc". */
  order?: "createdAt:desc" | "createdAt:asc" | "updatedAt:desc" | "updatedAt:asc";
  /** Default 50, maximum 200. */
  limit?: number;
  /** Only the current user's own records. */
  mine?: boolean;
}

export interface Collection<T extends JsonObject = JsonObject> {
  add(data: T): Promise<BahadRecord<T>>;
  list(options?: ListOptions): Promise<BahadRecord<T>[]>;
  get(id: string): Promise<BahadRecord<T>>;
  /** Shallow merge into data. */
  update(id: string, patch: Partial<T>): Promise<BahadRecord<T>>;
  remove(id: string): Promise<void>;
  /** Fires (with no data) whenever the collection changes. Returns an unsubscribe function. */
  subscribe(onChange: () => void): () => void;
}

export type PushTarget = "me" | { platoon: string } | { company: string };

export interface NotifyOptions {
  to: PushTarget;
  /** ≤ 80 chars */
  title: string;
  /** ≤ 300 chars */
  body?: string;
  /** ISO 8601 with offset. Default: now. At most 30 days ahead. */
  at?: string;
  /** Path inside this app to open on tap, e.g. "/a/laundry?day=2". Default: the app's home. */
  url?: string;
}

export interface NotifyResult {
  /** Use with push.cancel() to cancel a scheduled notification before it is sent. */
  id: string;
  /** How many people it was queued for. */
  recipients: number;
}

export interface PushMessage {
  title: string;
  body: string | null;
  url: string | null;
}

/** A person card from the portal directory (scope "directory"). Hidden phone/email are null. */
export interface Person {
  id: string;
  name: string;
  avatarUrl: string | null;
  role: Role;
  company: string | null;
  platoon: string | null;
  phone: string | null;
  email: string | null;
}

export interface Bahad {
  /** Resolves when connected to the portal (or when running in mock mode). */
  ready(): Promise<void>;
  /** true when running outside the portal with a fake user and local storage. */
  readonly isMock: boolean;
  user: {
    me(): Promise<Me>;
  };
  data: {
    collection<T extends JsonObject = JsonObject>(name: string): Collection<T>;
  };
  people: {
    /** A user's directory card — e.g. the owner of a record (record.owner.id). Scope "directory". */
    get(id: string): Promise<Person>;
  };
  push: {
    notify(options: NotifyOptions): Promise<NotifyResult>;
    /** Cancels a scheduled notification you queued that was not sent yet. */
    cancel(id: string): Promise<void>;
    /** Called when a push for this app arrives while the app is open. Returns an unsubscribe function. */
    onReceive(handler: (message: PushMessage) => void): () => void;
  };
  ui: {
    setTitle(title: string): void;
    toast(message: string): void;
    home(): void;
  };
}
