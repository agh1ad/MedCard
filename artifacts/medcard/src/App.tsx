import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import { Route, Switch, Router as WouterRouter } from "wouter";
import { AppLayout } from "@/components/layout/AppLayout";
import { Library } from "@/pages/Home";
import { CardDetail } from "@/pages/CardDetail";
import { ManualBuilder } from "@/pages/ManualBuilder";

const queryClient = new QueryClient();

function Router() {
  return (
    <AppLayout>
      <Switch>
        <Route path="/" component={Library} />
        <Route path="/folders/:id" component={Library} />
        <Route path="/notebooks/:id" component={Library} />
        <Route path="/manual" component={ManualBuilder} />
        <Route path="/cards/:id" component={CardDetail} />
        <Route component={NotFound} />
      </Switch>
    </AppLayout>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
