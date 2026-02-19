"use client";
import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";
import Image from "next/image";

export default function LandingPage() {
  const [isLoading, setIsLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  useEffect(() => {
    const timer = setTimeout(() => setIsLoading(false), 3000);
    return () => clearTimeout(timer);
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");
    setIsLoggingIn(true);

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setErrorMsg("Email atau Password salah. Silakan coba lagi.");
      setIsLoggingIn(false);
    } else {
      router.push("/dashboard");
    }
  };

  if (isLoading) {
    return (
      <div className="fixed inset-0 bg-green-900 flex flex-col items-center justify-center z-50">
        <div className="text-white text-5xl font-black tracking-tighter animate-pulse italic">
          TRUJIVA
        </div>
        <div className="mt-4 flex gap-1">
          <div className="w-2 h-2 bg-green-400 rounded-full animate-bounce [animation-delay:-0.3s]"></div>
          <div className="w-2 h-2 bg-green-400 rounded-full animate-bounce [animation-delay:-0.15s]"></div>
          <div className="w-2 h-2 bg-green-400 rounded-full animate-bounce"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4 font-sans">
      <div className="max-w-md w-full bg-white rounded-[40px] shadow-2xl p-10 border border-gray-100 transition-all hover:shadow-green-100/50">
        <div className="text-center mb-10">
          <h1 className="text-4xl font-black text-green-900 italic tracking-tight">
            TRUJIVA
          </h1>
          <p className="text-gray-400 text-[10px] uppercase tracking-widest mt-2 font-black">
            Internal Reporting System
          </p>
          <div className="mt-4 flex justify-center">
            <Image
              src="/rumah-perubahan-logo.png"
              alt="Logo Rumah Perubahan"
              width={200}
              height={250}
              className="object-contain"
            />
          </div>
        </div>

        {errorMsg && (
          <div className="mb-6 p-4 bg-red-50 text-red-600 text-xs rounded-2xl border border-red-100 font-bold text-center animate-shake">
            ⚠️ {errorMsg}
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-6">
          <div>
            <label className="block text-[10px] font-black uppercase text-gray-400 mb-2 ml-1 tracking-widest cursor-default">
              Email Staf
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full p-4 bg-gray-50 border border-gray-100 rounded-2xl outline-none focus:ring-2 focus:ring-green-500 transition-all text-gray-800 font-bold placeholder:text-gray-300"
              placeholder="admin@trujiva.id"
              required
            />
          </div>
          <div>
            <label className="block text-[10px] font-black uppercase text-gray-400 mb-2 ml-1 tracking-widest cursor-default">
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full p-4 bg-gray-50 border border-gray-100 rounded-2xl outline-none focus:ring-2 focus:ring-green-500 transition-all text-gray-800 font-bold placeholder:text-gray-300"
              placeholder="••••••••"
              required
            />
          </div>
          <button
            type="submit"
            disabled={isLoggingIn}
            className={`w-full text-white font-black py-5 rounded-2xl shadow-lg transition-all active:scale-95 uppercase tracking-widest text-xs cursor-pointer ${
              isLoggingIn
                ? "bg-gray-300 cursor-not-allowed"
                : "bg-green-800 hover:bg-green-900 hover:shadow-green-900/20"
            }`}
          >
            {isLoggingIn ? "Memvalidasi..." : "Masuk ke Dashboard"}
          </button>
        </form>
      </div>
    </div>
  );
}
