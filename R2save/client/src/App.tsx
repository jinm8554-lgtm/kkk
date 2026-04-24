import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { R2Provider } from "./contexts/R2Context";
import Dashboard from "./pages/Dashboard";
import Buckets from "./pages/Buckets";
import FileBrowser from "./pages/FileBrowser";
import Settings from "./pages/Settings";
import AppLayout from "./components/AppLayout";

function Router() {
  return (
    <AppLayout>
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/buckets" component={Buckets} />
        <Route path="/files" component={FileBrowser} />
        <Route path="/settings" component={Settings} />
        <Route path="/404" component={NotFound} />
        <Route component={NotFound} />
      </Switch>
    </AppLayout>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="dark">
        <R2Provider>
          <TooltipProvider>
            <Toaster />
            <Router />
          </TooltipProvider>
        </R2Provider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
