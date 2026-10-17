import { ActionArrow } from "@/app/components/action-arrow";
import Link from "next/link";
import styles from "@/app/components/case-workspace.module.css";

export default function NotFound() {
  return (
    <main className={styles.statusPage}>
      <div>
        <span className={styles.kicker}>404 / A MISSING CONNECTION</span>
        <div className={styles.loadingOrbit} aria-hidden="true">
          <i />
          <i />
          <i />
        </div>
        <h1>This path ends here.</h1>
        <p>The page you’re looking for isn’t available.</p>
        <Link href="/cases">
          Return to the case inbox <ActionArrow />
        </Link>
      </div>
    </main>
  );
}
