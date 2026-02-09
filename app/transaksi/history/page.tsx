"use client";
import { useEffect, useState, useMemo } from "react";
import { createClient } from "@/lib/supabase";
import {
  Search,
  Filter,
  History as HistoryIcon,
  ChevronLeft,
  ChevronRight,
  Wallet,
} from "lucide-react";

interface Transaction {
  id: string;
  created_at: string;
  total_amount: number;
  paid_amount: number;
  payment_status: string;
  payment_method: string;
  mitra: { full_name: string; current_tier: string } | null;
  transaction_items: {
    qty: number;
    remaining_qty_at_partner: number;
    product: { name: string } | null;
  }[];
}

export default function ArusKasPusatPage() {
  const supabase = useMemo(() => createClient(), []);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  useEffect(() => {
    async function loadHistory() {
      const { data } = await supabase
        .from("transactions")
        .select(
          `
        id, created_at, total_amount, paid_amount, payment_status, payment_method,
        mitra:mitra_id (full_name, current_tier),
        transaction_items (qty, remaining_qty_at_partner, product:product_id (name))
      `,
        )
        .order("created_at", { ascending: false });

      if (data) setTransactions(data as unknown as Transaction[]);
      setLoading(false);
    }
    loadHistory();
  }, [supabase]); // Dependensi hanya supabase agar jalan sekali saat mount

  const filteredData = useMemo(() => {
    return transactions.filter((t) => {
      const matchSearch = t.mitra?.full_name
        .toLowerCase()
        .includes(searchTerm.toLowerCase());
      const matchStatus =
        statusFilter === "All" || t.payment_status === statusFilter;
      return matchSearch && matchStatus;
    });
  }, [transactions, searchTerm, statusFilter]);

  const totalPages = Math.ceil(filteredData.length / itemsPerPage);
  const indexOfFirstItem = (currentPage - 1) * itemsPerPage;
  const currentItems = filteredData.slice(
    indexOfFirstItem,
    indexOfFirstItem + itemsPerPage,
  );

  if (loading)
    return (
      <div className="p-8 text-center font-black animate-pulse text-green-800 uppercase italic">
        Sync Arus Kas...
      </div>
    );

  return (
    <div className="p-8 max-w-7xl mx-auto font-sans text-gray-900">
      <header className="mb-10 flex items-center gap-3">
        <HistoryIcon size={36} className="text-green-900" />
        <h1 className="text-4xl font-black text-green-900 italic uppercase tracking-tighter">
          Arus Kas & Stok Mitra
        </h1>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="md:col-span-2 relative">
          <Search
            className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-300"
            size={18}
          />
          <input
            type="text"
            placeholder="Cari nama mitra..."
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setCurrentPage(1);
            }}
            className="w-full p-4 pl-12 bg-white border border-gray-100 rounded-2xl shadow-sm outline-none focus:ring-2 focus:ring-green-500 font-bold"
          />
        </div>
        <div className="relative">
          <Filter
            className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-300"
            size={18}
          />
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setCurrentPage(1);
            }}
            className="w-full p-4 pl-12 bg-white border border-gray-100 rounded-2xl shadow-sm font-bold appearance-none cursor-pointer outline-none focus:ring-2 focus:ring-green-500"
          >
            <option value="All">Semua Status</option>
            <option value="Unpaid">Piutang</option>
            <option value="Paid">Lunas</option>
          </select>
        </div>
      </div>

      <div className="bg-white rounded-[40px] shadow-2xl overflow-hidden border border-gray-100">
        <table className="w-full text-left">
          <thead className="bg-gray-50 text-[10px] font-black text-gray-400 uppercase tracking-widest border-b">
            <tr>
              <th className="p-8 border-r text-center w-16 font-black uppercase">
                No
              </th>
              <th className="p-8">Mitra & Metode</th>
              <th className="p-8">Stok Aktif</th>
              <th className="p-8 text-right bg-green-50/20 border-r">
                Dibayar ke Pusat
              </th>
              <th className="p-8 text-right bg-red-50/10">Sisa Piutang</th>
              <th className="p-8 text-center">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {currentItems.map((t, idx) => (
              <tr
                key={t.id}
                className="hover:bg-green-50/10 transition-all cursor-default group"
              >
                <td className="p-8 text-center font-bold text-gray-300 border-r">
                  {indexOfFirstItem + idx + 1}
                </td>
                <td className="p-8">
                  <div className="font-bold text-gray-800 uppercase">
                    {t.mitra?.full_name}
                  </div>
                  <div className="flex gap-2 mt-2 items-center">
                    <span className="text-[9px] font-black bg-blue-600 text-white px-2 py-0.5 rounded-lg">
                      {t.mitra?.current_tier}
                    </span>
                    <span className="text-[9px] font-black uppercase bg-green-50 text-green-700 px-2 py-0.5 rounded-lg border border-green-100 flex items-center gap-1">
                      <Wallet size={10} /> {t.payment_method}
                    </span>
                  </div>
                </td>
                <td className="p-8">
                  {t.transaction_items.map((item, i) => (
                    <div
                      key={i}
                      className="text-[10px] font-black text-gray-500 uppercase italic mb-1"
                    >
                      {item.product?.name}: {item.remaining_qty_at_partner} Pcs
                    </div>
                  ))}
                </td>
                <td className="p-8 text-right border-r bg-green-50/20 font-mono font-black text-green-700 italic text-lg">
                  Rp {t.paid_amount.toLocaleString("id-ID")}
                </td>
                <td className="p-8 text-right bg-red-50/10 font-mono font-black text-red-600 italic text-lg">
                  Rp {t.total_amount.toLocaleString("id-ID")}
                </td>
                <td className="p-8 text-center">
                  <span
                    className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase ${t.payment_status === "Paid" ? "bg-green-700 text-white" : "bg-red-50 text-red-500 border border-red-100"}`}
                  >
                    {t.payment_status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {totalPages > 1 && (
          <div className="p-8 flex justify-between items-center border-t bg-gray-50/30 font-black uppercase text-[10px] text-gray-400">
            <span>
              Hal {currentPage} dari {totalPages}
            </span>
            <div className="flex gap-3">
              <button
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="p-2 border rounded-lg hover:bg-white disabled:opacity-20 cursor-pointer"
              >
                <ChevronLeft size={20} />
              </button>
              <button
                onClick={() =>
                  setCurrentPage((p) => Math.min(totalPages, p + 1))
                }
                disabled={currentPage === totalPages}
                className="p-2 border rounded-lg hover:bg-white disabled:opacity-20 cursor-pointer"
              >
                <ChevronRight size={20} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
