"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Topbar from "@/components/Topbar";
import ProductSidebar from "@/components/ProductSidebar";
import { getCurrentProfile, hasSession } from "@/lib/supabase/auth";
import { PRODUCT_BY_SLUG } from "@/lib/productos";
import sidebar from "@/components/ClientSidebar.module.css";

export default function ProductoLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = use(params);
  const router = useRouter();
  const [authChecked, setAuthChecked] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  const product = PRODUCT_BY_SLUG[slug];

  useEffect(() => {
    hasSession().then(async (has) => {
      if (!has) {
        router.replace("/");
        return;
      }
      const p = await getCurrentProfile();
      if (!p || p.role === "client") {
        router.replace("/portal");
        return;
      }
      setAuthChecked(true);
    });
  }, [router]);

  useEffect(() => {
    try {
      if (localStorage.getItem("product_sidebar_hidden") === "1") setHidden(true);
    } catch {
      /* ignore */
    }
    setHydrated(true);
  }, []);

  function toggle() {
    setHidden((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("product_sidebar_hidden", next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  }

  if (!product) {
    return (
      <>
        <Topbar showPrimary={false} />
        <main style={{ padding: "80px 40px", textAlign: "center" }}>
          <h1 style={{ fontSize: 32, marginBottom: 16 }}>Producto no encontrado</h1>
          <button
            onClick={() => router.push("/hub")}
            style={{
              padding: "12px 24px",
              background: "var(--deep-green)",
              color: "var(--off-white)",
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

  if (!authChecked) {
    return (
      <>
        <Topbar showPrimary={false} />
        <main style={{ padding: "80px 40px", textAlign: "center" }}>
          <p style={{ color: "var(--text-muted)" }}>Cargando…</p>
        </main>
      </>
    );
  }

  return (
    <>
      <Topbar showPrimary={false} />
      <div
        className={sidebar.layout}
        style={{
          gridTemplateColumns: hidden ? "1fr" : "260px 1fr",
          transition: "grid-template-columns 0.2s ease",
        }}
      >
        {!hidden && <ProductSidebar product={product} onHide={toggle} />}
        <main className={sidebar.main} style={{ position: "relative" }}>
          {hydrated && hidden && (
            <button
              type="button"
              onClick={toggle}
              className={sidebar.showSidebarBtn}
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
