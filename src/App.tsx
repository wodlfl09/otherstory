import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import ProtectedRoute from "@/components/ProtectedRoute";
import Auth from "@/pages/Auth";
import Home from "@/pages/Home";
import CreateStory from "@/pages/CreateStory";
import GamePlay from "@/pages/GamePlay";
import Library from "@/pages/Library";
import Pricing from "@/pages/Pricing";
import AdultVerify from "@/pages/AdultVerify";
import Explore from "@/pages/Explore";
import StoryReader from "@/pages/StoryReader";
import NovelReader from "@/pages/NovelReader";
import Admin from "@/pages/Admin";
import Ad from "@/pages/Ad";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <AuthProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Navigate to="/home" replace />} />
            <Route path="/auth" element={<Auth />} />
            <Route path="/home" element={<ProtectedRoute><Home /></ProtectedRoute>} />
            <Route path="/create" element={<ProtectedRoute><CreateStory /></ProtectedRoute>} />
            <Route path="/game/:sessionId" element={<ProtectedRoute><GamePlay /></ProtectedRoute>} />
            <Route path="/library" element={<ProtectedRoute><Library /></ProtectedRoute>} />
            <Route path="/pricing" element={<ProtectedRoute><Pricing /></ProtectedRoute>} />
            <Route path="/explore" element={<ProtectedRoute><Explore /></ProtectedRoute>} />
            <Route path="/story/:storyId" element={<ProtectedRoute><StoryReader /></ProtectedRoute>} />
            <Route path="/novel/:novelId" element={<ProtectedRoute><NovelReader /></ProtectedRoute>} />
            <Route path="/admin" element={<ProtectedRoute><Admin /></ProtectedRoute>} />
            <Route path="/ad" element={<ProtectedRoute><Ad /></ProtectedRoute>} />
            <Route path="/adult-verify" element={<ProtectedRoute><AdultVerify /></ProtectedRoute>} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
