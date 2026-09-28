import { Dashboard } from "@/components/dashboard";

/**
 * No auth: the root URL is the dashboard. The login flow was removed for the
 * demo so the link works with no signup.
 */
export default function Home() {
  return <Dashboard />;
}
