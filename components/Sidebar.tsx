"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";
import { useMemo } from "react";
import {
  LayoutDashboard,
  Package,
  ShoppingCart,
  History,
  Users,
  ClipboardList,
  LogOut,
} from "lucide-react";

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const menuItems = [
    {
      name: "Dashboard",
      href: "/dashboard",
      icon: <LayoutDashboard size={20} />,
    },
    { name: "Manajemen Produk", href: "/product", icon: <Package size={20} /> },
    {
      name: "Input Penjualan",
      href: "/transaksi",
      icon: <ShoppingCart size={20} />,
    },
    {
      name: "Arus Kas & Stok",
      href: "/transaksi/history",
      icon: <History size={20} />,
    },
    {
      name: "Laporan Mitra",
      href: "/transaksi/mitra-report",
      icon: <ClipboardList size={20} />,
    },
    { name: "Manajemen Mitra", href: "/mitra", icon: <Users size={20} /> },
  ];

  // FUNGSI LOGOUT REAL
  const handleLogout = async () => {
    const confirmLogout = confirm("Apakah Anda yakin ingin keluar?");
    if (confirmLogout) {
      await supabase.auth.signOut();
      router.push("/"); // Balik ke halaman login
      router.refresh();
    }
  };

  return (
    <aside className="w-64 bg-green-900 text-white min-h-screen flex flex-col p-6 shadow-2xl border-r border-green-800">
      {/* BRANDING */}
      <div className="mb-10 px-2">
        <h1 className="text-2xl font-black italic tracking-tighter text-white">
          TRUJIVA
        </h1>
        <p className="text-[10px] font-black text-green-400 uppercase tracking-[0.2em] mt-1">
          Backoffice System
        </p>
      </div>

      {/* NAVIGATION */}
      <nav className="flex-1 space-y-2">
        {menuItems.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.name}
              href={item.href}
              className={`flex items-center gap-3 p-4 rounded-2xl transition-all font-bold text-sm cursor-pointer group ${
                isActive
                  ? "bg-green-700 text-white shadow-lg border-l-4 border-green-400"
                  : "text-green-300/70 hover:bg-green-800 hover:text-white"
              }`}
            >
              <span
                className={`${isActive ? "text-white" : "text-green-500 group-hover:text-green-300"}`}
              >
                {item.icon}
              </span>
              {item.name}
            </Link>
          );
        })}
      </nav>

      {/* FOOTER / LOGOUT */}
      <div className="pt-6 border-t border-green-800">
        <button
          onClick={handleLogout}
          className="flex items-center gap-3 p-4 w-full text-left text-green-400 hover:text-red-400 hover:bg-red-500/10 rounded-2xl transition-all font-black text-xs uppercase tracking-widest cursor-pointer group"
        >
          <LogOut
            size={20}
            className="group-hover:-translate-x-1 transition-transform"
          />
          LOGOUT
        </button>
      </div>
    </aside>
  );
}
