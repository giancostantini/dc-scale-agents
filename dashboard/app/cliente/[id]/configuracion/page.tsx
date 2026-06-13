"use client";

/**
 * Configuración del cliente — director only.
 *
 * Tres secciones:
 *   1. Logo: setear URL del logo (Clearbit-friendly) + preview.
 *   2. Contactos: CRUD de client_contacts (N contactos por cliente).
 *   3. Zona crítica: eliminar el cliente con doble confirmación.
 *
 * Director only. Team/client → redirect al dashboard del cliente.
 */

import { use, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  getClient,
  deleteClient,
  updateClientLogo,
  updateClientCore,
  updateClientExternalLinks,
  updateClientContentClassifications,
  updateClientSocialLinks,
  listClientContacts,
  addClientContact,
  updateClientContact,
  deleteClientContact,
  type ClientContactInput,
} from "@/lib/storage";
import {
  DEFAULT_CONTENT_CLASSIFICATIONS,
  classificationsFor,
  extractHandleFromUrl,
  type ClientContentClassification,
  type ClientSocialLinks,
} from "@/lib/types";
import { getCurrentProfile } from "@/lib/supabase/auth";
import { uploadContentPreview } from "@/lib/upload";
import type { Client, ClientContact, OnboardingFile } from "@/lib/types";
import InviteUserModal from "@/components/InviteUserModal";
import EditClientCoreModal from "@/components/EditClientCoreModal";
import LibraryUploadButton from "@/components/LibraryUploadButton";
import ui from "@/components/ClientUI.module.css";

