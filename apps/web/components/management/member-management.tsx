"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import type { AccountRole } from "../../lib/auth/account-context";
import type { StaffMemberDirectoryItem, TosSport } from "../../lib/tos/types";
import {
  activeFilterCount,
  EMPTY_MEMBER_FILTERS,
  filterMembers,
  memberDraft,
  pendingMemberChange,
  withPendingMember,
  type MemberEditDraft,
  type MemberFilters,
  type PendingMemberChange,
  type SportEdit,
} from "./member-management-state";
import styles from "./member-management.module.css";

const PAGE_SIZE = 25;
const ROLE_LABELS = { participant: "Deelnemer", planner: "Planner", admin: "Admin" } as const;
type SaveState = Readonly<{ tone: "success" | "danger"; text: string }> | null;

function initials(name: string): string {
  const parts = name.trim().split(/\s+/u).filter(Boolean);
  return (parts.length > 1 ? `${parts[0][0]}${parts.at(-1)?.[0] ?? ""}` : parts[0]?.slice(0, 2) ?? "?").toLocaleUpperCase("nl-NL");
}

function responseNotice(response: Response): string | null {
  try {
    const location = response.url || response.headers.get("location") || "";
    return new URL(location, window.location.origin).searchParams.get("notice");
  } catch {
    return null;
  }
}

function SportControls({ member, sport, value, disabled, onChange }: {
  member: StaffMemberDirectoryItem;
  sport: TosSport;
  value: SportEdit;
  disabled: boolean;
  onChange: (value: SportEdit) => void;
}) {
  const label = sport === "padel" ? "Padel" : "Tennis";
  return (
    <div className={styles.sportControls}>
      <select aria-label={`${label}profiel voor ${member.displayName}`} value={String(value.active)} disabled={disabled} onChange={(event) => onChange({ ...value, active: event.target.value === "true" })}>
        <option value="true">Actief</option><option value="false">Inactief</option>
      </select>
      <select aria-label={`${label}niveau voor ${member.displayName}`} value={value.ranking ?? ""} disabled={disabled} onChange={(event) => onChange({ ...value, ranking: event.target.value ? Number(event.target.value) : null })}>
        <option value="">–</option>{[1, 2, 3, 4, 5].map((ranking) => <option key={ranking} value={ranking}>{ranking}</option>)}
      </select>
    </div>
  );
}

function MemberIdentity({ member }: { member: StaffMemberDirectoryItem }) {
  return (
    <span className={styles.memberIdentity}>
      <span className={styles.avatar} aria-hidden="true">{initials(member.displayName)}</span>
      <span className={styles.identityText}><strong>{member.displayName}</strong><span title={member.loginEmail ?? undefined}>{member.loginEmail ?? "Geen login-e-mailadres"}</span></span>
    </span>
  );
}

function openModal(dialog: HTMLDialogElement | null) {
  dialog?.showModal();
  window.requestAnimationFrame(() => dialog?.querySelector<HTMLElement>("[data-initial-focus]")?.focus());
}

