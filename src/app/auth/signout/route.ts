import { signOut } from "@/platform/auth";
import { isSameOrigin } from "@/platform/server/http";
import { redirectTo } from "@/platform/server/redirect";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!isSameOrigin(req)) return new Response("forbidden", { status: 403 });
  await signOut();
  return redirectTo("/signin");
}
