import type { Metadata } from "next";
import { DOCS } from "@/generated/docs";
import { Doc } from "../doc";

export async function generateMetadata(props: PageProps<"/dev/[page]">): Promise<Metadata> {
  const { page } = await props.params;
  return { title: DOCS.find((d) => d.slug === page)?.title ?? "אתר המפתחים" };
}

export default async function DevPage(props: PageProps<"/dev/[page]">) {
  const { page } = await props.params;
  return <Doc slug={page} />;
}
