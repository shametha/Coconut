"use client";

import { ActionArrow } from "@/app/components/action-arrow";
import Link from "next/link";
import styles from "@/app/components/case-workspace.module.css";

export default function CasesError({ reset }: { reset: () => void }) {
  return (
    <main className={styles.statusPage}>
      <div>
        <span className={styles.kicker}>CASE SOURCE</span>
        <h1>Unable to load case records.</h1>
        <p>
          The source checks could not finish. Retry to check the current records
          again.
        </p>
        <button type="button" className={styles.textButton} onClick={reset}>
          Try again{" "}
          <span aria-hidden="true">
            <ActionArrow />
          </span>
        </button>
        <p>
          <Link href="/cases">Return to all cases</Link>
        </p>
      </div>
    </main>
  );
}
