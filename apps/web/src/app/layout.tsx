import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { TRPCProvider } from '@/trpc/Provider';
import { Toaster } from 'sonner';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'AI-Gatekeeper',
  description: 'AI Usage Tracker',
};

/**
 * Root Application Layout
 * 
 * Wraps all pages in the application. Sets up global styles, fonts,
 * tRPC/React Query providers, and the toast notification system.
 * 
 * @param {Object} props
 * @param {React.ReactNode} props.children - The child page content.
 * @returns {JSX.Element} The rendered HTML document structure.
 */
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className={`${inter.className} bg-background text-foreground min-h-screen antialiased`}>
        <TRPCProvider>{children}</TRPCProvider>
        <Toaster theme="dark" position="top-right" richColors />
      </body>
    </html>
  );
}
