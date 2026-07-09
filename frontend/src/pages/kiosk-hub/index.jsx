import React from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { LogOut, ScanFace, MonitorPlay } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { usePopup } from "../../context/PopupContext";

export default function KioskHub() {
  const navigate = useNavigate();
  const { logout, userData } = useAuth();
  const { showPopup } = usePopup();

  const handleLogout = () => {
    showPopup({
      title: "Confirm Logout",
      message: "Are you sure you want to log out of this kiosk device?",
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
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#071428] via-[#0d1f45] to-[#071428] font-sans flex flex-col items-center justify-center relative overflow-hidden text-white">
      {/* Top right logout */}
      <div className="absolute top-8 right-8 z-50">
        <button
          onClick={handleLogout}
          className="flex items-center gap-2 px-5 py-2.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-2xl transition-all duration-300 text-sm font-semibold tracking-wide hover:border-white/20 active:scale-95"
        >
          <LogOut size={16} />
          Logout Device
        </button>
      </div>

      {/* Background decorations */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-[#00f2ff]/10 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-[#D0B079]/10 rounded-full blur-[120px] pointer-events-none" />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: "easeOut" }}
        className="w-full max-w-5xl px-6 relative z-10"
      >
        <div className="text-center mb-16 space-y-4">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-[#D0B079]/10 border border-[#D0B079]/20 text-[#D0B079] text-xs font-bold uppercase tracking-[0.2em] mb-4">
            Device Terminal Active
          </div>
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-black tracking-tight">
            Kiosk Operations <span className="text-[#D0B079]">Hub</span>
          </h1>
          <p className="text-white/50 text-base md:text-lg max-w-2xl mx-auto font-medium">
            Select an operational mode to initialize this terminal. This device is securely authenticated to your restaurant workspace.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-12 max-w-4xl mx-auto">
          {/* Live Kiosk Module */}
          <motion.button
            whileHover={{ scale: 1.02, y: -5 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => navigate("/live-kiosk")}
            className="group relative bg-[#0b1a3d]/60 backdrop-blur-xl border border-white/10 hover:border-[#00f2ff]/50 rounded-[2.5rem] p-10 text-left transition-all duration-500 overflow-hidden shadow-2xl"
          >
            <div className="absolute inset-0 bg-gradient-to-br from-[#00f2ff]/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
            <div className="relative z-10 flex flex-col h-full justify-between gap-8">
              <div className="w-20 h-20 rounded-3xl bg-white/5 border border-white/10 flex items-center justify-center shadow-lg group-hover:scale-110 group-hover:bg-[#00f2ff]/10 group-hover:border-[#00f2ff]/20 transition-all duration-500">
                <MonitorPlay className="text-white/50 group-hover:text-[#00f2ff] transition-colors duration-500" size={36} />
              </div>
              
              <div>
                <h3 className="text-2xl font-bold tracking-tight text-white mb-3 group-hover:text-[#00f2ff] transition-colors duration-300">Live Kiosk Terminal</h3>
                <p className="text-white/40 text-sm leading-relaxed font-medium">
                  Initialize the live attendance interface. Staff can clock in and out securely using facial recognition directly from this device.
                </p>
              </div>

              <div className="flex items-center gap-3 text-xs font-bold uppercase tracking-widest text-white/30 group-hover:text-[#00f2ff] transition-colors duration-300 mt-4">
                Launch Module <span className="text-[16px] leading-none">→</span>
              </div>
            </div>
          </motion.button>

          {/* Biometric Registration Module */}
          <motion.button
            whileHover={{ scale: 1.02, y: -5 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => navigate("/biometric-kiosk")}
            className="group relative bg-[#0b1a3d]/60 backdrop-blur-xl border border-white/10 hover:border-[#D0B079]/50 rounded-[2.5rem] p-10 text-left transition-all duration-500 overflow-hidden shadow-2xl"
          >
            <div className="absolute inset-0 bg-gradient-to-br from-[#D0B079]/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
            <div className="relative z-10 flex flex-col h-full justify-between gap-8">
              <div className="w-20 h-20 rounded-3xl bg-white/5 border border-white/10 flex items-center justify-center shadow-lg group-hover:scale-110 group-hover:bg-[#D0B079]/10 group-hover:border-[#D0B079]/20 transition-all duration-500">
                <ScanFace className="text-white/50 group-hover:text-[#D0B079] transition-colors duration-500" size={36} />
              </div>
              
              <div>
                <h3 className="text-2xl font-bold tracking-tight text-white mb-3 group-hover:text-[#D0B079] transition-colors duration-300">Biometric Registration</h3>
                <p className="text-white/40 text-sm leading-relaxed font-medium">
                  Access the enrollment portal. Register new staff members and capture their facial biometrics securely into the system.
                </p>
              </div>

              <div className="flex items-center gap-3 text-xs font-bold uppercase tracking-widest text-white/30 group-hover:text-[#D0B079] transition-colors duration-300 mt-4">
                Launch Module <span className="text-[16px] leading-none">→</span>
              </div>
            </div>
          </motion.button>
        </div>
        
        <div className="mt-16 text-center text-white/20 text-xs font-bold tracking-widest uppercase">
          Device Managed by DigitalBotSolutions
        </div>
      </motion.div>
    </div>
  );
}
