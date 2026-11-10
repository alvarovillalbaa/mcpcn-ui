// T2: authored UI only; no database, SDK, account, model or production service.
import { useState } from "react";
import { createRoot } from "react-dom/client";
import { Button, Dialog, Input, Tabs } from "@mcpcn/react";
import "./candidate.css";
import "./theme.css";

function Fixture() {
  const values = ["alpha", "beta", "gamma"];
  const [selection, setSelection] = useState("alpha");
  const [available, setAvailable] = useState(values);
  const [submits, setSubmits] = useState(0);
  const [background, setBackground] = useState(0);
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(true);
  const [retain, setRetain] = useState(false);
  const [requests, setRequests] = useState(0);
  const [notes, setNotes] = useState(0);
  const [unhandled, setUnhandled] = useState("");
  const items = (names: string[]) => names.map(value => ({ value,
    label: value[0]!.toUpperCase() + value.slice(1),
    content: <><p>{value} panel text</p><Button type="button">{value} panel action</Button></> }));
  return <main className="mcpcn" data-ready="true" data-submits={submits} data-background={background}
    data-close-requests={requests} data-notes={notes} data-unhandled={unhandled}
    style={{ padding: 16, maxWidth: 800, margin: "auto" }} onKeyDown={event => {
      if (event.key === "ArrowDown" || event.key === "ArrowUp") setUnhandled(String(event.defaultPrevented));
    }}>
    <h1>Tabs and dialog keyboard fixture</h1>
    <form onSubmit={event => { event.preventDefault(); setSubmits(count => count + 1); }}>
      <h2>Controlled</h2>
      <Tabs label="Controlled sections" items={items(values)} value={selection} onValueChange={setSelection} />
      <h2>Uncontrolled</h2>
      <Tabs label="Local sections" items={items(values)} />
      <h2>Changing items</h2>
      <Tabs label="Changing sections" items={items(available)} />
      <div className="mcpcn-row" style={{ flexWrap: "wrap", marginTop: 16 }}>
        <Button type="button" onClick={() => setAvailable(names => names.filter(name => name !== "gamma"))}>Remove Gamma</Button>
        <Button type="button" onClick={() => setAvailable(names => [...names].reverse())}>Reverse items</Button>
        <Button type="button" onClick={() => setAvailable([])}>Empty items</Button>
        <Button type="button" onClick={() => setAvailable(values)}>Restore items</Button>
      </div>
      <p><label><input type="checkbox" checked={retain} onChange={event => setRetain(event.target.checked)} /> Keep open after close request</label></p>
      <div className="mcpcn-row" style={{ flexWrap: "wrap" }}>
        <Button type="button" onClick={() => setOpen(true)}>Open modal</Button>
        <Button type="button" onClick={() => setBackground(count => count + 1)}>Background action</Button>
        {!mounted && <Button type="button" onClick={() => setMounted(true)}>Restore dialog</Button>}
      </div>
      {mounted && <Dialog open={open} title="Review authored note" onClose={() => {
        setRequests(count => count + 1);
        if (!retain) setOpen(false);
      }}>
        <label>Note<Input aria-label="Note" defaultValue="Authored note" /></label>
        <Button type="button" onClick={() => setNotes(count => count + 1)}>Record note</Button>
        <Button type="button" onClick={() => setOpen(false)}>Owner closes modal</Button>
        <Button type="button" onClick={() => { setOpen(false); setMounted(false); }}>Unmount dialog</Button>
        {Array.from({ length: 12 }, (_, index) => <p key={index}>Authored review paragraph {index + 1}. Read the supplied note before choosing an action.</p>)}
      </Dialog>}
    </form>
  </main>;
}

createRoot(document.getElementById("root")!).render(<Fixture />);
