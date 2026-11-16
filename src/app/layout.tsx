import type { Metadata, Viewport } from "next";
import { Chakra_Petch, Inter } from "next/font/google";
import { Toaster } from "@/components/ui/Toaster";
import { appUrl } from "@/lib/env";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const chakra = Chakra_Petch({ subsets: ["latin"], weight: ["500", "600", "700"], variable: "--font-chakra", display: "swap" });

export const metadata: Metadata = {
  metadataBase: new URL(appUrl()),
  title: { default: "GhostKeys — Keys de jogos para Steam com entrega automática", template: "%s | GhostKeys" },
  description: "Compre keys de jogos para Steam com pagamento via PIX ou cartão e entrega digital automática na sua conta.",
  openGraph: { type: "website", locale: "pt_BR", siteName: "GhostKeys" },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = { themeColor: "#050506" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={`${inter.variable} ${chakra.variable}`}>
      <body className="min-h-dvh">
        {children}
        <Toaster />
      </body>
    </html>
  );
}
