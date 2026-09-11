"use client";

import { useRef } from "react";
import { CheckCircle2, Upload, VideoOff } from "lucide-react";

import styles from "./legacy.module.css";

/**
 * The two panels down the left of the project dashboard.
 *
 * Upper is the site's LIVE VIDEO, lower is the project image the assigned
 * contractor uploads. They are not two interchangeable image slots, which is
 * what they used to be.
 *
 * When a project has finished, the upper panel stops showing a feed and says
 * so. A camera pointed at a completed site is either off or showing something
 * that is no longer this project, and continuing to present it as "live" would
 * be worse than saying nothing. The project image below is unaffected — it is
 * the record of the work and stays.
 */

/** Base64 of a picked file, for the existing base64 upload endpoint. */
function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export function LiveVideoPanel({
  url,
  finished,
}: {
  url: string | null;
  finished: boolean;
}) {
  if (finished) {
    return (
      <div className={styles.imageSlot}>
        <div className={styles.projectDone}>
          <CheckCircle2 size={34} strokeWidth={1.5} />
          <p className={styles.projectDoneTitle}>Project Done</p>
          <p className={styles.projectDoneNote}>
            Monitoring for this project has ended.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.imageSlot}>
      <div className={styles.mediaBody}>
        {url ? (
          // muted so a browser will actually autoplay it.
          <video
            className={styles.video}
            src={url}
            controls
            autoPlay
            muted
            playsInline
          />
        ) : (
          <span className={styles.mediaPlaceholder}>
            <VideoOff size={22} strokeWidth={1.5} />
            No live video configured
          </span>
        )}
      </div>
    </div>
  );
}

export function ProjectImagePanel({
  src,
  canUpload,
  onUpload,
  uploading,
  error,
}: {
  src: string | null;
  canUpload: boolean;
  onUpload: (dataUrl: string) => void;
  uploading: boolean;
  /** Shown IN THIS PANEL: an upload failure reported elsewhere on the page is
      one the person who tried to upload will never see. */
  error: string | null;
}) {
  const fileRef = useRef<HTMLInputElement>(null);

  return (
    <div className={styles.imageSlot}>
      {canUpload && (
        <>
          <button
            type="button"
            className={styles.editBtn}
            aria-label="Upload project image"
            onClick={() => fileRef.current?.click()}
          >
            <Upload size={16} />
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            hidden
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              onUpload(await readAsDataUrl(file));
              // Reset so re-picking the same file fires change again.
              e.target.value = "";
            }}
          />
        </>
      )}

      <div className={styles.mediaBody}>
        {uploading ? (
          <span className={styles.mediaPlaceholder}>Uploading…</span>
        ) : src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt="Project" className={styles.dashImage} />
        ) : (
          <span className={styles.mediaPlaceholder}>
            {canUpload
              ? "No project image yet — upload one"
              : "No project image yet"}
          </span>
        )}
      </div>

      {error && (
        <p role="alert" className={styles.uploadError}>
          {error}
        </p>
      )}
    </div>
  );
}
