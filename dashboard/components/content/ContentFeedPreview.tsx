"use client";

/**
 * ContentFeedPreview — vista feed unificada de publicaciones del cliente.
 *
 * Se usa en dos lugares:
 *   1. /cliente/[id]/contenido (director / team): preview lado a lado
 *      con la tabla, click en tile → modal de detalle (editable desde
 *      la tabla).
 *   2. /portal/agenda (cliente final): vista read-only del feed con
 *      badge de recomendaciones por post y click → modal "+ Recomendación".
 *
 * Soporta las 4 redes (IG / TT / FB / LinkedIn) con header + grid
 * nativo de cada una. Para tile clickeable se pasa `onTileClick`.
 * Para mostrar contador (ej. recomendaciones del portal) se pasa
 * `badgeByPostId`.
 *
 * Antes el código vivía duplicado: `FeedPreview` en /contenido y
 * `PortalAgendaFeed` en /portal/agenda. Unificado en este módulo para
 * que cualquier cambio futuro al look del feed se propague a los dos.
 */

import type {
  ClientSocialLinks,
  ClientContentClassification,
  ContentFormat,
  ContentNetwork,
  ContentPost,
  ContentStatus,
} from "@/lib/types";
import { useEffect, useState } from "react";
import {
  classificationMetaById,
  extractHandleFromUrl,
} from "@/lib/types";
import { NETWORK_COLORS } from "@/lib/content-frequency";

// ============================================================
// Labels / colores compartidos. Idénticos a los que se usaban en los
// dos archivos originales — mantenemos el output visual exacto.
// ============================================================

const NETWORK_LABEL: Record<ContentNetwork, string> = {
  ig: "Instagram",
  tt: "TikTok",
  in: "LinkedIn",
  fb: "Facebook",
};

const FORMAT_LABEL: Record<ContentFormat, string> = {
  reel: "Reel",
  post: "Post",
  carrusel: "Carrusel",
  story: "Story",
  ugc: "UGC",
  anuncio: "Anuncio",
};

const STATUS_LABEL: Record<ContentStatus, string> = {
  draft: "Borrador",
  scheduled: "Aprobada",
  published: "Publicada",
};

/** Color del status chip arriba en cada tile.  draft=amarillo,
 *  scheduled=verde, published=azul claro — match con la convención
 *  del calendario/dashboard. */
const STATUS_COLOR: Record<ContentStatus, string> = {
  draft: "#9B8259",
  scheduled: "#2f7d4f",
  published: "#0A1A0C",
};

const MONTHS_ES = [
  "ene", "feb", "mar", "abr", "may", "jun",
  "jul", "ago", "sep", "oct", "nov", "dic",
];

function formatShortDate(iso: string): string {
  if (!iso || iso.length < 10) return iso;
  const y = Number(iso.slice(0, 4));
  const m = Number(iso.slice(5, 7)) - 1;
  const d = Number(iso.slice(8, 10));
  if (Number.isNaN(m) || Number.isNaN(d)) return iso;
  const mLabel = (MONTHS_ES[m] ?? "?").slice(0, 3).toLowerCase();
  const now = new Date().getFullYear();
  return y === now
    ? `${d} ${mLabel}`
    : `${d} ${mLabel} '${String(y).slice(-2)}`;
}

function formatHumanDate(iso: string): string {
  if (!iso || iso.length < 10) return iso;
  const y = iso.slice(0, 4);
  const m = Number(iso.slice(5, 7)) - 1;
  const d = Number(iso.slice(8, 10));
  if (Number.isNaN(m) || Number.isNaN(d)) return iso;
  return `${d} ${MONTHS_ES[m] ?? "?"} ${y}`;
}

// ============================================================
// PROPS — el contrato público del componente.
// ============================================================

export interface ContentFeedPreviewProps {
  /** Posts del cliente (todos los status: draft / scheduled / published). */
  posts: ContentPost[];
  network: ContentNetwork;
  onNetworkChange: (n: ContentNetwork) => void;
  clientName: string;
  clientLogoUrl: string | null;
  /** URLs de los perfiles del cliente en cada red. Se usa para linkear
   *  avatar/handle al perfil real. */
  clientSocialLinks?: ClientSocialLinks | null;
  /** Catálogo de clasificaciones editoriales del cliente — output de
   *  classificationsFor(client). Se inyecta acá para no leakear el
   *  Context del módulo /contenido y mantener este componente puro. */
  classifications: ClientContentClassification[];
  /** Opcional: badge en la esquina superior derecha por post.
   *  Usado en el portal del cliente para mostrar count de recomendaciones. */
  badgeByPostId?: Map<string, number>;
  /** Click en una tile. Si no se pasa, las tiles no son clickeables. */
  onTileClick?: (p: ContentPost) => void;
  /** Tamaño del feed: 'compact' (~440px) o 'regular' (~720px). Default regular. */
  size?: "compact" | "regular";
}

// ============================================================
// Helpers
// ============================================================

/** Código visual estable C-XXXX. Si el post tiene code en DB, lo usa;
 *  si no, fallback al hash de los primeros 4 chars del id. Reproduce
 *  el codeOf simplificado del portal — el módulo /contenido tiene
 *  un fallback más sofisticado por orden de createdAt, pero acá no
 *  vale la pena para mostrar en un tile. */
function codeOf(post: ContentPost): string {
  if (post.code != null) return `C-${String(post.code).padStart(4, "0")}`;
  return `C-${post.id.slice(0, 4).toUpperCase()}`;
}

/** Filtra posts por red (multi-red con fallback a single network) y
 *  ordena newest-first. */
function filterAndSortByNetwork(
  posts: ContentPost[],
  network: ContentNetwork,
): ContentPost[] {
  return posts
    .filter((p) =>
      p.networks && p.networks.length > 0
        ? p.networks.includes(network)
        : p.network === network,
    )
    .slice()
    .sort((a, b) => {
      if (a.date !== b.date) return a.date < b.date ? 1 : -1;
      return (b.time ?? "").localeCompare(a.time ?? "");
    });
}

// ============================================================
// Componente principal
// ============================================================

