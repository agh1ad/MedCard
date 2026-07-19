import {
  getListCardsQueryKey,
  useGetCardStats,
  useListCards,
  useListTags,
  useUpdateCard,
  type Card,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Link, useLocation, useRoute } from "wouter";
import { useState } from "react";
import { format } from "date-fns";
import {
  BarChart2,
  BookOpen,
  ChevronRight,
  Folder as FolderIcon,
  FolderPlus,
  Hash,
  MoreHorizontal,
  NotebookPen,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import {
  type Folder,
  type Notebook,
  useCreateFolder,
  useCreateNotebook,
  useDeleteFolder,
  useDeleteNotebook,
  useLibraryHierarchy,
} from "@/lib/library-api";

const COLORS = ["#2878e3", "#16a085", "#e8872b", "#d84c72", "#7656c9", "#d5a419"];

type CreateKind = "folder" | "notebook";

export function Library() {
  const [, folderParams] = useRoute("/folders/:id");
  const [, notebookParams] = useRoute("/notebooks/:id");
  const [, setLocation] = useLocation();
  const folderId = folderParams ? Number(folderParams.id) : null;
  const notebookId = notebookParams ? Number(notebookParams.id) : null;
  const [search, setSearch] = useState("");
  const [selectedTag, setSelectedTag] = useState("");
  const [createKind, setCreateKind] = useState<CreateKind | null>(null);

  const { data: library, isLoading: libraryLoading } = useLibraryHierarchy();
  const { data: stats, isLoading: statsLoading } = useGetCardStats();
  const { data: cards, isLoading: cardsLoading } = useListCards({
    search: search || undefined,
    tag: selectedTag || undefined,
  });
  const { data: tags, isLoading: tagsLoading } = useListTags();

  const currentFolder = library?.folders.find((folder) => folder.id === folderId);
  const currentNotebook = library?.notebooks.find((notebook) => notebook.id === notebookId);
  const contextFolderId = currentNotebook?.folderId ?? folderId;
  const isSearching = Boolean(search || selectedTag);

  const visibleFolders = isSearching || notebookId
    ? []
    : (library?.folders ?? []).filter((folder) => (folder.parentId ?? null) === folderId);
  const visibleNotebooks = isSearching || notebookId
    ? []
    : (library?.notebooks ?? []).filter((notebook) => (notebook.folderId ?? null) === folderId);
  const visibleCards = (cards ?? []).filter((card) => {
    if (isSearching) return true;
    if (notebookId) return card.notebookId === notebookId;
    if (folderId) return false;
    return card.notebookId == null;
  });

  const title = currentNotebook?.name ?? currentFolder?.name ?? "My Documents";
  const description = currentNotebook
    ? `${visibleCards.length} memory ${visibleCards.length === 1 ? "card" : "cards"}`
    : currentFolder
      ? "Folders and notebooks in this collection"
      : "Your visual medical study library";

  const folderTrail = buildFolderTrail(library?.folders ?? [], contextFolderId ?? null);

  return (
    <div className="library-page">
      <div className="library-breadcrumbs" aria-label="Breadcrumb">
        <Link href="/">Documents</Link>
        {folderTrail.map((folder) => (
          <span key={folder.id}>
            <ChevronRight />
            <Link href={`/folders/${folder.id}`}>{folder.name}</Link>
          </span>
        ))}
        {currentNotebook && (
          <span>
            <ChevronRight />
            <strong>{currentNotebook.name}</strong>
          </span>
        )}
      </div>

      <section className="library-heading">
        <div>
          <h1>{title}</h1>
          <p>{description}</p>
        </div>
        <div className="library-heading-actions">
          {!notebookId && (
            <>
              <Button variant="outline" onClick={() => setCreateKind("folder")}>
                <FolderPlus className="mr-2 h-4 w-4" /> New folder
              </Button>
              <Button variant="outline" onClick={() => setCreateKind("notebook")}>
                <NotebookPen className="mr-2 h-4 w-4" /> New notebook
              </Button>
            </>
          )}
          <Link href="/generate">
            <Button><Plus className="mr-2 h-4 w-4" /> New card</Button>
          </Link>
        </div>
      </section>

      <section className="library-toolbar">
        <div className="relative min-w-0 flex-1 md:max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search all cards..."
            className="h-11 bg-card pl-9 shadow-sm"
          />
        </div>
        <div className="library-tags">
          <Button variant={selectedTag === "" ? "default" : "outline"} size="sm" onClick={() => setSelectedTag("")} className="rounded-full">
            All topics
          </Button>
          {tagsLoading ? <Skeleton className="h-8 w-24 rounded-full" /> : tags?.map((tag) => (
            <Button key={tag} variant={selectedTag === tag ? "default" : "outline"} size="sm" onClick={() => setSelectedTag(tag)} className="rounded-full">
              <Hash className="mr-1 h-3 w-3 opacity-50" />{tag}
            </Button>
          ))}
        </div>
        {!notebookId && (
          <div className="library-stat">
            {statsLoading ? <Skeleton className="h-6 w-8" /> : <strong>{stats?.totalCards ?? 0}</strong>}
            <span>cards</span>
          </div>
        )}
      </section>

      {(libraryLoading || cardsLoading) ? (
        <LibrarySkeleton />
      ) : visibleFolders.length || visibleNotebooks.length || visibleCards.length ? (
        <div className="library-content">
          {(visibleFolders.length > 0 || visibleNotebooks.length > 0) && (
            <section>
              <h2 className="library-section-title">Collections</h2>
              <div className="library-collection-grid">
                {visibleFolders.map((folder) => (
                  <FolderTile key={folder.id} folder={folder} />
                ))}
                {visibleNotebooks.map((notebook) => (
                  <NotebookTile key={notebook.id} notebook={notebook} count={(cards ?? []).filter((card) => card.notebookId === notebook.id).length} />
                ))}
              </div>
            </section>
          )}

          {visibleCards.length > 0 && (
            <section>
              <h2 className="library-section-title">{isSearching ? "Search results" : "Memory cards"}</h2>
              <div className="library-card-grid">
                {visibleCards.map((card, index) => (
                  <CardTile key={card.id} card={card} notebooks={library?.notebooks ?? []} index={index} />
                ))}
              </div>
            </section>
          )}
        </div>
      ) : (
        <div className="library-empty">
          <div className="library-empty-icon">{notebookId ? <BookOpen /> : <FolderIcon />}</div>
          <h2>{isSearching ? "No matching cards" : `This ${notebookId ? "notebook" : "folder"} is empty`}</h2>
          <p>{isSearching ? "Try another keyword or topic." : "Add a card or create a collection to start organizing your study library."}</p>
          {!isSearching && <Link href="/generate"><Button className="mt-5">Create a MedCard</Button></Link>}
        </div>
      )}

      <CreateCollectionDialog
        kind={createKind}
        onClose={() => setCreateKind(null)}
        parentFolderId={folderId}
      />
    </div>
  );

  function FolderTile({ folder }: { folder: Folder }) {
    const deleteMutation = useDeleteFolder();
    return (
      <article className="library-folder-tile" style={{ "--collection-color": folder.color } as React.CSSProperties}>
        <Link href={`/folders/${folder.id}`} className="library-collection-link">
          <span className="library-folder-icon"><FolderIcon /></span>
          <span><strong>{folder.name}</strong><small>Folder</small></span>
        </Link>
        <CollectionMenu label={folder.name} onDelete={() => {
          if (!confirm(`Delete “${folder.name}”? Its contents will remain in Documents.`)) return;
          deleteMutation.mutate(folder.id, { onSuccess: () => folderId === folder.id && setLocation("/") });
        }} />
      </article>
    );
  }

  function NotebookTile({ notebook, count }: { notebook: Notebook; count: number }) {
    const deleteMutation = useDeleteNotebook();
    return (
      <article className="library-notebook-tile" style={{ "--collection-color": notebook.color } as React.CSSProperties}>
        <Link href={`/notebooks/${notebook.id}`} className="library-collection-link">
          <span className="library-notebook-cover"><NotebookPen /></span>
          <span><strong>{notebook.name}</strong><small>{count} {count === 1 ? "card" : "cards"}</small></span>
        </Link>
        <CollectionMenu label={notebook.name} onDelete={() => {
          if (!confirm(`Delete “${notebook.name}”? Its cards will return to Documents.`)) return;
          deleteMutation.mutate(notebook.id, { onSuccess: () => notebookId === notebook.id && setLocation("/") });
        }} />
      </article>
    );
  }
}

function CollectionMenu({ label, onDelete }: { label: string; onDelete: () => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="library-more" aria-label={`Actions for ${label}`}><MoreHorizontal /></button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={onDelete} className="text-destructive focus:text-destructive">
          <Trash2 /> Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function CardTile({ card, notebooks, index }: { card: Card; notebooks: Notebook[]; index: number }) {
  const updateMutation = useUpdateCard();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const move = (value: string) => {
    updateMutation.mutate(
      { id: card.id, data: { notebookId: value ? Number(value) : null } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListCardsQueryKey() });
          toast({ title: value ? "Card moved to notebook" : "Card moved to Documents" });
        },
      },
    );
  };

  return (
    <article className="library-card-tile" style={{ animationDelay: `${index * 45}ms` }}>
      <Link href={`/cards/${card.id}`} className="library-card-link">
        <div className="library-card-preview">
          <span>MEDCARD</span>
          <div className="library-preview-lines"><i /><i /><i /><i /></div>
        </div>
        <div className="library-card-body">
          <h3>{card.topic}</h3>
          <div className="flex flex-wrap gap-1.5">
            {card.tags?.slice(0, 3).map((tag) => <Badge key={tag} variant="secondary">{tag}</Badge>)}
          </div>
          <div className="library-card-meta">
            <span><BarChart2 />{card.flow?.length ?? 0} roots</span>
            <span>{format(new Date(card.updatedAt), "MMM d, yyyy")}</span>
          </div>
        </div>
      </Link>
      <label className="library-move-control">
        <span>Notebook</span>
        <select value={card.notebookId ?? ""} onChange={(event) => move(event.target.value)} disabled={updateMutation.isPending}>
          <option value="">Documents</option>
          {notebooks.map((notebook) => <option key={notebook.id} value={notebook.id}>{notebook.name}</option>)}
        </select>
      </label>
    </article>
  );
}

