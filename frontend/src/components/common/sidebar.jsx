import React, { useEffect, useMemo, useCallback, useState } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { can } from "../../utils/perm";
import { usePopup } from "../../context/PopupContext";
import { useAuth } from "../../context/AuthContext";
import { X } from "lucide-react";




/* Sidebar link item */
const Item = ({ to = "#", icon, label }) => {
  const location = useLocation();
  const isSettingsActive = to === "/settings" && (location.pathname === "/settings" || location.pathname === "/setttings");
  return (
    <NavLink
      to={to}
      end
      className={({ isActive }) =>
        `flex items-center gap-3 px-4 py-2.5 rounded-xl text-[15px] font-medium tracking-wide
        transition-all duration-200 group relative
        ${
          isActive || isSettingsActive
            ? "bg-[#D0B079]/15 text-[#D0B079] before:absolute before:left-0 before:top-2 before:bottom-2 before:w-[3px] before:rounded-full before:bg-[#D0B079]"
            : "text-white/85 hover:bg-white/8 hover:text-white"
        }`
      }
    >
      <span className="h-[18px] w-[18px] text-current shrink-0">{icon}</span>
      <span className="truncate">{label}</span>
    </NavLink>
  );
};

/* Dropdown (group) */
function Group({ label, icon, children, defaultOpen = false, hidden = false, openProp }) {
  const [open, setOpen] = useState(defaultOpen);

  useEffect(() => {
    if (typeof openProp === "boolean") setOpen(openProp);
  }, [openProp]);

  if (hidden) return null;

  return (
    <div className="space-y-0.5">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-2.5 rounded-xl
          text-[15px] font-medium text-white/85 hover:bg-white/8 hover:text-white
          transition-all duration-200"
        aria-expanded={open}
      >
        <span className="flex items-center gap-3 truncate">
          <span className="h-[18px] w-[18px] text-current shrink-0">{icon}</span>
          <span className="truncate">{label}</span>
        </span>
        <svg
          className={`h-3.5 w-3.5 text-white/30 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
          viewBox="0 0 20 20"
          fill="currentColor"
        >
          <path d="M5.23 7.21a.75.75 0 011.06.02L10 11.127l3.71-3.896a.75.75 0 111.08 1.04l-4.24 4.46a.75.75 0 01-1.08 0L5.21 8.27a.75.75 0 01.02-1.06z" />
        </svg>
      </button>

      {open && <div className="pl-9 pr-2 py-1 space-y-0.5 animate-fadeIn">{children}</div>}
    </div>
  );
}

export default function Sidebar({ open, onClose }) {
  const { userData, perms } = useAuth();
  const { showPopup } = usePopup();
  const { logout } = useAuth();
  const navigate = useNavigate();

  const location = useLocation();

  useEffect(() => {
    if (open && window.innerWidth < 1024) onClose?.();
  }, [location.pathname]);

  const escHandler = useCallback(
    (e) => {
      if (e.key === "Escape" && open) onClose?.();
    },
    [open, onClose]
  );

  useEffect(() => {
    document.addEventListener("keydown", escHandler);
    return () => document.removeEventListener("keydown", escHandler);
  }, [escHandler]);

  const rawMenu = useMemo(
    () => [
      { label: "Dashboard", to: "/dashboard", icon: iconDashboard(), perm: "dashboard" },
      { label: "Restaurant Profile", to: "/restuarent", icon: iconRestaurant(), perm: "restaurant" },
      { label: "All Staff", to: "/allstaff", icon: iconAllStaff(), perm: "all_staff" },
      { label: "Staff Management", to: "/staff", icon: iconUsers(), perm: "staff_management" },
      { label: "Notifications", to: "/notifications", icon: iconBell(), perm: "notifications" },
      { label: "Auto Logouts", to: "/autologouts", icon: iconAutoLogouts(), perm: "auto_logouts" },
      { label: "Biometric Registration", to: "/biometric-kiosk", icon: iconBiometric(), perm: "biometric_kiosk" },
      { label: "Live Kiosk", to: "/live-kiosk", icon: iconLiveKiosk(), perm: "live_kiosk" },
      { label: "Settings", to: "/settings", icon: iconSettings(), perm: "settings" },
    ],
    []
  );

  const rawAccessChildren = useMemo(
    () => [
      { label: "Permissions", to: "/access", icon: iconLock(), perm: "access" },
      { label: "Roles", to: "/access/roles", icon: iconUsersCog(), perm: "access" },
      { label: "Users", to: "/access/users", icon: iconUser(), perm: "access" },
    ],
    []
  );

  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query.trim().toLowerCase()), 160);
    return () => clearTimeout(t);
  }, [query]);

  const visibleMenu = useMemo(() => {
    const q = debouncedQuery;
    return rawMenu.filter((m) => can(m.perm, userData, perms) && (!q || m.label.toLowerCase().includes(q)));
  }, [rawMenu, debouncedQuery, userData, perms]);

  const filteredAccessChildren = useMemo(() => {
    const q = debouncedQuery;
    return rawAccessChildren.filter(
      (c) => can(c.perm, userData, perms) && (!q || c.label.toLowerCase().includes(q))
    );
  }, [rawAccessChildren, debouncedQuery, userData, perms]);

  const showAccessGroup =
    filteredAccessChildren.length > 0 || location.pathname.startsWith("/access");

  return (
    <>
      <style>{`
        .animate-fadeIn { animation: fadeIn 200ms ease both; }
        @keyframes fadeIn { from { opacity:0; transform: translateY(-4px) } to { opacity:1; transform: translateY(0) } }
        .sidebar-scroll::-webkit-scrollbar { width: 4px; }
        .sidebar-scroll::-webkit-scrollbar-thumb { background: rgba(255,255,255,.18); border-radius: 999px; }
        .sidebar-scroll::-webkit-scrollbar-track { background: transparent; }
      `}</style>

      <div
        onClick={onClose}
        className={`fixed inset-0 z-[55] bg-black/60 backdrop-blur-md lg:hidden transition-opacity duration-300 ${open ? "opacity-100" : "opacity-0 pointer-events-none"
          }`}
      />
 
      <aside
        className={`
          fixed left-0 top-0 bottom-0 z-[60] w-[300px]
          flex flex-col shadow-2xl
          transform transition-all duration-500 cubic-bezier(0.4, 0, 0.2, 1)
          lg:z-40 lg:top-16
          ${open ? "translate-x-0" : "-translate-x-full"}
        `}
        style={{ background: 'linear-gradient(180deg, #071428 0%, #0d1f45 55%, #071428 100%)' }}
      >
        {/* Mobile Sidebar Header (Logo + Close) */}
        <div className="flex lg:hidden items-center justify-between px-6 pb-6 pt-12 border-b border-white/5">
          <img src="/digitalbotsolutions.png" alt="Logo" className="h-12 w-auto object-contain" />
          <button 
            onClick={onClose} 
            className="p-2.5 text-white/40 hover:text-white bg-white/5 hover:bg-white/10 rounded-2xl transition-all active:scale-90"
          >
            <X size={20} />
          </button>
        </div>

        {/* Search */}
        <div className="px-3 py-3 border-b border-white/[0.06]">
          <div className="relative">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-white/30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search menu..."
              className="w-full text-[13px] rounded-xl pl-9 pr-4 py-2.5
                bg-white/5 border border-white/[0.08]
                text-white/80 placeholder:text-white/25
                focus:outline-none focus:border-[#D0B079]/40 focus:bg-white/8
                transition-all duration-200"
            />
          </div>
        </div>

        <nav className="flex-1 px-3 py-3 space-y-0.5 overflow-y-auto sidebar-scroll">
          {visibleMenu.map((m) => (
            <Item key={m.label} to={m.to} label={m.label} icon={m.icon} />
          ))}

          <Group
            label="Access Control"
            icon={iconShield()}
            hidden={!showAccessGroup}
            openProp={location.pathname.startsWith("/access")}
          >
            {filteredAccessChildren.map((m) => (
              <Item key={m.label} to={m.to} label={m.label} icon={m.icon} />
            ))}
          </Group>
        </nav>

        {/* Footer */}
        <div className="px-3 py-3 border-t border-white/[0.06]" style={{ background: 'rgba(255,255,255,0.03)' }}>
          <div className="flex items-center gap-3 px-1 mb-3">
            <div className="h-9 w-9 rounded-full flex items-center justify-center text-white font-bold text-sm shrink-0 border border-white/15"
              style={{ background: 'linear-gradient(135deg, #f97316, #fb923c)' }}>
              {userData?.name ? userData.name.charAt(0).toUpperCase() : "A"}
            </div>
            <div className="min-w-0">
              <div className="text-[13px] font-semibold text-white/90 truncate">{userData?.name || "Admin"}</div>
              <div className="text-[11px] text-white/40 truncate">{userData?.email || "admin@digitalbotsolutions.com"}</div>
            </div>
          </div>

          <button
            onClick={() => {
              showPopup({
                title: "Confirm Logout",
                message: "Are you sure you want to log out?",
                type: "confirm",
                onConfirm: async () => {
                  try {
                    await logout();
                    localStorage.clear();
                    navigate("/login", { replace: true });
                  } catch (err) {
                    console.error("Logout error:", err);
                  }
                }
              });
            }}

            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-[13px] font-semibold transition-all duration-200 border border-white/10 text-white/70 hover:text-white hover:border-white/20"
            style={{ background: 'rgba(255,255,255,0.06)' }}
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
              <polyline points="16 17 21 12 16 7"/>
              <line x1="21" y1="12" x2="9" y2="12"/>
            </svg>
            Logout
          </button>
        </div>
      </aside>
    </>
  );
}

function iconAllStaff() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="w-full h-full">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="9" cy="7" r="4" stroke="currentColor" strokeWidth="1.6" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="20" cy="5" r="2" fill="currentColor" className="text-[#D0B079]" />
    </svg>
  );
}

function iconDashboard() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="w-full h-full">
      <path d="M3 12h8V4H3v8zm10 8h8v-6h-8v6zM3 20h8v-6H3v6zm10-8h8V4h-8v8z" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function iconRestaurant() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="w-full h-full">
      <path d="M6 3v9a2 2 0 0 0 4 0V3M6 8h4M14 3h2a3 3 0 0 1 3 3v15h-3v-7h-2V3z" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function iconShield() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="w-full h-full">
      <path d="M12 3l7 3v6c0 5-3.5 8-7 9-3.5-1-7-4-7-9V6l7-3z" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function iconLock() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="w-full h-full">
      <path d="M7 10V7a5 5 0 0 1 10 0v3M6 10h12v9a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2v-9z" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function iconUsersCog() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="w-full h-full">
      <path d="M12 14a5 5 0 0 0-9 3v3M21 20v-1a4 4 0 0 0-6.5-3.1M8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6z" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M18.5 7.5l1 .6-1 1.7h-2l-1-1.7 1-.6V6h2v1.5z" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function iconUsers() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="w-full h-full">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="9" cy="7" r="4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function iconUser() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="w-4 h-4">
      <path d="M16 9a4 4 0 1 1-8 0 4 4 0 0 1 8 0zM4 20a8 8 0 0 1 16 0" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}



function iconBell() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="w-full h-full">
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 0 1-3.46 0" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="18" cy="8" r="2" fill="currentColor" className="text-[#D0B079]" />
    </svg>
  );
}

function iconAutoLogouts() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="w-full h-full">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
      <polyline points="16 17 21 12 16 7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
      <line x1="21" y1="12" x2="9" y2="12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
      <circle cx="19" cy="5" r="2" fill="currentColor" className="text-[#D0B079]" />
    </svg>
  );
}

function iconSettings() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="w-full h-full">
      <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.1a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function iconBiometric() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="w-full h-full">
      <path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.6" />
      <path d="M12 17v.01" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function iconLiveKiosk() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="w-full h-full">
      <rect x="2" y="3" width="20" height="14" rx="2" stroke="currentColor" strokeWidth="1.6" />
      <path d="M8 21h8M12 17v4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="12" cy="10" r="3" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}
