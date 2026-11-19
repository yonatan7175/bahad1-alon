import { AppPage } from "@/components/app-page";
import { DormApp } from "@apps/dorm/src/app";

export const metadata = { title: "מגורים" };

export default function Page() {
  return (
    <AppPage slug="dorm" tier="full">
      <DormApp />
    </AppPage>
  );
}
