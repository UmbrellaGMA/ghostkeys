import type { MetadataRoute } from "next";
import { appUrl } from "@/lib/env";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/admin", "/api", "/conta", "/checkout", "/pedido", "/carrinho"] }],
    sitemap: `${appUrl()}/sitemap.xml`,
  };
}
