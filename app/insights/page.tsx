import { AppShell } from "@/components/app-shell";
import { InsightsDashboard } from "@/components/insights/insights-dashboard";
import { UpsellCard } from "@/components/upsell-card";
import { isProViewer } from "@/lib/auth/is-pro";

export const metadata = { title: "Insights | Hot Dog or Not" };

export default async function InsightsPage() {
  const isPro = await isProViewer();
  return (
    <AppShell>
      {isPro ? (
        <InsightsDashboard />
      ) : (
        <UpsellCard
          title="Insights are a Pro feature"
          text="Pro accounts see their hot dog rate, average confidence and daily scan activity."
        />
      )}
    </AppShell>
  );
}
