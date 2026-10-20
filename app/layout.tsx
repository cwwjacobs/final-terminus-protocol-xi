import type { Metadata } from 'next';
import './globals.css';
export const metadata:Metadata={title:'Final Terminus Protocol XI',description:'Enter the Quantum Plane. Five souls. One resonance. A third-person party combat prototype.',icons:{icon:'/favicon.svg'}};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en"><body>{children}</body></html>}
