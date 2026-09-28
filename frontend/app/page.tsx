import { Dashboard } from "@/components/dashboard";
import { getIsAdmin, getUser } from "@/lib/auth";

/**
 * The dashboard is server-rendered so the is_admin flag is read with the
 * service-side session. The proxy already guarantees a logged-in user here.
 */
export default async function Home() {
  const [user, isAdmin] = await Promise.all([getUser(), getUser().then(getIsAdmin)]);

  return <Dashboard email={user?.email ?? null} isAdmin={isAdmin} />;
}
