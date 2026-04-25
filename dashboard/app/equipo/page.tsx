"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Topbar from "@/components/Topbar";
import InviteUserModal from "@/components/InviteUserModal";
import {
  getCurrentProfile,
  hasSession,
  type Profile,
  type ClientAssignment,
} from "@/lib/supabase/auth";
import { listProfiles, listAllAssignments } from "@/lib/team";
import styles from "./equipo.module.css";

export default function EquipoPage() {
  const router = useRouter();
  const [authChecked, setAuthChecked] = useState(false);
  const [me, setMe] = useState<Profile | null>(null);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [assignments, setAssignments] = useState<ClientAssignment[]>([]);
  const [inviteOpen, setInviteOpen] = useState(false);

  async function refresh() {
    const [list, asg] = await Promise.all([
      listProfiles(),
      listAllAssignments(),
    ]);
    setProfiles(list);
    setAssignments(asg);
  }

  useEffect(() => {
    hasSession().then(async (has) => {
      if (!has) {
        router.replace("/");
        return;
      }
      setAuthChecked(true);
      const p = await getCurrentProfile();
      setMe(p);
      refresh();
    });
  }, [router]);

  if (!authChecked || !me) return null;

  const isDirector = me.role === "director";

  // count assignments per user
  const countByUser: Record<string, number> = {};
  for (const a of assignments) {
    countByUser[a.user_id] = (countByUser[a.user_id] ?? 0) + 1;
  }

  return (
    <>
      <Topbar showPrimary={false} />

      <main className={styles.wrap}>
        <div className={styles.head}>
          <div>
            <div className={styles.eyebrow}>Equipo</div>
            <h1>Miembros del equipo</h1>
            <div className={styles.sub}>
              {profiles.length} {profiles.length === 1 ? "persona" : "personas"}{" "}
              · {profiles.filter((p) => p.role === "director").length}{" "}
              director(es)
            </div>
          </div>
          <div className={styles.actions}>
            <Link href="/perfil" className={styles.btnGhost}>
              Mi perfil
            </Link>
            {isDirector && (
              <button
                className={styles.btnSolid}
                onClick={() => setInviteOpen(true)}
              >
                + Invitar persona
              </button>
            )}
          </div>
        </div>

        {!isDirector && (
          <div className={styles.banner}>
            Visualizás el equipo en modo lectura. Para modificar pagos,
            asignaciones o invitar gente, hablá con un director.
          </div>
        )}

        <div className={styles.list}>
          {profiles.map((p) => {
            const isMe = p.id === me.id;
            return (
              <Link
                key={p.id}
                href={isDirector || isMe ? `/equipo/${p.id}` : `/perfil`}
                className={styles.row}
              >
                <div className={styles.avatar}>
                  {p.initials || "??"}
                </div>
                <div className={styles.info}>
                  <div className={styles.name}>
                    {p.name}
                    {isMe && <span className={styles.youTag}>Vos</span>}
                  </div>
                  <div className={styles.email}>{p.email}</div>
                </div>
                <div className={styles.position}>{p.position || "—"}</div>
                <div className={styles.roleCol}>
                  {p.role === "director" ? (
                    <span className={styles.dirBadge}>Director</span>
                  ) : (
                    <span className={styles.teamBadge}>Equipo</span>
                  )}
                </div>
                <div className={styles.assignCount}>
                  {countByUser[p.id] ?? 0} clientes
                </div>
                <div className={styles.payment}>
                  {p.payment_amount != null && isDirector
                    ? `${p.payment_currency ?? "USD"} ${Number(p.payment_amount).toLocaleString()}`
                    : isDirector
                    ? "—"
                    : ""}
                </div>
                <div className={styles.arrow}>→</div>
              </Link>
            );
          })}
        </div>
      </main>

      <InviteUserModal
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        onCreated={refresh}
      />
    </>
  );
}
