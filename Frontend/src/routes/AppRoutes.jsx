import { Routes, Route, Navigate } from 'react-router-dom';
import MainLayout from '../layouts/MainLayout.jsx';
import ProtectedRoute from '../components/ProtectedRoute.jsx';
import Login from '../pages/Login.jsx';
import ForgotPassword from '../pages/ForgotPassword.jsx';
import ResetPassword from '../pages/ResetPassword.jsx';
import Dashboard from '../pages/Dashboard.jsx';
import Meters from '../pages/Meters.jsx';
import MeterDetail from '../pages/MeterDetail.jsx';
import Network from '../pages/Network.jsx';
import Anomalies from '../pages/Anomalies.jsx';
import Reliability from '../pages/Reliability.jsx';
import LossAnalysis from '../pages/LossAnalysis.jsx';
import AdminUsers from '../pages/AdminUsers.jsx';

export default function AppRoutes() {
  return (
    <Routes>
      {/* Public — accounts are admin-provisioned, so no signup route exists. */}
      <Route path="/login" element={<Login />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />

      {/* Old signup URL → bounce to login */}
      <Route path="/signup" element={<Navigate to="/login" replace />} />

      {/* Authenticated app shell */}
      <Route
        element={
          <ProtectedRoute>
            <MainLayout />
          </ProtectedRoute>
        }
      >
        <Route path="/" element={<Dashboard />} />
        <Route path="/meters" element={<Meters />} />
        <Route path="/meters/:id" element={<MeterDetail />} />

        {/* Admin-only operational pages */}
        <Route path="/network" element={<ProtectedRoute adminOnly><Network /></ProtectedRoute>} />
        <Route path="/anomalies" element={<ProtectedRoute adminOnly><Anomalies /></ProtectedRoute>} />
        <Route path="/reliability" element={<ProtectedRoute adminOnly><Reliability /></ProtectedRoute>} />
        <Route path="/losses" element={<ProtectedRoute adminOnly><LossAnalysis /></ProtectedRoute>} />
        <Route path="/admin/users" element={<ProtectedRoute adminOnly><AdminUsers /></ProtectedRoute>} />

        <Route path="*" element={<Navigate to="/" />} />
      </Route>
    </Routes>
  );
}
