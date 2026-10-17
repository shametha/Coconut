import { ActionArrow } from "@/app/components/action-arrow";
import Link from "next/link";
import styles from "@/app/components/case-workspace.module.css";

export default function CaseNotFound() {
  return (
    <main className={styles.statusPage}>
      <div>
        <span className={styles.kicker}>CASE NOT FOUND</span>
        <h1>That case is not available.</h1>
        <p>Choose a case from the inbox to continue.</p>
        <Link href="/cases">
          Return to cases <ActionArrow />
        </Link>
      </div>
    </main>
  );
}
