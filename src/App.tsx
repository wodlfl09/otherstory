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
import GenerationWait from "@/pages/GenerationWait";
import Library from "@/pages/Library";
import Pricing from "@/pages/Pricing";
import AdultVerify from "@/pages/AdultVerify";
import Explore from "@/pages/Explore";
import StoryReader from "@/pages/StoryReader";
import NovelReader from "@/pages/NovelReader";
import Ad from "@/pages/Ad";
import NotFound from "./pages/NotFound";
import AdminLayout from "@/pages/admin/AdminLayout";
import AdminUsers from "@/pages/admin/AdminUsers";
import AdminCredits from "@/pages/admin/AdminCredits";
import AdminRoles from "@/pages/admin/AdminRoles";
import AdminBootstrap from "@/pages/admin/AdminBootstrap";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <AuthProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Navigate to="/auth" replace />} />
            <Route path="/auth" element={<Auth />} />
            <Route path="/home" element={<ProtectedRoute><Home /></ProtectedRoute>} />
            <Route path="/create" element={<ProtectedRoute><CreateStory /></ProtectedRoute>} />
            <Route path="/game/:sessionId" element={<ProtectedRoute><GamePlay /></ProtectedRoute>} />
            <Route path="/generating/:jobId" element={<ProtectedRoute><GenerationWait /></ProtectedRoute>} />
            <Route path="/library" element={<ProtectedRoute><Library /></ProtectedRoute>} />
            <Route path="/pricing" element={<ProtectedRoute><Pricing /></ProtectedRoute>} />
            <Route path="/explore" element={<ProtectedRoute><Explore /></ProtectedRoute>} />
            <Route path="/story/:storyId" element={<ProtectedRoute><StoryReader /></ProtectedRoute>} />
            <Route path="/novel/:novelId" element={<ProtectedRoute><NovelReader /></ProtectedRoute>} />
            <Route path="/ad" element={<ProtectedRoute><Ad /></ProtectedRoute>} />
            <Route path="/adult-verify" element={<ProtectedRoute><AdultVerify /></ProtectedRoute>} />
            <Route path="/admin/bootstrap" element={<ProtectedRoute><AdminBootstrap /></ProtectedRoute>} />
            <Route path="/admin" element={<ProtectedRoute><AdminLayout /></ProtectedRoute>}>
              <Route index element={<Navigate to="/admin/users" replace />} />
              <Route path="users" element={<AdminUsers />} />
              <Route path="credits" element={<AdminCredits />} />
              <Route path="roles" element={<AdminRoles />} />
            </Route>
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