export function MemberManagement({ members, query, canAdminister, currentProfileId }: {
  members: readonly StaffMemberDirectoryItem[];
  query: string;
  canAdminister: boolean;
  currentProfileId: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState<Record<string, PendingMemberChange>>({});
  const [filters, setFilters] = useState<MemberFilters>({ ...EMPTY_MEMBER_FILTERS, query });
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<MemberEditDraft | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>(null);
  const editDialog = useRef<HTMLDialogElement>(null);
  const filterDialog = useRef<HTMLDialogElement>(null);
  const deleteDialog = useRef<HTMLDialogElement>(null);

  const projectedMembers = useMemo(() => members.map((member) => withPendingMember(member, pending[member.memberId])), [members, pending]);
  const filtered = useMemo(() => filterMembers(projectedMembers, filters), [projectedMembers, filters]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const visibleMembers = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  const dirtyCount = Object.keys(pending).length;
  const selectedMember = selectedId ? projectedMembers.find((member) => member.memberId === selectedId) ?? null : null;
  const deleteMember = deleteId ? projectedMembers.find((member) => member.memberId === deleteId) ?? null : null;

  useEffect(() => {
    if (!dirtyCount) return;
    const protect = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", protect);
    return () => window.removeEventListener("beforeunload", protect);
  }, [dirtyCount]);

  function canEditRole(member: StaffMemberDirectoryItem): boolean {
    return canAdminister && Boolean(member.profileId && member.accountRole) && member.profileId !== currentProfileId;
  }

  function stage(member: StaffMemberDirectoryItem, nextDraft: MemberEditDraft) {
    const next = pendingMemberChange(member, nextDraft, canEditRole(member));
    setPending((current) => {
      const copy = { ...current };
      if (next) copy[member.memberId] = next;
      else delete copy[member.memberId];
      return copy;
    });
    setSaveState(null);
  }

  function changeSport(member: StaffMemberDirectoryItem, sport: TosSport, value: SportEdit) {
    const current = memberDraft(member, pending[member.memberId]);
    stage(member, { ...current, [sport]: value });
  }

  function changeRole(member: StaffMemberDirectoryItem, role: AccountRole) {
    const current = memberDraft(member, pending[member.memberId]);
    stage(member, { ...current, role });
  }

  function openEditor(member: StaffMemberDirectoryItem) {
    setSelectedId(member.memberId);
    setDraft(memberDraft(member, pending[member.memberId]));
    window.requestAnimationFrame(() => openModal(editDialog.current));
  }

  function applyEditor() {
    const serverMember = members.find((member) => member.memberId === selectedId);
    if (serverMember && draft) stage(serverMember, draft);
    editDialog.current?.close();
  }

  async function post(path: string, fields: Record<string, string>, expectedNotice: string): Promise<boolean> {
    const body = new FormData();
    Object.entries(fields).forEach(([key, value]) => body.set(key, value));
    try {
      const response = await fetch(path, { method: "POST", body, credentials: "same-origin" });
      return response.ok && responseNotice(response) === expectedNotice;
    } catch {
      return false;
    }
  }

  async function saveChanges() {
    if (!dirtyCount || saving) return;
    setSaving(true);
    setSaveState(null);
    const remaining: Record<string, PendingMemberChange> = { ...pending };
    for (const member of members) {
      const change = remaining[member.memberId];
      if (!change) continue;
      for (const sport of ["padel", "tennis"] as const) {
        const edit = change[sport];
        if (!edit) continue;
        const ok = await post("/api/beheer/leden/sport-profile", { member_id: member.memberId, sport, active: String(edit.active), ranking: edit.ranking === null ? "" : String(edit.ranking) }, "sport-profile-updated");
        if (ok) {
          const next = { ...remaining[member.memberId] };
          delete next[sport];
          if (Object.keys(next).length) remaining[member.memberId] = next;
          else delete remaining[member.memberId];
        }
      }
      const role = remaining[member.memberId]?.role;
      if (role && member.profileId) {
        const ok = await post("/api/beheer/leden/role", { profile_id: member.profileId, role }, "account-role-updated");
        if (ok) {
          const next = { ...remaining[member.memberId] };
          delete next.role;
          if (Object.keys(next).length) remaining[member.memberId] = next;
          else delete remaining[member.memberId];
        }
      }
    }
    setPending(remaining);
    setSaving(false);
    setSaveState(Object.keys(remaining).length
      ? { tone: "danger", text: `${Object.keys(remaining).length} ${Object.keys(remaining).length === 1 ? "lid kon" : "leden konden"} niet volledig worden opgeslagen. Probeer het opnieuw.` }
      : { tone: "success", text: "Wijzigingen opgeslagen" });
    router.refresh();
  }

  async function deleteSelectedMember() {
    if (!deleteMember || saving) return;
    setSaving(true);
    const ok = await post("/api/beheer/leden/delete", { member_id: deleteMember.memberId }, "member-deleted");
    setSaving(false);
    if (!ok) {
      setSaveState({ tone: "danger", text: "Het lid kon niet worden verwijderd." });
      return;
    }
    setPending((current) => { const next = { ...current }; delete next[deleteMember.memberId]; return next; });
    deleteDialog.current?.close();
    setDeleteId(null);
    setSaveState({ tone: "success", text: "Lid verwijderd" });
    router.refresh();
  }

  function askDelete(member: StaffMemberDirectoryItem) {
    editDialog.current?.close();
    setDeleteId(member.memberId);
    window.requestAnimationFrame(() => openModal(deleteDialog.current));
  }

  function updateFilters(update: (current: MemberFilters) => MemberFilters) {
    setFilters(update);
    setPage(1);
  }

  function clearFilters() {
    setFilters(EMPTY_MEMBER_FILTERS);
    setPage(1);
  }

  return (
    <div className={`${styles.memberManagement} ${dirtyCount ? styles.hasSaveBar : ""}`}>
      <div className={styles.toolbar}>
        <label className={styles.searchField}>
          <span className={styles.srOnly}>Zoeken op naam of e-mailadres</span><span aria-hidden="true">⌕</span>
          <input type="search" maxLength={80} placeholder="Zoek leden" value={filters.query} onChange={(event) => updateFilters((current) => ({ ...current, query: event.target.value }))} />
        </label>
        <div className={styles.desktopFilters}>
          <select aria-label="Accountfilter" value={filters.account} onChange={(event) => updateFilters((current) => ({ ...current, account: event.target.value as MemberFilters["account"] }))}><option value="all">Alle leden</option><option value="linked">Gekoppeld</option><option value="unlinked">Geen account</option></select>
          <select aria-label="Sportprofielfilter" value={filters.sport} onChange={(event) => updateFilters((current) => ({ ...current, sport: event.target.value as MemberFilters["sport"] }))}><option value="all">Sportprofiel</option><option value="padel">Padel actief</option><option value="tennis">Tennis actief</option><option value="both">Beide actief</option></select>
          <select aria-label="Niveaufilter" value={filters.level} onChange={(event) => updateFilters((current) => ({ ...current, level: event.target.value as MemberFilters["level"] }))}><option value="all">Alle niveaus</option><option value="missing">Niveau ontbreekt</option></select>
          <button type="button" className={styles.clearButton} onClick={clearFilters}>Filters wissen</button>
        </div>
        <button className={styles.filterButton} type="button" onClick={() => openModal(filterDialog.current)} aria-label="Filters openen">Filter{activeFilterCount(filters) ? <span>{activeFilterCount(filters)}</span> : null}</button>
        <a className={styles.backLink} href="/beheer">← Terug naar TOS-beheer</a>
      </div>

      <div className={styles.summary}><strong>{filtered.length} {filtered.length === 1 ? "lid" : "leden"}</strong>{saveState ? <span className={saveState.tone === "success" ? styles.success : styles.error} role={saveState.tone === "danger" ? "alert" : "status"}>{saveState.text}</span> : null}</div>

      {visibleMembers.length ? (
        <>
          <div className={styles.desktopTableWrap}>
            <table className={styles.memberTable}>
              <thead><tr><th scope="col">Lid</th><th scope="col">Account</th><th scope="col">Padel</th><th scope="col">Tennis</th><th scope="col">Rol</th><th scope="col"><span className={styles.srOnly}>Acties</span></th></tr></thead>
              <tbody>{visibleMembers.map((member) => {
                const serverMember = members.find((item) => item.memberId === member.memberId) ?? member;
                return <tr key={member.memberId} className={pending[member.memberId] ? styles.dirtyRow : undefined}>
                  <td><MemberIdentity member={member} /></td>
                  <td><span className={`${styles.accountDot} ${member.accountLinked ? styles.linked : ""}`} />{member.accountLinked ? "Gekoppeld" : "Geen account"}</td>
                  <td><SportControls member={member} sport="padel" value={memberDraft(member).padel} disabled={saving} onChange={(value) => changeSport(serverMember, "padel", value)} /></td>
                  <td><SportControls member={member} sport="tennis" value={memberDraft(member).tennis} disabled={saving} onChange={(value) => changeSport(serverMember, "tennis", value)} /></td>
                  <td>{canEditRole(serverMember) ? <select aria-label={`Accountrol voor ${member.displayName}`} value={member.accountRole ?? "participant"} disabled={saving} onChange={(event) => changeRole(serverMember, event.target.value as AccountRole)}><option value="participant">Deelnemer</option><option value="planner">Planner</option><option value="admin">Admin</option></select> : <span className={member.accountRole && member.accountRole !== "participant" ? styles.staffBadge : styles.roleText}>{member.accountRole ? ROLE_LABELS[member.accountRole] : "Geen account"}</span>}</td>
                  <td><button className={styles.rowAction} type="button" aria-label={`Details van ${member.displayName}`} onClick={() => openEditor(serverMember)}>⋮</button></td>
                </tr>;
              })}</tbody>
            </table>
          </div>

          <div className={styles.mobileList}>{visibleMembers.map((member) => <button className={`${styles.mobileMember} ${pending[member.memberId] ? styles.mobileDirty : ""}`} type="button" key={member.memberId} onClick={() => openEditor(members.find((item) => item.memberId === member.memberId) ?? member)}>
            <MemberIdentity member={member} />
            <span className={styles.mobileAccount}><span className={`${styles.accountDot} ${member.accountLinked ? styles.linked : ""}`} />{member.accountLinked ? "Gekoppeld" : "Geen account"}</span>
            <span className={styles.mobileBadges}><span>Padel {member.padelProfileActive ? member.padelRanking ?? "–" : "inactief"}</span><span>Tennis {member.tennisProfileActive ? member.tennisRanking ?? "–" : "inactief"}</span><span className={member.accountRole && member.accountRole !== "participant" ? styles.staffBadge : ""}>{member.accountRole ? ROLE_LABELS[member.accountRole] : "Geen account"}</span></span>
            <span className={styles.chevron} aria-hidden="true">›</span>
          </button>)}</div>
        </>
      ) : <p className={styles.empty}>Geen leden gevonden.</p>}

      <nav className={styles.pagination} aria-label="Ledenpagina's"><span>{filtered.length ? (safePage - 1) * PAGE_SIZE + 1 : 0}–{Math.min(safePage * PAGE_SIZE, filtered.length)} van {filtered.length}</span><div><button type="button" disabled={safePage <= 1} onClick={() => setPage((value) => value - 1)} aria-label="Vorige pagina">‹</button><span>Pagina {safePage} van {pageCount}</span><button type="button" disabled={safePage >= pageCount} onClick={() => setPage((value) => value + 1)} aria-label="Volgende pagina">›</button></div></nav>

      <dialog className={styles.sheet} ref={editDialog} aria-label={selectedMember ? `${selectedMember.displayName} bewerken` : "Lid bewerken"} onClose={() => { setSelectedId(null); setDraft(null); }}>
        {selectedMember && draft ? <div className={styles.sheetContent}>
          <header><MemberIdentity member={selectedMember} /><form method="dialog"><button type="submit" aria-label="Sluiten">×</button></form></header>
          <p className={styles.sheetAccount}><span className={`${styles.accountDot} ${selectedMember.accountLinked ? styles.linked : ""}`} />{selectedMember.accountLinked ? "Gekoppeld account" : "Geen gekoppeld account"}</p>
          <div className={styles.sheetSports}>{(["padel", "tennis"] as const).map((sport) => <section key={sport}><h3>{sport === "padel" ? "Padel" : "Tennis"}</h3><label>Profiel<select value={String(draft[sport].active)} onChange={(event) => setDraft({ ...draft, [sport]: { ...draft[sport], active: event.target.value === "true" } })}><option value="true">Actief</option><option value="false">Inactief</option></select></label><label>Niveau<select value={draft[sport].ranking ?? ""} onChange={(event) => setDraft({ ...draft, [sport]: { ...draft[sport], ranking: event.target.value ? Number(event.target.value) : null } })}><option value="">Niet ingesteld</option>{[1, 2, 3, 4, 5].map((value) => <option key={value}>{value}</option>)}</select></label></section>)}</div>
          <section className={styles.sheetRole}><label>Accountrol{canEditRole(selectedMember) ? <select value={draft.role ?? "participant"} onChange={(event) => setDraft({ ...draft, role: event.target.value as AccountRole })}><option value="participant">Deelnemer</option><option value="planner">Planner</option><option value="admin">Admin</option></select> : <span>{draft.role ? ROLE_LABELS[draft.role] : "Geen account"}</span>}</label></section>
          {canAdminister && selectedMember.profileId !== currentProfileId ? <button className={styles.deleteText} type="button" onClick={() => askDelete(selectedMember)}>Lid verwijderen</button> : null}
          <button className={styles.applyButton} type="button" data-initial-focus onClick={applyEditor}>Wijzigingen toepassen</button>
        </div> : null}
      </dialog>

      <dialog className={styles.filterSheet} ref={filterDialog} aria-label="Ledenfilters"><div className={styles.sheetContent}><header><h2>Filters</h2><form method="dialog"><button type="submit" aria-label="Sluiten">×</button></form></header>
        <label>Account<select value={filters.account} onChange={(event) => updateFilters((current) => ({ ...current, account: event.target.value as MemberFilters["account"] }))}><option value="all">Alle leden</option><option value="linked">Gekoppeld</option><option value="unlinked">Geen account</option></select></label>
        <label>Sportprofiel<select value={filters.sport} onChange={(event) => updateFilters((current) => ({ ...current, sport: event.target.value as MemberFilters["sport"] }))}><option value="all">Alle sporten</option><option value="padel">Padel actief</option><option value="tennis">Tennis actief</option><option value="both">Beide actief</option></select></label>
        <label>Niveau<select value={filters.level} onChange={(event) => updateFilters((current) => ({ ...current, level: event.target.value as MemberFilters["level"] }))}><option value="all">Alle niveaus</option><option value="missing">Niveau ontbreekt</option></select></label>
        <button type="button" className={styles.applyButton} onClick={() => filterDialog.current?.close()}>Filters toepassen</button><button type="button" className={styles.clearButton} onClick={clearFilters}>Filters wissen</button>
      </div></dialog>

      <dialog className={styles.deleteDialog} ref={deleteDialog} aria-label="Lid verwijderen">{deleteMember ? <div className={styles.sheetContent}><header><h2>Lid verwijderen?</h2><form method="dialog"><button type="submit" aria-label="Sluiten">×</button></form></header><p>{deleteMember.displayName}{deleteMember.loginEmail ? ` · ${deleteMember.loginEmail}` : ""}</p><p>Dit verwijdert het clublid, sportprofielen, aanmeldingen en het eventueel gekoppelde loginaccount. Historische weergaven behouden waar van toepassing alleen de historische naam.</p><strong>Dit kan niet ongedaan worden gemaakt.</strong><button className={styles.dangerButton} type="button" data-initial-focus onClick={deleteSelectedMember} disabled={saving}>Lid verwijderen</button><form method="dialog"><button className={styles.cancelButton} type="submit">Annuleren</button></form></div> : null}</dialog>

      {dirtyCount ? <div className={styles.saveBar} role="region" aria-label="Niet-opgeslagen wijzigingen"><span><strong>{dirtyCount}</strong> {dirtyCount === 1 ? "lid gewijzigd" : "leden gewijzigd"}</span><button type="button" className={styles.discardButton} disabled={saving} onClick={() => { if (dirtyCount === 1 || window.confirm("Alle niet-opgeslagen wijzigingen wissen?")) setPending({}); }}>Ongedaan maken</button><button type="button" disabled={saving} onClick={saveChanges}>{saving ? "Opslaan…" : `${dirtyCount} ${dirtyCount === 1 ? "wijziging" : "wijzigingen"} opslaan`}</button></div> : null}
    </div>
  );
}
