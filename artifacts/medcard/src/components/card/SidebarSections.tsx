import { SidebarSections as SidebarSectionsType } from "@workspace/api-client-react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { FileText, AlertTriangle, Activity, Pill, HeartPulse, Plus, X, GripVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

interface SidebarSectionsProps {
  sections: SidebarSectionsType;
  isEditing: boolean;
  onChange?: (sections: SidebarSectionsType) => void;
}

const SECTION_CONFIG = [
  { key: "high_yield" as const, title: "High-Yield Notes", icon: FileText, color: "text-amber-500" },
  { key: "risk_factors" as const, title: "Risk Factors & Associations", icon: AlertTriangle, color: "text-destructive" },
  { key: "diagnosis" as const, title: "Diagnosis & Workup", icon: Activity, color: "text-blue-500" },
  { key: "treatment" as const, title: "Treatment & Management", icon: Pill, color: "text-emerald-500" },
  { key: "complications" as const, title: "Complications & Prognosis", icon: HeartPulse, color: "text-purple-500" },
];

export function SidebarSections({ sections, isEditing, onChange }: SidebarSectionsProps) {
  const handleItemChange = (sectionKey: keyof SidebarSectionsType, index: number, value: string) => {
    if (!onChange) return;
    const newItems = [...(sections[sectionKey] || [])];
    newItems[index] = value;
    onChange({ ...sections, [sectionKey]: newItems });
  };

  const addItem = (sectionKey: keyof SidebarSectionsType) => {
    if (!onChange) return;
    const newItems = [...(sections[sectionKey] || []), ""];
    onChange({ ...sections, [sectionKey]: newItems });
  };

  const removeItem = (sectionKey: keyof SidebarSectionsType, index: number) => {
    if (!onChange) return;
    const newItems = [...(sections[sectionKey] || [])];
    newItems.splice(index, 1);
    onChange({ ...sections, [sectionKey]: newItems });
  };

  // If not editing and no data, maybe show empty state or hide empty sections
  const isEmpty = (sectionKey: keyof SidebarSectionsType) => {
    return !sections[sectionKey] || sections[sectionKey].length === 0;
  };

  return (
    <div className="w-full flex flex-col gap-4">
      <Accordion type="multiple" defaultValue={SECTION_CONFIG.map(c => c.key)} className="w-full space-y-4">
        {SECTION_CONFIG.map(({ key, title, icon: Icon, color }) => {
          if (!isEditing && isEmpty(key)) return null;

          return (
            <AccordionItem value={key} key={key} className="border bg-card rounded-xl shadow-sm px-4">
              <AccordionTrigger className="hover:no-underline py-4">
                <div className="flex items-center gap-2 text-card-foreground">
                  <div className={`p-1.5 rounded-md bg-muted/50 ${color}`}>
                    <Icon className="w-4 h-4" />
                  </div>
                  <span className="font-semibold">{title}</span>
                </div>
              </AccordionTrigger>
              <AccordionContent className="pb-4">
                <ul className="space-y-3 pl-2">
                  {(sections[key] || []).map((item, index) => (
                    <li key={index} className="relative group">
                      {isEditing ? (
                        <div className="flex items-start gap-2">
                          <span className="text-primary font-bold mt-2">•</span>
                          <Textarea 
                            value={item}
                            onChange={(e) => handleItemChange(key, index, e.target.value)}
                            className="min-h-[60px] resize-y bg-background border-border/50 text-sm leading-relaxed"
                            placeholder="Enter detail..."
                          />
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="mt-1 h-8 w-8 text-destructive hover:bg-destructive/10 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
                            onClick={() => removeItem(key, index)}
                          >
                            <X className="w-4 h-4" />
                          </Button>
                        </div>
                      ) : (
                        <div className="flex items-start gap-3 text-sm leading-relaxed text-card-foreground">
                          <span className="text-primary font-bold mt-0.5">•</span>
                          <span>{item}</span>
                        </div>
                      )}
                    </li>
                  ))}
                  
                  {isEditing && (
                    <li className="pt-2">
                      <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={() => addItem(key)}
                        className="w-full border-dashed text-muted-foreground hover:text-foreground"
                      >
                        <Plus className="w-4 h-4 mr-2" />
                        Add Item
                      </Button>
                    </li>
                  )}
                  
                  {!isEditing && isEmpty(key) && (
                    <li className="text-sm text-muted-foreground italic pl-5">
                      No items.
                    </li>
                  )}
                </ul>
              </AccordionContent>
            </AccordionItem>
          );
        })}
      </Accordion>
    </div>
  );
}