export default function ContentFeedPreview({
  posts,
  network,
  onNetworkChange,
  clientName,
  clientLogoUrl,
  clientSocialLinks,
  classifications,
  badgeByPostId,
  onTileClick,
  size = "regular",
}: ContentFeedPreviewProps) {
  const networkPosts = filterAndSortByNetwork(posts, network);

  // URL real del perfil del cliente en la red elegida + handle derivado.
  const profileUrl = clientSocialLinks?.[network] ?? null;
  const handle =
    extractHandleFromUrl(profileUrl) ??
    `@${clientName.toLowerCase().replace(/[^a-z0-9.]+/g, "")}`;

  const maxWidth = size === "compact" ? 440 : 720;

  // Diagnóstico: ¿cuántos posts tiene cada red? Cuando el feed sale
  // vacío en una red pero tiene posts en otras, el director necesita
  // ver dónde están sus posts para entender la causa.
  const countsByNetwork: Record<string, number> = { ig: 0, tt: 0, fb: 0, in: 0 };
  for (const p of posts) {
    const ns =
      p.networks && p.networks.length > 0 ? p.networks : p.network ? [p.network] : [];
    for (const n of ns) {
      if (n in countsByNetwork) countsByNetwork[n] += 1;
    }
  }

  const handleTileClick = (p: ContentPost) => {
    if (onTileClick) onTileClick(p);
  };

  const emptyBody = (
    <div
      style={{
        padding: "48px 20px",
        textAlign: "center",
        color: "var(--text-muted)",
        fontSize: 12,
        fontStyle: "italic",
      }}
    >
      Sin contenido planeado para {NETWORK_LABEL[network]}.
    </div>
  );

  const bodyByNetwork =
    networkPosts.length === 0
      ? emptyBody
      : network === "ig"
        ? (
            <InstagramGrid
              posts={networkPosts}
              classifications={classifications}
              badgeByPostId={badgeByPostId}
              onTileClick={handleTileClick}
              clickable={!!onTileClick}
            />
          )
        : network === "tt"
          ? (
              <TikTokGrid
                posts={networkPosts}
                classifications={classifications}
                badgeByPostId={badgeByPostId}
                onTileClick={handleTileClick}
                clickable={!!onTileClick}
              />
            )
          : network === "fb"
            ? (
                <FacebookFeed
                  posts={networkPosts}
                  classifications={classifications}
                  clientName={clientName}
                  clientLogoUrl={clientLogoUrl}
                  badgeByPostId={badgeByPostId}
                  onTileClick={handleTileClick}
                  clickable={!!onTileClick}
                />
              )
            : (
                <LinkedInFeed
                  posts={networkPosts}
                  classifications={classifications}
                  clientName={clientName}
                  clientLogoUrl={clientLogoUrl}
                  badgeByPostId={badgeByPostId}
                  onTileClick={handleTileClick}
                  clickable={!!onTileClick}
                />
              );

  const headerByNetwork =
    network === "ig" ? (
      <InstagramProfileHeader
        clientName={clientName}
        clientLogoUrl={clientLogoUrl}
        handle={handle}
        profileUrl={profileUrl}
        postsCount={networkPosts.length}
      />
    ) : network === "tt" ? (
      <TikTokProfileHeader
        clientName={clientName}
        clientLogoUrl={clientLogoUrl}
        handle={handle}
        profileUrl={profileUrl}
      />
    ) : network === "fb" ? (
      <FacebookProfileHeader
        clientName={clientName}
        clientLogoUrl={clientLogoUrl}
        handle={handle}
        profileUrl={profileUrl}
      />
    ) : (
      <LinkedInProfileHeader
        clientName={clientName}
        clientLogoUrl={clientLogoUrl}
        handle={handle}
        profileUrl={profileUrl}
      />
    );

  return (
    <div
      style={{
        background: "var(--white)",
        border: "1px solid rgba(10,26,12,0.08)",
        borderRadius: "var(--r-lg)",
        marginBottom: 24,
        marginLeft: "auto",
        marginRight: "auto",
        padding: 0,
        overflow: "hidden",
        maxWidth,
        transition: "max-width 0.2s",
      }}
    >
      {/* CHROME — selector de red. Paleta de la app para que quede claro
          que este pedacito NO es parte del perfil simulado. */}
      <div
        style={{
          padding: "10px 14px",
          borderBottom: "1px solid rgba(10,26,12,0.06)",
          display: "flex",
          gap: 6,
          flexWrap: "wrap",
          background: "var(--off-white)",
          alignItems: "center",
        }}
      >
        <span
          style={{
            fontSize: 9,
            letterSpacing: "0.2em",
            textTransform: "uppercase",
            color: "var(--sand-dark)",
            fontWeight: 700,
            marginRight: 4,
          }}
        >
          Preview
        </span>
        {(Object.keys(NETWORK_LABEL) as ContentNetwork[]).map((n) => {
          const active = network === n;
          return (
            <button
              key={n}
              type="button"
              onClick={() => onNetworkChange(n)}
              style={{
                padding: "5px 10px",
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                background: active ? "var(--deep-green)" : "transparent",
                color: active ? "var(--off-white)" : "var(--deep-green)",
                border: "1px solid rgba(10,26,12,0.12)",
                borderRadius: 4,
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              {NETWORK_LABEL[n]}
            </button>
          );
        })}
      </div>

      {/* Diagnóstico de distribución por red. Útil cuando el director
          mira "Feed → IG" y aparece vacío: si esta línea muestra
          "IG: 0 · TT: 0 · FB: 0 · IN: 33", la causa es que sus posts
          están todos en LinkedIn, no en IG. */}
      <div
        style={{
          padding: "8px 14px",
          background: "rgba(196,168,130,0.08)",
          borderTop: "1px solid rgba(10,26,12,0.06)",
          fontSize: 10,
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          color: "var(--sand-dark)",
          fontWeight: 600,
          display: "flex",
          gap: 14,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <span style={{ opacity: 0.7 }}>Distribución:</span>
        {(["ig", "tt", "fb", "in"] as const).map((n) => {
          const c = countsByNetwork[n] ?? 0;
          const isActive = n === network;
          return (
            <span
              key={n}
              style={{
                fontWeight: isActive ? 800 : 600,
                color: isActive
                  ? "var(--deep-green)"
                  : c > 0
                    ? "var(--deep-green)"
                    : "var(--text-muted)",
              }}
            >
              {NETWORK_LABEL[n]}: <strong>{c}</strong>
            </span>
          );
        })}
      </div>

      {headerByNetwork}
      {bodyByNetwork}
    </div>
  );
}

// ============================================================
// AVATAR HELPERS
// ============================================================

function RoundAvatar({
  size,
  clientName,
  clientLogoUrl,
  border,
  background,
  fontSize,
}: {
  size: number;
  clientName: string;
  clientLogoUrl: string | null;
  border?: string;
  background?: string;
  fontSize?: number;
}) {
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background: background ?? (clientLogoUrl ? "#fff" : "var(--sand)"),
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
        color: "var(--deep-green)",
        fontWeight: 800,
        fontSize: fontSize ?? Math.round(size * 0.32),
        flexShrink: 0,
        border: border ?? "1px solid rgba(10,26,12,0.08)",
      }}
    >
      {clientLogoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={clientLogoUrl}
          alt={clientName}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
          }}
        />
      ) : (
        clientName
          .split(/\s+/)
          .map((w) => w[0])
          .filter(Boolean)
          .slice(0, 2)
          .join("")
          .toUpperCase()
      )}
    </div>
  );
}

