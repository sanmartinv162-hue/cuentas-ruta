import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { AppLayout } from '../components/layout/AppLayout';
import { LoadingSpinner } from '../components/ui/LoadingSpinner';

const HomePage = lazy(() => import('../pages/Home'));
const PersonalPage = lazy(() => import('../pages/Personal'));
const BusinessPage = lazy(() => import('../pages/Business'));
const JourneyPage = lazy(() => import('../pages/Business/JourneyPage'));
const BusinessSavingsPage = lazy(() => import('../pages/Savings'));
const ReportsPage = lazy(() => import('../pages/Reports'));
const SettingsPage = lazy(() => import('../pages/Settings'));
const NotFoundPage = lazy(() => import('../pages/NotFound'));

function PageLoader({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<LoadingSpinner label="Cargando página" />}>{children}</Suspense>;
}

export function AppRoutes() {
  return <Routes><Route element={<AppLayout />}><Route index element={<PageLoader><HomePage /></PageLoader>} /><Route path="personal" element={<PageLoader><PersonalPage /></PageLoader>} /><Route path="business" element={<PageLoader><BusinessPage /></PageLoader>} /><Route path="business/journey" element={<PageLoader><JourneyPage /></PageLoader>} /><Route path="business/savings" element={<PageLoader><BusinessSavingsPage /></PageLoader>} /><Route path="reports" element={<PageLoader><ReportsPage /></PageLoader>} /><Route path="settings" element={<PageLoader><SettingsPage /></PageLoader>} /><Route path="*" element={<PageLoader><NotFoundPage /></PageLoader>} /></Route><Route path="/inicio" element={<Navigate to="/" replace />} /></Routes>;
}