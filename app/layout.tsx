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

// Applies the saved palette AND dark mode before first paint, so a hard
// refresh in dark mode never flashes the light theme. next-themes ships its
// own pre-paint script, but in this tree it runs a beat too late (from inside
// <ThemeProvider>); this hand-placed script is the first thing in <body>, so
// the `dark` class + color-scheme are set before the browser paints. Resolution
// mirrors next-themes' config (attribute="class", defaultTheme="light",
// enableSystem): dark when stored theme is "dark", or "system" + OS is dark.
const themeInitScript = `try{var d=document.documentElement;var p=localStorage.getItem("palette");if(p)d.dataset.palette=p;var t=localStorage.getItem("theme");if(t==="dark"||(t==="system"&&window.matchMedia("(prefers-color-scheme: dark)").matches)){d.classList.add("dark");d.style.colorScheme="dark";}}catch(e){}`;

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
      <head>
        {/* Runs in <head> so palette + dark mode are set before ANY content
         * paints — per Next's "preventing flash before hydration" guide. In
         * <body> the root background could paint light for a frame first (the
         * flash on fast refreshes). */}
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="flex h-dvh flex-col overflow-hidden">
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