function SquareAvatar({
  size,
  clientName,
  clientLogoUrl,
  background,
}: {
  size: number;
  clientName: string;
  clientLogoUrl: string | null;
  background?: string;
}) {
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: 8,
        background: background ?? (clientLogoUrl ? "#fff" : "#0a66c2"),
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
        color: "#fff",
        fontWeight: 800,
        fontSize: Math.round(size * 0.34),
        flexShrink: 0,
        border: "3px solid #fff",
        boxShadow: "0 2px 4px rgba(0,0,0,0.08)",
      }}
    >
      {clientLogoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={clientLogoUrl}
          alt={clientName}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
          }}
        />
      ) : (
        clientName
          .split(/\s+/)
          .map((w) => w[0])
          .filter(Boolean)
          .slice(0, 2)
          .join("")
          .toUpperCase()
      )}
    </div>
  );
}

function ProfileLinkWrap({
  profileUrl,
  title,
  children,
}: {
  profileUrl: string | null;
  title: string;
  children: React.ReactNode;
}) {
  if (!profileUrl) return <>{children}</>;
  return (
    <a
      href={profileUrl}
      target="_blank"
      rel="noopener noreferrer"
      title={title}
      style={{
        textDecoration: "none",
        color: "inherit",
        display: "contents",
      }}
    >
      {children}
    </a>
  );
}

// ============================================================
// HEADERS NATIVOS POR RED
// ============================================================

