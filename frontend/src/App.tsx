import { Routes, Route, Navigate } from 'react-router-dom';
import { Layout } from './components/Layout';
import { DashboardPage } from './pages/DashboardPage';
import { CustomersPage } from './pages/CustomersPage';
import { InventoryPage } from './pages/InventoryPage';
import { MessagesPage } from './pages/MessagesPage';
import { SchedulingPage } from './pages/SchedulingPage';
import { ScriptsPage } from './pages/ScriptsPage';
import { FinancialPage } from './pages/FinancialPage';
import { ProfilePage } from './pages/ProfilePage';
import { TeamPage } from './pages/TeamPage';
import { AssinaturaPage } from './pages/AssinaturaPage';
import { LoginPage } from './pages/LoginPage';
import { DemoPage } from './pages/DemoPage';
import { DemoJFPage } from './pages/DemoJFPage';
import { EloyDemo } from './pages/demo/EloyDemo';
import { ConfirmacaoDemo } from './pages/demo/ConfirmacaoDemo';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const token = sessionStorage.getItem('accessToken');
  if (!token) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function PublicRoute({ children }: { children: React.ReactNode }) {
  const token = sessionStorage.getItem('accessToken');
  if (token) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/demo" element={<DemoPage />} />
      <Route path="/demo-jf" element={<DemoJFPage />} />
      <Route path="/demo/eloy" element={<EloyDemo />} />
      <Route path="/demo/confirmacao" element={<ConfirmacaoDemo />} />
      <Route path="/login" element={<PublicRoute><LoginPage /></PublicRoute>} />
      <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={<DashboardPage />} />
        <Route path="clientes" element={<CustomersPage />} />
        <Route path="estoque" element={<InventoryPage />} />
        <Route path="mensagens" element={<MessagesPage />} />
        <Route path="agendamentos" element={<SchedulingPage />} />
        <Route path="scripts" element={<ScriptsPage />} />
        <Route path="financeiro" element={<FinancialPage />} />
        <Route path="equipe" element={<TeamPage />} />
        <Route path="assinatura" element={<AssinaturaPage />} />
        <Route path="perfil" element={<ProfilePage />} />
      </Route>
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}
