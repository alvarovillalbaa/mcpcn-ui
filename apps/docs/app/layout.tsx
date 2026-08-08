import type { Metadata } from "next";
import Link from "next/link";
import "@mcpcn/react/styles.css";
import "./site.css";
export const metadata:Metadata={title:{default:"MCPCN — MCP Component Network",template:"%s · MCPCN"},description:"Production-ready React components and workflow blocks for human-controlled MCP Apps."};
const nav=[["/docs","Docs"],["/components","Components"],["/blocks","Blocks"],["/examples","Examples"],["/playground","Playground"]] as const;
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en"><body><header className="site-nav"><Link href="/" className="brand"><span className="brand-mark">M</span>MCPCN</Link><nav>{nav.map(([href,label])=><Link href={href} key={href}>{label}</Link>)}</nav><div className="nav-actions"><Link href="/create" className="button secondary">Create</Link><a href="https://github.com/alvarovillalbaa/mcpcn-ui" className="button">GitHub</a></div></header>{children}<footer><div><strong>MCPCN</strong><p>Human control for agentic apps.</p></div><div><a href="/llms.txt">llms.txt</a><a href="https://github.com/alvarovillalbaa/mcpcn-ui">GitHub</a><a href="/docs/security">Security</a></div></footer></body></html>}
