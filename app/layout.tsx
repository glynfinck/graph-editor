import type { Metadata } from "next";
import { Figtree, JetBrains_Mono } from "next/font/google";

import { Navbar } from "@/components/site/navbar";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";

import "./globals.css";

const figtree = Figtree({
  variable: "--font-figtree",
  subsets: ["latin"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
});

// Applies the saved palette before first paint (same trick next-themes uses
// for dark mode) so switching palettes never flashes the default.
const paletteInitScript = `try{var p=localStorage.getItem("palette");if(p)document.documentElement.dataset.palette=p}catch(e){}`;

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
  ),
  title: {
    default: "Graph Editor",
    template: "%s · Graph Editor",
  },
  description:
    "Edit graphs visually and run real Python algorithms that animate them — networkx in your browser, powered by Pyodide.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${figtree.variable} ${jetbrainsMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="flex h-dvh flex-col overflow-hidden">
        <script dangerouslySetInnerHTML={{ __html: paletteInitScript }} />
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          disableTransitionOnChange
        >
          <Navbar />
          <main className="flex min-h-0 flex-1 flex-col overflow-y-auto">
            {children}
          </main>
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
