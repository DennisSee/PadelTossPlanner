import type { StaffMemberDirectoryItem, TosSport } from "../../lib/tos/types";
import { Badge, Card, SecondaryLinkButton } from "../ui";

import styles from "./member-management.module.css";

const APPROVAL_LABELS = {
  approved: "Goedgekeurd",
  pending: "In behandeling",
  rejected: "Afgewezen",
} as const;

function SportProfileForm({ member, sport }: { member: StaffMemberDirectoryItem; sport: TosSport }) {
  const active = sport === "padel" ? member.padelProfileActive : member.tennisProfileActive;
  const ranking = sport === "padel" ? member.padelRanking : member.tennisRanking;
  return (
    <form className={styles.sportForm} action="/api/beheer/leden/sport-profile" method="post">
      <input type="hidden" name="member_id" value={member.memberId} />
      <input type="hidden" name="sport" value={sport} />
      <h3>{sport === "padel" ? "Padel" : "Tennis"}</h3>
      <label>
        Profiel
        <select name="active" defaultValue={String(active)}>
          <option value="true">Actief</option>
          <option value="false">Inactief</option>
        </select>
      </label>
      <label>
        Niveau
        <select name="ranking" defaultValue={ranking ?? ""}>
          <option value="">Nog niet ingesteld</option>
          {[1, 2, 3, 4, 5].map((value) => <option key={value} value={value}>{value}</option>)}
        </select>
      </label>
      <button type="submit">{sport === "padel" ? "Padelprofiel" : "Tennisprofiel"} opslaan</button>
    </form>
  );
}

export function MemberManagement({
  members,
  query,
}: {
  members: readonly StaffMemberDirectoryItem[];
  query: string;
}) {
  return (
    <div className={styles.stack}>
      <div className={styles.toolbar}>
        <form method="get">
          <label htmlFor="member-search">Zoeken op naam of e-mailadres</label>
          <input id="member-search" name="q" maxLength={80} defaultValue={query} type="search" />
          <button type="submit">Zoeken</button>
        </form>
        <SecondaryLinkButton href="/beheer">← Terug naar TOS-beheer</SecondaryLinkButton>
      </div>
      <p className={styles.resultCount}>{members.length} {members.length === 1 ? "lid" : "leden"}</p>
      {members.length ? (
        <div className={styles.memberGrid}>
          {members.map((member) => (
            <Card className={styles.memberCard} key={member.memberId}>
              <header>
                <div>
                  <h2>{member.displayName}</h2>
                  <p className={styles.loginEmail}>
                    {member.loginEmail ?? (member.accountLinked ? "Geen login-e-mailadres beschikbaar" : "Geen gekoppeld account")}
                  </p>
                  <p className={styles.accountState}>{member.accountLinked ? "Account gekoppeld" : "Geen gekoppeld account"}</p>
                </div>
                <div className={styles.badges}>
                  <Badge tone={member.approvalStatus === "approved" ? "success" : member.approvalStatus === "pending" ? "warning" : "danger"}>
                    {APPROVAL_LABELS[member.approvalStatus]}
                  </Badge>
                  <Badge tone={member.memberActive ? "success" : "neutral"}>
                    {member.memberActive ? "Lid actief" : "Lid inactief"}
                  </Badge>
                </div>
              </header>
              <div className={styles.sports}>
                <SportProfileForm member={member} sport="padel" />
                <SportProfileForm member={member} sport="tennis" />
              </div>
            </Card>
          ))}
        </div>
      ) : <p>Geen leden gevonden.</p>}
    </div>
  );
}
