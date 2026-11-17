import { AppPage } from "@/components/app-page";
import { LaundryApp } from "@apps/laundry/src/app";

export const metadata = { title: 'לו"ז מכונות כביסה' };

export default function Page() {
  return (
    <AppPage slug="laundry" tier="full">
      <LaundryApp />
    </AppPage>
  );
}