export default function ConfiguracionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const [client, setClient] = useState<Client | null | undefined>(undefined);
  const [isDirector, setIsDirector] = useState<boolean | null>(null);
  const [contacts, setContacts] = useState<ClientContact[]>([]);

  // Logo
  const [savingLogo, setSavingLogo] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Invitar al portal
  const [inviteOpen, setInviteOpen] = useState(false);

  // Nuevo contacto
  const [showAddContact, setShowAddContact] = useState(false);
  const [contactForm, setContactForm] = useState<ClientContactInput>({
    name: "",
    role: "",
    email: "",
    phone: "",
    notes: "",
    is_primary: false,
  });
  const [savingContact, setSavingContact] = useState(false);

  // Edit
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<ClientContactInput>({
    name: "",
    role: "",
    email: "",
    phone: "",
    notes: "",
    is_primary: false,
  });

  // Delete client
  const [deletingClient, setDeletingClient] = useState(false);

  // Edit creation
  const [editCoreOpen, setEditCoreOpen] = useState(false);

  async function refresh() {
    const [c, prof, ct] = await Promise.all([
      getClient(id),
      getCurrentProfile(),
      listClientContacts(id),
    ]);
    setClient(c ?? null);
    setIsDirector(prof?.role === "director");
    setContacts(ct);
  }

  useEffect(() => {
    refresh();
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (isDirector === false) {
      router.replace(`/cliente/${id}`);
    }
  }, [isDirector, id, router]);

  if (client === undefined || isDirector === null) return null;
  if (client === null) return null;
  if (!isDirector) return null;

  // ============ Logo ============
  async function handleLogoFileChange(
    e: React.ChangeEvent<HTMLInputElement>,
  ) {
    const file = e.target.files?.[0];
    if (!file) return;
    // Validación rápida de tipo
    if (!file.type.startsWith("image/")) {
      alert("El archivo tiene que ser una imagen (PNG, JPG, SVG, etc).");
      e.target.value = "";
      return;
    }
    // Validación de tamaño (~5MB max)
    if (file.size > 5 * 1024 * 1024) {
      alert("La imagen pesa más de 5MB. Bajá el peso e intentá de nuevo.");
      e.target.value = "";
      return;
    }
    setUploadingLogo(true);
    try {
      // Subimos al bucket PÚBLICO "content-post-previews" (mig 069)
      // para que el <img src> del logo cargue sin auth. Antes
      // usábamos client-onboarding (privado), y el browser recibía
      // 403 al renderear el logo en el dashboard.
      // Path: logos/{clientId}/{timestamp}_{filename}
      const uploaded = await uploadContentPreview(file, `logos/${id}`);
      if (!uploaded.url) throw new Error("El upload no devolvió URL pública.");
      await updateClientLogo(id, uploaded.url);
      await refresh();
    } catch (err) {
      const e = err as Error;
      const hint = e.message.includes("Bucket not found")
        ? "\n\nEl bucket público de previews no existe todavía. Corré la migración 069 en Supabase."
        : "";
      alert(`No se pudo subir el logo: ${e.message}${hint}`);
    } finally {
      setUploadingLogo(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function clearLogo() {
    if (!confirm("¿Quitar el logo? Se va a mostrar el fallback de iniciales.")) return;
    setSavingLogo(true);
    try {
      await updateClientLogo(id, null);
      await refresh();
    } catch (err) {
      const e = err as Error;
      alert(`Error: ${e.message}`);
    } finally {
      setSavingLogo(false);
    }
  }

  // ============ Contactos ============
  async function saveNewContact() {
    if (!contactForm.name.trim()) {
      alert("El nombre es obligatorio.");
      return;
    }
    setSavingContact(true);
    try {
      await addClientContact(id, contactForm);
      setContactForm({ name: "", role: "", email: "", phone: "", notes: "", is_primary: false });
      setShowAddContact(false);
      await refresh();
    } catch (err) {
      const e = err as Error;
      alert(`Error: ${e.message}`);
    } finally {
      setSavingContact(false);
    }
  }

  function openEdit(c: ClientContact) {
    setEditingId(c.id);
    setEditForm({
      name: c.name,
      role: c.role ?? "",
      email: c.email ?? "",
      phone: c.phone ?? "",
      notes: c.notes ?? "",
      is_primary: c.is_primary,
    });
  }

  async function saveEdit() {
    if (!editingId) return;
    if (!editForm.name.trim()) {
      alert("El nombre es obligatorio.");
      return;
    }
    try {
      await updateClientContact(editingId, editForm);
      setEditingId(null);
      await refresh();
    } catch (err) {
      const e = err as Error;
      alert(`Error: ${e.message}`);
    }
  }

  async function removeContact(c: ClientContact) {
    if (!confirm(`¿Eliminar el contacto ${c.name}?`)) return;
    try {
      await deleteClientContact(c.id);
      await refresh();
    } catch (err) {
      const e = err as Error;
      alert(`Error: ${e.message}`);
    }
  }

  // ============ Eliminar cliente ============
  async function handleDeleteClient() {
    if (deletingClient) return;
    if (
      !confirm(
        `¿Eliminar el cliente "${client!.name}"?\n\n` +
          `Esto borra el cliente y TODO lo asociado: objetivos, notas, ` +
          `tareas, campañas, contenido, contactos, pagos y demás. ` +
          `NO se puede deshacer.`,
      )
    )
      return;
    const typed = window.prompt(
      `Para confirmar, tipeá el nombre exacto:\n\n${client!.name}`,
    );
    if (typed === null) return;
    if (typed.trim() !== client!.name) {
      alert("El nombre no coincide. Eliminación cancelada.");
      return;
    }
    setDeletingClient(true);
    try {
      await deleteClient(id);
      router.push("/hub");
    } catch (err) {
      const e = err as { code?: string; message?: string };
      alert(`No se pudo eliminar.\n${e.code ?? ""} ${e.message ?? ""}`);
      setDeletingClient(false);
    }
  }

  return (
    <>
      <div className={ui.head}>
        <div>
          <div className={ui.eyebrow}>Cliente · Configuración</div>
          <h1>Configuración de {client.name}</h1>
          <p style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 6 }}>
            Logo, contactos de referencia y zona crítica.
          </p>
        </div>
      </div>

      {/* ============== ESTADO / FASE ============== */}
      {/* Si el cliente está en onboarding y el director ya lo dio
          por activado, lo promovemos a 'active' con un click. Útil
          para clientes históricos que se crearon como onboarding
          y nunca se promovieron. */}
      {client.status === "onboarding" && (
        <div
          className={ui.panel}
          style={{
            marginBottom: 24,
            borderLeft: "3px solid var(--green-ok)",
          }}
        >
          <div className={ui.panelHead}>
            <div>
              <div className={ui.panelTitle}>Estado del cliente</div>
              <div
                style={{
                  fontSize: 12,
                  color: "var(--text-muted)",
                  marginTop: 4,
                  lineHeight: 1.5,
                }}
              >
                Hoy aparece como <strong>Onboarding</strong>. Si ya
                terminó la fase de estrategia/branding y entró en
                ejecución, marcalo como activo para que aparezca como{" "}
                <strong>"● Growth"</strong> en el hub.
              </div>
            </div>
            <button
              onClick={async () => {
                if (
                  !confirm(
                    "¿Marcar este cliente como activo (en ejecución)?",
                  )
                ) {
                  return;
                }
                try {
                  const updated = await updateClientCore(client.id, {
                    status: "active",
                    phase: "Activo · Ejecución",
                  });
                  setClient(updated);
                } catch (err) {
                  const e = err as Error;
                  alert(`No se pudo actualizar:\n${e.message}`);
                }
              }}
              style={{
                padding: "10px 18px",
                background: "var(--green-ok)",
                color: "var(--off-white)",
                border: "none",
                borderRadius: 6,
                fontSize: 12,
                fontWeight: 700,
                letterSpacing: "0.04em",
                cursor: "pointer",
                fontFamily: "inherit",
                textTransform: "uppercase",
              }}
            >
              ✓ Activar cliente
            </button>
          </div>
        </div>
      )}

      {/* ============== EDITAR CREACIÓN ============== */}
      <div className={ui.panel} style={{ marginBottom: 24 }}>
        <div className={ui.panelHead}>
          <div>
            <div className={ui.panelTitle}>Editar creación del cliente</div>
            <div
              style={{
                fontSize: 12,
                color: "var(--text-muted)",
                marginTop: 4,
              }}
            >
              Corregir nombre, sector, contactos, fees, cuenta default,
              dividendos y otros datos cargados al crear el cliente.
            </div>
          </div>
          <button
            onClick={() => setEditCoreOpen(true)}
            style={{
              padding: "9px 18px",
              background: "var(--deep-green)",
              color: "var(--off-white)",
              border: "none",
              borderRadius: 6,
              fontSize: 12,
              fontWeight: 600,
              letterSpacing: "0.04em",
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            ✎ Editar datos del cliente
          </button>
        </div>
      </div>

      {editCoreOpen && (
        <EditClientCoreModal
          client={client}
          open={editCoreOpen}
          onClose={() => setEditCoreOpen(false)}
          onSaved={(updated) => setClient(updated)}
        />
      )}

      {/* ============== CONTRATO ============== */}
      {/* Se movió desde Biblioteca: el contrato es información
          contractual, no documentación viva del cliente. Vive más
          natural junto con el resto de los datos de Configuración. */}
      <div className={ui.panel} style={{ marginBottom: 24 }}>
        <div className={ui.panelHead}>
          <div>
            <div className={ui.panelTitle}>Contrato</div>
            <div
              style={{
                fontSize: 12,
                color: "var(--text-muted)",
                marginTop: 4,
              }}
            >
              PDF firmado del contrato con el cliente.
            </div>
          </div>
        </div>
        <ContractPanel client={client} onChange={refresh} />
      </div>

      {/* ============== LOGO ============== */}
      <div className={ui.panel} style={{ marginBottom: 24 }}>
        <div className={ui.panelHead}>
          <div className={ui.panelTitle}>Logo del cliente</div>
        </div>
        <p style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 16 }}>
          Subí el logo del cliente (PNG, JPG o SVG, hasta 5MB). Se guarda en
          el storage del sistema. Si no cargás ninguno, se muestran las
          iniciales como fallback.
        </p>
        <div
          style={{
            display: "flex",
            gap: 18,
            alignItems: "center",
            marginBottom: 16,
          }}
        >
          <div
            style={{
              width: 110,
              height: 110,
              background: "var(--ivory)",
              borderRadius: 12,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--deep-green)",
              fontSize: 32,
              fontWeight: 800,
              overflow: "hidden",
              border: "1px solid rgba(10,26,12,0.08)",
              flexShrink: 0,
            }}
          >
            {client.logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={client.logo_url}
                alt={`Logo ${client.name}`}
                style={{
                  width: "100%",
                  height: "100%",
                  objectFit: "contain",
                  background: "white",
                }}
              />
            ) : (
              client.initials
            )}
          </div>
          <div style={{ flex: 1 }}>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/jpg,image/svg+xml,image/webp"
              onChange={handleLogoFileChange}
              style={{ display: "none" }}
            />
            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadingLogo || savingLogo}
                style={{
                  padding: "10px 18px",
                  background: "var(--deep-green)",
                  color: "var(--off-white)",
                  border: "none",
                  borderRadius: 6,
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: uploadingLogo ? "wait" : "pointer",
                  fontFamily: "inherit",
                  opacity: uploadingLogo ? 0.5 : 1,
                }}
              >
                {uploadingLogo
                  ? "Subiendo…"
                  : client.logo_url
                    ? "Reemplazar logo"
                    : "Subir logo"}
              </button>
              {client.logo_url && (
                <button
                  onClick={clearLogo}
                  disabled={savingLogo || uploadingLogo}
                  style={{
                    padding: "10px 14px",
                    background: "transparent",
                    border: "1px solid rgba(176,75,58,0.2)",
                    borderRadius: 6,
                    color: "#B91C1C",
                    fontSize: 12,
                    cursor: savingLogo ? "wait" : "pointer",
                    fontFamily: "inherit",
                  }}
                >
                  Quitar logo
                </button>
              )}
            </div>
            <div
              style={{
                fontSize: 11,
                color: "var(--text-muted)",
                marginTop: 8,
                lineHeight: 1.5,
              }}
            >
              Recomendado: PNG transparente cuadrado 512x512 o SVG.
              {client.logo_url && (
                <>
                  <br />
                  <strong>Logo actual:</strong>{" "}
                  <a
                    href={client.logo_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: "var(--deep-green)" }}
                  >
                    abrir archivo
                  </a>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Los 3 paneles siguientes (Meta Business Suite, Clasificaciones
          editoriales y Links de redes sociales) son específicos del
          camino de Growth Partner — habilitan funcionalidades del menú
          Contenido (Programar en MBS, color-code de chips, preview
          feed con links reales). En clientes DEV no aplican: no hay
          calendario de contenido ni feed preview, así que los ocultamos
          para no agregar ruido a su configuración. */}
      {client.type !== "dev" && (
        <>
          {/* ============== META BUSINESS SUITE URL ==============
              URL del planner de IG/FB del cliente. Cuando el director
              toca un post en el calendario, el botón "Programar" abre
              este link en una pestaña nueva. Si no se setea, cae al
              home genérico de business.facebook.com. */}
          <MetaBusinessSuitePanel
            client={client}
            onSaved={(url) =>
              setClient((prev) =>
                prev
                  ? {
                      ...prev,
                      external_links: {
                        ...(prev.external_links ?? {}),
                        meta_business_suite_url: url || undefined,
                      },
                    }
                  : prev,
              )
            }
          />

          {/* ============== CLASIFICACIONES EDITORIALES ==============
              Catálogo custom de clasificaciones del cliente. Se usa en
              el menú Contenido para clasificar cada pieza y tintar los
              tiles del feed con colores propios. Si el cliente no carga
              ninguna, la UI cae a los DEFAULTS (valor/conversión/aspiracional). */}
          <EditorialClassificationsPanel
            client={client}
            onSaved={(list) =>
              setClient((prev) =>
                prev ? { ...prev, content_classifications: list } : prev,
              )
            }
          />

          {/* ============== LINKS DE REDES SOCIALES ==============
              Solo URLs — bio/seguidores/siguiendo NO se piden manualmente
              (decidimos no mantener esos datos a mano). El preview del
              feed muestra avatar + nombre + handle + link al perfil
              real, sin stats numéricos ni bio. */}
          <SocialLinksPanel
            client={client}
            onSaved={(links) =>
              setClient((prev) =>
                prev ? { ...prev, social_links: links } : prev,
              )
            }
          />
        </>
      )}

      {/* ============== ACCESO DEL CLIENTE AL PORTAL ============== */}
      <div className={ui.panel} style={{ marginBottom: 24 }}>
        <div className={ui.panelHead}>
          <div className={ui.panelTitle}>Acceso al portal del cliente</div>
        </div>
        <p style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 14 }}>
          Invitá al cliente al portal de solo lectura. Va a poder ver
          reportes, calendario de contenido, KPIs y mandar solicitudes.
        </p>
        <button
          onClick={() => setInviteOpen(true)}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            padding: "10px 18px",
            background: "var(--deep-green)",
            color: "var(--off-white)",
            border: "none",
            borderRadius: 6,
            fontSize: 12,
            fontWeight: 600,
            cursor: "pointer",
            fontFamily: "inherit",
          }}
        >
          ✉ Invitar al portal
        </button>
      </div>

      {/* ============== CONTACTOS ============== */}
      <div className={ui.panel} style={{ marginBottom: 24 }}>
        <div className={ui.panelHead}>
          <div>
            <div className={ui.panelTitle}>Contactos de referencia</div>
            <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>
              Tantos como necesites — CEO, marketing, brand, operativo, etc.
            </p>
          </div>
          {!showAddContact && (
            <button
              onClick={() => setShowAddContact(true)}
              style={{
                padding: "8px 14px",
                background: "var(--deep-green)",
                color: "var(--off-white)",
                border: "none",
                borderRadius: 6,
                fontSize: 12,
                fontWeight: 600,
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              + Agregar contacto
            </button>
          )}
        </div>

        {/* Form: nuevo contacto */}
        {showAddContact && (
          <div
            style={{
              padding: 16,
              background: "var(--ivory)",
              borderRadius: 8,
              marginBottom: 14,
              border: "1px solid rgba(196,168,130,0.25)",
            }}
          >
            <ContactForm
              form={contactForm}
              setForm={setContactForm}
              onSave={saveNewContact}
              onCancel={() => {
                setShowAddContact(false);
                setContactForm({ name: "", role: "", email: "", phone: "", notes: "", is_primary: false });
              }}
              saving={savingContact}
              saveLabel="Agregar"
            />
          </div>
        )}

        {/* Lista de contactos */}
        {contacts.length === 0 ? (
          <div
            style={{
              padding: 24,
              textAlign: "center",
              color: "var(--text-muted)",
              fontSize: 13,
              fontStyle: "italic",
            }}
          >
            Sin contactos cargados todavía.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {contacts.map((c) =>
              editingId === c.id ? (
                <div
                  key={c.id}
                  style={{
                    padding: 16,
                    background: "var(--ivory)",
                    borderRadius: 8,
                    border: "1px solid rgba(196,168,130,0.25)",
                  }}
                >
                  <ContactForm
                    form={editForm}
                    setForm={setEditForm}
                    onSave={saveEdit}
                    onCancel={() => setEditingId(null)}
                    saveLabel="Guardar cambios"
                  />
                </div>
              ) : (
                <div
                  key={c.id}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 200px 80px",
                    gap: 14,
                    padding: 14,
                    background: "var(--white)",
                    border: "1px solid rgba(10,26,12,0.06)",
                    borderRadius: 8,
                    borderLeft: c.is_primary
                      ? "3px solid var(--sand)"
                      : "1px solid rgba(10,26,12,0.06)",
                    alignItems: "center",
                  }}
                >
                  <div>
                    <div
                      style={{
                        fontSize: 14,
                        fontWeight: 600,
                        color: "var(--deep-green)",
                      }}
                    >
                      {c.name}
                      {c.is_primary && (
                        <span
                          style={{
                            marginLeft: 8,
                            padding: "2px 8px",
                            fontSize: 9,
                            background: "var(--sand)",
                            color: "var(--deep-green)",
                            borderRadius: 999,
                            textTransform: "uppercase",
                            letterSpacing: "0.06em",
                            fontWeight: 700,
                          }}
                        >
                          Principal
                        </span>
                      )}
                    </div>
                    {c.role && (
                      <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>
                        {c.role}
                      </div>
                    )}
                    {c.notes && (
                      <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4, fontStyle: "italic" }}>
                        {c.notes}
                      </div>
                    )}
                  </div>
                  <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
                    {c.email && <div>{c.email}</div>}
                    {c.phone && <div style={{ marginTop: 2 }}>{c.phone}</div>}
                  </div>
                  <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                    <button
                      onClick={() => openEdit(c)}
                      style={iconBtn}
                      title="Editar"
                    >
                      ✎
                    </button>
                    <button
                      onClick={() => removeContact(c)}
                      style={{ ...iconBtn, color: "#B91C1C" }}
                      title="Eliminar"
                    >
                      ×
                    </button>
                  </div>
                </div>
              ),
            )}
          </div>
        )}
      </div>

      {/* ============== ZONA CRÍTICA ============== */}
      <div
        className={ui.panel}
        style={{ borderLeft: "3px solid #B91C1C", marginBottom: 40 }}
      >
        <div className={ui.panelHead}>
          <div className={ui.panelTitle} style={{ color: "#B91C1C" }}>
            Zona crítica
          </div>
        </div>
        <p style={{ fontSize: 13, color: "var(--text-muted)", lineHeight: 1.6, marginBottom: 16 }}>
          Eliminar el cliente borra <strong>todo lo asociado</strong>: objetivos,
          notas, tareas, campañas, contenido, contactos, asignaciones de equipo,
          pagos y movimientos bancarios vinculados. <strong>No se puede deshacer.</strong>
        </p>
        <button
          onClick={handleDeleteClient}
          disabled={deletingClient}
          style={{
            padding: "10px 18px",
            background: "#B91C1C",
            color: "white",
            border: "none",
            borderRadius: 6,
            fontSize: 12,
            fontWeight: 600,
            cursor: deletingClient ? "wait" : "pointer",
            fontFamily: "inherit",
          }}
        >
          {deletingClient ? "Eliminando…" : "Eliminar cliente"}
        </button>
      </div>

      {/* Modal: invitar al portal */}
      <InviteUserModal
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        initialUserType="client"
        initialClientId={id}
      />
    </>
  );
}

