import { useListCards, useGetCardStats, useListTags } from "@workspace/api-client-react";
import { Link } from "wouter";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, Hash, Plus, ChevronRight, BarChart2 } from "lucide-react";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

export function Library() {
  const [search, setSearch] = useState("");
  const [selectedTag, setSelectedTag] = useState<string>("");

  const { data: stats, isLoading: statsLoading } = useGetCardStats();
  const { data: cards, isLoading: cardsLoading } = useListCards({ search: search || undefined, tag: selectedTag || undefined });
  const { data: tags, isLoading: tagsLoading } = useListTags();

  return (
    <div className="container mx-auto px-4 py-8 max-w-6xl flex flex-col gap-8">
      {/* Header & Stats */}
      <div className="flex flex-col md:flex-row gap-6 items-start md:items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground tracking-tight">My Library</h1>
          <p className="text-muted-foreground mt-1">Your structured medical knowledge base.</p>
        </div>
        
        <div className="flex gap-4">
          <div className="bg-card border shadow-sm rounded-xl p-4 flex gap-8 items-center">
            <div className="flex flex-col">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Total Cards</span>
              {statsLoading ? <Skeleton className="h-8 w-12 mt-1" /> : <span className="text-2xl font-bold text-primary">{stats?.totalCards || 0}</span>}
            </div>
            <div className="w-px h-8 bg-border"></div>
            <div className="flex flex-col">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Recent (7d)</span>
              {statsLoading ? <Skeleton className="h-8 w-12 mt-1" /> : <span className="text-2xl font-bold text-foreground">{stats?.recentCount || 0}</span>}
            </div>
          </div>
          
          <Link href="/generate">
            <Button className="h-full px-6 shadow-sm">
              <Plus className="w-5 h-5 mr-2" />
              New Card
            </Button>
          </Link>
        </div>
      </div>

      {/* Filters & Search */}
      <div className="flex flex-col md:flex-row gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input 
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search topics, keywords..."
            className="pl-9 h-11 bg-card border-border/60 shadow-sm"
          />
        </div>
        
        <div className="flex-1 flex flex-wrap gap-2 items-center">
          <Button 
            variant={selectedTag === "" ? "default" : "outline"}
            size="sm"
            onClick={() => setSelectedTag("")}
            className="h-9 rounded-full"
          >
            All Topics
          </Button>
          {tagsLoading ? (
             <div className="flex gap-2">
               <Skeleton className="h-9 w-20 rounded-full" />
               <Skeleton className="h-9 w-24 rounded-full" />
             </div>
          ) : tags?.map(tag => (
            <Button
              key={tag}
              variant={selectedTag === tag ? "default" : "outline"}
              size="sm"
              onClick={() => setSelectedTag(tag)}
              className="h-9 rounded-full"
            >
              <Hash className="w-3 h-3 mr-1 opacity-50" />
              {tag}
            </Button>
          ))}
        </div>
      </div>

      {/* Cards Grid */}
      <div className="mt-4">
        {cardsLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3, 4, 5, 6].map(i => (
              <div key={i} className="bg-card border rounded-2xl p-5 h-40">
                <Skeleton className="h-6 w-3/4 mb-4" />
                <Skeleton className="h-4 w-1/2 mb-2" />
                <Skeleton className="h-4 w-1/4" />
              </div>
            ))}
          </div>
        ) : !cards?.length ? (
          <div className="flex flex-col items-center justify-center py-20 text-center bg-card/50 border border-dashed rounded-2xl">
            <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mb-4">
              <Search className="w-8 h-8 text-muted-foreground" />
            </div>
            <h3 className="text-xl font-bold text-foreground">No cards found</h3>
            <p className="text-muted-foreground mt-2 max-w-md">
              {search || selectedTag 
                ? "Try adjusting your search or filters to find what you're looking for."
                : "Your library is empty. Start by generating your first medical study card."}
            </p>
            {!(search || selectedTag) && (
              <Link href="/generate">
                <Button className="mt-6">Generate First Card</Button>
              </Link>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {cards.map((card, idx) => (
              <Link key={card.id} href={`/cards/${card.id}`}>
                <div 
                  className="group bg-card border rounded-2xl p-5 shadow-sm hover:shadow-md hover:border-primary/40 transition-all cursor-pointer flex flex-col h-full animate-in fade-in slide-in-from-bottom-4"
                  style={{ animationDelay: `${idx * 50}ms`, animationFillMode: 'both' }}
                >
                  <div className="flex justify-between items-start mb-3">
                    <h3 className="font-bold text-lg text-card-foreground leading-tight line-clamp-2 group-hover:text-primary transition-colors">
                      {card.topic}
                    </h3>
                    <ChevronRight className="w-5 h-5 text-muted-foreground opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all" />
                  </div>
                  
                  <div className="flex flex-wrap gap-1.5 mb-4 mt-auto">
                    {card.tags?.slice(0, 3).map(tag => (
                      <Badge key={tag} variant="secondary" className="bg-muted text-muted-foreground font-medium hover:bg-muted/80">
                        {tag}
                      </Badge>
                    ))}
                    {(card.tags?.length || 0) > 3 && (
                      <Badge variant="secondary" className="bg-muted text-muted-foreground">
                        +{(card.tags?.length || 0) - 3}
                      </Badge>
                    )}
                  </div>
                  
                  <div className="flex items-center justify-between text-xs text-muted-foreground pt-4 border-t border-border/50">
                    <div className="flex items-center gap-1.5">
                      <BarChart2 className="w-3.5 h-3.5" />
                      <span>{card.flow?.length || 0} steps</span>
                    </div>
                    <span>{format(new Date(card.updatedAt), "MMM d, yyyy")}</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
