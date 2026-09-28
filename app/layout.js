import './globals.css';
export const metadata = { title: 'Desknotes', description: 'AI-powered notes' };
export const viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover' };
export default function RootLayout({ children }) {
  return <html lang="en" data-t="light" suppressHydrationWarning><body>{children}</body></html>;
}