function InstagramProfileHeader({
  clientName,
  clientLogoUrl,
  handle,
  profileUrl,
  postsCount,
}: {
  clientName: string;
  clientLogoUrl: string | null;
  handle: string;
  profileUrl: string | null;
  postsCount: number;
}) {
  return (
    <div
      style={{
        background: "#fff",
        color: "#000",
        padding: "20px 18px 14px",
        fontFamily:
          "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
        <ProfileLinkWrap
          profileUrl={profileUrl}
          title="Abrir perfil de Instagram"
        >
          <div
            style={{
              padding: 2.5,
              background:
                "linear-gradient(45deg, #f09433, #e6683c, #dc2743, #cc2366, #bc1888)",
              borderRadius: "50%",
              flexShrink: 0,
              display: "flex",
            }}
          >
            <div
              style={{
                padding: 2,
                background: "#fff",
                borderRadius: "50%",
                display: "flex",
              }}
            >
              <RoundAvatar
                size={72}
                clientName={clientName}
                clientLogoUrl={clientLogoUrl}
              />
            </div>
          </div>
        </ProfileLinkWrap>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              marginBottom: 6,
              flexWrap: "wrap",
            }}
          >
            <ProfileLinkWrap profileUrl={profileUrl} title="Abrir perfil de Instagram">
              <span
                style={{
                  fontSize: 16,
                  fontWeight: 400,
                  color: "#000",
                }}
              >
                {handle.replace(/^@/, "")}
              </span>
            </ProfileLinkWrap>
            <button
              type="button"
              style={{
                marginLeft: 4,
                padding: "5px 14px",
                fontSize: 13,
                fontWeight: 600,
                background: "#0095F6",
                color: "#fff",
                border: "none",
                borderRadius: 6,
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              Seguir
            </button>
            <button
              type="button"
              style={{
                padding: "5px 12px",
                fontSize: 13,
                fontWeight: 600,
                background: "#EFEFEF",
                color: "#000",
                border: "none",
                borderRadius: 6,
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              Mensaje
            </button>
          </div>
          <div
            style={{
              fontSize: 14,
              color: "#000",
              marginTop: 2,
            }}
          >
            <strong>{postsCount}</strong> publicaciones
          </div>
        </div>
      </div>

      <div style={{ marginTop: 14 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: "#000" }}>
          {clientName || "Cliente"}
        </div>
      </div>
    </div>
  );
}

function TikTokProfileHeader({
  clientName,
  clientLogoUrl,
  handle,
  profileUrl,
}: {
  clientName: string;
  clientLogoUrl: string | null;
  handle: string;
  profileUrl: string | null;
}) {
  return (
    <div
      style={{
        background: "#fff",
        color: "#161823",
        padding: "22px 16px 16px",
        fontFamily:
          "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
        textAlign: "center",
      }}
    >
      <ProfileLinkWrap profileUrl={profileUrl} title="Abrir perfil de TikTok">
        <div style={{ display: "flex", justifyContent: "center" }}>
          <RoundAvatar
            size={96}
            clientName={clientName}
            clientLogoUrl={clientLogoUrl}
            border="3px solid rgba(0,0,0,0.04)"
          />
        </div>
      </ProfileLinkWrap>

      <ProfileLinkWrap profileUrl={profileUrl} title="Abrir perfil de TikTok">
        <div
          style={{
            fontSize: 18,
            fontWeight: 700,
            color: "#161823",
            marginTop: 10,
          }}
        >
          {handle}
        </div>
      </ProfileLinkWrap>
      <div
        style={{
          fontSize: 13,
          color: "rgba(22,24,35,0.5)",
          marginTop: 1,
        }}
      >
        {clientName || "Cliente"}
      </div>

      <button
        type="button"
        style={{
          marginTop: 12,
          padding: "8px 28px",
          fontSize: 14,
          fontWeight: 700,
          background: "#FE2C55",
          color: "#fff",
          border: "none",
          borderRadius: 4,
          cursor: "pointer",
          fontFamily: "inherit",
        }}
      >
        Seguir
      </button>
    </div>
  );
}

function FacebookProfileHeader({
  clientName,
  clientLogoUrl,
  handle,
  profileUrl,
}: {
  clientName: string;
  clientLogoUrl: string | null;
  handle: string;
  profileUrl: string | null;
}) {
  return (
    <div
      style={{
        background: "#fff",
        color: "#050505",
        fontFamily:
          "Helvetica, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
      }}
    >
      <div
        style={{
          height: 120,
          background: "linear-gradient(135deg, #1877F2 0%, #166FE5 100%)",
          position: "relative",
        }}
      />
      <div style={{ padding: "0 18px 14px", position: "relative" }}>
        <div
          style={{
            position: "absolute",
            top: -42,
            left: 18,
          }}
        >
          <ProfileLinkWrap profileUrl={profileUrl} title="Abrir perfil de Facebook">
            <RoundAvatar
              size={84}
              clientName={clientName}
              clientLogoUrl={clientLogoUrl}
              border="4px solid #fff"
              fontSize={26}
            />
          </ProfileLinkWrap>
        </div>
        <div style={{ height: 50 }} />
        <div style={{ marginBottom: 6 }}>
          <ProfileLinkWrap profileUrl={profileUrl} title="Abrir perfil de Facebook">
            <span style={{ fontSize: 24, fontWeight: 700, color: "#050505" }}>
              {clientName || "Cliente"}
            </span>
          </ProfileLinkWrap>
        </div>
        <div style={{ fontSize: 13, color: "#65676B", marginBottom: 12 }}>
          {handle} · Página de empresa
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <button
            type="button"
            style={{
              padding: "6px 14px",
              fontSize: 14,
              fontWeight: 600,
              background: "#1877F2",
              color: "#fff",
              border: "none",
              borderRadius: 6,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            👍 Me gusta
          </button>
          <button
            type="button"
            style={{
              padding: "6px 14px",
              fontSize: 14,
              fontWeight: 600,
              background: "#E4E6EB",
              color: "#050505",
              border: "none",
              borderRadius: 6,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            Seguir
          </button>
          <button
            type="button"
            style={{
              padding: "6px 14px",
              fontSize: 14,
              fontWeight: 600,
              background: "#E4E6EB",
              color: "#050505",
              border: "none",
              borderRadius: 6,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            ↗ Compartir
          </button>
        </div>
      </div>
    </div>
  );
}

function LinkedInProfileHeader({
  clientName,
  clientLogoUrl,
  handle,
  profileUrl,
}: {
  clientName: string;
  clientLogoUrl: string | null;
  handle: string;
  profileUrl: string | null;
}) {
  return (
    <div
      style={{
        background: "#fff",
        color: "rgba(0,0,0,0.9)",
        fontFamily:
          "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
      }}
    >
      <div
        style={{
          height: 110,
          background:
            "linear-gradient(135deg, #0a66c2 0%, #004182 50%, #0a66c2 100%)",
          position: "relative",
        }}
      />
      <div style={{ padding: "0 18px 14px", position: "relative" }}>
        <div
          style={{
            position: "absolute",
            top: -50,
            left: 18,
          }}
        >
          <ProfileLinkWrap profileUrl={profileUrl} title="Abrir perfil de LinkedIn">
            <SquareAvatar
              size={92}
              clientName={clientName}
              clientLogoUrl={clientLogoUrl}
            />
          </ProfileLinkWrap>
        </div>
        <div style={{ height: 56 }} />
        <ProfileLinkWrap profileUrl={profileUrl} title="Abrir perfil de LinkedIn">
          <div
            style={{
              fontSize: 22,
              fontWeight: 700,
              color: "rgba(0,0,0,0.9)",
              marginBottom: 2,
            }}
          >
            {clientName || "Cliente"}
          </div>
        </ProfileLinkWrap>
        <div
          style={{
            fontSize: 12,
            color: "rgba(0,0,0,0.55)",
            marginBottom: 12,
          }}
        >
          {handle} · Empresa
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <button
            type="button"
            style={{
              padding: "6px 16px",
              fontSize: 14,
              fontWeight: 700,
              background: "#0a66c2",
              color: "#fff",
              border: "none",
              borderRadius: 999,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            + Seguir
          </button>
          <button
            type="button"
            style={{
              padding: "5px 14px",
              fontSize: 14,
              fontWeight: 600,
              background: "#fff",
              color: "#0a66c2",
              border: "1px solid #0a66c2",
              borderRadius: 999,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            Mensaje
          </button>
          <button
            type="button"
            style={{
              padding: "5px 14px",
              fontSize: 14,
              fontWeight: 600,
              background: "transparent",
              color: "rgba(0,0,0,0.6)",
              border: "1px solid rgba(0,0,0,0.6)",
              borderRadius: 999,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            Más
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// GRIDS POR RED
// ============================================================

interface GridProps {
  posts: ContentPost[];
  classifications: ClientContentClassification[];
  badgeByPostId?: Map<string, number>;
  onTileClick: (p: ContentPost) => void;
  /** Si false, los tiles NO son clickeables (cursor default, no click handler). */
  clickable: boolean;
}

interface FeedProps extends GridProps {
  clientName: string;
  clientLogoUrl: string | null;
}

function InstagramGrid({
  posts,
  classifications,
  badgeByPostId,
  onTileClick,
  clickable,
}: GridProps) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(3, 1fr)",
        gap: 2,
        padding: 2,
        background: "rgba(10,26,12,0.06)",
      }}
    >
      {posts.map((p) => (
        <FeedTile
          key={p.id}
          post={p}
          code={codeOf(p)}
          classifications={classifications}
          badge={badgeByPostId?.get(p.id)}
          onClick={() => onTileClick(p)}
          clickable={clickable}
        />
      ))}
    </div>
  );
}

/**
 * StoryViewer — modal fullscreen que muestra las stories de IG en
 * vertical 9:16, una a la vez, con auto-advance cada 6s y barras de
 * progreso arriba (como IG real). Click izquierdo / derecho para
 * navegar. ESC cierra.
 */
function StoryViewer({
  stories,
  startIndex,
  classifications,
  onClose,
  onTileClick,
  clickable,
}: {
  stories: ContentPost[];
  startIndex: number;
  classifications: ClientContentClassification[];
  onClose: () => void;
  onTileClick: (p: ContentPost) => void;
  clickable: boolean;
}) {
  const [idx, setIdx] = useState(startIndex);
  const [progress, setProgress] = useState(0);
  const STORY_DURATION = 6000; // 6s por story

  // Auto-advance — corre cada 50ms, suma % al progress; cuando llega
  // a 100, salta a la próxima story. Si es la última, cierra.
  useEffect(() => {
    setProgress(0);
    const step = 50;
    const tick = setInterval(() => {
      setProgress((p) => {
        const next = p + (step / STORY_DURATION) * 100;
        if (next >= 100) {
          // Pasar a la próxima en el próximo tick para evitar setState
          // dentro del setInterval que está corriendo.
          setTimeout(() => {
            if (idx < stories.length - 1) {
              setIdx(idx + 1);
            } else {
              onClose();
            }
          }, 0);
          return 100;
        }
        return next;
      });
    }, step);
    return () => clearInterval(tick);
  }, [idx, stories.length, onClose]);

  // Navegación con teclado
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") {
        if (idx < stories.length - 1) setIdx(idx + 1);
        else onClose();
      }
      if (e.key === "ArrowLeft") {
        if (idx > 0) setIdx(idx - 1);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [idx, stories.length, onClose]);

  const current = stories[idx];
  if (!current) return null;
  const classMeta = classificationMetaById(
    classifications,
    current.classification,
  );
  const bg = classMeta?.color ?? "#0A1A0C";

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.92)",
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          position: "relative",
          width: "100%",
          maxWidth: 380,
          aspectRatio: "9 / 16",
          background: current.imageUrl ? "#000" : bg,
          backgroundImage: current.imageUrl
            ? `url(${current.imageUrl})`
            : undefined,
          backgroundSize: "cover",
          backgroundPosition: "center",
          borderRadius: 12,
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Barras de progreso arriba — una por story, la actual
            muestra el % en vivo. */}
        <div
          style={{
            display: "flex",
            gap: 4,
            padding: "10px 10px 0",
            zIndex: 3,
          }}
        >
          {stories.map((_, i) => (
            <div
              key={i}
              style={{
                flex: 1,
                height: 3,
                background: "rgba(255,255,255,0.32)",
                borderRadius: 2,
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  width:
                    i < idx
                      ? "100%"
                      : i === idx
                        ? `${progress}%`
                        : "0%",
                  height: "100%",
                  background: "rgba(255,255,255,0.95)",
                  transition: i === idx ? "none" : "width 0.15s",
                }}
              />
            </div>
          ))}
        </div>

        {/* Header tipo IG story — código + close */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "10px 14px",
            color: "#fff",
            fontSize: 12,
            fontWeight: 700,
            textShadow: "0 1px 4px rgba(0,0,0,0.6)",
            zIndex: 3,
          }}
        >
          <span>{codeOf(current)}</span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            style={{
              background: "transparent",
              border: "none",
              color: "#fff",
              fontSize: 22,
              cursor: "pointer",
              padding: 0,
              lineHeight: 1,
            }}
          >
            ×
          </button>
        </div>

        {/* Overlay degradado para legibilidad del texto */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: current.imageUrl
              ? "linear-gradient(180deg, rgba(0,0,0,0.4) 0%, rgba(0,0,0,0) 25%, rgba(0,0,0,0) 65%, rgba(0,0,0,0.55) 100%)"
              : "none",
            pointerEvents: "none",
          }}
        />

        {/* Concepto centrado / brief — el texto principal de la story */}
        <div
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "0 24px",
            position: "relative",
            zIndex: 2,
          }}
        >
          <div
            style={{
              color: "#fff",
              fontSize: 18,
              fontWeight: 700,
              lineHeight: 1.4,
              textAlign: "center",
              textShadow: current.imageUrl
                ? "0 1px 6px rgba(0,0,0,0.7)"
                : "none",
            }}
          >
            {current.idea ?? current.brief ?? "Sin idea"}
          </div>
        </div>

        {/* Footer: copy + CTA / abrir detalle */}
        {(current.copy || clickable) && (
          <div
            style={{
              padding: "12px 16px 16px",
              color: "#fff",
              fontSize: 12,
              lineHeight: 1.45,
              position: "relative",
              zIndex: 2,
              textShadow: current.imageUrl
                ? "0 1px 4px rgba(0,0,0,0.7)"
                : "none",
              display: "flex",
              flexDirection: "column",
              gap: 10,
            }}
          >
            {current.copy && (
              <div
                style={{
                  display: "-webkit-box",
                  WebkitLineClamp: 3,
                  WebkitBoxOrient: "vertical",
                  overflow: "hidden",
                  opacity: 0.92,
                }}
              >
                {current.copy}
              </div>
            )}
            {clickable && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onTileClick(current);
                }}
                style={{
                  padding: "8px 14px",
                  background: "rgba(255,255,255,0.96)",
                  color: "#0A1A0C",
                  border: "none",
                  borderRadius: 4,
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                  cursor: "pointer",
                  fontFamily: "inherit",
                  alignSelf: "flex-start",
                }}
              >
                Ver detalle
              </button>
            )}
          </div>
        )}

        {/* Tap zones invisibles — izquierda atrás, derecha adelante.
            Tienen menos z-index que los botones del header. */}
        <button
          type="button"
          aria-label="Story anterior"
          onClick={() => {
            if (idx > 0) setIdx(idx - 1);
          }}
          disabled={idx === 0}
          style={{
            position: "absolute",
            left: 0,
            top: 30,
            bottom: 80,
            width: "30%",
            background: "transparent",
            border: "none",
            cursor: idx > 0 ? "pointer" : "default",
            zIndex: 1,
          }}
        />
        <button
          type="button"
          aria-label="Story siguiente"
          onClick={() => {
            if (idx < stories.length - 1) setIdx(idx + 1);
            else onClose();
          }}
          style={{
            position: "absolute",
            right: 0,
            top: 30,
            bottom: 80,
            width: "30%",
            background: "transparent",
            border: "none",
            cursor: "pointer",
            zIndex: 1,
          }}
        />
      </div>
    </div>
  );
}

function TikTokGrid({
  posts,
  classifications,
  badgeByPostId,
  onTileClick,
  clickable,
}: GridProps) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(2, 1fr)",
        gap: 3,
        padding: 3,
        background: "#000",
      }}
    >
      {posts.map((p) => (
        <TikTokTile
          key={p.id}
          post={p}
          code={codeOf(p)}
          classifications={classifications}
          badge={badgeByPostId?.get(p.id)}
          onClick={() => onTileClick(p)}
          clickable={clickable}
        />
      ))}
    </div>
  );
}

