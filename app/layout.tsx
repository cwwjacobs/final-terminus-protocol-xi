import type { Metadata, Viewport } from 'next';
import './globals.css';
export const metadata:Metadata={title:'Final Terminus Protocol XI',description:'Enter the Quantum Plane. Five souls. One resonance. A third-person party combat prototype.',icons:{icon:'/favicon.svg'}};
export const viewport: Viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover' };
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en"><body>{children}</body></html>}
