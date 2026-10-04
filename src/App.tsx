import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import Website from "./pages/Website";
import Driver from "./pages/Driver";
import { ThemeProvider } from "next-themes";

const queryClient = new QueryClient();
const driverBuild = import.meta.env.VITE_APP_VARIANT === 'driver';

function AppRoutes() {
  const { pathname } = useLocation();
  const themeKey = driverBuild || pathname === '/driver' ? 'kayan-driver-theme' : 'kayan-theme';
  return <ThemeProvider key={themeKey} attribute="class" defaultTheme="system" enableSystem storageKey={themeKey}>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <Routes>
          <Route path="/" element={driverBuild ? <Driver /> : <Index />} />
          <Route path="/driver" element={<Driver />} />
          {!driverBuild && <Route path="/website" element={<Website />} />}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </TooltipProvider>
    </QueryClientProvider>
  </ThemeProvider>;
}

const App = () => <BrowserRouter><AppRoutes /></BrowserRouter>;
export default App;
