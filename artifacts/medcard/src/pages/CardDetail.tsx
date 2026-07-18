import {
  useGetCard,
  useUpdateCard,
  useDeleteCard,
  type FlowNode,
  type SidebarSections,
} from "@workspace/api-client-react";
import { useRoute, useLocation } from "wouter";
import { useState, useRef, useEffect } from "react";
import { SidebarSections as SidebarSectionsComponent } from "@/components/card/SidebarSections";
import { FlowTree, flattenFlowToText } from "@/components/card/FlowTree";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  Edit2,
  Save,
  X,
  Printer,
  Copy,
  Trash2,
  ChevronLeft,
  AlertCircle,
  Loader2,
  Tags,
} from "lucide-react";
import { Link } from "wouter";
import { format } from "date-fns";
import { getGetCardQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";

export function CardDetail() {
  const [, params] = useRoute("/cards/:id");
  const id = Number(params?.id);
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: card, isLoading, isError } = useGetCard(id, {
    query: { enabled: !!id, queryKey: getGetCardQueryKey(id) },
  });

  const updateMut = useUpdateCard();
  const deleteMut = useDeleteCard();

  const [isEditing, setIsEditing] = useState(false);
  const [topic, setTopic] = useState("");
  const [flow, setFlow] = useState<FlowNode[]>([]);
  const [sidebar, setSidebar] = useState<SidebarSections>({
    high_yield: [],
    risk_factors: [],
    diagnosis: [],
    treatment: [],
    complications: [],
  });
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");

  const initializedForId = useRef<number | null>(null);

  useEffect(() => {
    if (card && initializedForId.current !== id) {
      initializedForId.current = id;
      setTopic(card.topic);
      setFlow(card.flow ?? []);
      setSidebar(card.sidebar);
      setTags(card.tags ?? []);
    }
  }, [card, id]);

  const handleSave = () => {
    if (!topic.trim()) {
      toast({ title: "Topic required", variant: "destructive" });
      return;
    }

    updateMut.mutate(
      { id, data: { topic, flow, sidebar, tags } },
      {
        onSuccess: (updatedData) => {
          queryClient.setQueryData(getGetCardQueryKey(id), updatedData);
          setIsEditing(false);
          toast({ title: "Changes saved" });
        },
        onError: () => {
          toast({ title: "Failed to save", variant: "destructive" });
        },
      },
    );
  };

  const handleCancel = () => {
    if (card) {
      setTopic(card.topic);
      setFlow(card.flow ?? []);
      setSidebar(card.sidebar);
      setTags(card.tags ?? []);
    }
    setIsEditing(false);
  };

  const handleDelete = () => {
    if (
      confirm(
        "Are you sure you want to delete this card? This action cannot be undone.",
      )
    ) {
      deleteMut.mutate(
        { id },
        {
          onSuccess: () => {
            toast({ title: "Card deleted" });
            setLocation("/");
          },
        },
      );
    }
  };

  const handlePrint = () => window.print();

  const handleCopy = async () => {
    if (!card) return;

    let text = `# ${card.topic}\n\n`;
    text += `## Pathophysiology Flow\n`;
    text += flattenFlowToText(card.flow ?? []);
    text += `\n\n## Clinical Details\n`;

    const sectionLabels: Record<keyof SidebarSections, string> = {
      high_yield: "High-Yield Notes",
      risk_factors: "Risk Factors & Associations",
      diagnosis: "Diagnosis & Workup",
      treatment: "Treatment & Management",
      complications: "Complications & Prognosis",
    };

    (Object.keys(sectionLabels) as (keyof SidebarSections)[]).forEach((key) => {
      const items = card.sidebar[key];
      if (items && items.length > 0) {
        text += `\n### ${sectionLabels[key]}\n`;
        items.forEach((item: string) => {
          text += `- ${item}\n`;
        });
      }
    });

    try {
      await navigator.clipboard.writeText(text);
      toast({ title: "Copied to clipboard" });
    } catch {
      toast({ title: "Failed to copy", variant: "destructive" });
    }
  };

  const handleAddTag = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && tagInput.trim()) {
      e.preventDefault();
      if (!tags.includes(tagInput.trim())) {
        setTags([...tags, tagInput.trim()]);
      }
      setTagInput("");
    }
  };

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-12 flex justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (isError || !card) {
    return (
      <div className="container mx-auto px-4 py-12 flex flex-col items-center">
        <AlertCircle className="w-12 h-12 text-destructive mb-4" />
        <h2 className="text-2xl font-bold">Card not found</h2>
        <p className="text-muted-foreground mt-2 mb-6">
          The card you're looking for doesn't exist or has been deleted.
        </p>
        <Link href="/">
          <Button>Back to Library</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-[1400px] flex flex-col">
      {/* Top action bar */}
      <div className="flex flex-wrap items-center justify-between mb-8 gap-4 print:hidden">
        <div className="flex items-center gap-2">
          <Link href="/">
            <Button
              variant="ghost"
              size="icon"
              className="hover:bg-muted"
              data-testid="button-back"
            >
              <ChevronLeft className="w-5 h-5" />
            </Button>
          </Link>
          <div className="text-sm font-medium text-muted-foreground hidden sm:block">
            Last updated: {format(new Date(card.updatedAt), "MMM d, yyyy")}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {!isEditing ? (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={handlePrint}
                data-testid="button-print"
              >
                <Printer className="w-4 h-4 mr-2" /> Print
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleCopy}
                data-testid="button-copy"
              >
                <Copy className="w-4 h-4 mr-2" /> Copy text
              </Button>
              <div className="w-px h-6 bg-border mx-1" />
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsEditing(true)}
                data-testid="button-edit"
              >
                <Edit2 className="w-4 h-4 mr-2" /> Edit
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleCancel}
                disabled={updateMut.isPending}
                data-testid="button-cancel"
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleSave}
                disabled={updateMut.isPending}
                data-testid="button-save"
              >
                {updateMut.isPending ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Save className="w-4 h-4 mr-2" />
                )}
                Save Changes
              </Button>
              <div className="w-px h-6 bg-border mx-1" />
              <Button
                variant="destructive"
                size="sm"
                onClick={handleDelete}
                disabled={deleteMut.isPending}
                data-testid="button-delete"
              >
                <Trash2 className="w-4 h-4 mr-2" /> Delete
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Print area */}
      <div
        id="print-area"
        className="flex flex-col gap-6 print:gap-4 print:m-0 print:p-0"
      >
        {/* Card header */}
        <div className="bg-card border shadow-sm rounded-2xl p-6 print:border-b-2 print:border-black print:rounded-none print:shadow-none print:bg-white">
          {isEditing ? (
            <div className="flex flex-col gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Topic</label>
                <Input
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  className="font-bold text-2xl h-12"
                  data-testid="input-topic"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium flex items-center gap-2">
                  <Tags className="w-4 h-4" /> Tags
                </label>
                <div className="flex flex-wrap items-center gap-2 min-h-[48px] bg-background border rounded-md px-3 py-2">
                  {tags.map((tag) => (
                    <Badge key={tag} variant="secondary" className="gap-1">
                      {tag}
                      <X
                        className="w-3 h-3 cursor-pointer hover:text-destructive"
                        onClick={() => setTags(tags.filter((t) => t !== tag))}
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
          ) : (
            <div>
              <h1
                className="text-4xl font-bold text-foreground print:text-black tracking-tight"
                data-testid="text-card-topic"
              >
                {topic}
              </h1>
              {tags && tags.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-4 print:mt-2">
                  {tags.map((tag) => (
                    <Badge
                      key={tag}
                      variant="secondary"
                      className="print:border print:border-black print:bg-transparent"
                    >
                      {tag}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Two-column body */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 print:block print:w-full">
          {/* Left: sidebar */}
          <div className="lg:col-span-4 xl:col-span-3 flex flex-col gap-4 print:mb-8 print:w-full">
            <h3 className="font-bold text-sm tracking-widest uppercase text-muted-foreground print:text-black mb-2 px-1">
              Clinical Details
            </h3>
            <SidebarSectionsComponent
              sections={sidebar}
              isEditing={isEditing}
              onChange={setSidebar}
            />
          </div>

          {/* Right: branching flow tree */}
          <div className="lg:col-span-8 xl:col-span-9 flex flex-col gap-4 print:w-full">
            <h3 className="font-bold text-sm tracking-widest uppercase text-muted-foreground print:text-black mb-2 px-1">
              Pathophysiology Tree
            </h3>
            <div className="bg-card border shadow-sm rounded-xl min-h-[600px] overflow-x-auto print:border-none print:shadow-none print:p-0 print:min-h-0">
              <FlowTree
                nodes={flow}
                isEditing={isEditing}
                onChange={setFlow}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
