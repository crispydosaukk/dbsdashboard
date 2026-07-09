// frontend/src/utils/perm.js

// Get permissions array (for normal roles)
export function getPerms() {
  try {
    return JSON.parse(localStorage.getItem("perms") || "[]");
  } catch {
    return [];
  }
}

// New helper: get logged-in user
function getUser() {
  try {
    return JSON.parse(localStorage.getItem("user") || "{}");
  } catch {
    return {};
  }
}

export function can(required, passedUser, passedPerms) {
  if (!required) return true;

  const user = passedUser || getUser();
  const perms = (passedPerms || getPerms() || []).map(p => String(p).toLowerCase());
  
  // 🔥 SUPER ADMIN BYPASS
  const isSuper = (
    user?.role_id === 6 || 
    user?.role_id === "6" ||
    (user?.role_title && String(user.role_title).toLowerCase().trim() === "super admin") ||
    (user?.role && typeof user.role === 'string' && user.role.toLowerCase().trim() === "super admin") ||
    (user?.role?.title && String(user.role.title).toLowerCase().trim() === "super admin")
  );

  const isKiosk = user?.role_id === "KIOSK";
  if (isKiosk && ["biometric_kiosk", "live_kiosk", "kiosk_hub"].includes(String(required).toLowerCase())) {
    return true;
  }

  const hasPerm = perms.includes(String(required).toLowerCase());
  return isSuper || hasPerm;
}


/**
 * Returns the first route the user has permission for.
 * Defaults to '/dashboard' if they have it, or the first available.
 * If no permissions, returns '/login'.
 */
export function getSafePath(passedUser, passedPerms) {
  const user = passedUser || getUser();
  
  // 🔥 SUPER ADMIN BYPASS
  const isSuper = (
    user?.role_id === 6 || 
    user?.role_id === "6" ||
    user?.role_title?.toLowerCase()?.trim() === "super admin" ||
    user?.role?.toLowerCase()?.trim() === "super admin" ||
    user?.role?.title?.toLowerCase()?.trim() === "super admin"
  );

  if (isSuper) {
    return "/dashboard";
  }

  if (user?.role_id === "KIOSK") {
    return "/kiosk-hub";
  }

  const perms = (passedPerms || getPerms() || []).map(p => String(p).toLowerCase());

  const map = [
    { perm: "dashboard", path: "/dashboard" },
    { perm: "staff_management", path: "/staff" },
    { perm: "all_staff", path: "/allstaff" },
    { perm: "notifications", path: "/notifications" },
    { perm: "auto_logouts", path: "/autologouts" },
    { perm: "restaurant", path: "/restuarent" },
    { perm: "settings", path: "/settings" },
    { perm: "biometric_kiosk", path: "/biometric-kiosk" },
    { perm: "live_kiosk", path: "/live-kiosk" },
    { perm: "access", path: "/access" },
  ];

  for (const item of map) {
    if (perms.includes(item.perm)) {
      return item.path;
    }
  }

  return "/login"; // fallback if no perms at all
}


