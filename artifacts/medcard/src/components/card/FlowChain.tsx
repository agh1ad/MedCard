import { Card, FlowStep, SidebarSections } from "@workspace/api-client-react";
import { ArrowDown, Edit2, Check, X, FileText, Activity, AlertTriangle, Pill, HeartPulse } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

interface FlowChainProps {
  steps: FlowStep[];
  isEditing: boolean;
  onChange?: (steps: FlowStep[]) => void;
}

export function FlowChain({ steps, isEditing, onChange }: FlowChainProps) {
  const handleChange = (index: number, field: keyof FlowStep, value: string | number) => {
    if (!onChange) return;
    const newSteps = [...steps];
    newSteps[index] = { ...newSteps[index], [field]: value };
    onChange(newSteps);
  };

  const addStep = (index: number) => {
    if (!onChange) return;
    const newSteps = [...steps];
    newSteps.splice(index + 1, 0, { label: "", sublabel: "", indent: steps[index]?.indent || 0 });
    onChange(newSteps);
  };

  const removeStep = (index: number) => {
    if (!onChange) return;
    const newSteps = [...steps];
    newSteps.splice(index, 1);
    onChange(newSteps);
  };

  if (!steps?.length) {
    return <div className="text-center p-8 text-muted-foreground bg-muted/30 rounded-lg border border-dashed border-border/50">No flow steps defined.</div>;
  }

  return (
    <div className="flex flex-col items-center py-4 relative">
      {steps.map((step, i) => (
        <div key={i} className="flex flex-col items-center w-full max-w-md relative group">
          <div 
            className="w-full relative transition-all duration-300"
            style={{ 
              transform: `translateX(${(step.indent || 0) * 24}px)`,
              width: `calc(100% - ${(step.indent || 0) * 24}px)`
            }}
          >
            <div className="bg-card border border-border shadow-sm rounded-xl p-4 flex flex-col gap-2 relative group hover:border-primary/50 transition-colors">
              {isEditing ? (
                <div className="flex flex-col gap-2 relative">
                  <div className="flex items-center gap-2">
                    <Input 
                      value={step.label || ""} 
                      onChange={(e) => handleChange(i, "label", e.target.value)}
                      placeholder="Step label"
                      className="font-medium bg-background border-border/50 h-8"
                    />
                    <div className="flex -space-x-px">
                      <Button variant="outline" size="icon" className="h-8 w-8 rounded-r-none" onClick={() => handleChange(i, "indent", Math.max(0, (step.indent || 0) - 1))}>
                        -
                      </Button>
                      <Button variant="outline" size="icon" className="h-8 w-8 rounded-l-none" onClick={() => handleChange(i, "indent", (step.indent || 0) + 1)}>
                        +
                      </Button>
                    </div>
                  </div>
                  <Input 
                    value={step.sublabel || ""} 
                    onChange={(e) => handleChange(i, "sublabel", e.target.value)}
                    placeholder="Sublabel (optional)"
                    className="text-sm bg-background border-border/50 text-muted-foreground h-8"
                  />
                  <div className="absolute -right-12 top-0 flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive hover:bg-destructive/10" onClick={() => removeStep(i)}>
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="font-semibold text-card-foreground text-center">{step.label}</div>
                  {step.sublabel && (
                    <div className="text-sm text-muted-foreground text-center mt-1">{step.sublabel}</div>
                  )}
                </>
              )}
            </div>
          </div>
          
          {i < steps.length - 1 && (
            <div className="flex flex-col items-center justify-center h-8 relative w-full">
              <div className="w-px h-full bg-border absolute left-1/2 -translate-x-1/2"></div>
              <ArrowDown className="w-4 h-4 text-muted-foreground relative z-10 bg-background rounded-full" />
              
              {isEditing && (
                <Button 
                  variant="outline" 
                  size="icon" 
                  className="h-6 w-6 rounded-full absolute left-1/2 -translate-x-1/2 z-20 opacity-0 group-hover:opacity-100 transition-opacity bg-background hover:bg-primary hover:text-primary-foreground hover:border-primary"
                  onClick={() => addStep(i)}
                >
                  <PlusSquare className="h-3 w-3" />
                </Button>
              )}
            </div>
          )}
          
          {isEditing && i === steps.length - 1 && (
             <div className="mt-4 opacity-0 group-hover:opacity-100 transition-opacity">
               <Button variant="outline" size="sm" onClick={() => addStep(i)} className="gap-1">
                 <PlusSquare className="h-4 w-4" /> Add Step
               </Button>
             </div>
          )}
        </div>
      ))}
    </div>
  );
}

// Just adding the missing icon that FlowChain was using
import { PlusSquare } from "lucide-react";
