import { useState } from "react";
import { BranchIcon, CheckIcon, Chevron, Dropdown } from "./Menu";

// Lists remote branches on demand. Each branch keeps its own local draft.
export function BranchMenu({ branch, loadBranches, switchBranch, disabled }: { branch: string; loadBranches: () => Promise<string[]>; switchBranch: (branch: string) => void; disabled: boolean }) {
  const [branches, setBranches] = useState<string[]>();
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("");
  const load = () => { setFilter(""); setError(""); loadBranches().then(setBranches, (error: unknown) => setError(error instanceof Error ? error.message : String(error))); };
  const shown = (branches ?? []).filter(name => name.toLowerCase().includes(filter.trim().toLowerCase()));
  return <Dropdown className="branch-trigger" title="Switch branch" panelClassName="branch-panel" onOpen={load} label={<><BranchIcon /><span className="branch-name">{branch}</span><Chevron /></>}>
    {close => <>
      <div className="dropdown-heading">Switch branch</div>
      <input className="branch-filter" aria-label="Find a branch" placeholder="Find a branch…" value={filter} onChange={event => setFilter(event.target.value)} autoFocus />
      <div className="branch-list" role="menu" aria-label="Branches">
        {error ? <p className="dropdown-empty">{error}</p> : !branches ? <p className="dropdown-empty">Loading branches…</p> : !shown.length ? <p className="dropdown-empty">No branch matches.</p> : shown.slice(0, 100).map(name =>
          <button key={name} role="menuitemradio" aria-checked={name === branch} className="menu-item" disabled={disabled} onClick={() => { close(); if (name !== branch) switchBranch(name); }}>
            <span className="menu-check">{name === branch && <CheckIcon />}</span><span className="branch-name">{name}</span>
          </button>)}
      </div>
      <p className="dropdown-note">Drafts are kept separately for each branch.</p>
    </>}
  </Dropdown>;
}