function CreateCollectionDialog({ kind, onClose, parentFolderId }: { kind: CreateKind | null; onClose: () => void; parentFolderId: number | null }) {
  const [name, setName] = useState("");
  const [color, setColor] = useState(COLORS[0]);
  const createFolder = useCreateFolder();
  const createNotebook = useCreateNotebook();
  const { toast } = useToast();

  const submit = () => {
    if (!kind || !name.trim()) return;
    const mutation = kind === "folder" ? createFolder : createNotebook;
    const input = kind === "folder"
      ? { name: name.trim(), color, parentId: parentFolderId }
      : { name: name.trim(), color, folderId: parentFolderId };
    mutation.mutate(input, {
      onSuccess: () => {
        toast({ title: `${kind === "folder" ? "Folder" : "Notebook"} created` });
        setName("");
        onClose();
      },
      onError: (error) => toast({ title: "Could not create collection", description: error.message, variant: "destructive" }),
    });
  };

  return (
    <Dialog open={kind !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New {kind}</DialogTitle>
          <DialogDescription>{kind === "folder" ? "Group notebooks and nested folders." : "Keep related MedCards together like pages in a notebook."}</DialogDescription>
        </DialogHeader>
        <Input value={name} onChange={(event) => setName(event.target.value)} onKeyDown={(event) => event.key === "Enter" && submit()} placeholder={`${kind === "folder" ? "Folder" : "Notebook"} name`} autoFocus />
        <div className="collection-color-picker" aria-label="Collection color">
          {COLORS.map((option) => <button key={option} type="button" aria-label={`Use ${option}`} className={color === option ? "is-selected" : ""} style={{ background: option }} onClick={() => setColor(option)} />)}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={!name.trim() || createFolder.isPending || createNotebook.isPending}>Create</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function LibrarySkeleton() {
  return <div className="library-collection-grid">{[1, 2, 3, 4].map((item) => <Skeleton key={item} className="h-24 rounded-xl" />)}</div>;
}

function buildFolderTrail(folders: Folder[], id: number | null): Folder[] {
  const trail: Folder[] = [];
  const visited = new Set<number>();
  let current = id;
  while (current != null && !visited.has(current)) {
    visited.add(current);
    const folder = folders.find((item) => item.id === current);
    if (!folder) break;
    trail.unshift(folder);
    current = folder.parentId ?? null;
  }
  return trail;
}