const iconBtn: React.CSSProperties = {
  width: 30,
  height: 30,
  background: "transparent",
  border: "1px solid rgba(10,26,12,0.1)",
  borderRadius: 6,
  cursor: "pointer",
  fontFamily: "inherit",
  fontSize: 14,
  color: "var(--deep-green)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};

// ============================================================
// ContactForm (compartido entre Add y Edit)
// ============================================================
function ContactForm({
  form,
  setForm,
  onSave,
  onCancel,
  saving,
  saveLabel,
}: {
  form: ClientContactInput;
  setForm: (f: ClientContactInput) => void;
  onSave: () => void | Promise<void>;
  onCancel: () => void;
  saving?: boolean;
  saveLabel: string;
}) {
  return (
    <>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
        <FormField label="Nombre" required>
          <input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            style={inputStyle}
            placeholder="Ej: María González"
          />
        </FormField>
        <FormField label="Rol / Cargo">
          <input
            value={form.role ?? ""}
            onChange={(e) => setForm({ ...form, role: e.target.value })}
            style={inputStyle}
            placeholder="CEO, Marketing Lead, Brand Mgr…"
          />
        </FormField>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
        <FormField label="Email">
          <input
            type="email"
            value={form.email ?? ""}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            style={inputStyle}
            placeholder="contacto@empresa.com"
          />
        </FormField>
        <FormField label="Teléfono">
          <input
            value={form.phone ?? ""}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
            style={inputStyle}
            placeholder="+598..."
          />
        </FormField>
      </div>
      <FormField label="Notas (opcional)">
        <textarea
          value={form.notes ?? ""}
          onChange={(e) => setForm({ ...form, notes: e.target.value })}
          rows={2}
          style={{ ...inputStyle, resize: "vertical" }}
          placeholder="Contexto, cuándo escribir, preferencias…"
        />
      </FormField>
      <label
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          fontSize: 12,
          margin: "10px 0",
          cursor: "pointer",
        }}
      >
        <input
          type="checkbox"
          checked={form.is_primary ?? false}
          onChange={(e) => setForm({ ...form, is_primary: e.target.checked })}
          style={{ width: "auto", margin: 0 }}
        />
        Marcar como contacto principal
      </label>
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <button
          onClick={onCancel}
          style={{
            padding: "8px 14px",
            background: "transparent",
            border: "1px solid rgba(10,26,12,0.15)",
            borderRadius: 6,
            fontSize: 12,
            cursor: "pointer",
            fontFamily: "inherit",
          }}
        >
          Cancelar
        </button>
        <button
          onClick={onSave}
          disabled={saving}
          style={{
            padding: "8px 14px",
            background: "var(--deep-green)",
            color: "var(--off-white)",
            border: "none",
            borderRadius: 6,
            fontSize: 12,
            fontWeight: 600,
            cursor: saving ? "wait" : "pointer",
            fontFamily: "inherit",
          }}
        >
          {saving ? "Guardando…" : saveLabel}
        </button>
      </div>
    </>
  );
}