function FacebookFeed({
  posts,
  classifications,
  clientName,
  clientLogoUrl,
  badgeByPostId,
  onTileClick,
  clickable,
}: FeedProps) {
  return (
    <div
      style={{
        background: "#f0f2f5",
        padding: 14,
        display: "flex",
        flexDirection: "column",
        gap: 14,
      }}
    >
      {posts.map((p) => (
        <FacebookPostCard
          key={p.id}
          post={p}
          code={codeOf(p)}
          classifications={classifications}
          clientName={clientName}
          clientLogoUrl={clientLogoUrl}
          badge={badgeByPostId?.get(p.id)}
          onClick={() => onTileClick(p)}
          clickable={clickable}
        />
      ))}
    </div>
  );
}

function LinkedInFeed({
  posts,
  classifications,
  clientName,
  clientLogoUrl,
  badgeByPostId,
  onTileClick,
  clickable,
}: FeedProps) {
  return (
    <div
      style={{
        background: "#f3f2ef",
        padding: 14,
        display: "flex",
        flexDirection: "column",
        gap: 12,
      }}
    >
      {posts.map((p) => (
        <LinkedInPostCard
          key={p.id}
          post={p}
          code={codeOf(p)}
          classifications={classifications}
          clientName={clientName}
          clientLogoUrl={clientLogoUrl}
          badge={badgeByPostId?.get(p.id)}
          onClick={() => onTileClick(p)}
          clickable={clickable}
        />
      ))}
    </div>
  );
}

