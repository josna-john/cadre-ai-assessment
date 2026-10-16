import type { Metadata } from "next";
import { Inter, Inter_Tight, Poppins } from "next/font/google";
import "./globals.css";

// Same families as cadre.ai: Inter for body, Inter Tight for headings, Poppins for the wordmark.
const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });
const interTight = Inter_Tight({ variable: "--font-inter-tight", subsets: ["latin"] });
const poppins = Poppins({ variable: "--font-poppins", subsets: ["latin"], weight: ["500", "600"] });

export const metadata: Metadata = {
  title: "Ask Cadre",
  description:
    "Ask questions about Cadre AI's services, industries, and client resources. AI assistant with human follow-up.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${interTight.variable} ${poppins.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
