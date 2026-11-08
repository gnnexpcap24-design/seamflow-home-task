import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { QuotaProvider } from "@/components/quota-provider";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Hot Dog or Not",
  description: "Upload an image and get a definitive Hot Dog or Not Hot Dog verdict.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${inter.variable} h-full antialiased`}>
      <body className="min-h-full" suppressHydrationWarning>
        <QuotaProvider>{children}</QuotaProvider>
        <Toaster />
      </body>
    </html>
  );
}
