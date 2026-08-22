"use client";

import { useId, useRef, type ReactNode } from "react";

import styles from "./ui.module.css";

export function ActionDialog({
  triggerLabel,
  title,
  description,
  children,
  triggerClassName = "",
  dialogClassName = "",
  cancelLabel = "Annuleren",
}: {
  triggerLabel: ReactNode;
  title: string;
  description?: string;
  children: ReactNode;
  triggerClassName?: string;
  dialogClassName?: string;
  cancelLabel?: string;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  function openDialog() {
    const current = dialog.current;
    if (!current) return;
    current.showModal();
    window.requestAnimationFrame(() => {
      current.querySelector<HTMLElement>("[data-dialog-initial]")?.focus();
    });
  }

  return (
    <>
      <button
        className={`${styles.dialogTrigger} ${triggerClassName}`.trim()}
        type="button"
        onClick={openDialog}
      >
        {triggerLabel}
      </button>
      <dialog
        className={`${styles.actionDialog} ${dialogClassName}`.trim()}
        ref={dialog}
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
      >
        <div className={styles.dialogHandle} aria-hidden="true" />
        <header className={styles.actionDialogHeader}>
          <div>
            <h2 id={titleId}>{title}</h2>
            {description ? <p id={descriptionId}>{description}</p> : null}
          </div>
          <form method="dialog">
            <button className={styles.dialogIconClose} type="submit" aria-label="Sluiten">×</button>
          </form>
        </header>
        <div className={styles.actionDialogBody}>{children}</div>
        <form className={styles.actionDialogCancel} method="dialog">
          <button type="submit">{cancelLabel}</button>
        </form>
      </dialog>
    </>
  );
}
