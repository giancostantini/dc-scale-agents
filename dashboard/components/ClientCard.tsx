"use client";

import { useRouter } from "next/navigation";
import type { Client } from "@/lib/types";
import styles from "./ClientCard.module.css";

export default function ClientCard({ client }: { client: Client }) {
  const router = useRouter();

  const statusClass =
    client.status === "active"
      ? styles.statusActive
      : client.status === "onboarding"
      ? styles.statusOnboarding
      : styles.statusDev;

  const badgeClass =
    client.type === "gp" ? styles.badgeGp : styles.badgeDev;

  return (
    <button
      className={styles.card}
      onClick={() => router.push(`/cliente/${client.id}`)}
    >
      <div className={`${styles.statusBar} ${statusClass}`} />
      <div className={`${styles.badge} ${badgeClass}`}>
        {client.type === "gp" ? "Growth Partner" : "Desarrollo"}
      </div>
      <div className={styles.logoBig}>{client.initials}</div>
      <div className={styles.name}>{client.name}</div>
    </button>
  );
}
