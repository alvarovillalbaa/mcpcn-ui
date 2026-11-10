import Link from "next/link";
import { blockCatalog } from "@mcpcn/registry/catalog";
import { InstallCommand } from "../../components/install-command";
import { localCli } from "../../lib/release-installation";
export const metadata = { title: "Blocks" };
export default function Blocks() {
  return <main><span className="eyebrow">Complete patterns</span><h1>Workflow blocks</h1><p className="lede">Install the React UI, bound app, schemas, real MCP server recipe and runnable SQL fixture together.</p>
    <p><Link href="/docs/block-recipes">Connect a persistent block to your server</Link></p>
    <p><Link href="/docs#install">Install the checked release packages and initialize your app</Link> before adding a block.</p>
    <div className="block-grid">{blockCatalog.map((block,index) => <article className="catalog-card" key={block.name}><span>{String(index+1).padStart(2,"0")}</span><h3>{block.name}</h3><p>{block.description}</p>
      <div className="filter-row">{block.components.map(component => <span className="pill" key={component}>{component}</span>)}</div><InstallCommand label={`${block.name} installation`} command={`${localCli} add ${block.name}`} />
      <Link href="/docs/block-recipes#recipes">Server, fixture, checks and preview</Link></article>)}</div></main>;
}
