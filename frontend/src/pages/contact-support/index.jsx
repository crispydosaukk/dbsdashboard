import React from 'react';
import { Link } from 'react-router-dom';
import Footer from '../../components/common/footer';

export default function ContactSupport() {
  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-[#071428] via-[#0d1f45] to-[#071428] text-white font-sans">
      <div className="flex-1 max-w-4xl w-full mx-auto p-6 mt-8 mb-12">
        <Link to="/login" className="text-[#D0B079] hover:underline mb-6 inline-block">&larr; Back to App</Link>
        <div className="bg-[#0b1a3d]/60 backdrop-blur-xl rounded-lg border border-white/10 p-8 shadow-2xl">
          <h1 className="text-3xl font-bold mb-6 text-white drop-shadow-lg">Contact and Support</h1>
          <div className="space-y-6 text-white/80 leading-relaxed">
            <p>
              We are here to help! If you have any questions, concerns, or need support with the DigitalBotSolutions application, please feel free to reach out to us using the contact information below.
            </p>
            
            <div className="bg-[#D0B079]/10 p-8 rounded-xl border border-[#D0B079]/20 shadow-inner space-y-6">
              <h2 className="text-2xl font-semibold text-white/90 border-b border-white/10 pb-2">Contact Information</h2>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <p className="text-sm font-bold text-white/50 uppercase tracking-widest mb-1">Company Name</p>
                  <p className="text-lg text-white">Catering Spice Ltd</p>
                </div>
                
                <div>
                  <p className="text-sm font-bold text-white/50 uppercase tracking-widest mb-1">Email Address</p>
                  <a href="mailto:digitalbotsolutions@gmail.com" className="text-lg text-[#D0B079] hover:underline">digitalbotsolutions@gmail.com</a>
                </div>
                
                <div>
                  <p className="text-sm font-bold text-white/50 uppercase tracking-widest mb-1">Phone Number</p>
                  <a href="tel:07448055754" className="text-lg text-[#D0B079] hover:underline">07448055754</a>
                </div>
                
                <div>
                  <p className="text-sm font-bold text-white/50 uppercase tracking-widest mb-1">Physical Address</p>
                  <p className="text-lg text-white">35 Saints Drive, London, E7 0RF</p>
                </div>
              </div>
            </div>
            
            <p className="mt-8 text-sm text-center text-white/60 bg-white/5 p-4 rounded-lg border border-white/10">
              Our support team usually responds within 24-48 business hours. Thank you for choosing Catering Spice Ltd!
            </p>
          </div>
        </div>
      </div>
      <Footer />
    </div>
  );
}
