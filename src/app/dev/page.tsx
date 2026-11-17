import type { Metadata } from "next";
import { Doc } from "./doc";

export const metadata: Metadata = { title: "אתר המפתחים" };

export default function DevHome() {
  return <Doc slug="" />;
}
