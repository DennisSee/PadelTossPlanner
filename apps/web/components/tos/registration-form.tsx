"use client";

import { useState } from "react";

import { TIME_INPUT_STEP_SECONDS } from "../../lib/tos/time";
import type { RegistrationResponse } from "../../lib/tos/types";

import styles from "./tos.module.css";

export function RegistrationForm({
  slug,
  initialResponse,
  initialFrom,
  initialUntil,
  existing,
}: {
  slug: string;
  initialResponse: RegistrationResponse;
  initialFrom: string;
  initialUntil: string;
  existing: boolean;
}) {
  const [response, setResponse] = useState<RegistrationResponse>(initialResponse);
  return (
    <form className={styles.form} action="/api/tos/registration" method="post">
      <input type="hidden" name="slug" value={slug} />
      <fieldset className={styles.field}>
        <legend>Jouw keuze</legend>
        <div className={styles.choiceRow}>
          <label className={styles.choice}>
            <input
              type="radio"
              name="response"
              value="attending"
              checked={response === "attending"}
              onChange={() => setResponse("attending")}
            />
            Ik doe mee
          </label>
          <label className={styles.choice}>
            <input
              type="radio"
              name="response"
              value="declined"
              checked={response === "declined"}
              onChange={() => setResponse("declined")}
            />
            Ik doe niet mee
          </label>
        </div>
      </fieldset>
      <div className={styles.timeGrid} hidden={response !== "attending"}>
        <label className={styles.field} htmlFor="available-from">
          Vanaf
          <input
            className={styles.input}
            id="available-from"
            name="available_from"
            type="time"
            step={TIME_INPUT_STEP_SECONDS}
            required={response === "attending"}
            defaultValue={initialFrom}
          />
        </label>
        <label className={styles.field} htmlFor="available-until">
          Tot
          <input
            className={styles.input}
            id="available-until"
            name="available_until"
            type="time"
            step={TIME_INPUT_STEP_SECONDS}
            required={response === "attending"}
            defaultValue={initialUntil}
          />
        </label>
      </div>
      <button className={styles.primaryButton} type="submit">
        {existing ? "Aanmelding wijzigen" : "Aanmelden"}
      </button>
    </form>
  );
}
