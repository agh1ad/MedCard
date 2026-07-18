import { useState } from "react";
import { useLocation } from "wouter";
import {
  useCreateCard,
  useGenerateCard,
  type CardImage,
  type CardImageSection,
  type GeneratedCard,
} from "@workspace/api-client-react";
import { MemoryCardCanvas } from "@/components/card/MemoryCardCanvas";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowLeft,
  CheckCircle2,
  ImagePlus,
  Loader2,
  Save,
  ShieldCheck,
  Sparkles,
  Trash2,
  WandSparkles,
  X,
} from "lucide-react";

const IMAGE_SECTIONS: Array<{ value: CardImageSection; label: string }> = [
  { value: "main", label: "Main flow" },
  { value: "high_yield", label: "High yield" },
  { value: "risk_factors", label: "Risk factors" },
  { value: "associations", label: "Associations" },
  { value: "diagnosis", label: "Diagnosis" },
  { value: "treatment", label: "Treatment" },
  { value: "complications", label: "Complications" },
];

function readImage(file: File): Promise<CardImage> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () =>
      resolve({
        id: crypto.randomUUID(),
        name: file.name,
        dataUrl: String(reader.result),
        caption: "",
        section: "main",
      });
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export function Generate() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [rawText, setRawText] = useState("");
  const [topic, setTopic] = useState("");
  const [tagInput, setTagInput] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [images, setImages] = useState<CardImage[]>([]);
  const [preview, setPreview] = useState<GeneratedCard | null>(null);

  const generateMutation = useGenerateCard();
  const createMutation = useCreateCard();

  const addTag = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Enter" || !tagInput.trim()) return;
    event.preventDefault();
    const next = tagInput.trim();
    if (!tags.includes(next)) setTags([...tags, next]);
    setTagInput("");
  };

  const handleImages = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    const valid = files.filter(
      (file) => file.type.startsWith("image/") && file.size <= 3 * 1024 * 1024,
    );
    if (valid.length !== files.length) {
      toast({
        title: "Some images were skipped",
        description: "Use image files smaller than 3 MB each.",
        variant: "destructive",
      });
    }
    setImages([...images, ...(await Promise.all(valid.map(readImage)))]);
    event.target.value = "";
  };

  const generate = () => {
    if (!topic.trim() || !rawText.trim()) {
      toast({
        title: "Topic and source text are required",
        description: "The title stays separate so the AI never invents one.",
        variant: "destructive",
      });
      return;
    }

    generateMutation.mutate(
      { data: { rawText, topic: topic.trim() } },
      {
        onSuccess: (data) => {
          setPreview(data);
          window.scrollTo({ top: 0, behavior: "smooth" });
        },
        onError: (error) => {
          toast({
            title: "Card organization failed",
            description: error instanceof Error ? error.message : "Check the AI connection and try again.",
            variant: "destructive",
          });
        },
      },
    );
  };

  const save = () => {
    if (!preview) return;
    createMutation.mutate(
      {
        data: {
          topic: topic.trim(),
          tags,
          rawText,
          flow: preview.flow,
          sidebar: preview.sidebar,
          sectionTrees: preview.sectionTrees,
          sourceBlocks: preview.sourceBlocks,
          images,
        },
      },
      {
        onSuccess: (card) => setLocation(`/cards/${card.id}`),
        onError: (error) =>
          toast({
            title: "Save failed",
            description: error instanceof Error ? error.message : "Could not save this card.",
            variant: "destructive",
          }),
      },
    );
  };

  if (preview) {
    return (
      <div className="mx-auto flex w-full max-w-[1540px] flex-col gap-6 px-4 py-6 lg:px-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-emerald-700">
              <CheckCircle2 className="h-4 w-4" /> Every source block accounted for
            </div>
            <h1 className="text-3xl font-bold tracking-tight">Review your memory card</h1>
            <p className="mt-1 text-muted-foreground">Place images, inspect the visual flow, then save.</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setPreview(null)}>
              <ArrowLeft className="mr-2 h-4 w-4" /> Back to source
            </Button>
            <Button onClick={save} disabled={createMutation.isPending}>
              {createMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Save card
            </Button>
          </div>
        </div>

        <MemoryCardCanvas
          topic={topic}
          flow={preview.flow}
          sectionTrees={preview.sectionTrees}
          images={images}
        />

        {images.length > 0 && (
          <section className="rounded-2xl border bg-card p-5 shadow-sm">
            <h2 className="mb-4 font-bold">Image placement</h2>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {images.map((image) => (
                <div key={image.id} className="flex gap-3 rounded-xl border bg-background p-3">
                  <img src={image.dataUrl} alt="" className="h-20 w-24 rounded-md object-cover" />
                  <div className="min-w-0 flex-1 space-y-2">
                    <select
                      value={image.section}
                      onChange={(event) =>
                        setImages(images.map((item) => item.id === image.id ? { ...item, section: event.target.value as CardImageSection } : item))
                      }
                      className="h-8 w-full rounded-md border bg-card px-2 text-xs"
                    >
                      {IMAGE_SECTIONS.map((section) => <option key={section.value} value={section.value}>{section.label}</option>)}
                    </select>
                    <Input
                      value={image.caption ?? ""}
                      onChange={(event) => setImages(images.map((item) => item.id === image.id ? { ...item, caption: event.target.value } : item))}
                      placeholder="Optional caption"
                      className="h-8 text-xs"
                    />
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => setImages(images.filter((item) => item.id !== image.id))}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8 lg:px-8">
      <div className="mb-8 max-w-3xl">
        <Badge variant="outline" className="mb-4 border-primary/30 bg-primary/5 text-primary">
          <WandSparkles className="mr-1.5 h-3.5 w-3.5" /> Visual note compiler
        </Badge>
        <h1 className="text-4xl font-bold tracking-tight md:text-5xl">Turn bulk research into one memorable page.</h1>
        <p className="mt-4 text-lg leading-relaxed text-muted-foreground">
          Your wording remains untouched. AI only decides where each source block belongs and how the branches connect.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <section className="rounded-3xl border bg-card p-5 shadow-sm md:p-7">
          <div className="mb-5 flex items-center justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">01 / Source</p>
              <h2 className="mt-1 text-xl font-bold">Paste everything you collected</h2>
            </div>
            <ShieldCheck className="h-7 w-7 text-emerald-600" />
          </div>
          <Textarea
            value={rawText}
            onChange={(event) => setRawText(event.target.value)}
            placeholder="Paste notes from your sources. New lines, arrows, and complete sentences help create cleaner branches..."
            className="min-h-[500px] resize-y rounded-2xl bg-background p-5 font-mono text-sm leading-7"
            data-testid="textarea-raw-text"
          />
          <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
            <span>{rawText.trim() ? rawText.trim().split(/\s+/).length : 0} words</span>
            <span>Nothing is summarized or medically rewritten</span>
          </div>
        </section>

        <aside className="flex flex-col gap-5">
          <section className="rounded-3xl border bg-card p-5 shadow-sm">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">02 / Identity</p>
            <div className="mt-4 space-y-4">
              <div className="space-y-2">
                <Label htmlFor="topic">Card title</Label>
                <Input id="topic" value={topic} onChange={(event) => setTopic(event.target.value)} placeholder="e.g. Hypertrophic pyloric stenosis" />
                <p className="text-xs text-muted-foreground">Required so AI never invents your title.</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="tags">Tags</Label>
                <Input id="tags" value={tagInput} onChange={(event) => setTagInput(event.target.value)} onKeyDown={addTag} placeholder="Type and press Enter" />
                <div className="flex flex-wrap gap-1.5">
                  {tags.map((tag) => (
                    <Badge key={tag} variant="secondary">{tag}<X className="ml-1 h-3 w-3 cursor-pointer" onClick={() => setTags(tags.filter((item) => item !== tag))} /></Badge>
                  ))}
                </div>
              </div>
            </div>
          </section>

          <section className="rounded-3xl border bg-card p-5 shadow-sm">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">03 / Visual anchors</p>
            <label className="mt-4 flex cursor-pointer flex-col items-center rounded-2xl border border-dashed border-primary/30 bg-primary/[0.035] px-4 py-7 text-center transition-colors hover:bg-primary/[0.07]">
              <ImagePlus className="mb-2 h-7 w-7 text-primary" />
              <span className="font-semibold">Add clinical images</span>
              <span className="mt-1 text-xs text-muted-foreground">PNG, JPEG, WebP up to 3 MB</span>
              <input type="file" accept="image/*" multiple className="hidden" onChange={handleImages} />
            </label>
            {images.length > 0 && <p className="mt-3 text-center text-xs font-medium text-emerald-700">{images.length} image{images.length === 1 ? "" : "s"} ready</p>}
          </section>

          <Button size="lg" className="h-14 rounded-2xl text-base" onClick={generate} disabled={generateMutation.isPending || !rawText.trim() || !topic.trim()}>
            {generateMutation.isPending ? <><Loader2 className="mr-2 h-5 w-5 animate-spin" /> Organizing source blocks...</> : <><Sparkles className="mr-2 h-5 w-5" /> Build memory card</>}
          </Button>
          <p className="text-center text-xs leading-relaxed text-muted-foreground">One low-cost AI call. Images stay out of the AI request.</p>
        </aside>
      </div>
    </div>
  );
}
