import "server-only";
// Platform API for FULL apps on the server (server components, server actions):
//   const p = platformFor("laundry");  const me = await p.user.me();
// Same methods and the same rule checks as the client API (minus subscribe/ui).
import { getAuthUser } from "../auth";
import type { BahadRecord, JsonObject, ListOptions, Me, NotifyOptions, NotifyResult, Person } from "../types";
import { executeCall } from "./engine";
import { engineDeps } from "./http";

export interface ServerCollection<T extends JsonObject = JsonObject> {
  add(data: T): Promise<BahadRecord<T>>;
  list(options?: ListOptions): Promise<BahadRecord<T>[]>;
  get(id: string): Promise<BahadRecord<T>>;
  update(id: string, patch: Partial<T>): Promise<BahadRecord<T>>;
  remove(id: string): Promise<void>;
}

export interface ServerPlatform {
  user: { me(): Promise<Me> };
  data: { collection<T extends JsonObject = JsonObject>(name: string): ServerCollection<T> };
  people: { get(id: string): Promise<Person> };
  push: { notify(options: NotifyOptions): Promise<NotifyResult>; cancel(id: string): Promise<void> };
}

export function platformFor(slug: string): ServerPlatform {
  const run = async <R,>(method: string, params: object = {}): Promise<R> => {
    const user = await getAuthUser();
    return (await executeCall(await engineDeps(), { userId: user?.id ?? null, slug }, method, params)) as R;
  };
  return {
    user: { me: () => run<Me>("user.me") },
    data: {
      collection: <T extends JsonObject = JsonObject>(name: string): ServerCollection<T> => ({
        add: (data) => run("data.add", { collection: name, data }),
        list: (options) => run("data.list", { collection: name, options }),
        get: (id) => run("data.get", { collection: name, id }),
        update: (id, patch) => run("data.update", { collection: name, id, patch }),
        remove: async (id) => {
          await run("data.remove", { collection: name, id });
        },
      }),
    },
    people: { get: (id) => run<Person>("people.get", { id }) },
    push: {
      notify: (options) => run("push.notify", { options }),
      cancel: async (id) => {
        await run("push.cancel", { id });
      },
    },
  };
}
