import { useState } from 'react';
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { BottomNav } from "@/components/BottomNav";
import { CreateGoalSheet } from "@/components/CreateGoalSheet";
import Dashboard from "./pages/Dashboard";
import Pulse from "./pages/Pulse";
import Friends from "./pages/Friends";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => {
  const [createOpen, setCreateOpen] = useState(false);

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <div className="max-w-lg mx-auto relative">
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/pulse" element={<Pulse />} />
              <Route path="/friends" element={<Friends />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
            <BottomNav onCreateGoal={() => setCreateOpen(true)} />
            <CreateGoalSheet open={createOpen} onClose={() => setCreateOpen(false)} />
          </div>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;
