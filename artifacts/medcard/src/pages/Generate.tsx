import { useState } from "react";
import { useLocation } from "wouter";
import {
  useGenerateCard,
  useCreateCard,
  type GeneratedCard,
  type FlowNode,
  type SidebarSections,
} from "@workspace/api-client-react";
import { FlowTree } from "@/components/card/FlowTree";
import { SidebarSections as SidebarSectionsComponent } from "@/components/card/SidebarSections";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import {
  Wand2,
  Save,
  X,
  RotateCcw,
  Sparkles,
  Loader2,
  Tags,
} from "lucide-react";
import { Label } from "@/components/ui/label";

export function Generate() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const [rawText, setRawText] = useState("");
  const [topic, setTopic] = useState("");
  const [tagInput, setTagInput] = useState("");
  const [tags, setTags] = useState<string[]>([]);

  const [preview, setPreview] = useState<GeneratedCard | null>(null);

  const generateMut = useGenerateCard();
  const createMut = useCreateCard();

  const handleAddTag = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && tagInput.trim()) {
      e.preventDefault();
      if (!tags.includes(tagInput.trim())) {
        setTags([...tags, tagInput.trim()]);
      }
      setTagInput("");
    }
  };

  const removeTag = (tagToRemove: string) => {
    setTags(tags.filter((t) => t !== tagToRemove));
  };

  const handleGenerate = () => {
    if (!rawText.trim()) {
      toast({
        title: "Input required",
        description: "Please paste some medical text to generate a card.",
        variant: "destructive",
      });
      return;
    }

    generateMut.mutate(
      { data: { rawText, topic: topic || undefined } },
      {
        onSuccess: (data) => {
          setPreview(data);
          toast({
            title: "Card Generated",
            description: "Review and edit before saving.",
          });
          window.scrollTo({ top: 0, behavior: "smooth" });
        },
        onError: () => {
          toast({
            title: "Generation failed",
            description: "There was an error generating the card.",
            variant: "destructive",
          });
        },
      },
    );
  };

  const handleSave = () => {
    if (!preview) return;
    if (!topic.trim()) {
      toast({
        title: "Topic required",
        description: "Please enter a topic name before saving.",
        variant: "destructive",
      });
      return;
    }

    createMut.mutate(
      {
        data: {
          topic,
          tags,
          rawText,
          flow: preview.flow,
          sidebar: preview.sidebar,
        },
      },
      {
        onSuccess: (card) => {
          toast({
            title: "Saved successfully",
            description: "Your card has been added to the library.",
          });
          setLocation(`/cards/${card.id}`);
        },
        onError: () => {
          toast({
            title: "Save failed",
            description: "Could not save the card.",
            variant: "destructive",
          });
        },
      },
    );
  };

  return (
    <div className="container mx-auto px-4 py-8 max-w-7xl">
      <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            Generate Study Card
          </h1>
          <p className="text-muted-foreground mt-1">
            Transform raw notes into a branching pathophysiology tree.
          </p>
        </div>
        {preview && (
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              onClick={() => setPreview(null)}
              disabled={createMut.isPending}
              data-testid="button-reset"
            >
              <RotateCcw className="w-4 h-4 mr-2" />
              Reset
            </Button>
            <Button
              onClick={handleSave}
              disabled={createMut.isPending}
              data-testid="button-save"
            >
              {createMut.isPending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Save className="w-4 h-4 mr-2" />
              )}
              Save to Library
            </Button>
          </div>
        )}
      </div>

      {!preview ? (
        /* ── Input form ── */
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 flex flex-col gap-6">
            <div className="bg-card border shadow-sm rounded-2xl p-6 flex flex-col gap-4">
              <div className="flex items-center gap-2 text-primary font-medium mb-2">
                <Sparkles className="w-5 h-5" />
                <h3>Raw Information</h3>
              </div>

              <Textarea
                value={rawText}
                onChange={(e) => setRawText(e.target.value)}
                placeholder="Paste from UWorld, First Aid, lecture slides, or Up-To-Date…"
                className="min-h-[400px] resize-y bg-background font-mono text-sm leading-relaxed p-4"
                data-testid="textarea-raw-text"
              />

              <div className="flex justify-end">
                <Button
                  onClick={handleGenerate}
                  disabled={generateMut.isPending || !rawText.trim()}
                  className="h-12 px-8 text-lg rounded-xl w-full md:w-auto"
                  size="lg"
                  data-testid="button-generate"
                >
                  {generateMut.isPending ? (
                    <>
                      <Loader2 className="w-5 h-5 mr-2 animate-spin" />{" "}
                      Analyzing…
                    </>
                  ) : (
                    <>
                      <Wand2 className="w-5 h-5 mr-2" /> Generate Structured
                      Card
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-6">
            <div className="bg-card border shadow-sm rounded-2xl p-6 flex flex-col gap-5">
              <h3 className="font-semibold text-lg border-b pb-3">
                Metadata (Optional)
              </h3>

              <div className="space-y-3">
                <Label htmlFor="topic">Topic / Disease</Label>
                <Input
                  id="topic"
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  placeholder="e.g. Heart Failure, Asthma…"
                  className="bg-background"
                  data-testid="input-topic"
                />
                <p className="text-xs text-muted-foreground">
                  If left blank, AI will attempt to infer the topic.
                </p>
              </div>

              <div className="space-y-3 pt-2">
                <Label htmlFor="tags">Tags</Label>
                <div className="relative">
                  <Tags className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    id="tags"
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    onKeyDown={handleAddTag}
                    placeholder="Press enter to add…"
                    className="pl-9 bg-background"
                    data-testid="input-tags"
                  />
                </div>
                {tags.length > 0 && (
                  <div className="flex flex-wrap gap-2 pt-2">
                    {tags.map((tag) => (
                      <Badge
                        key={tag}
                        variant="secondary"
                        className="gap-1 pl-2 pr-1 py-1"
                      >
                        {tag}
                        <div
                          className="bg-muted-foreground/20 rounded-full p-0.5 hover:bg-destructive hover:text-destructive-foreground cursor-pointer transition-colors"
                          onClick={() => removeTag(tag)}
                        >
                          <X className="w-3 h-3" />
                        </div>
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="bg-primary/5 border border-primary/20 rounded-2xl p-6 text-sm text-primary/80">
              <h4 className="font-semibold text-primary mb-2 flex items-center gap-2">
                <Wand2 className="w-4 h-4" /> How it works
              </h4>
              <p className="mb-2">
                MedCard's AI arranges your notes into a branching
                pathophysiology tree — one node per step, with parallel
                outcomes shown side-by-side just like your handwritten notes.
              </p>
              <p>Review and edit the result before saving.</p>
            </div>
          </div>
        </div>
      ) : (
        /* ── Preview + edit ── */
        <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-8 duration-500">
          {/* Topic + tags row */}
          <div className="bg-card border shadow-sm rounded-2xl p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
              <div className="space-y-3">
                <Label>Topic</Label>
                <Input
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  placeholder="Required topic name…"
                  className="font-bold text-lg h-12"
                  data-testid="input-topic-preview"
                />
              </div>
              <div className="space-y-3">
                <Label>Tags</Label>
                <div className="flex flex-wrap items-center gap-2 min-h-[48px] bg-background border rounded-md px-3 py-2">
                  {tags.map((tag) => (
                    <Badge key={tag} variant="secondary" className="gap-1">
                      {tag}
                      <X
                        className="w-3 h-3 cursor-pointer hover:text-destructive"
                        onClick={() => removeTag(tag)}
                      />
                    </Badge>
                  ))}
                  <Input
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    onKeyDown={handleAddTag}
                    placeholder="Add tag…"
                    className="border-0 h-6 w-32 focus-visible:ring-0 px-1 py-0 shadow-none bg-transparent"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Two-column card preview */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-4 flex flex-col gap-4">
              <h3 className="font-semibold text-lg text-muted-foreground px-1">
                Clinical Details
              </h3>
              <SidebarSectionsComponent
                sections={preview.sidebar}
                isEditing={true}
                onChange={(s: SidebarSections) =>
                  setPreview({ ...preview, sidebar: s })
                }
              />
            </div>

            <div className="lg:col-span-8 flex flex-col gap-4">
              <h3 className="font-semibold text-lg text-muted-foreground px-1">
                Pathophysiology Tree
              </h3>
              <div className="bg-card border shadow-sm rounded-xl min-h-[500px] overflow-x-auto">
                <FlowTree
                  nodes={preview.flow}
                  isEditing={true}
                  onChange={(f: FlowNode[]) =>
                    setPreview({ ...preview, flow: f })
                  }
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
