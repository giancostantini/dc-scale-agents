// ==================== DATOS MOCK ====================
// Solo quedan los usuarios (después se reemplazan por Supabase Auth).
// Los clientes, pipeline, eventos, etc. viven en localStorage (lib/storage.ts).

import type { User, UserKey } from "./types";

export const USERS: Record<UserKey, User> = {
  gianluca: { name: "Gianluca", role: "Director",    initials: "GC", isDirector: true  },
  federico: { name: "Federico", role: "Director",    initials: "FD", isDirector: true  },
  laura:    { name: "Laura",    role: "Content",     initials: "LC", isDirector: false },
  martin:   { name: "Martín",   role: "Media Buyer", initials: "MR", isDirector: false },
  sofia:    { name: "Sofía",    role: "SEO",         initials: "SP", isDirector: false },
};
