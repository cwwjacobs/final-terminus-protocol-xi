import type { Metadata, Viewport } from 'next';
import './globals.css';
export const metadata:Metadata={title:'TERMINUS PROTOCOL — LOGOS ASCENSION',description:'Enter the Quantum Realm. Five heroes. One coherent Logos. A third-person party combat adventure.',icons:{icon:'/favicon.svg'}};
export const viewport: Viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover' };
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en"><body>{children}</body></html>}
