import React, { useState, useEffect, useRef } from "react";
import Header from "../../components/common/header.jsx";
import Sidebar from "../../components/common/sidebar.jsx";
import Footer from "../../components/common/footer.jsx";
import { db } from "../../lib/firebase";
import { collection, query, where, getDocs, orderBy, doc, updateDoc } from "firebase/firestore";
import * as faceapi from "face-api.js";
import { motion } from "framer-motion";
import { ScanFace, Building2, UserCircle, Camera, CheckCircle } from "lucide-react";
import { usePopup } from "../../context/PopupContext";
import { useAuth } from "../../context/AuthContext";

export default function BiometricKiosk() {
  const { showPopup } = usePopup();
  const { user, userData } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // Data states
  const [restaurants, setRestaurants] = useState([]);
  const [staffList, setStaffList] = useState([]);
  
  // Selection states
  const [selectedRestaurant, setSelectedRestaurant] = useState("");
  const [selectedStaff, setSelectedStaff] = useState("");

  const [loading, setLoading] = useState(true);

  // Face API states
  const [modelsLoaded, setModelsLoaded] = useState(false);
  const [isCameraOn, setIsCameraOn] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanMessage, setScanMessage] = useState("");
  
  const videoRef = useRef(null);
  const streamRef = useRef(null);

  const isSuperAdmin = 
    userData?.role_id === 6 || 
    userData?.role_id === "6" || 
    String(userData?.role_title || "").toLowerCase().trim() === "super admin";

  useEffect(() => {
    fetchInitialData();
    loadModels();
    return () => stopVideo(); // Cleanup on unmount
  }, [user, isSuperAdmin]);

  const loadModels = async () => {
    try {
      const MODEL_URL = '/models';
      await Promise.all([
        faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL),
        faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
        faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL)
      ]);
      setModelsLoaded(true);
      console.log("Face API Models loaded.");
    } catch (err) {
      console.error("Error loading models:", err);
      showPopup({ title: "Error", message: "Failed to load face recognition models.", type: "error" });
    }
  };

  const fetchInitialData = async () => {
    setLoading(true);
    try {
      if (isSuperAdmin) {
        // Fetch all restaurants for super admin
        const restQuery = query(collection(db, "restaurants"), orderBy("restaurant_name", "asc"));
        const restSnap = await getDocs(restQuery);
        const rests = restSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setRestaurants(rests);
        
        // If super admin hasn't selected a restaurant, we don't load staff yet
      } else {
        // Normal manager - auto select their restaurant
        setSelectedRestaurant(user?.uid || "");
        fetchStaffForRestaurant(user?.uid || "");
      }
    } catch (error) {
      console.error("Error fetching data:", error);
      showPopup({ title: "Error", message: "Failed to load initial data.", type: "error" });
    } finally {
      setLoading(false);
    }
  };

  const fetchStaffForRestaurant = async (restId) => {
    if (!restId) {
      setStaffList([]);
      return;
    }
    setLoading(true);
    try {
      const staffQuery = query(
        collection(db, "staff"),
        where("created_by", "==", restId)
      );
      const staffSnap = await getDocs(staffQuery);
      const staff = staffSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      
      // Sort staff by name
      staff.sort((a, b) => (a.full_name || "").localeCompare(b.full_name || ""));
      setStaffList(staff);
    } catch (error) {
      console.error("Error fetching staff:", error);
      showPopup({ title: "Error", message: "Failed to load staff list.", type: "error" });
    } finally {
      setLoading(false);
    }
  };

  const startVideo = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      streamRef.current = stream;
      setIsCameraOn(true);
      setScanMessage("Camera active. Please look straight.");
    } catch (err) {
      console.error("Camera error:", err);
      showPopup({ title: "Camera Error", message: "Could not access webcam.", type: "error" });
    }
  };

  const stopVideo = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setIsCameraOn(false);
    setScanMessage("");
  };

  const registerFace = async () => {
    if (!videoRef.current || !selectedStaff) return;
    
    setScanning(true);
    setScanMessage("Scanning face... please hold still.");
    
    try {
      // Detect single face
      const detection = await faceapi.detectSingleFace(videoRef.current).withFaceLandmarks().withFaceDescriptor();
      
      if (!detection) {
        setScanMessage("No face detected. Please ensure you are visible and well-lit.");
        setScanning(false);
        return;
      }

      // Convert descriptor to regular array for Firestore
      const descriptorArray = Array.from(detection.descriptor);

      // Save to Firebase
      const staffDocRef = doc(db, "staff", selectedStaff);
      await updateDoc(staffDocRef, {
        faceDescriptor: descriptorArray,
        updated_at: new Date()
      });

      setScanMessage("Face registered successfully!");
      showPopup({ title: "Success", message: "Face biometric data saved.", type: "success" });
      
      // Stop camera after success
      setTimeout(() => stopVideo(), 2000);
      
    } catch (err) {
      console.error("Scanning error:", err);
      setScanMessage("An error occurred during scanning.");
    } finally {
      setScanning(false);
    }
  };

  const handleRestaurantChange = (e) => {
    const restId = e.target.value;
    setSelectedRestaurant(restId);
    setSelectedStaff(""); // Reset staff selection
    stopVideo();
    fetchStaffForRestaurant(restId);
  };

  const handleStaffChange = (e) => {
    setSelectedStaff(e.target.value);
    stopVideo();
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#071428] via-[#0d1f45] to-[#071428] font-sans">
      <Header onToggleSidebar={() => setSidebarOpen((s) => !s)} />
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <div className={`flex-1 -mt-12 flex flex-col pt-36 lg:pt-24 transition-all duration-300 ease-in-out ${sidebarOpen ? "lg:pl-72" : "lg:pl-0"}`}>
        <main className="flex-1 px-4 sm:px-6 lg:px-10 py-8">
          
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8"
          >
            <div>
              <h2 className="text-2xl sm:text-4xl font-bold text-white tracking-tight flex items-center gap-3">
                <ScanFace className="text-[#00f2ff]" size={36} />
                Biometric Registration
              </h2>
              <p className="mt-2 text-white/50 text-base font-medium">Select a staff member to register their face for attendance.</p>
            </div>
          </motion.div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            
            {/* Selection Panel */}
            <motion.div 
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              className="lg:col-span-1 bg-[#0b1a3d]/60 backdrop-blur-xl border border-white/[0.08] rounded-[2rem] p-6 shadow-2xl flex flex-col gap-6"
            >
              <h3 className="text-xl font-bold text-white mb-2 flex items-center gap-2">
                <UserCircle className="text-[#D0B079]" size={24} />
                Select Employee
              </h3>

              {isSuperAdmin && (
                <div className="space-y-2">
                  <label className="text-sm font-medium tracking-wide text-white/70 flex items-center gap-2">
                    <Building2 size={16} className="text-[#D0B079]" />
                    Select Restaurant
                  </label>
                  <select
                    value={selectedRestaurant}
                    onChange={handleRestaurantChange}
                    className="w-full px-5 py-4 bg-white/[0.03] border border-white/[0.08] rounded-2xl text-white font-medium focus:outline-none focus:ring-4 focus:ring-[#D0B079]/20 focus:border-[#D0B079]/40 transition-all appearance-none cursor-pointer"
                    disabled={loading}
                  >
                    <option value="" className="bg-[#0b1a3d] text-white">-- Select Restaurant --</option>
                    {restaurants.map(r => (
                      <option key={r.id} value={r.id} className="bg-[#0b1a3d] text-white">
                        {r.restaurant_name || "Unnamed Restaurant"}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="space-y-2">
                <label className="text-sm font-medium tracking-wide text-white/70 flex items-center gap-2">
                  <UserCircle size={16} className="text-[#D0B079]" />
                  Select Staff Member
                </label>
                <select
                  value={selectedStaff}
                  onChange={handleStaffChange}
                  className="w-full px-5 py-4 bg-white/[0.03] border border-white/[0.08] rounded-2xl text-white font-medium focus:outline-none focus:ring-4 focus:ring-[#D0B079]/20 focus:border-[#D0B079]/40 transition-all appearance-none cursor-pointer"
                  disabled={loading || !selectedRestaurant}
                >
                  <option value="" className="bg-[#0b1a3d] text-white">-- Select Staff --</option>
                  {staffList.map(s => (
                    <option key={s.id} value={s.id} className="bg-[#0b1a3d] text-white">
                      {s.full_name} ({s.designation || "Staff"})
                    </option>
                  ))}
                </select>
              </div>

              {selectedStaff && (
                <div className="mt-4 p-4 rounded-2xl bg-[#00f2ff]/5 border border-[#00f2ff]/20">
                  <div className="flex items-center gap-3">
                    <CheckCircle className="text-[#00f2ff]" size={24} />
                    <div>
                      <p className="text-sm text-white/60 font-medium">Ready to register</p>
                      <p className="text-base text-white font-bold">
                        {staffList.find(s => s.id === selectedStaff)?.full_name}
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </motion.div>

            {/* Camera / Registration Panel */}
            <motion.div 
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              className="lg:col-span-2 bg-[#0b1a3d]/60 backdrop-blur-xl border border-white/[0.08] rounded-[2rem] p-6 md:p-10 shadow-2xl flex flex-col items-center justify-center min-h-[400px]"
            >
              {!selectedStaff ? (
                <div className="text-center">
                  <div className="w-24 h-24 rounded-full bg-white/5 border border-white/10 flex items-center justify-center mx-auto mb-6">
                    <Camera className="text-white/20" size={40} />
                  </div>
                  <h3 className="text-2xl font-bold text-white mb-2">Awaiting Selection</h3>
                  <p className="text-white/40">Please select a staff member from the left panel to begin face registration.</p>
                </div>
              ) : (
                <div className="text-center w-full max-w-md">
                  <div className="aspect-square w-full rounded-3xl bg-black/50 border-2 border-dashed border-white/20 flex flex-col items-center justify-center mb-8 relative overflow-hidden group">
                    {isCameraOn ? (
                      <video 
                        ref={videoRef} 
                        autoPlay 
                        muted 
                        playsInline
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <>
                        <ScanFace className="text-white/20 group-hover:text-[#00f2ff]/50 transition-colors duration-500" size={80} />
                        <p className="mt-4 text-white/50 font-medium tracking-wide">Camera Offline</p>
                      </>
                    )}
                    
                    {scanning && (
                      <div className="absolute top-0 left-0 right-0 h-1 bg-[#00f2ff]/80 shadow-[0_0_20px_#00f2ff] animate-scan opacity-80 z-10" />
                    )}
                  </div>
                  
                  {scanMessage && (
                    <p className={`mb-4 text-sm font-bold ${scanMessage.includes('error') || scanMessage.includes('No face') ? 'text-red-400' : 'text-[#00f2ff]'}`}>
                      {scanMessage}
                    </p>
                  )}

                  {!isCameraOn ? (
                    <button 
                      onClick={startVideo}
                      disabled={!modelsLoaded}
                      className="w-full inline-flex items-center justify-center gap-3 px-8 py-4 bg-white/10 hover:bg-white/20 text-white rounded-2xl font-bold text-lg transition-all hover:-translate-y-1 active:scale-95 disabled:opacity-50"
                    >
                      <Camera size={24} />
                      {modelsLoaded ? "Turn On Camera" : "Loading Models..."}
                    </button>
                  ) : (
                    <div className="flex gap-4">
                      <button 
                        onClick={stopVideo}
                        className="flex-1 inline-flex items-center justify-center px-4 py-4 bg-red-500/10 text-red-400 hover:bg-red-500 hover:text-white rounded-2xl font-bold transition-all"
                      >
                        Cancel
                      </button>
                      <button 
                        onClick={registerFace}
                        disabled={scanning}
                        className="flex-[2] inline-flex items-center justify-center gap-2 px-8 py-4 bg-gradient-to-r from-[#D0B079] to-[#b8965f] hover:from-[#b8965f] hover:to-[#a3804d] text-[#071428] rounded-2xl font-bold text-lg shadow-[0_0_20px_rgba(251,191,36,0.2)] transition-all hover:-translate-y-1 active:scale-95 disabled:opacity-50"
                      >
                        <ScanFace size={24} />
                        {scanning ? "Scanning..." : "Register Face"}
                      </button>
                    </div>
                  )}
                  
                  <p className="mt-4 text-sm text-white/40">Ensure the employee's face is clearly visible and well-lit before registering.</p>
                </div>
              )}
            </motion.div>
          </div>

        </main>
        <Footer />
      </div>
      
      <style>{`
        @keyframes scan {
          0% { transform: translateY(0); }
          50% { transform: translateY(10000%); }
          100% { transform: translateY(0); }
        }
        .animate-scan {
          animation: scan 3s linear infinite;
        }
      `}</style>
    </div>
  );
}
