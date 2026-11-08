import { AppShell } from "@/components/app-shell";
import { HistoryList } from "@/components/history/history-list";
import { UpsellCard } from "@/components/upsell-card";
import { isProViewer } from "@/lib/auth/is-pro";

export const metadata = { title: "History | Hot Dog or Not" };

export default async function HistoryPage() {
  const isPro = await isProViewer();
  return (
    <AppShell>
      {isPro ? (
        <HistoryList />
      ) : (
        <UpsellCard
          title="Scan history is a Pro feature"
          text="Pro accounts keep a private history of their scans, with thumbnails that only you can see."
        />
      )}
    </AppShell>
  );
}
