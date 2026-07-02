import React from "react";
import { Link } from "react-router-dom";

export default function Footer() {
  return (
    <footer className="border-t border-white/10 bg-transparent mt-auto">
      <div className="mx-auto max-w-7xl px-4 py-8 text-center text-sm text-white/60">
        <div className="flex flex-col md:flex-row justify-center items-center gap-4 mb-4">
          <Link to="/privacy-policy" className="hover:text-white transition-colors">Privacy Policy</Link>
          <span className="hidden md:inline">•</span>
          <Link to="/terms-conditions" className="hover:text-white transition-colors">Terms and Conditions</Link>
          <span className="hidden md:inline">•</span>
          <Link to="/contact-support" className="hover:text-white transition-colors">Contact and Support</Link>
        </div>

        <div className="mt-2 text-xs">
          © {new Date().getFullYear()} DigitalBotSolutions. All rights reserved.
        </div>
      </div>
    </footer>
  );
}
