import { getAuthUser, resolveIdentity } from "@/lib/auth/identity";

// For server components that show an upsell instead of a Pro page. The API routes enforce Pro separately.
export async function isProViewer(): Promise<boolean> {
  const user = await getAuthUser();
  if (!user) return false;
  return (await resolveIdentity(user)).plan === "pro";
}
