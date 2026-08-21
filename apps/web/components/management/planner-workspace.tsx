"use client";

import { useMemo, useState } from "react";

import type {
  EditablePlannerPlayer,
  PlannerCourt,
  PlannerDraft,
  PlannerSearchProfile,
  TosEvent,
} from "../../lib/tos/types";
import { PLANNER_COURTS, PLANNER_SEARCH_PROFILES } from "../../lib/tos/types";
import type { ImportPreviewItem } from "../../lib/tos/planner-draft";
import type { PlannerGeneration } from "../../lib/planner-api/types";
import { Card } from "../ui";

import styles from "./planner-workspace.module.css";

type SafeDraft = Readonly<{
  players: readonly EditablePlannerPlayer[];
  selectedCourts: readonly PlannerCourt[];
  matchMinutes: PlannerDraft["matchMinutes"];
  restMinutes: number;
  searchProfile: PlannerSearchProfile;
  allowRepeatPartners: boolean;
  levelMix: number;
  teamDifferenceTolerance: number;
  revision: number;
  updatedByName: string | null;
  updatedAt: string | null;
}>;

type EditorPlayer = Omit<EditablePlannerPlayer, "linked"> & Readonly<{ linked: boolean; clientKey: string }>;
type SafePlannerEvent = Readonly<Omit<TosEvent, "id">>;
export type SafeScheduleSummary = Readonly<{
  id: string;
  createdByName: string;
  isPublished: boolean;
  generationSeed: number;
  plannerDraftRevision: number;
  createdAt: string;
  canPublish: boolean;
}>;
export type SafeScheduleDetail = Readonly<{
  id: string;
  title: string;
  eventDate: string;
  startTime: string;
  endTime: string;
  matchMinutes: number;
  courts: readonly string[];
  schedule: PlannerGeneration["schedule"];
  statistics: PlannerGeneration["statistics"];
  diagnostics: PlannerGeneration["diagnostics"];
}>;

const DISPOSITION_LABELS: Record<ImportPreviewItem["disposition"], string> = {
  add: "Toevoegen",
  update: "Bijwerken",
  unchanged: "Ongewijzigd",
  declined: "Afgemeld — overslaan",
  approval: "Goedkeuring ontbreekt",
  member: "Lid inactief",
  "sport-profile": "Padelprofiel inactief",
  ranking: "Padelniveau ontbreekt",
  availability: "Beschikbaarheid ongeldig",
  "identity-conflict": "Dubbele ledenkoppeling",
  "legacy-name-conflict": "Naamconflict met handmatige rij",
};

function clientKey(): string {
  return globalThis.crypto?.randomUUID?.() ?? `local-${Date.now()}-${Math.random()}`;
}

function savedAt(value: string): string {
  return new Intl.DateTimeFormat("nl-NL", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/Amsterdam",
  }).format(new Date(value));
}

