"use client";

import { useEffect, useState } from "react";
import { getClient } from "./storage";
import type { Client } from "./types";

export function useClient(id: string) {
  const [client, setClient] = useState<Client | null | undefined>(undefined);

  useEffect(() => {
    getClient(id).then((c) => setClient(c ?? null));
  }, [id]);

  function refresh() {
    getClient(id).then((c) => setClient(c ?? null));
  }

  return { client, refresh };
}
