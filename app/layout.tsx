import './globals.css';
import type { Metadata } from 'next';
import { PWARegister } from '@/components/PWARegister';
export const metadata: Metadata = { title: 'Price Label Scanner', description: 'Scanner barcode gudang', manifest: '/manifest.json', themeColor: '#1e1b4b', appleWebApp: { capable: true, statusBarStyle: 'black-translucent', title: 'PriceLabel' }, icons: { apple: '/icon-192.png' } };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="id"><head><meta name="apple-mobile-web-app-capable" content="yes"/><meta name="apple-mobile-web-app-status-bar-style" content="black-translucent"/><link rel="apple-touch-icon" href="/icon-192.png"/></head><body><PWARegister/>{children}</body></html>; }
