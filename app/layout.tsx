"use client";
import "./globals.css";
import Sidebar from "@/components/Sidebar";
import { usePathname } from "next/navigation";
import { Toaster } from "react-hot-toast";

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
        {/* Favicon Setup - Menggunakan logo.jpg dari folder /public */}
        <link rel="icon" href="/logo.jpg" type="image/jpeg" />
        <link rel="apple-touch-icon" href="/logo.jpg" />
        <title>Trujiva Backoffice</title>
      </head>
      <body className="bg-gray-50 min-h-screen font-sans">
        {/* Wadah Toast Notification dengan gaya khas Trujiva */}
        <Toaster
          position="top-center"
          reverseOrder={false}
          toastOptions={{
            style: {
              borderRadius: "16px",
              background: "#064e3b", // green-900 sesuai branding
              color: "#fff",
              fontSize: "12px",
              fontWeight: "900",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.1)",
            },
            success: {
              iconTheme: {
                primary: "#4ade80", // green-400
                secondary: "#fff",
              },
            },
            error: {
              style: {
                background: "#991b1b", // red-800 untuk error
              },
            },
          }}
        />

        <div className="flex h-screen overflow-hidden">
          {/* Sidebar navigasi sesuai pilihan menu di dashboard */}
          {showSidebar && <Sidebar />}

          <main
            className={`flex-1 overflow-y-auto ${!showSidebar ? "w-full" : ""}`}
          >
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