// ============================================================
// TILES / CARDS
// ============================================================

interface TileProps {
  post: ContentPost;
  code: string;
  classifications: ClientContentClassification[];
  badge?: number;
  onClick: () => void;
  clickable: boolean;
}

function StatusChip({ status }: { status: ContentStatus }) {
  return (
    <div
      style={{
        padding: "2px 7px",
        fontSize: 9,
        fontWeight: 700,
        letterSpacing: "0.06em",
        textTransform: "uppercase",
        background: STATUS_COLOR[status],
        color: "rgba(255,255,255,0.95)",
        borderRadius: 3,
      }}
      title={STATUS_LABEL[status]}
    >
      {STATUS_LABEL[status]}
    </div>
  );
}

function BadgePill({ count }: { count: number }) {
  return (
    <div
      style={{
        fontSize: 9,
        fontWeight: 800,
        padding: "2px 6px",
        background: "var(--sand-dark)",
        color: "#fff",
        borderRadius: 999,
      }}
      title={`${count} recomendación${count === 1 ? "" : "es"} enviada${count === 1 ? "" : "s"}`}
    >
      ✎ {count}
    </div>
  );
}

/**
 * FeedTile — un tile cuadrado de la grilla IG (también reutilizable
 * por otras grids cuadradas). image_url como background, concepto
 * centrado, date pill abajo, status chip arriba, badge opcional.
 */
function FeedTile({
  post,
  code,
  classifications,
  badge,
  onClick,
  clickable,
}: TileProps) {
  const meta = classificationMetaById(classifications, post.classification);
  const bg = meta?.color ?? NETWORK_COLORS[post.network]?.solid ?? "#0A1A0C";
  const concept = (post.idea ?? post.brief ?? "").split("\n")[0]?.trim() || "";
  const conceptShown = concept ? concept.slice(0, 110) : "Sin concepto";
  const formatIcon =
    post.format === "reel"
      ? "▶"
      : post.format === "carrusel"
        ? "⌗"
        : post.format === "story"
          ? "○"
          : post.format === "ugc"
            ? "♻"
            : post.format === "anuncio"
              ? "$"
              : "";
  const hasImage = !!post.imageUrl;

  return (
    <button
      type="button"
      onClick={clickable ? onClick : undefined}
      title={`${code} · ${FORMAT_LABEL[post.format] ?? post.format} · ${STATUS_LABEL[post.status]}`}
      style={{
        position: "relative",
        aspectRatio: "1 / 1",
        background: bg,
        color: "var(--off-white)",
        border: "none",
        cursor: clickable ? "pointer" : "default",
        padding: 0,
        overflow: "hidden",
        fontFamily: "inherit",
      }}
    >
      {hasImage && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={post.imageUrl!}
          alt=""
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: "cover",
          }}
        />
      )}

      <div
        style={{
          position: "absolute",
          inset: 0,
          background: hasImage
            ? "rgba(0,0,0,0.42)"
            : "linear-gradient(180deg, rgba(0,0,0,0.0) 0%, rgba(0,0,0,0.10) 60%, rgba(0,0,0,0.22) 100%)",
        }}
      />

      {/* Status chip arriba-izquierda (color por estado) */}
      <div
        style={{
          position: "absolute",
          top: 6,
          left: 6,
          zIndex: 2,
        }}
      >
        <StatusChip status={post.status} />
      </div>

      {/* Badge arriba-derecha — count de recomendaciones */}
      {badge != null && badge > 0 && (
        <div
          style={{
            position: "absolute",
            top: 6,
            right: 6,
            zIndex: 2,
          }}
        >
          <BadgePill count={badge} />
        </div>
      )}

      {/* Format icon — abajo-derecha si no hay badge tapando */}
      {formatIcon && (
        <div
          style={{
            position: "absolute",
            top: badge != null && badge > 0 ? 28 : 6,
            right: 8,
            fontSize: 14,
            fontWeight: 800,
            color: "rgba(255,255,255,0.9)",
            textShadow: "0 1px 2px rgba(0,0,0,0.4)",
            zIndex: 2,
          }}
        >
          {formatIcon}
        </div>
      )}

      {/* Date pill — abajo-izquierda */}
      <div
        style={{
          position: "absolute",
          bottom: 6,
          left: 6,
          fontSize: 9,
          fontWeight: 700,
          letterSpacing: "0.04em",
          padding: "2px 6px",
          background: "rgba(0,0,0,0.45)",
          color: "rgba(255,255,255,0.92)",
          borderRadius: 3,
          backdropFilter: "blur(2px)",
          zIndex: 2,
          textTransform: "uppercase",
        }}
      >
        {formatShortDate(post.date)}
      </div>

      {/* Código C-XXXX — abajo-derecha, chiquito */}
      <div
        style={{
          position: "absolute",
          bottom: 6,
          right: 6,
          fontSize: 9,
          fontFamily: "monospace",
          fontWeight: 700,
          color: "rgba(255,255,255,0.7)",
          zIndex: 2,
        }}
      >
        {code}
      </div>

      {/* CONCEPTO centrado */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "32px 12px 30px",
          zIndex: 1,
        }}
      >
        <div
          style={{
            fontSize: 13,
            fontWeight: 700,
            lineHeight: 1.3,
            letterSpacing: "-0.005em",
            color: "rgba(255,255,255,0.98)",
            textAlign: "center",
            textShadow: hasImage ? "0 1px 4px rgba(0,0,0,0.6)" : "none",
            display: "-webkit-box",
            WebkitLineClamp: 5,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
            fontStyle: concept ? "normal" : "italic",
            opacity: concept ? 1 : 0.7,
          }}
        >
          {conceptShown}
        </div>
      </div>
    </button>
  );
}

