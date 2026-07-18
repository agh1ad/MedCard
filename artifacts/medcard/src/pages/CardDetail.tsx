import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useRoute } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  getGetCardQueryKey,
  useDeleteCard,
  useGetCard,
  useUpdateCard,
  type CardImage,
  type CardImageSection,
  type FlowNode,
  type SectionTrees,
} from "@workspace/api-client-react";
import { FlowTree, flattenFlowToText } from "@/components/card/FlowTree";
import { MemoryCardCanvas } from "@/components/card/MemoryCardCanvas";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import {
  AlertCircle,
  ArrowLeft,
  Copy,
  Edit3,
  Loader2,
  Printer,
  Save,
  ShieldCheck,
  Trash2,
  X,
} from "lucide-react";

const EMPTY_TREES: SectionTrees = {
  high_yield: [],
  risk_factors: [],
  associations: [],
  diagnosis: [],
  treatment: [],
  complications: [],
};

const SECTION_LABELS: Record<keyof SectionTrees, string> = {
  high_yield: "High yield",
  risk_factors: "Risk factors",
  associations: "Associations",
  diagnosis: "Diagnosis",
  treatment: "Treatment",
  complications: "Complications",
};

const IMAGE_SECTIONS: Array<{ value: CardImageSection; label: string }> = [
  { value: "main", label: "Main flow" },
  ...Object.entries(SECTION_LABELS).map(([value, label]) => ({
    value: value as CardImageSection,
    label,
  })),
];

