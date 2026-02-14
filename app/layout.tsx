"use client";
import "./globals.css";
import Sidebar from "@/components/Sidebar";
import { usePathname } from "next/navigation";
import { Toaster } from "react-hot-toast";
import { Suspense } from "react";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  // Logika navigasi: Sidebar muncul di semua halaman kecuali Login ('/')
  const showSidebar = pathname !== "/";

  return (
    <html lang="id">
      <head>
        <link rel="icon" href="/logo.jpg" type="image/jpeg" />
        <link rel="apple-touch-icon" href="/logo.jpg" />
        <title>Trujiva Backoffice</title>
      </head>
      <body className="bg-gray-50 min-h-screen font-sans">
        <Toaster
          position="top-center"
          reverseOrder={false}
          toastOptions={{
            style: {
              borderRadius: "16px",
              background: "#064e3b",
              color: "#fff",
              fontSize: "12px",
              fontWeight: "900",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.1)",
            },
            success: {
              iconTheme: {
                primary: "#4ade80",
                secondary: "#fff",
              },
            },
            error: {
              style: {
                background: "#991b1b",
              },
            },
          }}
        />

        <div className="flex h-screen overflow-hidden">
          {/* Suspense membungkus Sidebar karena Sidebar akan membaca URL (useSearchParams). 
              Tanpa ini, Next.js akan error saat proses build/deploy.
          */}
          <Suspense fallback={<div className="w-64 bg-green-900" />}>
            {showSidebar && <Sidebar />}
          </Suspense>

          <main
            className={`flex-1 overflow-y-auto ${!showSidebar ? "w-full" : ""}`}
          >
            {/* Membungkus konten utama agar loading terasa smooth saat pindah periode */}
            <Suspense
              fallback={
                <div className="p-20 text-center font-black animate-pulse uppercase">
                  Syncing Data...
                </div>
              }
            >
              {children}
            </Suspense>
          </main>
        </div>
      </body>
    </html>
  );
}
