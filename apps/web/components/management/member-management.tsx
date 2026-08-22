import type { StaffMemberDirectoryItem, TosSport } from "../../lib/tos/types";
import { ActionDialog, Badge, Card, SecondaryLinkButton } from "../ui";

import styles from "./member-management.module.css";

const APPROVAL_LABELS = {
  approved: "Goedgekeurd",
  pending: "In behandeling",
  rejected: "Afgewezen",
} as const;
const ROLE_LABELS = { participant: "Deelnemer", planner: "Planner", admin: "Beheerder" } as const;

function RoleManagement({ member, canAdminister, currentProfileId }: { member: StaffMemberDirectoryItem; canAdminister: boolean; currentProfileId: string }) {
  if (!member.profileId || !member.accountRole) return <p className={styles.roleState}><strong>Accountrol</strong> Geen gekoppeld account</p>;
  const ownAccount = member.profileId === currentProfileId;
  return (
    <div className={styles.roleState}>
      <p><strong>Accountrol</strong> <Badge tone={member.accountRole === "participant" ? "neutral" : "warning"}>{ROLE_LABELS[member.accountRole]}</Badge></p>
      {canAdminister && !ownAccount ? (
        <ActionDialog triggerLabel="Accountrol wijzigen" title={`Accountrol van ${member.displayName}`} description="Clublidmaatschap en sportprofielen blijven ongewijzigd." triggerClassName={styles.roleTrigger}>
          <form className={styles.roleForm} action="/api/beheer/leden/role" method="post">
            <input type="hidden" name="profile_id" value={member.profileId} />
            <label>Nieuwe accountrol<select name="role" defaultValue={member.accountRole}><option value="participant">Deelnemer</option><option value="planner">Planner</option><option value="admin">Beheerder</option></select></label>
            <p>Je wijzigt alleen de staffrol. De toegang als clublid blijft apart bepaald.</p>
            <button type="submit">Rolwijziging bevestigen</button>
          </form>
        </ActionDialog>
      ) : <span className={styles.roleHint}>{ownAccount ? "Je kunt je eigen rol niet wijzigen." : "Alleen een admin kan accountrollen wijzigen."}</span>}
    </div>
  );
}

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
  canAdminister,
  currentProfileId,
}: {
  members: readonly StaffMemberDirectoryItem[];
  query: string;
  canAdminister: boolean;
  currentProfileId: string;
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
              <RoleManagement member={member} canAdminister={canAdminister} currentProfileId={currentProfileId} />
            </Card>
          ))}
        </div>
      ) : <p>Geen leden gevonden.</p>}
    </div>
  );
}
