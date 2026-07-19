import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export interface Folder {
  id: number;
  name: string;
  color: string;
  parentId?: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface Notebook {
  id: number;
  name: string;
  color: string;
  folderId?: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface LibraryHierarchy {
  folders: Folder[];
  notebooks: Notebook[];
}

interface FolderInput {
  name: string;
  color?: string;
  parentId?: number | null;
}

interface NotebookInput {
  name: string;
  color?: string;
  folderId?: number | null;
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `Request failed (${response.status})`);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export const libraryQueryKey = ["library-hierarchy"] as const;

export function useLibraryHierarchy() {
  return useQuery({
    queryKey: libraryQueryKey,
    queryFn: () => request<LibraryHierarchy>("/api/library"),
  });
}

function useLibraryMutation<TInput, TResult>(mutationFn: (input: TInput) => Promise<TResult>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: libraryQueryKey }),
  });
}

export function useCreateFolder() {
  return useLibraryMutation<FolderInput, Folder>((input) =>
    request("/api/folders", { method: "POST", body: JSON.stringify(input) }),
  );
}

export function useCreateNotebook() {
  return useLibraryMutation<NotebookInput, Notebook>((input) =>
    request("/api/notebooks", { method: "POST", body: JSON.stringify(input) }),
  );
}

export function useDeleteFolder() {
  return useLibraryMutation<number, void>((id) =>
    request(`/api/folders/${id}`, { method: "DELETE" }),
  );
}

export function useDeleteNotebook() {
  return useLibraryMutation<number, void>((id) =>
    request(`/api/notebooks/${id}`, { method: "DELETE" }),
  );
}
