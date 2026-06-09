"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Topbar from "@/components/Topbar";
import ClientSidebar from "@/components/ClientSidebar";
import { getClient } from "@/lib/storage";
import { hasSession } from "@/lib/supabase/auth";
import type { Client } from "@/lib/types";
import styles from "@/components/ClientSidebar.module.css";

export default function ClientLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const [client, setClient] = useState<Client | null | undefined>(undefined);

  useEffect(() => {
    hasSession().then((has) => {
      if (!has) {
        router.replace("/");
        return;
      }
      getClient(id).then((c) => setClient(c ?? null));
    });
  }, [id, router]);

  if (client === undefined) {
    return (
      <>
        <Topbar showPrimary={false} />
        <main style={{ padding: "80px 40px", textAlign: "center" }}>
          <p style={{ color: "var(--text-muted)" }}>Cargando…</p>
        </main>
      </>
    );
  }

  if (client === null) {
    return (
      <>
        <Topbar showPrimary={false} />
        <main style={{ padding: "80px 40px", textAlign: "center" }}>
          <div
            style={{
              fontSize: 10,
              letterSpacing: "0.25em",
              textTransform: "uppercase",
              color: "var(--sand-dark)",
              fontWeight: 600,
              marginBottom: 14,
            }}
          >
            404 · Cliente no encontrado
          </div>
          <h1 style={{ fontSize: 40, marginBottom: 20 }}>Ese cliente no existe</h1>
          <button
            onClick={() => router.push("/hub")}
            style={{
              padding: "12px 24px",
              background: "var(--deep-green)",
              color: "var(--off-white)",
              fontSize: 12,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              border: "none",
              cursor: "pointer",
            }}
          >
            ← Volver al hub
          </button>
        </main>
      </>
    );
  }

  return (
    <ClientLayoutInner client={client}>{children}</ClientLayoutInner>
  );
}

// Layout interno con el toggle del sidebar.
// La preferencia se persiste en localStorage para que al navegar entre
// pantallas del cliente no se reinicie.
function ClientLayoutInner({
  client,
  children,
}: {
  client: Client;
  children: React.ReactNode;
}) {
  const [hidden, setHidden] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  // Hidratar desde localStorage en el primer paint del cliente.
  // Antes de hidratar, render con el default (sidebar visible) para
  // evitar SSR mismatch.
  useEffect(() => {
    try {
      const stored = localStorage.getItem("client_sidebar_hidden");
      if (stored === "1") setHidden(true);
    } catch {
      // ignore
    }
    setHydrated(true);
  }, []);

  const toggle = () => {
    setHidden((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("client_sidebar_hidden", next ? "1" : "0");
      } catch {
        // ignore
      }
      return next;
    });
  };

  return (
    <>
      <Topbar showPrimary={false} />
      <div
        className={styles.layout}
        style={{
          gridTemplateColumns: hidden ? "1fr" : "260px 1fr",
          transition: "grid-template-columns 0.2s ease",
        }}
      >
        {!hidden && <ClientSidebar client={client} onHide={toggle} />}
        <main className={styles.main} style={{ position: "relative" }}>
          {hydrated && hidden && (
            <button
              type="button"
              onClick={toggle}
              className={styles.showSidebarBtn}
              title="Mostrar menú lateral"
            >
              ☰ Mostrar menú
            </button>
          )}
          {children}
        </main>
      </div>
    </>
  );
}