function FormField({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label
        style={{
          display: "block",
          fontSize: 10,
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          color: "var(--sand-dark)",
          fontWeight: 600,
          marginBottom: 5,
        }}
      >
        {label}
        {required && <span style={{ color: "#B91C1C", marginLeft: 4 }}>*</span>}
      </label>
      {children}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "8px 10px",
  fontSize: 12,
  border: "1px solid rgba(10,26,12,0.12)",
  borderRadius: 6,
  fontFamily: "inherit",
  background: "var(--white)",
  color: "var(--deep-green)",
  outline: "none",
};

// ============================================================
// MetaBusinessSuitePanel — input para guardar la URL del planner de
// IG/FB del cliente. La usa el modal de detalle de publicación del
// calendario para llevar el botón "Programar" al lugar correcto.
//
// Si el cliente no tiene URL configurada, el calendario cae al home
// genérico de business.facebook.com.
// ============================================================
function MetaBusinessSuitePanel({
  client,
  onSaved,
}: {
  client: Client;
  onSaved: (url: string) => void;
}) {
  const initial = client.external_links?.meta_business_suite_url ?? "";
  const initialAdAccount = client.external_links?.meta_ad_account_id ?? "";
  const [url, setUrl] = useState(initial);
  const [adAccountId, setAdAccountId] = useState(initialAdAccount);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Si cambia el cliente desde afuera, resync.
  useEffect(() => {
    setUrl(client.external_links?.meta_business_suite_url ?? "");
    setAdAccountId(client.external_links?.meta_ad_account_id ?? "");
  }, [
    client.external_links?.meta_business_suite_url,
    client.external_links?.meta_ad_account_id,
  ]);

  // Hay cambios sin guardar si los valores actuales difieren de lo
  // que está en DB. Lo usamos para enable/disable del botón Guardar.
  const dirty =
    url.trim() !== initial.trim() ||
    adAccountId.trim() !== initialAdAccount.trim();

  async function save() {
    setError("");
    const cleanUrl = url.trim();
    const cleanAdAccount = adAccountId.trim();
    if (cleanUrl && !/^https?:\/\//i.test(cleanUrl)) {
      setError("La URL tiene que empezar con http:// o https://");
      return;
    }
    if (cleanAdAccount && !/^\d+$/.test(cleanAdAccount)) {
      setError(
        "El Ad Account ID tiene que ser solo números (sin el prefijo 'act_').",
      );
      return;
    }
    setSaving(true);
    try {
      await updateClientExternalLinks(client.id, {
        meta_business_suite_url: cleanUrl || null,
        meta_ad_account_id: cleanAdAccount || null,
      });
      onSaved(cleanUrl);
    } catch (err) {
      const e = err as Error;
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={ui.panel} style={{ marginBottom: 24 }}>
      <div className={ui.panelHead}>
        <div>
          <div className={ui.panelTitle}>Meta Business Suite</div>
          <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>
            URL al planner de IG/FB (botón "Programar" del calendario) y{" "}
            <strong>Ad Account ID</strong> (necesario para generar y
            pushear campañas desde /meta).
          </p>
        </div>
      </div>

      {/* Inputs SIEMPRE visibles — sin modo colapsado. Antes había un
          toggle "Editar" pero el director pidió ver los valores siempre
          sin tener que abrir un editor. El botón Guardar se prende solo
          cuando hay cambios sin guardar. */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div>
          <div
            style={{
              fontSize: 10,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: "var(--sand-dark)",
              fontWeight: 700,
              marginBottom: 4,
            }}
          >
            URL del planner (opcional)
          </div>
          <input
            type="url"
            placeholder="https://business.facebook.com/latest/home?asset_id=..."
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            disabled={saving}
            style={{
              width: "100%",
              padding: "10px 12px",
              border: "1px solid rgba(10,26,12,0.15)",
              borderRadius: 6,
              fontFamily: "inherit",
              fontSize: 13,
              background: "var(--white)",
              color: "var(--deep-green)",
              outline: "none",
            }}
          />
          {initial && (
            <div style={{ marginTop: 6 }}>
              <a
                href={initial}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  fontSize: 11,
                  color: "var(--text-muted)",
                  textDecoration: "underline",
                  textDecorationStyle: "dotted",
                }}
              >
                Abrir en pestaña nueva ↗
              </a>
            </div>
          )}
        </div>
        <div>
          <div
            style={{
              fontSize: 10,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: "var(--sand-dark)",
              fontWeight: 700,
              marginBottom: 4,
            }}
          >
            Ad Account ID (solo números, sin "act_")
          </div>
          <input
            type="text"
            placeholder="123456789012345"
            value={adAccountId}
            onChange={(e) => setAdAccountId(e.target.value)}
            disabled={saving}
            style={{
              width: "100%",
              padding: "10px 12px",
              border: "1px solid rgba(10,26,12,0.15)",
              borderRadius: 6,
              fontFamily: "monospace",
              fontSize: 13,
              background: "var(--white)",
              color: "var(--deep-green)",
              outline: "none",
            }}
          />
          {initialAdAccount && (
            <div
              style={{
                marginTop: 6,
                fontSize: 11,
                color: "var(--text-muted)",
                fontFamily: "monospace",
              }}
            >
              Guardado como: <strong>act_{initialAdAccount}</strong>
            </div>
          )}
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {dirty && (
            <span
              style={{
                fontSize: 11,
                color: "var(--sand-dark)",
                flex: 1,
              }}
            >
              Hay cambios sin guardar.
            </span>
          )}
          <div style={{ flex: dirty ? 0 : 1 }} />
          <button
            onClick={save}
            disabled={saving || !dirty}
            className={ui.btnSolid}
            style={{
              whiteSpace: "nowrap",
              opacity: saving || !dirty ? 0.55 : 1,
            }}
          >
            {saving ? "Guardando…" : "Guardar"}
          </button>
        </div>
      </div>

      {error && (
        <div
          style={{
            marginTop: 10,
            fontSize: 11,
            color: "#B91C1C",
          }}
        >
          {error}
        </div>
      )}

      <p
        style={{
          marginTop: 10,
          fontSize: 11,
          color: "var(--text-muted)",
          lineHeight: 1.5,
        }}
      >
        Tip: el link específico al planner de la página del cliente lo
        encontrás dentro de Meta Business Suite → Planner → copiá el
        URL de la barra del navegador. Si dejás vacío, el botón del
        calendario cae al home genérico de business.facebook.com.
      </p>
    </div>
  );
}

// ============================================================
// SocialLinksPanel — 4 inputs (IG/FB/TT/LinkedIn) con los URLs
// públicos del perfil del cliente. Sirven para que el preview del
// feed sea más fiel: el avatar/handle del header linkea al perfil
// real (target=_blank), y el handle se extrae del path del URL.
//
// Validación: si el campo está vacío lo guardamos como undefined.
// Si tiene contenido, exigimos http(s)://. Por red, el helper
// extractHandleFromUrl te muestra qué handle vamos a usar.
// ============================================================
const SOCIAL_FIELD_LABEL = {
  ig: "Instagram",
  fb: "Facebook",
  tt: "TikTok",
  in: "LinkedIn",
} as const;

const SOCIAL_ACCENT: Record<keyof typeof SOCIAL_FIELD_LABEL, string> = {
  ig: "#E4405F",
  fb: "#1877F2",
  tt: "#000000",
  in: "#0A66C2",
};

const SOCIAL_URL_PLACEHOLDER: Record<keyof typeof SOCIAL_FIELD_LABEL, string> =
  {
    ig: "https://instagram.com/usuario",
    fb: "https://facebook.com/pagina",
    tt: "https://tiktok.com/@usuario",
    in: "https://linkedin.com/company/empresa",
  };

type SocialKey = keyof typeof SOCIAL_FIELD_LABEL;

function SocialLinksPanel({
  client,
  onSaved,
}: {
  client: Client;
  onSaved: (links: ClientSocialLinks) => void;
}) {
  const initial: ClientSocialLinks = client.social_links ?? {};
  const [rows, setRows] = useState<Record<SocialKey, string>>({
    ig: initial.ig ?? "",
    fb: initial.fb ?? "",
    tt: initial.tt ?? "",
    in: initial.in ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    const cur: ClientSocialLinks = client.social_links ?? {};
    setRows({
      ig: cur.ig ?? "",
      fb: cur.fb ?? "",
      tt: cur.tt ?? "",
      in: cur.in ?? "",
    });
  }, [client.social_links]);

  const dirty = (Object.keys(rows) as SocialKey[]).some(
    (k) => (rows[k]?.trim() || "") !== (initial[k] ?? ""),
  );

  function isValidUrl(value: string): boolean {
    if (!value.trim()) return true;
    return /^https?:\/\//i.test(value.trim());
  }

  async function save() {
    setErr("");
    for (const k of Object.keys(rows) as SocialKey[]) {
      if (!isValidUrl(rows[k])) {
        setErr(
          `El URL de ${SOCIAL_FIELD_LABEL[k]} tiene que empezar con http:// o https://`,
        );
        return;
      }
    }
    setSaving(true);
    try {
      const payload: ClientSocialLinks = {};
      for (const k of Object.keys(rows) as SocialKey[]) {
        if (rows[k].trim()) payload[k] = rows[k].trim();
      }
      await updateClientSocialLinks(client.id, payload);
      onSaved(payload);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={ui.panel} style={{ marginBottom: 24 }}>
      <div className={ui.panelHead}>
        <div>
          <div className={ui.panelTitle}>Links de redes sociales</div>
          <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>
            URLs de los perfiles públicos del cliente. Se usan para que el
            avatar / handle del header del feed (menú Contenido → Vista feed)
            linkeen al perfil real. Datos como bio o seguidores NO se piden
            acá — el preview los omite a propósito.
          </p>
        </div>
      </div>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 10,
          marginBottom: 14,
        }}
      >
        {(Object.keys(SOCIAL_FIELD_LABEL) as SocialKey[]).map((key) => {
          const accent = SOCIAL_ACCENT[key];
          const value = rows[key];
          const handle = extractHandleFromUrl(value);
          return (
            <div
              key={key}
              style={{
                display: "flex",
                gap: 10,
                alignItems: "center",
                padding: "8px 12px",
                background: "var(--white)",
                border: "1px solid rgba(10,26,12,0.08)",
                borderLeft: `4px solid ${accent}`,
                borderRadius: 6,
              }}
            >
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                  color: accent,
                  width: 84,
                  flexShrink: 0,
                }}
              >
                {SOCIAL_FIELD_LABEL[key]}
              </div>
              <input
                type="url"
                value={value}
                onChange={(e) =>
                  setRows((prev) => ({ ...prev, [key]: e.target.value }))
                }
                placeholder={SOCIAL_URL_PLACEHOLDER[key]}
                style={{
                  flex: 1,
                  padding: "6px 10px",
                  border: "1px solid rgba(10,26,12,0.12)",
                  borderRadius: 4,
                  fontSize: 13,
                  fontFamily: "inherit",
                  background: "var(--white)",
                  color: "var(--deep-green)",
                  outline: "none",
                }}
              />
              <div
                style={{
                  fontSize: 11,
                  color: "var(--text-muted)",
                  fontFamily: "monospace",
                  minWidth: 80,
                  textAlign: "right",
                }}
              >
                {handle ?? "—"}
              </div>
            </div>
          );
        })}
      </div>

      <div
        style={{
          display: "flex",
          gap: 8,
          alignItems: "center",
          justifyContent: "flex-end",
        }}
      >
        {dirty && (
          <span style={{ fontSize: 11, color: "var(--sand-dark)", flex: 1 }}>
            Hay cambios sin guardar.
          </span>
        )}
        <button
          type="button"
          onClick={save}
          disabled={saving || !dirty}
          className={ui.btnSolid}
          style={{ opacity: saving || !dirty ? 0.55 : 1 }}
        >
          {saving ? "Guardando…" : "Guardar"}
        </button>
      </div>

      {err && (
        <div
          style={{
            marginTop: 10,
            fontSize: 11,
            color: "#B91C1C",
          }}
        >
          ⚠ {err}
        </div>
      )}
    </div>
  );
}

