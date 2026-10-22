import type { Metadata } from "next"
import { Inter } from "next/font/google"
import { GeistSans } from 'geist/font/sans'
import "@/app/globals.css"
import { Providers } from "./providers"
import { ThemeProvider } from "@/components/theme-provider"
import { Toaster } from "sonner"

const inter = Inter({
  subsets: ["latin"],
  variable: '--font-sans',
})

export const metadata: Metadata = {
  title: "NBA Fantasy Stats Dashboard",
  description: "Advanced analytics and insights for your fantasy NBA league",
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning className={`${inter.variable} ${GeistSans.variable}`}>
      <body className={inter.className}>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <Providers>{children}</Providers>
          <Toaster richColors position="top-right" />
        </ThemeProvider>
      </body>
    </html>
  )
}

