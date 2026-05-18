"use client";

/**
 * Organigrama visual del equipo.
 *
 * Renderiza recursivamente la jerarquía construida a partir de
 * profiles.reports_to_id. Cards por persona con avatar, nombre,
 * cargo, count de clientes asignados. Click → /equipo/[id].
 *
 * Diseño:
 * - Cada nivel se renderiza horizontalmente (los hijos directos
 *   en una fila debajo del padre).
 * - Conectores verticales y horizontales con pseudo-elementos CSS.
 * - Personas sin manager (reports_to_id null) son los "raíz".
 * - Personas con un manager que no está en el equipo visible
 *   (ej: client) caen como huérfanas — las agregamos al final
 *   bajo un placeholder "Sin jefe asignado".
 */

import Link from "next/link";
import { useMemo } from "react";
import type { Profile, ClientAssignment } from "@/lib/supabase/auth";

interface TreeNode {
  profile: Profile;
  children: TreeNode[];
  clientCount: number;
}

interface Props {
  profiles: Profile[]; // solo non-client
  assignments: ClientAssignment[];
}

export default function OrgTree({ profiles, assignments }: Props) {
  const tree = useMemo(() => buildTree(profiles, assignments), [
    profiles,
    assignments,
  ]);

  if (tree.roots.length === 0 && tree.orphans.length === 0) {
    return (
      <div
        style={{
          padding: 40,
          textAlign: "center",
          color: "var(--text-muted)",
          fontSize: 13,
          background: "var(--off-white)",
          border: "1px dashed rgba(10,26,12,0.15)",
        }}
      >
        Sin miembros del equipo para mostrar todavía.
      </div>
    );
  }

  return (
    <div
      style={{
        padding: "32px 16px",
        overflowX: "auto",
        background: "var(--ivory)",
        border: "1px solid rgba(10,26,12,0.06)",
      }}
    >
      {/* Roots (típicamente directores). Si hay más de uno, se renderizan
          como pares en la misma fila top. */}
      {tree.roots.length > 0 && (
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            gap: 48,
            flexWrap: "wrap",
          }}
        >
          {tree.roots.map((node) => (
            <TreeBranch key={node.profile.id} node={node} isRoot />
          ))}
        </div>
      )}

      {tree.orphans.length > 0 && (
        <div style={{ marginTop: 48 }}>
          <div
            style={{
              textAlign: "center",
              fontSize: 10,
              letterSpacing: "0.2em",
              textTransform: "uppercase",
              color: "var(--sand-dark)",
              fontWeight: 700,
              marginBottom: 12,
            }}
          >
            Sin jefe asignado
          </div>
          <div
            style={{
              display: "flex",
              justifyContent: "center",
              gap: 16,
              flexWrap: "wrap",
            }}
          >
            {tree.orphans.map((node) => (
              <TreeCard key={node.profile.id} node={node} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// TreeBranch — renderiza un nodo + sus hijos recursivamente
// ============================================================
function TreeBranch({
  node,
  isRoot = false,
}: {
  node: TreeNode;
  isRoot?: boolean;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
      <TreeCard node={node} />

      {node.children.length > 0 && (
        <>
          {/* Conector vertical desde el card al spine de los hijos */}
          <div
            style={{
              width: 2,
              height: 24,
              background: "rgba(10,26,12,0.18)",
            }}
          />

          {/* Spine horizontal — solo se ve si hay 2+ hijos */}
          {node.children.length > 1 && (
            <div
              style={{
                height: 2,
                background: "rgba(10,26,12,0.18)",
                width: `calc(${node.children.length * 220}px - 32px)`,
                position: "relative",
              }}
            />
          )}

          <div
            style={{
              display: "flex",
              gap: 32,
              alignItems: "flex-start",
              marginTop: node.children.length > 1 ? 0 : 0,
            }}
          >
            {node.children.map((child) => (
              <div
                key={child.profile.id}
                style={{ display: "flex", flexDirection: "column", alignItems: "center" }}
              >
                {/* Conector vertical individual al child */}
                {node.children.length > 1 && (
                  <div
                    style={{
                      width: 2,
                      height: 16,
                      background: "rgba(10,26,12,0.18)",
                      marginBottom: 0,
                    }}
                  />
                )}
                <TreeBranch node={child} />
              </div>
            ))}
          </div>
        </>
      )}
      {/* isRoot acá no agrega marcador visual pero queda como hook a
          futuro para diferenciar raíces (ej. badge "Founder") */}
      {void isRoot}
    </div>
  );
}

// ============================================================
// TreeCard — tarjeta de una persona en el árbol
// ============================================================
function TreeCard({ node }: { node: TreeNode }) {
  const p = node.profile;
  const isDirector = p.role === "director";

  return (
    <Link
      href={`/equipo/${p.id}`}
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 6,
        padding: "14px 18px",
        width: 200,
        background: "var(--white)",
        border: `1px solid ${isDirector ? "var(--sand)" : "rgba(10,26,12,0.08)"}`,
        borderTop: isDirector ? "3px solid var(--sand)" : "3px solid transparent",
        textDecoration: "none",
        color: "inherit",
        transition: "all 0.15s",
      }}
    >
      <div
        style={{
          width: 44,
          height: 44,
          background: isDirector ? "var(--deep-green)" : "var(--sand)",
          color: isDirector ? "var(--off-white)" : "var(--deep-green)",
          fontWeight: 700,
          fontSize: 14,
          letterSpacing: "0.05em",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          marginBottom: 4,
        }}
      >
        {p.initials || "??"}
      </div>
      <div
        style={{
          fontSize: 13,
          fontWeight: 600,
          color: "var(--deep-green)",
          textAlign: "center",
          letterSpacing: "-0.01em",
          lineHeight: 1.2,
        }}
      >
        {p.name}
      </div>
      {p.position && (
        <div
          style={{
            fontSize: 10,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            color: "var(--sand-dark)",
            fontWeight: 600,
            textAlign: "center",
          }}
        >
          {p.position}
        </div>
      )}
      <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
        {isDirector && (
          <span
            style={{
              fontSize: 9,
              padding: "2px 6px",
              background: "var(--deep-green)",
              color: "var(--off-white)",
              letterSpacing: "0.1em",
              fontWeight: 600,
            }}
          >
            DIRECTOR
          </span>
        )}
        {node.clientCount > 0 && (
          <span
            style={{
              fontSize: 9,
              padding: "2px 6px",
              background: "var(--off-white)",
              color: "var(--deep-green)",
              letterSpacing: "0.08em",
              fontWeight: 600,
            }}
          >
            {node.clientCount} cliente{node.clientCount === 1 ? "" : "s"}
          </span>
        )}
      </div>
    </Link>
  );
}

// ============================================================
// buildTree — construye estructura jerárquica desde la lista plana
// ============================================================
function buildTree(
  profiles: Profile[],
  assignments: ClientAssignment[],
): { roots: TreeNode[]; orphans: TreeNode[] } {
  // Index de assignments por user_id
  const assignCount = new Map<string, number>();
  for (const a of assignments) {
    assignCount.set(a.user_id, (assignCount.get(a.user_id) ?? 0) + 1);
  }

  // Crear nodos por profile
  const byId = new Map<string, TreeNode>();
  for (const p of profiles) {
    byId.set(p.id, {
      profile: p,
      children: [],
      clientCount: assignCount.get(p.id) ?? 0,
    });
  }

  // Conectar: cada profile con reports_to_id va como child del padre
  const roots: TreeNode[] = [];
  const orphans: TreeNode[] = [];
  for (const node of byId.values()) {
    const managerId = node.profile.reports_to_id;
    if (!managerId) {
      // Sin manager: es root
      roots.push(node);
      continue;
    }
    const parent = byId.get(managerId);
    if (parent) {
      parent.children.push(node);
    } else {
      // Manager no está en la lista (probablemente cliente o deleted) → huérfano
      orphans.push(node);
    }
  }

  // Sort: dentro de cada nivel, primero por position, luego por name
  function sortNodes(nodes: TreeNode[]) {
    nodes.sort((a, b) => {
      const pa = a.profile.position ?? "";
      const pb = b.profile.position ?? "";
      if (pa !== pb) return pa.localeCompare(pb);
      return a.profile.name.localeCompare(b.profile.name);
    });
    for (const n of nodes) sortNodes(n.children);
  }
  sortNodes(roots);
  sortNodes(orphans);

  return { roots, orphans };
}