// ============================================================
// EditorialClassificationsPanel — CRUD de las clasificaciones
// editoriales custom del cliente (label + color). Lo que cargue acá
// es lo que aparece como pills en /contenido (NewIdea, RowEditor,
// filtro) y como background-color en los tiles del feed.
//
// Si el cliente no tiene nada cargado, mostramos los DEFAULTS como
// placeholder y un botón "Seedear defaults" que copia los 3 históricos
// (valor/conversión/aspiracional) al catálogo del cliente.
//
// El id se autogenera al crear (slug del label, único). Esto es lo
// que se persiste en content_posts.classification — si se renombra
// el label, el id se mantiene y los posts viejos siguen apuntando.
// ============================================================
function EditorialClassificationsPanel({
  client,
  onSaved,
}: {
  client: Client;
  onSaved: (list: ClientContentClassification[]) => void;
}) {
  // Estado local: lo que el director está editando. Inicialmente trae
  // lo que tenía guardado el cliente; si está vacío, arranca con array
  // vacío (el panel ofrece seedear los DEFAULTS).
  const initial = client.content_classifications ?? [];
  const [list, setList] = useState<ClientContentClassification[]>(initial);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [draftLabel, setDraftLabel] = useState("");
  const [draftColor, setDraftColor] = useState("#2f7d4f");

  // Resync si el cliente cambia desde afuera (otra pestaña, etc.).
  useEffect(() => {
    setList(client.content_classifications ?? []);
  }, [client.content_classifications]);

  // Detectar si hay cambios respecto al storage para mostrar el CTA
  // de guardar.
  const dirty = JSON.stringify(list) !== JSON.stringify(initial);

  function slugify(text: string): string {
    return text
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || `cat-${Date.now().toString(36)}`;
  }

  function addClassification() {
    setErr("");
    const label = draftLabel.trim();
    if (!label) {
      setErr("Poné un nombre para la clasificación");
      return;
    }
    // Generamos el id como slug del label, asegurando unicidad dentro
    // del set actual.
    let baseId = slugify(label);
    let id = baseId;
    let n = 2;
    while (list.find((c) => c.id === id)) {
      id = `${baseId}-${n}`;
      n++;
    }
    setList((prev) => [...prev, { id, label, color: draftColor }]);
    setDraftLabel("");
  }

  function removeClassification(id: string) {
    setList((prev) => prev.filter((c) => c.id !== id));
  }

  function updateClassification(
    id: string,
    patch: Partial<ClientContentClassification>,
  ) {
    setList((prev) =>
      prev.map((c) => (c.id === id ? { ...c, ...patch } : c)),
    );
  }

  async function save() {
    setSaving(true);
    setErr("");
    try {
      await updateClientContentClassifications(client.id, list);
      onSaved(list);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  function seedDefaults() {
    setList(DEFAULT_CONTENT_CLASSIFICATIONS);
  }

  const effective = list.length === 0 ? DEFAULT_CONTENT_CLASSIFICATIONS : list;

  return (
    <div className={ui.panel} style={{ marginBottom: 24 }}>
      <div className={ui.panelHead}>
        <div>
          <div className={ui.panelTitle}>Clasificaciones editoriales</div>
          <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>
            Categorías propias para tipificar el contenido del cliente. Se
            muestran como chips en el menú Contenido y tintan los tiles
            del feed con el color que elijas.
          </p>
        </div>
      </div>

      {/* Listado de clasificaciones cargadas */}
      {list.length === 0 ? (
        <div
          style={{
            padding: 16,
            background: "var(--ivory)",
            borderLeft: "3px solid var(--sand)",
            borderRadius: "var(--r-md)",
            fontSize: 12,
            color: "var(--deep-green)",
            marginBottom: 14,
            lineHeight: 1.5,
          }}
        >
          Este cliente todavía no tiene clasificaciones custom. Mientras
          tanto se ven los <strong>defaults</strong>: Valor, Conversión y
          Aspiracional. Cargá las propias acá abajo o copiá los defaults
          como punto de partida.
          <div style={{ marginTop: 10 }}>
            <button
              type="button"
              onClick={seedDefaults}
              className={ui.btnGhost}
              style={{ fontSize: 11 }}
            >
              + Seedear con los defaults
            </button>
          </div>
        </div>
      ) : (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 8,
            marginBottom: 14,
          }}
        >
          {list.map((c) => (
            <div
              key={c.id}
              style={{
                display: "flex",
                gap: 10,
                alignItems: "center",
                padding: "8px 12px",
                background: "var(--white)",
                border: "1px solid rgba(10,26,12,0.08)",
                borderLeft: `4px solid ${c.color}`,
                borderRadius: 6,
              }}
            >
              <input
                type="color"
                value={c.color}
                onChange={(e) =>
                  updateClassification(c.id, { color: e.target.value })
                }
                style={{
                  width: 36,
                  height: 28,
                  padding: 0,
                  border: "1px solid rgba(10,26,12,0.15)",
                  borderRadius: 4,
                  cursor: "pointer",
                  background: "transparent",
                }}
                title="Color del chip / tile"
              />
              <input
                type="text"
                value={c.label}
                onChange={(e) =>
                  updateClassification(c.id, { label: e.target.value })
                }
                placeholder="Nombre"
                style={{
                  flex: 1,
                  padding: "6px 10px",
                  border: "1px solid rgba(10,26,12,0.12)",
                  borderRadius: 4,
                  fontSize: 13,
                  fontFamily: "inherit",
                  background: "var(--white)",
                  color: "var(--deep-green)",
                  outline: "none",
                }}
              />
              <code
                style={{
                  fontSize: 10,
                  color: "var(--text-muted)",
                  padding: "2px 6px",
                  background: "var(--off-white)",
                  borderRadius: 3,
                  fontFamily: "monospace",
                }}
                title={`id estable que se guarda en cada post: ${c.id}`}
              >
                {c.id}
              </code>
              <button
                type="button"
                onClick={() => removeClassification(c.id)}
                style={{
                  background: "transparent",
                  border: "none",
                  color: "var(--red-warn)",
                  fontSize: 18,
                  fontWeight: 700,
                  cursor: "pointer",
                  padding: "0 6px",
                }}
                title="Borrar clasificación"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Form para agregar nueva */}
      <div
        style={{
          display: "flex",
          gap: 8,
          alignItems: "center",
          padding: 10,
          background: "var(--off-white)",
          borderRadius: 6,
          marginBottom: 12,
        }}
      >
        <input
          type="color"
          value={draftColor}
          onChange={(e) => setDraftColor(e.target.value)}
          style={{
            width: 36,
            height: 28,
            padding: 0,
            border: "1px solid rgba(10,26,12,0.15)",
            borderRadius: 4,
            cursor: "pointer",
            background: "transparent",
          }}
        />
        <input
          type="text"
          value={draftLabel}
          onChange={(e) => setDraftLabel(e.target.value)}
          placeholder="Nueva clasificación — ej: Tutorial, Behind-the-scenes…"
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addClassification();
            }
          }}
          style={{
            flex: 1,
            padding: "6px 10px",
            border: "1px solid rgba(10,26,12,0.12)",
            borderRadius: 4,
            fontSize: 13,
            fontFamily: "inherit",
            background: "var(--white)",
            color: "var(--deep-green)",
            outline: "none",
          }}
        />
        <button
          type="button"
          onClick={addClassification}
          className={ui.btnGhost}
          style={{ whiteSpace: "nowrap", fontSize: 11 }}
        >
          + Agregar
        </button>
      </div>

      {/* Preview rápido de los chips como van a verse */}
      {effective.length > 0 && (
        <div
          style={{
            marginBottom: 14,
            padding: 12,
            background: "var(--off-white)",
            borderRadius: 6,
            display: "flex",
            gap: 8,
            flexWrap: "wrap",
            alignItems: "center",
          }}
        >
          <span
            style={{
              fontSize: 10,
              letterSpacing: "0.15em",
              textTransform: "uppercase",
              color: "var(--sand-dark)",
              fontWeight: 700,
              marginRight: 6,
            }}
          >
            Preview
          </span>
          {effective.map((c) => (
            <span
              key={c.id}
              style={{
                padding: "5px 11px",
                fontSize: 11,
                fontWeight: 700,
                background: c.color,
                color: "var(--off-white)",
                borderRadius: 999,
                letterSpacing: "0.04em",
              }}
            >
              {c.label}
            </span>
          ))}
        </div>
      )}

      {/* CTAs: guardar + seedear si vacío */}
      <div
        style={{
          display: "flex",
          gap: 8,
          alignItems: "center",
          justifyContent: "flex-end",
        }}
      >
        {dirty && (
          <span style={{ fontSize: 11, color: "var(--sand-dark)", flex: 1 }}>
            Hay cambios sin guardar.
          </span>
        )}
        {list.length === 0 && (
          <button
            type="button"
            onClick={seedDefaults}
            className={ui.btnGhost}
            style={{ fontSize: 11 }}
          >
            + Usar defaults
          </button>
        )}
        <button
          type="button"
          onClick={save}
          disabled={saving || !dirty}
          className={ui.btnSolid}
          style={{ opacity: saving || !dirty ? 0.55 : 1 }}
        >
          {saving ? "Guardando…" : "Guardar"}
        </button>
      </div>

      {err && (
        <div
          style={{
            marginTop: 10,
            fontSize: 11,
            color: "#B91C1C",
          }}
        >
          ⚠ {err}
        </div>
      )}

      <p
        style={{
          marginTop: 12,
          fontSize: 11,
          color: "var(--text-muted)",
          lineHeight: 1.5,
        }}
      >
        Tip: el id estable (gris) es lo que se guarda en cada pieza. Si
        renombrás el label, el id no cambia y los posts viejos siguen
        apuntando a la categoría. Si borrás una clasificación, los posts
        que la usaban quedan como "sin clasificar" hasta que les pongas
        otra.
      </p>
    </div>
  );
}

// classificationsFor está importado pero no se usa directamente acá —
// el panel siempre trabaja con `list` (lo que está editando el
// director). El effective fallback con DEFAULTS solo se muestra en el
// preview y en el mensaje cuando la lista está vacía.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _useClassificationsFor = classificationsFor;

// ============================================================
// ContractPanel — visualizar + subir/reemplazar el contrato PDF
// del cliente. El archivo se guarda en client.onboarding.contractFile
// (string path o OnboardingFile). Se gestiona acá en Configuración
// porque es información contractual, no documentación viva del
// cliente.
// ============================================================
function ContractPanel({
  client,
  onChange,
}: {
  client: Client;
  onChange: () => void;
}) {
  const contractFile = client.onboarding?.contractFile;
  const fileName = !contractFile
    ? null
    : typeof contractFile === "string"
      ? contractFile.split("/").pop() || contractFile
      : (contractFile as OnboardingFile).name;

  return (
    <div
      style={{
        display: "flex",
        gap: 18,
        alignItems: "center",
        flexWrap: "wrap",
      }}
    >
      <div
        style={{
          width: 64,
          height: 80,
          background: "var(--ivory)",
          borderRadius: 6,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 24,
          color: "var(--sand-dark)",
          border: "1px solid rgba(10,26,12,0.08)",
          flexShrink: 0,
        }}
      >
        📄
      </div>
      <div style={{ flex: 1, minWidth: 200 }}>
        {fileName ? (
          <>
            <div
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: "var(--deep-green)",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
              title={fileName}
            >
              {fileName}
            </div>
            <div
              style={{
                fontSize: 11,
                color: "var(--text-muted)",
                marginTop: 4,
              }}
            >
              Reemplazá el archivo si necesitás actualizar el contrato.
            </div>
          </>
        ) : (
          <div
            style={{
              fontSize: 12,
              color: "var(--text-muted)",
              fontStyle: "italic",
            }}
          >
            Sin contrato cargado. Subí el PDF firmado para tenerlo
            disponible cuando lo necesites.
          </div>
        )}
      </div>
      <LibraryUploadButton
        client={client}
        target="contract"
        label={contractFile ? "↻ Reemplazar contrato" : "+ Subir contrato"}
        accept=".pdf"
        onUploaded={onChange}
      />
    </div>
  );
}
