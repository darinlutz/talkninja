import type { Metadata } from "next";
import { Geist, Geist_Mono, Inter, Space_Grotesk } from "next/font/google";
import Navigation from "@/components/Navigation";
import PageTranslator from "@/components/PageTranslator";
import { getCurrentUser } from "@/lib/session";
import { ACCOUNT_STATUS } from "@/lib/accountStatus";
import "./globals.css";
// After globals.css: its rules join the base layer that globals.css declares
import "./landing.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// The landing page's fonts (see landing.css)
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "TalkNinja. New Language. Next Belt.",
  description:
    "Learn a new language from the one you already speak, and earn your belts one level at a time.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const user = await getCurrentUser();

  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${inter.variable} ${spaceGrotesk.variable} h-full antialiased`}
      data-scroll-behavior="smooth"
    >
      <body className="min-h-screen bg-white text-dark-blue flex flex-col">
        <Navigation
          user={
            user
              ? { userName: user.userName, isSubscribed: user.accountStatus === ACCOUNT_STATUS.subscribed }
              : null
          }
        />
        <main className="flex-1 pt-16">
          {children}
        </main>
        {/* Shows the site in the user's "I speak" language */}
        <PageTranslator language={user?.nativeLanguage ?? null} />
      </body>
    </html>
  );
}