export function CardDetail() {
  const [, params] = useRoute("/cards/:id");
  const id = Number(params?.id);
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: card, isLoading, isError } = useGetCard(id, {
    query: { enabled: Number.isFinite(id) && id > 0, queryKey: getGetCardQueryKey(id) },
  });
  const updateMutation = useUpdateCard();
  const deleteMutation = useDeleteCard();
  const initializedId = useRef<number | null>(null);

  const [editing, setEditing] = useState(false);
  const [topic, setTopic] = useState("");
  const [flow, setFlow] = useState<FlowNode[]>([]);
  const [sectionTrees, setSectionTrees] = useState<SectionTrees>(EMPTY_TREES);
  const [images, setImages] = useState<CardImage[]>([]);
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");

  useEffect(() => {
    if (!card || initializedId.current === id) return;
    initializedId.current = id;
    setTopic(card.topic);
    setFlow(card.flow ?? []);
    setSectionTrees(card.sectionTrees ?? EMPTY_TREES);
    setImages(card.images ?? []);
    setTags(card.tags ?? []);
  }, [card, id]);

  const reset = () => {
    if (!card) return;
    setTopic(card.topic);
    setFlow(card.flow ?? []);
    setSectionTrees(card.sectionTrees ?? EMPTY_TREES);
    setImages(card.images ?? []);
    setTags(card.tags ?? []);
    setEditing(false);
  };

  const save = () => {
    if (!topic.trim()) {
      toast({ title: "A card title is required", variant: "destructive" });
      return;
    }
    updateMutation.mutate(
      { id, data: { topic: topic.trim(), flow, sectionTrees, images, tags } },
      {
        onSuccess: (updated) => {
          queryClient.setQueryData(getGetCardQueryKey(id), updated);
          setEditing(false);
          toast({ title: "Memory card updated" });
        },
        onError: (error) =>
          toast({
            title: "Update failed",
            description: error instanceof Error ? error.message : undefined,
            variant: "destructive",
          }),
      },
    );
  };

  const remove = () => {
    if (!confirm("Delete this memory card permanently?")) return;
    deleteMutation.mutate(
      { id },
      { onSuccess: () => setLocation("/") },
    );
  };

  const copyText = async () => {
    const sectionText = (Object.keys(sectionTrees) as (keyof SectionTrees)[])
      .filter((key) => sectionTrees[key].length)
      .map((key) => `\n## ${SECTION_LABELS[key]}\n${flattenFlowToText(sectionTrees[key])}`)
      .join("\n");
    await navigator.clipboard.writeText(
      `# ${topic}\n\n## Main flow\n${flattenFlowToText(flow)}${sectionText}`,
    );
    toast({ title: "Card copied as text" });
  };

  const addTag = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Enter" || !tagInput.trim()) return;
    event.preventDefault();
    const value = tagInput.trim();
    if (!tags.includes(value)) setTags([...tags, value]);
    setTagInput("");
  };

  if (isLoading) {
    return <div className="flex flex-1 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  if (isError || !card) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center px-4 text-center">
        <AlertCircle className="mb-4 h-12 w-12 text-destructive" />
        <h1 className="text-2xl font-bold">Card not found</h1>
        <Link href="/"><Button className="mt-6">Return to library</Button></Link>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-[1540px] flex-col gap-6 px-4 py-6 lg:px-8">
      <div className="flex flex-wrap items-center justify-between gap-4 print:hidden">
        <div className="flex items-center gap-3">
          <Link href="/"><Button variant="ghost" size="icon"><ArrowLeft className="h-5 w-5" /></Button></Link>
          <div>
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-emerald-700">
              <ShieldCheck className="h-3.5 w-3.5" /> Verbatim source ledger
            </div>
            <p className="mt-1 text-sm text-muted-foreground">{card.sourceBlocks.length || "Legacy"} information blocks</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {editing ? (
            <>
              <Button variant="ghost" onClick={reset}>Cancel</Button>
              <Button onClick={save} disabled={updateMutation.isPending}>
                {updateMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />} Save changes
              </Button>
              <Button variant="destructive" onClick={remove} disabled={deleteMutation.isPending}><Trash2 className="mr-2 h-4 w-4" /> Delete</Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={() => window.print()}><Printer className="mr-2 h-4 w-4" /> Print A4</Button>
              <Button variant="outline" onClick={copyText}><Copy className="mr-2 h-4 w-4" /> Copy</Button>
              <Button onClick={() => setEditing(true)}><Edit3 className="mr-2 h-4 w-4" /> Edit structure</Button>
            </>
          )}
        </div>
      </div>

      {editing ? (
        <div className="space-y-6">
          <section className="grid gap-5 rounded-2xl border bg-card p-5 shadow-sm md:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm font-semibold">Card title</label>
              <Input value={topic} onChange={(event) => setTopic(event.target.value)} className="text-lg font-bold" />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-semibold">Tags</label>
              <div className="flex min-h-10 flex-wrap items-center gap-2 rounded-md border px-3 py-2">
                {tags.map((tag) => <Badge key={tag} variant="secondary">{tag}<X className="ml-1 h-3 w-3 cursor-pointer" onClick={() => setTags(tags.filter((item) => item !== tag))} /></Badge>)}
                <Input value={tagInput} onChange={(event) => setTagInput(event.target.value)} onKeyDown={addTag} placeholder="Add tag" className="h-6 w-28 border-0 p-0 shadow-none focus-visible:ring-0" />
              </div>
            </div>
          </section>

          <section className="rounded-2xl border bg-card p-5 shadow-sm">
            <h2 className="mb-4 text-lg font-bold">Central pathophysiology tree</h2>
            <div className="min-h-[420px] overflow-x-auto rounded-xl border bg-background">
              <FlowTree nodes={flow} isEditing onChange={setFlow} />
            </div>
          </section>

          <div className="grid gap-5 lg:grid-cols-2">
            {(Object.keys(sectionTrees) as (keyof SectionTrees)[]).map((key) => (
              <section key={key} className="rounded-2xl border bg-card p-5 shadow-sm">
                <h2 className="mb-3 font-bold">{SECTION_LABELS[key]}</h2>
                <div className="min-h-[220px] overflow-x-auto rounded-xl border bg-background">
                  <FlowTree
                    nodes={sectionTrees[key]}
                    isEditing
                    onChange={(nodes) => setSectionTrees({ ...sectionTrees, [key]: nodes })}
                  />
                </div>
              </section>
            ))}
          </div>

          {images.length > 0 && (
            <section className="rounded-2xl border bg-card p-5 shadow-sm">
              <h2 className="mb-4 font-bold">Image placement</h2>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {images.map((image) => (
                  <div key={image.id} className="flex gap-3 rounded-xl border p-3">
                    <img src={image.dataUrl} alt="" className="h-20 w-24 rounded object-cover" />
                    <div className="min-w-0 flex-1 space-y-2">
                      <select value={image.section} onChange={(event) => setImages(images.map((item) => item.id === image.id ? { ...item, section: event.target.value as CardImageSection } : item))} className="h-8 w-full rounded border bg-background px-2 text-xs">
                        {IMAGE_SECTIONS.map((section) => <option key={section.value} value={section.value}>{section.label}</option>)}
                      </select>
                      <Input value={image.caption ?? ""} onChange={(event) => setImages(images.map((item) => item.id === image.id ? { ...item, caption: event.target.value } : item))} placeholder="Caption" className="h-8 text-xs" />
                    </div>
                    <Button variant="ghost" size="icon" onClick={() => setImages(images.filter((item) => item.id !== image.id))}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      ) : (
        <MemoryCardCanvas topic={topic} flow={flow} sectionTrees={sectionTrees} images={images} />
      )}
    </div>
  );
}
