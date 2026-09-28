import { Dashboard } from "@/components/dashboard";
import { getUser } from "@/lib/auth";

/**
 * Server-rendered so the session email is read with the server-side cookies.
 * The proxy already guarantees a logged-in user here.
 */
export default async function Home() {
  const user = await getUser();
  return <Dashboard email={user?.email ?? null} />;
}
