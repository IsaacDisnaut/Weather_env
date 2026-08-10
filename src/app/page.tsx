import { Landing } from "@/components/Landing";
import { siteConfig } from "@/lib/config";

export default function HomePage() {
  return <Landing siteName={siteConfig.name} />;
}
