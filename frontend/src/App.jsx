import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import LoginPage from "./pages/login/index.jsx";
import Dashboard from "./components/dashboard/dashboard.jsx";
import AccessManagement from "./pages/access/index.jsx";
import AutoLogoutsPage from "./pages/autologouts/index.jsx";
import Roles from "./pages/roles/index.jsx";
import Users from "./pages/users/index.jsx";
import Restuarent from "./pages/restuarent/index.jsx";
import RequirePerm from "./components/RequirePerm.jsx";
// import Category from "./pages/category/index.jsx";
// import Product from "./pages/product/index.jsx";
// import CustomerInfo from "./pages/customerinfo/index.jsx";
// import Orders from "./pages/orders/index.jsx";
import Settings from "./pages/settings/index.jsx";
// import CustomerDetails from "./pages/customerdetails/index.jsx";
// import RestaurantRegistration from "./pages/restaurantregistration/index.jsx";
// import OffersPage from "./pages/offers/index.jsx";
// import TableReservations from "./pages/tablereservations/index.jsx";
// import FinanceManagement from "./pages/financemanagement/index.jsx";
import AllStaffPage from "./pages/allstaff/index.jsx";
import StaffManagement from "./pages/staff/index.jsx";
import NotificationsPage from "./pages/notifications/index.jsx";
import PrivacyPolicy from "./pages/privacy-policy/index.jsx";
import TermsConditions from "./pages/terms-conditions/index.jsx";
import ContactSupport from "./pages/contact-support/index.jsx";
import BiometricKiosk from "./pages/biometric-kiosk/index.jsx";
import LiveKiosk from "./pages/live-kiosk/index.jsx";
import { getSafePath } from "./utils/perm";
import { useAuth } from "./context/AuthContext";
function PrivateRoute({ children }) {
  const { user } = useAuth();
  return user ? children : <Navigate to="/login" replace />;
}

import { useEffect } from "react";
import { performAttendanceCleanup } from "./utils/cleanup";

export default function App() {
  const { user, userData, perms } = useAuth();

  useEffect(() => {
    // Run cleanup once when an Admin (or authorized staff) logs in
    if (user && (perms?.includes("all_staff") || perms?.includes("dashboard"))) {
      performAttendanceCleanup();
    }
  }, [user, perms]);

  return (

    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        
        <Route path="/privacy-policy" element={<PrivacyPolicy />} />
        <Route path="/terms-conditions" element={<TermsConditions />} />
        <Route path="/contact-support" element={<ContactSupport />} />

        <Route
          path="/dashboard"
          element={
            <PrivateRoute>
              <RequirePerm perm="dashboard"><Dashboard /></RequirePerm>
            </PrivateRoute>
          }
        />


        <Route
          path="/restuarent"
          element={
            <PrivateRoute>
              <RequirePerm perm="restaurant"><Restuarent /></RequirePerm>
            </PrivateRoute>
          }
        />

        <Route
          path="/staff"
          element={
            <PrivateRoute>
              <RequirePerm perm="staff_management"><StaffManagement /></RequirePerm>
            </PrivateRoute>
          }
        />

        <Route
          path="/allstaff"
          element={
            <PrivateRoute>
              <RequirePerm perm="all_staff"><AllStaffPage /></RequirePerm>
            </PrivateRoute>
          }
        />
        <Route
          path="/notifications"
          element={
            <PrivateRoute>
              <RequirePerm perm="notifications"><NotificationsPage /></RequirePerm>
            </PrivateRoute>
          }
        />

        <Route
          path="/access"
          element={
            <PrivateRoute>
              <RequirePerm perm="access"><AccessManagement /></RequirePerm>
            </PrivateRoute>
          }
        />
        <Route
          path="/autologouts"
          element={
            <PrivateRoute>
              <RequirePerm perm="auto_logouts"><AutoLogoutsPage /></RequirePerm>
            </PrivateRoute>
          }
        />
        <Route
          path="/biometric-kiosk"
          element={
            <PrivateRoute>
              <RequirePerm perm="biometric_kiosk"><BiometricKiosk /></RequirePerm>
            </PrivateRoute>
          }
        />
        <Route
          path="/live-kiosk"
          element={
            <PrivateRoute>
              <RequirePerm perm="live_kiosk"><LiveKiosk /></RequirePerm>
            </PrivateRoute>
          }
        />
        <Route
          path="/access/roles"
          element={
            <PrivateRoute>
              <RequirePerm perm="access"><Roles /></RequirePerm>
            </PrivateRoute>
          }
        />
        <Route
          path="/access/users"
          element={
            <PrivateRoute>
              <RequirePerm perm="access"><Users /></RequirePerm>
            </PrivateRoute>
          }
        />

        {/* Legacy Routes - Disabled */}
        {/* 
        <Route
          path="/category"
          element={
            <PrivateRoute>
              <RequirePerm perm="category"><Category /></RequirePerm>
            </PrivateRoute>
          }
        />

        <Route
          path="/product"
          element={
            <PrivateRoute>
              <RequirePerm perm="product"><Product /></RequirePerm>
            </PrivateRoute>
          }
        />

        <Route
          path="/customerinfo"
          element={
            <PrivateRoute>
              <RequirePerm perm="customer_info">
                <CustomerInfo />
              </RequirePerm>
            </PrivateRoute>
          }
        />

        <Route
          path="/customerdetails"
          element={
            <PrivateRoute>
              <RequirePerm perm="customer_details">
                <CustomerDetails />
              </RequirePerm>
            </PrivateRoute>
          }
        />
        */}

        <Route
          path="/"
          element={
            user && userData ? (
              <Navigate to={getSafePath(userData, perms)} replace />
            ) : (
              <Navigate to="/login" replace />
            )
          }
        />

        {/* 
        <Route
          path="/orders"
          element={
            <PrivateRoute>
              <RequirePerm perm="order_management">
                <Orders />
              </RequirePerm>
            </PrivateRoute>
          }
        />

        */}

        <Route
          path="/settings"
          element={
            <PrivateRoute>
              <RequirePerm perm="settings">
                <Settings />
              </RequirePerm>
            </PrivateRoute>
          }
        />
        <Route
          path="/setttings"
          element={
            <PrivateRoute>
              <RequirePerm perm="settings">
                <Settings />
              </RequirePerm>
            </PrivateRoute>
          }
        />

        {/*

        <Route
          path="/restaurantregistration"
          element={
            <PrivateRoute>
              <RequirePerm perm="restaurant_registration">
                <RestaurantRegistration />
              </RequirePerm>
            </PrivateRoute>
          }
        />

        <Route
          path="/offers"
          element={
            <PrivateRoute>
              <RequirePerm perm="promotional_offers">
                <OffersPage />
              </RequirePerm>
            </PrivateRoute>
          }
        />

        <Route
          path="/table-reservations"
          element={
            <PrivateRoute>
              <RequirePerm perm="table_reservations">
                <TableReservations />
              </RequirePerm>
            </PrivateRoute>
          }
        />

        <Route
          path="/finance"
          element={
            <PrivateRoute>
              <RequirePerm perm="finance_management">
                <FinanceManagement />
              </RequirePerm>
            </PrivateRoute>
          }
        />
        */}

        <Route path="*" element={<Navigate to="/" replace />} />

      </Routes>
    </BrowserRouter>
  );
}