export function PlannerWorkspace({
  event,
  draft,
  importPreview,
  schedules,
  selectedSchedule,
}: {
  event: SafePlannerEvent;
  draft: SafeDraft;
  importPreview: readonly ImportPreviewItem[];
  schedules: readonly SafeScheduleSummary[];
  selectedSchedule: SafeScheduleDetail | null;
}) {
  const [players, setPlayers] = useState<EditorPlayer[]>(() => draft.players.map((player) => ({ ...player, clientKey: clientKey() })));
  const [selectedCourts, setSelectedCourts] = useState<PlannerCourt[]>([...draft.selectedCourts]);
  const [allowRepeatPartners, setAllowRepeatPartners] = useState(draft.allowRepeatPartners);
  const [generation, setGeneration] = useState<PlannerGeneration | null>(null);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [dirty, setDirty] = useState(false);
  const serializedPlayers = useMemo(() => JSON.stringify(players.map((player) => ({
    rowId: player.rowId,
    name: player.name,
    ranking: player.ranking,
    included: player.included,
    availableFrom: player.availableFrom,
    availableUntil: player.availableUntil,
  }))), [players]);

  function markDirty() {
    setDirty(true);
    setGeneration(null);
    setGenerationError(null);
  }

  function updatePlayer(index: number, update: Partial<EditorPlayer>) {
    markDirty();
    setPlayers((current) => current.map((player, position) => position === index ? { ...player, ...update } : player));
  }

  function addPlayer() {
    markDirty();
    const from = new Intl.DateTimeFormat("nl-NL", { timeZone: "Europe/Amsterdam", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(event.startsAt));
    const until = new Intl.DateTimeFormat("nl-NL", { timeZone: "Europe/Amsterdam", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(event.endsAt));
    setPlayers((current) => [...current, {
      clientKey: clientKey(), rowId: "", name: "", ranking: 3, included: true,
      availableFrom: from, availableUntil: until, linked: false,
    }]);
  }

  async function generate() {
    setGenerating(true);
    setGenerationError(null);
    try {
      const response = await fetch("/api/beheer/tos/planner/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug: event.slug, expected_revision: draft.revision }),
        credentials: "same-origin",
      });
      const body: unknown = await response.json();
      if (!response.ok || !body || typeof body !== "object" || Array.isArray(body)) throw new Error();
      const value = body as Record<string, unknown>;
      if (!Number.isSafeInteger(value.seed) || !Array.isArray(value.schedule) || !Array.isArray(value.statistics) ||
          !value.diagnostics || typeof value.diagnostics !== "object") throw new Error();
      setGeneration(value as PlannerGeneration);
    } catch {
      setGeneration(null);
      setGenerationError("Er kon met deze opzet geen geldig schema worden gemaakt.");
    } finally {
      setGenerating(false);
    }
  }

  return (
    <section className={styles.stack} aria-labelledby="planner-heading">
      <Card className={styles.card}>
        <div className={styles.headingRow}>
          <div>
            <h2 id="planner-heading">Planneropzet</h2>
            <p>Revisie {draft.revision}{draft.updatedByName ? ` · laatst opgeslagen door ${draft.updatedByName}` : " · nog niet opgeslagen"}</p>
          </div>
          <a className={styles.reload} href={`/beheer/tos/${event.slug}`}>Opnieuw laden</a>
        </div>
      </Card>

      <Card className={styles.card}>
        <h2>Aanmeldingen overnemen</h2>
        <p className={styles.muted}>Alleen geldige padelaanmeldingen worden toegevoegd of via hun stabiele ledenkoppeling bijgewerkt. Handmatige rijen blijven staan.</p>
        {importPreview.length ? (
          <ul className={styles.previewList}>
            {importPreview.map((item, index) => <li key={`${item.displayName}-${index}`}><strong>{item.displayName}</strong><span>{DISPOSITION_LABELS[item.disposition]}</span></li>)}
          </ul>
        ) : <p className={styles.muted}>Er zijn nog geen registraties om te beoordelen.</p>}
        <form action="/api/beheer/tos/planner/import" method="post">
          <input type="hidden" name="slug" value={event.slug} />
          <input type="hidden" name="expected_revision" value={draft.revision} />
          <button className={styles.secondaryButton} type="submit">Aanmeldingen verwerken</button>
        </form>
      </Card>

      <form action="/api/beheer/tos/planner/save" method="post" className={styles.stack} onChange={markDirty}>
        <input type="hidden" name="slug" value={event.slug} />
        <input type="hidden" name="expected_revision" value={draft.revision} />
        <input type="hidden" name="players" value={serializedPlayers} />
        <input type="hidden" name="selected_courts" value={JSON.stringify(selectedCourts)} />
        <input type="hidden" name="allow_repeat_partners" value={String(allowRepeatPartners)} />

        <Card className={styles.card}>
          <div className={styles.headingRow}>
            <div><h2>Spelers</h2><p>{players.filter((player) => player.included).length} geselecteerd</p></div>
            <button className={styles.secondaryButton} type="button" onClick={addPlayer}>Handmatige speler toevoegen</button>
          </div>
          <div className={styles.playerList}>
            {players.map((player, index) => (
              <fieldset className={styles.playerRow} key={player.clientKey}>
                <legend>{player.linked ? "Gekoppelde speler" : "Handmatige speler"}</legend>
                <label className={styles.checkbox}><input type="checkbox" checked={player.included} onChange={(event) => updatePlayer(index, { included: event.target.checked })} /> Meedoen</label>
                <label>Naam<input required maxLength={120} value={player.name} onChange={(event) => updatePlayer(index, { name: event.target.value })} /></label>
                <label>Niveau<input type="number" min="1" max="5" step="1" required value={player.ranking} onChange={(event) => updatePlayer(index, { ranking: Number(event.target.value) })} /></label>
                <label>Vanaf<input type="time" step="60" required value={player.availableFrom} onChange={(event) => updatePlayer(index, { availableFrom: event.target.value })} /></label>
                <label>Tot<input type="time" step="60" required value={player.availableUntil} onChange={(event) => updatePlayer(index, { availableUntil: event.target.value })} /></label>
                <button className={styles.removeButton} type="button" onClick={() => { markDirty(); setPlayers((current) => current.filter((_, position) => position !== index)); }}>Verwijderen</button>
              </fieldset>
            ))}
          </div>
        </Card>

        <Card className={styles.card}>
          <h2>Plannerinstellingen</h2>
          <div className={styles.courts}>
            {PLANNER_COURTS.map((court) => <label className={styles.checkbox} key={court}><input type="checkbox" checked={selectedCourts.includes(court)} onChange={(event) => { markDirty(); setSelectedCourts((current) => event.target.checked ? [...current, court] : current.filter((entry) => entry !== court)); }} /> {court}</label>)}
          </div>
          <div className={styles.settings}>
            <label>Wedstrijdduur<select name="match_minutes" defaultValue={draft.matchMinutes}>{[15,20,25,30].map((value) => <option value={value} key={value}>{value} minuten</option>)}</select></label>
            <label>Pauze<input name="rest_minutes" type="number" min="0" max="30" defaultValue={draft.restMinutes} /></label>
            <label>Zoekprofiel<select name="search_profile" defaultValue={draft.searchProfile}>{PLANNER_SEARCH_PROFILES.map((value) => <option key={value}>{value}</option>)}</select></label>
            <label>Niveaumix<input name="level_mix" type="number" min="0" max="100" defaultValue={draft.levelMix} /></label>
            <label>Teamtolerantie<input name="team_difference_tolerance" type="number" min="0" max="1.5" step="0.1" defaultValue={draft.teamDifferenceTolerance} /></label>
            <label className={styles.checkbox}><input type="checkbox" checked={allowRepeatPartners} onChange={(event) => setAllowRepeatPartners(event.target.checked)} /> Herhaalde partners toestaan</label>
          </div>
          <button className={styles.primaryButton} type="submit">Planneropzet opslaan</button>
          {dirty ? <p className={styles.unsaved} role="status">Niet-opgeslagen wijzigingen — sla eerst op voordat je genereert.</p> : null}
        </Card>
      </form>

      <Card className={styles.card}>
        <h2>Schema genereren</h2>
        <p className={styles.muted}>Sla wijzigingen eerst op. Iedere generatie gebruikt een nieuwe willekeurige seed.</p>
        <button className={styles.primaryButton} type="button" disabled={draft.revision < 1 || dirty || generating} onClick={generate}>
          {generating ? "Schema wordt gemaakt…" : "Schema genereren"}
        </button>
        {generationError ? <p role="alert">{generationError}</p> : null}
        {generation ? (
          <div className={styles.generation}>
            <h3>Controleer het voorstel</h3>
            <p>{generation.schedule.length} baanindelingen · seed {generation.seed}</p>
            <div className={styles.scheduleRows}>
              {generation.schedule.map((row, index) => (
                <div key={`${row.Ronde}-${row.Baan}-${index}`}>
                  <strong>Ronde {row.Ronde} · {row.Tijd} · {row.Baan}</strong>
                  <span>{row["Team 1"]} tegen {row["Team 2"]}</span>
                  <small>Niveau {row["Niveau T1"]} – {row["Niveau T2"]} · verschil {row.Teamverschil}</small>
                  <small>Rust: {row.Rust}</small>
                </div>
              ))}
            </div>
            <details><summary>Spelerstatistieken</summary><pre>{JSON.stringify(generation.statistics, null, 2)}</pre></details>
            <details><summary>Plannerdiagnostiek</summary><pre>{JSON.stringify(generation.diagnostics, null, 2)}</pre></details>
            <form action="/api/beheer/tos/planner/schedule/save" method="post">
              <input type="hidden" name="slug" value={event.slug} />
              <input type="hidden" name="expected_revision" value={draft.revision} />
              <input type="hidden" name="generation_seed" value={generation.seed} />
              <button className={styles.primaryButton} type="submit">Dit schema privé opslaan</button>
            </form>
          </div>
        ) : null}
      </Card>

      <Card className={styles.card}>
        <h2>Opgeslagen schema’s</h2>
        {schedules.length ? <ul className={styles.savedSchedules}>
          {schedules.map((schedule) => <li key={schedule.id}>
            <div>
              <strong>{schedule.isPublished ? "Gepubliceerd" : "Privé schema"}</strong>
              <span>{savedAt(schedule.createdAt)} · {schedule.id.slice(0, 8)} · revisie {schedule.plannerDraftRevision} · door {schedule.createdByName}</span>
              <a href={`/beheer/tos/${event.slug}?schedule=${encodeURIComponent(schedule.id)}`}>Schema bekijken</a>
            </div>
            <div className={styles.scheduleActions}>
              {schedule.isPublished ? <a href="/live">Open live schema</a> : null}
              {schedule.canPublish ? <form action="/api/beheer/tos/planner/schedule/publish" method="post">
                <input type="hidden" name="slug" value={event.slug} />
                <input type="hidden" name="schedule_id" value={schedule.id} />
                <input type="hidden" name="published" value={String(!schedule.isPublished)} />
                <button className={styles.secondaryButton} type="submit">{schedule.isPublished ? "Publicatie intrekken" : "Publiceren"}</button>
              </form> : null}
            </div>
          </li>)}
        </ul> : <p className={styles.muted}>Nog geen schema’s voor dit event opgeslagen.</p>}
      </Card>

      {selectedSchedule ? <Card className={styles.card}>
        <div className={styles.headingRow}>
          <div>
            <h2>Opgeslagen schema controleren</h2>
            <p>{selectedSchedule.eventDate} · {selectedSchedule.startTime}–{selectedSchedule.endTime} · {selectedSchedule.matchMinutes} minuten</p>
          </div>
          <a className={styles.reload} href={`/beheer/tos/${event.slug}`}>Sluiten</a>
        </div>
        <div className={styles.scheduleRows}>
          {selectedSchedule.schedule.map((row, index) => <div key={`${row.Ronde}-${row.Baan}-${index}`}>
            <strong>Ronde {row.Ronde} · {row.Tijd} · {row.Baan}</strong>
            <span>{row["Team 1"]} tegen {row["Team 2"]}</span>
            <small>Rust: {row.Rust}</small>
            <small>Niveau {row["Niveau T1"]} – {row["Niveau T2"]} · verschil {row.Teamverschil}</small>
          </div>)}
        </div>
        <details><summary>Spelerstatistieken</summary><pre>{JSON.stringify(selectedSchedule.statistics, null, 2)}</pre></details>
        <details><summary>Plannerdiagnostiek</summary><pre>{JSON.stringify(selectedSchedule.diagnostics, null, 2)}</pre></details>
      </Card> : null}
    </section>
  );
}

export type { SafeDraft };
