"use client";

import { useEffect, useState } from "react";
import { Loader2, Mail, Trash2 } from "lucide-react";

import {
  useProjectEmails,
  useSaveProjectEmails,
  type RecipientDraft,
} from "@/hooks/use-project-emails";
import { describeError } from "@/lib/errors";
import styles from "./legacy.module.css";

/**
 * Who gets told when this structure misbehaves.
 *
 * A reading crossing its trigger or threshold already sends mail; until now
 * there was no way to put an address on the list — the API had no field for
 * one, so the only row it could create stored a number in the email column.
 *
 * Each recipient carries a name so the warning can open "Hello Asha," rather
 * than at a bare address, and can be switched off without being deleted: a
 * contact who is on leave should stop receiving alerts, not be forgotten.
 */
export function AlertRecipients({
  uniqueId,
  canEdit,
}: {
  uniqueId: string | null;
  canEdit: boolean;
}) {
  const query = useProjectEmails(uniqueId);
  const save = useSaveProjectEmails(uniqueId);

  const [rows, setRows] = useState<RecipientDraft[]>([]);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (query.data) {
      setRows(
        query.data.map((r) => ({
          emailId: r.id,
          email: r.email,
          name: r.name,
          isEnable: r.isEnable,
        })),
      );
    }
  }, [query.data]);

  const commit = (next: RecipientDraft[]) => {
    setRows(next);
    setError(null);
    save.mutate(next, {
      onError: (e) => {
        const d = describeError(e);
        setError(`${d.title} — ${d.description}`);
        // Put back what the server still holds, so the list never shows a
        // recipient that was not actually saved.
        query.refetch();
      },
    });
  };

  const add = (e: React.FormEvent) => {
    e.preventDefault();
    const address = email.trim();
    if (!address) return;
    if (rows.some((r) => r.email?.toLowerCase() === address.toLowerCase())) {
      setError("That address is already on the list.");
      return;
    }
    commit([...rows, { email: address, name: name.trim() || null, isEnable: true }]);
    setName("");
    setEmail("");
  };

  return (
    <div className={styles.recipients}>
      <div className={styles.recipientsHead}>
        <Mail size={15} strokeWidth={1.75} />
        <span className={styles.recipientsTitle}>Alert recipients</span>
      </div>
      <p className={styles.recipientsNote}>
        Emailed when a sensor on this project reads beyond its trigger or
        threshold.
      </p>

      {query.isLoading ? (
        <p className={styles.recipientsEmpty}>Loading…</p>
      ) : rows.length === 0 ? (
        <p className={styles.recipientsEmpty}>
          No one is being alerted for this project yet.
        </p>
      ) : (
        <ul className={styles.recipientsList}>
          {rows.map((r) => (
            <li key={r.emailId ?? r.email} className={styles.recipientRow}>
              <label className={styles.recipientToggle}>
                <input
                  type="checkbox"
                  checked={r.isEnable}
                  disabled={!canEdit || save.isPending}
                  onChange={(e) =>
                    commit(
                      rows.map((x) =>
                        x === r ? { ...x, isEnable: e.target.checked } : x,
                      ),
                    )
                  }
                />
                <span className={styles.recipientWho}>
                  <span className={styles.recipientName}>
                    {r.name || r.email}
                  </span>
                  {r.name && (
                    <span className={styles.recipientAddress}>{r.email}</span>
                  )}
                </span>
              </label>
              {canEdit && (
                <button
                  type="button"
                  aria-label={`Remove ${r.email}`}
                  className={styles.recipientRemove}
                  disabled={save.isPending}
                  onClick={() => commit(rows.filter((x) => x !== r))}
                >
                  <Trash2 size={14} />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {canEdit && (
        <form className={styles.recipientForm} onSubmit={add}>
          <input
            className={styles.recipientInput}
            placeholder="Name"
            aria-label="Recipient name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <input
            className={styles.recipientInput}
            type="email"
            required
            placeholder="name@company.com"
            aria-label="Recipient email address"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <button
            type="submit"
            className={`${styles.pill} ${styles.pillDone}`}
            disabled={save.isPending}
          >
            {save.isPending && <Loader2 size={14} className="mo-spin" aria-hidden="true" />}
            {save.isPending ? "Saving…" : "Add"}
          </button>
        </form>
      )}

      {error && (
        <p role="alert" className={styles.uploadError}>
          {error}
        </p>
      )}
    </div>
  );
}
