import { ImageStudio } from "@/components/images/image-studio";
import { isProviderEnabled } from "@/lib/ai/providers";

export default function ImageGenPage() {
  return <ImageStudio connected={isProviderEnabled("cloudflare")} />;
}