function TikTokTile({
  post,
  code,
  classifications,
  badge,
  onClick,
  clickable,
}: TileProps) {
  const meta = classificationMetaById(classifications, post.classification);
  const bg = meta?.color ?? "#1a1a1a";
  const concept = (post.idea ?? post.brief ?? "").split("\n")[0]?.trim() || "";
  const conceptShown = concept ? concept.slice(0, 120) : "Sin concepto";
  const hasImage = !!post.imageUrl;

  return (
    <button
      type="button"
      onClick={clickable ? onClick : undefined}
      title={`${code} · ${FORMAT_LABEL[post.format] ?? post.format} · ${STATUS_LABEL[post.status]}`}
      style={{
        position: "relative",
        aspectRatio: "9 / 16",
        background: bg,
        color: "var(--off-white)",
        border: "none",
        cursor: clickable ? "pointer" : "default",
        padding: 0,
        overflow: "hidden",
        fontFamily: "inherit",
      }}
    >
      {hasImage && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={post.imageUrl!}
          alt=""
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: "cover",
          }}
        />
      )}

      <div
        style={{
          position: "absolute",
          inset: 0,
          background: hasImage
            ? "rgba(0,0,0,0.5)"
            : "linear-gradient(180deg, rgba(0,0,0,0.05) 0%, rgba(0,0,0,0.15) 100%)",
        }}
      />

      <div
        style={{
          position: "absolute",
          top: 6,
          left: 6,
          zIndex: 2,
        }}
      >
        <StatusChip status={post.status} />
      </div>

      {badge != null && badge > 0 && (
        <div
          style={{
            position: "absolute",
            top: 6,
            right: 6,
            zIndex: 2,
          }}
        >
          <BadgePill count={badge} />
        </div>
      )}

      <div
        style={{
          position: "absolute",
          bottom: 8,
          left: 8,
          fontSize: 9,
          fontWeight: 700,
          letterSpacing: "0.04em",
          padding: "2px 6px",
          background: "rgba(0,0,0,0.45)",
          color: "rgba(255,255,255,0.92)",
          borderRadius: 3,
          backdropFilter: "blur(2px)",
          zIndex: 2,
          textTransform: "uppercase",
        }}
      >
        {formatShortDate(post.date)}
      </div>

      <div
        style={{
          position: "absolute",
          bottom: 8,
          right: 8,
          fontSize: 9,
          fontFamily: "monospace",
          fontWeight: 700,
          color: "rgba(255,255,255,0.7)",
          background: "rgba(0,0,0,0.4)",
          padding: "1px 5px",
          borderRadius: 3,
          zIndex: 2,
        }}
      >
        {code}
      </div>

      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "30px 14px 36px",
          zIndex: 1,
        }}
      >
        <div
          style={{
            fontSize: 12.5,
            fontWeight: 700,
            lineHeight: 1.3,
            letterSpacing: "-0.005em",
            color: "rgba(255,255,255,0.98)",
            textAlign: "center",
            textShadow: hasImage ? "0 1px 4px rgba(0,0,0,0.6)" : "none",
            display: "-webkit-box",
            WebkitLineClamp: 6,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
            fontStyle: concept ? "normal" : "italic",
            opacity: concept ? 1 : 0.7,
          }}
        >
          {conceptShown}
        </div>
      </div>
    </button>
  );
}

interface CardProps extends TileProps {
  clientName: string;
  clientLogoUrl: string | null;
}

