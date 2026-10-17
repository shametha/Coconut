"use client";

import { ActionArrow } from "./action-arrow";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { sections } from "./case-navigation";
import styles from "./case-workspace.module.css";

export function CaseLoading({ id }: { id: string }) {
  const pathname = usePathname();
  const base = `/cases/${id}`;
  return (
    <div className={styles.workspace}>
      <header className={styles.siteHeader}>
        <Link className={styles.brand} href="/" aria-label="Coconut homepage">
          coconut
        </Link>
        <span className={styles.headerCaption}>FOLLOW THE EVIDENCE</span>
        <Link className={styles.allCases} href="/cases">
          All cases{" "}
          <span aria-hidden="true">
            <ActionArrow />
          </span>
        </Link>
      </header>
      <div className={styles.caseLayout}>
        <aside className={styles.sidebar}>
          <div className={styles.sidebarHead}>
            <span className={styles.kicker}>INVESTIGATION</span>
            <strong>{id}</strong>
          </div>
          <nav className={styles.sectionNav} aria-label="Case sections">
            {sections.map((section) => (
              <Link
                key={section.path}
                href={base + section.path}
                prefetch={false}
                aria-current={
                  pathname === base + section.path ? "page" : undefined
                }
              >
                <span>{section.number}</span>
                {section.label}
                <span aria-hidden="true">
                  <ActionArrow />
                </span>
              </Link>
            ))}
          </nav>
        </aside>
        <main
          className={styles.caseMain}
          aria-busy="true"
          aria-label="Loading investigation"
        >
          <div className={styles.caseHeading}>
            <div>
              <span className={styles.kicker}>CASE {id}</span>
              <h1>Opening investigation.</h1>
              <p role="status">Checking case records and their sources…</p>
            </div>
          </div>
          <div className={styles.workspaceSkeleton} aria-hidden="true">
            <div className={styles.skeletonLine} />
            <div className={styles.skeletonCards}>
              {[0, 1, 2].map((index) => (
                <div key={index}>
                  <i />
                  <i />
                  <i />
                </div>
              ))}
            </div>
            <div className={styles.skeletonDetail}>
              <i />
              <i />
              <i />
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
