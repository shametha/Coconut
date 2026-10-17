import styles from "@/app/components/case-workspace.module.css";

export default function CasesLoading() {
  return (
    <main className={styles.statusPage} aria-busy="true">
      <div role="status">
        <span className={styles.kicker}>COCONUT</span>
        <div className={styles.loadingOrbit} aria-hidden="true">
          <i />
          <i />
          <i />
        </div>
        <h1>Following the thread.</h1>
        <p>Opening your investigation workspace…</p>
      </div>
    </main>
  );
}