function FacebookPostCard({
  post,
  code,
  classifications,
  clientName,
  clientLogoUrl,
  badge,
  onClick,
  clickable,
}: CardProps) {
  const meta = classificationMetaById(classifications, post.classification);
  const initials = clientName
    .split(/\s+/)
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <button
      type="button"
      onClick={clickable ? onClick : undefined}
      style={{
        background: "#fff",
        border: "none",
        borderRadius: 8,
        padding: 0,
        textAlign: "left",
        cursor: clickable ? "pointer" : "default",
        boxShadow: "0 1px 2px rgba(0,0,0,0.1)",
        overflow: "hidden",
        fontFamily: "inherit",
        color: "#050505",
        position: "relative",
      }}
    >
      {badge != null && badge > 0 && (
        <div
          style={{
            position: "absolute",
            top: 10,
            right: 10,
            zIndex: 3,
          }}
        >
          <BadgePill count={badge} />
        </div>
      )}

      <div
        style={{
          padding: 12,
          display: "flex",
          alignItems: "center",
          gap: 10,
        }}
      >
        <div
          style={{
            width: 40,
            height: 40,
            borderRadius: "50%",
            background: clientLogoUrl ? "#fff" : "#1877F2",
            color: "#fff",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontWeight: 700,
            fontSize: 14,
            overflow: "hidden",
            flexShrink: 0,
          }}
        >
          {clientLogoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={clientLogoUrl}
              alt=""
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
            />
          ) : (
            initials
          )}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "#050505" }}>
            {clientName || "Cliente"}
          </div>
          <div style={{ fontSize: 11, color: "#65676b" }}>
            {formatHumanDate(post.date)}
            {post.time ? ` · ${post.time}` : ""} · 🌐
          </div>
        </div>
        <div
          style={{
            fontSize: 9,
            fontFamily: "monospace",
            fontWeight: 700,
            color: "#65676b",
          }}
        >
          {code}
        </div>
      </div>

      {(post.copy || post.idea) && (
        <div
          style={{
            padding: "0 12px 10px",
            fontSize: 13,
            lineHeight: 1.4,
            color: "#050505",
            whiteSpace: "pre-wrap",
            display: "-webkit-box",
            WebkitLineClamp: 4,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
          }}
        >
          {post.copy ?? post.idea}
        </div>
      )}

      {post.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={post.imageUrl}
          alt=""
          style={{
            width: "100%",
            maxHeight: 320,
            objectFit: "cover",
            display: "block",
            background: "#e4e6eb",
          }}
        />
      ) : meta ? (
        <div
          style={{
            background: meta.color,
            padding: "32px 14px",
            color: "var(--off-white)",
            textAlign: "center",
            fontWeight: 700,
            fontSize: 13,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
          }}
        >
          {meta.label} · {FORMAT_LABEL[post.format] ?? post.format}
        </div>
      ) : null}

      <div
        style={{
          padding: 10,
          borderTop: "1px solid #ced0d4",
          display: "flex",
          gap: 8,
          alignItems: "center",
          fontSize: 11,
          color: "#65676b",
        }}
      >
        <StatusChip status={post.status} />
        <span>{FORMAT_LABEL[post.format] ?? post.format}</span>
        {meta && (
          <span
            style={{
              marginLeft: "auto",
              padding: "2px 7px",
              background: meta.bg,
              color: meta.color,
              borderRadius: 4,
              fontSize: 10,
              fontWeight: 700,
            }}
          >
            {meta.label}
          </span>
        )}
      </div>
    </button>
  );
}

function LinkedInPostCard({
  post,
  code,
  classifications,
  clientName,
  clientLogoUrl,
  badge,
  onClick,
  clickable,
}: CardProps) {
  const meta = classificationMetaById(classifications, post.classification);
  const initials = clientName
    .split(/\s+/)
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <button
      type="button"
      onClick={clickable ? onClick : undefined}
      style={{
        background: "#fff",
        border: "1px solid #e0dfdc",
        borderRadius: 8,
        padding: 0,
        textAlign: "left",
        cursor: clickable ? "pointer" : "default",
        overflow: "hidden",
        fontFamily: "inherit",
        color: "rgba(0,0,0,0.9)",
        position: "relative",
      }}
    >
      {badge != null && badge > 0 && (
        <div
          style={{
            position: "absolute",
            top: 10,
            right: 10,
            zIndex: 3,
          }}
        >
          <BadgePill count={badge} />
        </div>
      )}

      <div
        style={{
          padding: 12,
          display: "flex",
          alignItems: "flex-start",
          gap: 10,
        }}
      >
        <div
          style={{
            width: 44,
            height: 44,
            borderRadius: 6,
            background: clientLogoUrl ? "#fff" : "#0a66c2",
            color: "#fff",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontWeight: 700,
            fontSize: 15,
            overflow: "hidden",
            flexShrink: 0,
          }}
        >
          {clientLogoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={clientLogoUrl}
              alt=""
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
            />
          ) : (
            initials
          )}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "rgba(0,0,0,0.9)" }}>
            {clientName || "Cliente"}
          </div>
          <div style={{ fontSize: 11, color: "rgba(0,0,0,0.6)" }}>
            Empresa · contenido editorial
          </div>
          <div style={{ fontSize: 10, color: "rgba(0,0,0,0.55)", marginTop: 2 }}>
            {formatHumanDate(post.date)}
            {post.time ? ` · ${post.time}` : ""} · 🌐
          </div>
        </div>
        <div
          style={{
            fontSize: 9,
            fontFamily: "monospace",
            fontWeight: 700,
            color: "rgba(0,0,0,0.45)",
          }}
        >
          {code}
        </div>
      </div>

      {post.idea && (
        <div
          style={{
            padding: "0 12px 8px",
            fontSize: 14,
            fontWeight: 600,
            lineHeight: 1.35,
            color: "rgba(0,0,0,0.9)",
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
          }}
        >
          {post.idea}
        </div>
      )}

      {post.copy && (
        <div
          style={{
            padding: "0 12px 12px",
            fontSize: 12.5,
            lineHeight: 1.5,
            color: "rgba(0,0,0,0.75)",
            whiteSpace: "pre-wrap",
            display: "-webkit-box",
            WebkitLineClamp: 4,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
          }}
        >
          {post.copy}
        </div>
      )}

      {post.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={post.imageUrl}
          alt=""
          style={{
            width: "100%",
            maxHeight: 360,
            objectFit: "cover",
            display: "block",
            borderTop: "1px solid #e0dfdc",
            borderBottom: "1px solid #e0dfdc",
          }}
        />
      ) : meta ? (
        <div
          style={{
            background: meta.bg,
            padding: "40px 16px",
            color: meta.color,
            textAlign: "center",
            fontWeight: 700,
            fontSize: 13,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            borderTop: "1px solid #e0dfdc",
            borderBottom: "1px solid #e0dfdc",
          }}
        >
          {meta.label} · {FORMAT_LABEL[post.format] ?? post.format}
        </div>
      ) : null}

      <div
        style={{
          padding: 10,
          display: "flex",
          gap: 8,
          alignItems: "center",
          fontSize: 11,
          color: "rgba(0,0,0,0.6)",
        }}
      >
        <StatusChip status={post.status} />
        <span>{FORMAT_LABEL[post.format] ?? post.format}</span>
        {meta && (
          <span
            style={{
              marginLeft: "auto",
              padding: "2px 7px",
              background: meta.color,
              color: "var(--off-white)",
              borderRadius: 4,
              fontSize: 10,
              fontWeight: 700,
            }}
          >
            {meta.label}
          </span>
        )}
      </div>
    </button>
  );
}
